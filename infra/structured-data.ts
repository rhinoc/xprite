/**
 * JSON-LD checks for built public pages. Every `application/ld+json` block must parse, and
 * each FAQPage must list well-formed questions whose text the page visibly shows.
 */

const JSON_LD_PATTERN =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const NON_VISIBLE_PATTERN = /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
const BLOCK_END_PATTERN =
  /<\/(?:p|li|h[1-6]|div|section|summary|details|tr|td|th|dd|dt)>|<br\s*\/?>/gi;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    const hex = name[1] === "x" || name[1] === "X";
    return String.fromCodePoint(Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

/** The text an HTML fragment displays: tags removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(NON_VISIBLE_PATTERN, " ")
      .replace(BLOCK_END_PATTERN, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasType = (node: JsonObject, type: string) =>
  node["@type"] === type || (Array.isArray(node["@type"]) && node["@type"].includes(type));

export interface StructuredDataPage {
  /** Public URL path, such as `/zh-CN/about/`. */
  readonly page: string;
  readonly html: string;
}

export interface StructuredDataIssue {
  readonly page: string;
  readonly message: string;
}

export interface StructuredDataSummary {
  readonly blocks: number;
  readonly faqPages: number;
  readonly questions: number;
  readonly issues: readonly StructuredDataIssue[];
}

/** Top-level nodes and `@graph` members of every parsed block. */
function schemaNodes(blocks: readonly unknown[]): JsonObject[] {
  return blocks.flatMap((block) => {
    const roots = Array.isArray(block) ? block : [block];
    return roots.filter(isObject).flatMap((root) => {
      const graph = Array.isArray(root["@graph"]) ? root["@graph"].filter(isObject) : [];
      return "@type" in root ? [root, ...graph] : graph;
    });
  });
}

/** Whitespace-free text, so markup boundaries in the page cannot split a phrase. */
const compact = (value: string) => value.replace(/\s+/g, "");

function checkFaqPage(
  faq: JsonObject,
  page: string,
  visible: string,
  issue: (message: string) => void,
): number {
  const questions = Array.isArray(faq.mainEntity) ? faq.mainEntity : [];
  if (!questions.length) issue("FAQPage needs a non-empty mainEntity list of Questions");
  const names = new Set<string>();
  questions.forEach((question, index) => {
    const label = `FAQPage question ${index + 1}`;
    if (!isObject(question) || !hasType(question, "Question")) {
      issue(`${label} is not a Question`);
      return;
    }
    const name = typeof question.name === "string" ? question.name.trim() : "";
    const answer = isObject(question.acceptedAnswer) ? question.acceptedAnswer : undefined;
    const text = answer && typeof answer.text === "string" ? answer.text.trim() : "";
    if (!name) issue(`${label} has no name`);
    if (!answer || !hasType(answer, "Answer")) issue(`${label} needs an acceptedAnswer Answer`);
    else if (!text) issue(`${label} has an empty answer`);
    if (name && names.has(name)) issue(`${label} repeats "${name}"`);
    names.add(name);
    if (name && !visible.includes(compact(name)))
      issue(`${label} is not shown on the page: "${name}"`);
    if (text && !visible.includes(compact(text)))
      issue(`${label} answer is not shown on the page: "${text.slice(0, 80)}…"`);
  });
  if (typeof faq.url === "string" && new URL(faq.url).pathname !== page)
    issue(`FAQPage url ${faq.url} does not match the page`);
  return questions.length;
}

/** Parses every JSON-LD block and validates FAQPage nodes against the visible page text. */
export function checkStructuredData(pages: readonly StructuredDataPage[]): StructuredDataSummary {
  const issues: StructuredDataIssue[] = [];
  let blocks = 0;
  let faqPages = 0;
  let questions = 0;
  for (const { page, html } of pages) {
    const issue = (message: string) => issues.push({ page, message });
    const parsed: unknown[] = [];
    for (const [, source] of html.matchAll(JSON_LD_PATTERN)) {
      blocks += 1;
      try {
        parsed.push(JSON.parse(source));
      } catch (error) {
        issue(`JSON-LD block ${blocks} does not parse: ${(error as Error).message}`);
      }
    }
    for (const block of parsed) {
      const roots = Array.isArray(block) ? block : [block];
      for (const root of roots)
        if (!isObject(root) || root["@context"] !== "https://schema.org")
          issue('JSON-LD block needs "@context": "https://schema.org"');
    }
    const faqs = schemaNodes(parsed).filter((node) => hasType(node, "FAQPage"));
    if (faqs.length > 1) issue(`page has ${faqs.length} FAQPage nodes; keep one`);
    if (!faqs.length) continue;
    const body = html.split(/<body\b[^>]*>/i)[1] ?? "";
    const visible = compact(htmlToText(body));
    for (const faq of faqs) {
      faqPages += 1;
      questions += checkFaqPage(faq, page, visible, issue);
    }
  }
  return { blocks, faqPages, questions, issues };
}

export function formatStructuredDataIssue(issue: StructuredDataIssue): string {
  return `✗ ${issue.page} JSON-LD: ${issue.message}`;
}
