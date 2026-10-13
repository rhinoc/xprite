/**
 * Search snippet limits for built public pages. Titles and meta descriptions are
 * measured in display units: Latin characters count 1 and CJK characters count 2,
 * which is roughly how wide Google renders them before truncating.
 */

type MetadataField = "title" | "description";
type MetadataSeverity = "error" | "warning";

interface FieldLimit {
  /** Lengths inside this range pass silently. */
  readonly ideal: { readonly min: number; readonly max: number };
  /** Lengths outside this range fail; lengths between ideal and hard only warn. */
  readonly hard: { readonly min: number; readonly max: number };
}

export interface LanguageLimits {
  readonly title: FieldLimit;
  readonly description: FieldLimit;
}

/** Latin and Cyrillic scripts (English, Russian, Portuguese, Spanish) share these limits. */
const ENGLISH_LIMITS: LanguageLimits = {
  title: { ideal: { min: 1, max: 60 }, hard: { min: 1, max: 65 } },
  description: { ideal: { min: 70, max: 160 }, hard: { min: 50, max: 165 } },
};

/**
 * Chinese, Japanese and Korean results truncate titles at about 30 wide characters and
 * snippets at about 75–80, so a 160-unit description shows almost whole. Short, factual
 * CJK descriptions are normal, so the lower bounds are lower than the English ones.
 */
const CJK_LIMITS: LanguageLimits = {
  title: { ideal: { min: 1, max: 60 }, hard: { min: 1, max: 66 } },
  description: { ideal: { min: 70, max: 160 }, hard: { min: 40, max: 170 } },
};

export function metadataLimits(language: string): LanguageLimits {
  return /^(?:zh|ja|ko)(?:-|$)/i.test(language) ? CJK_LIMITS : ENGLISH_LIMITS;
}

/** East Asian Wide and Fullwidth code point ranges (Unicode UAX #11). */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

const isWide = (codePoint: number) =>
  WIDE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);

export function displayWidth(text: string): number {
  let width = 0;
  for (const character of text) width += isWide(character.codePointAt(0)!) ? 2 : 1;
  return width;
}

export interface PageMetadata {
  /** Public URL path, such as `/zh-CN/help/`. */
  readonly page: string;
  readonly language: string;
  readonly indexable: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly ogTitle?: string;
  readonly ogDescription?: string;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeText(value: string): string {
  return value
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== "#") return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
      const hex = name[1] === "x" || name[1] === "X";
      return String.fromCodePoint(Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10));
    })
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    result.set(match[1].toLowerCase(), decodeText(match[2] ?? match[3]));
  return result;
}

/** Reads search metadata from a page's `<head>`; scripts and the body are ignored. */
export function readPageMetadata(
  html: string,
  page: string,
  options: { indexable?: boolean } = {},
): PageMetadata {
  const head = (html.split(/<\/head>/i)[0] ?? html).replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0];
  const language = (htmlTag && attributes(htmlTag).get("lang")) || "en";
  const meta = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const values = attributes(tag);
    const key = values.get("name") ?? values.get("property");
    if (key && values.has("content") && !meta.has(key.toLowerCase()))
      meta.set(key.toLowerCase(), values.get("content")!);
  }
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const robots = meta.get("robots") ?? "";
  return {
    page,
    language,
    indexable: options.indexable ?? !/\bnoindex\b/i.test(robots),
    title: titleMatch ? decodeText(titleMatch[1]) : undefined,
    description: meta.get("description"),
    ogTitle: meta.get("og:title"),
    ogDescription: meta.get("og:description"),
  };
}

export interface MetadataIssue {
  readonly severity: MetadataSeverity;
  readonly page: string;
  readonly field: MetadataField | "og:title" | "og:description";
  readonly message: string;
}

function lengthIssue(
  page: PageMetadata,
  field: MetadataField,
  value: string | undefined,
): MetadataIssue | undefined {
  if (!value) return { severity: "error", page: page.page, field, message: "missing or empty" };
  const { ideal, hard } = metadataLimits(page.language)[field];
  const length = displayWidth(value);
  const unit = metadataLimits(page.language) === CJK_LIMITS ? "units (CJK = 2)" : "chars";
  const range = (limit: { min: number; max: number }) => `${limit.min}–${limit.max}`;
  if (length < hard.min || length > hard.max)
    return {
      severity: "error",
      page: page.page,
      field,
      message: `${length} ${unit}, allowed ${range(hard)}: "${value}"`,
    };
  if (length < ideal.min || length > ideal.max)
    return {
      severity: "warning",
      page: page.page,
      field,
      message: `${length} ${unit}, aim for ${range(ideal)}: "${value}"`,
    };
  return undefined;
}

/** Checks indexable pages: lengths per language, missing values and duplicates. */
export function checkPageMetadata(pages: readonly PageMetadata[]): MetadataIssue[] {
  const indexed = pages.filter((page) => page.indexable);
  const issues: MetadataIssue[] = [];
  for (const page of indexed) {
    for (const field of ["title", "description"] as const) {
      const issue = lengthIssue(page, field, page[field]);
      if (issue) issues.push(issue);
    }
    for (const [field, value, expected] of [
      ["og:title", page.ogTitle, page.title],
      ["og:description", page.ogDescription, page.description],
    ] as const) {
      if (value !== undefined && expected && value !== expected)
        issues.push({
          severity: "warning",
          page: page.page,
          field,
          message: `differs from ${field.slice(3)}: "${value}"`,
        });
    }
  }
  for (const field of ["title", "description"] as const) {
    const owners = new Map<string, string[]>();
    for (const page of indexed) {
      const value = page[field];
      if (!value) continue;
      const key = `${page.language.toLowerCase()}\n${value}`;
      owners.set(key, [...(owners.get(key) ?? []), page.page]);
    }
    for (const [key, paths] of owners) {
      if (paths.length < 2) continue;
      for (const path of paths)
        issues.push({
          severity: "error",
          page: path,
          field,
          message: `duplicate of ${paths.filter((other) => other !== path).join(", ")}: "${key.split("\n")[1]}"`,
        });
    }
  }
  return issues;
}

export function formatMetadataIssue(issue: MetadataIssue): string {
  return `${issue.severity === "error" ? "✗" : "!"} ${issue.page} ${issue.field}: ${issue.message}`;
}
