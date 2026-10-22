/**
 * Visible FAQ content and its schema.org FAQPage form. Pages build both from the same
 * entries so the structured data cannot drift from the questions readers see.
 */

/** One answer fragment as written in FAQ copy: text, inline code or a link. */
export type FaqInlineContent =
  | string
  | { readonly code: string }
  | { readonly label: string; readonly href: string };

/** One question with its answer, both as the plain text that the page displays. */
export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

/** The text a reader sees for rich FAQ copy: code and link labels without markup. */
export function faqInlineText(content: readonly FaqInlineContent[]): string {
  return normalizeText(
    content
      .map((part) => {
        if (typeof part === "string") return part;
        return "code" in part ? part.code : part.label;
      })
      .join(""),
  );
}

/**
 * A FAQPage node for a page's JSON-LD `@graph`, or `undefined` when the page shows no FAQ.
 * Question names and answers are plain text so they match the visible copy exactly.
 */
export function faqPageSchema(
  entries: readonly FaqEntry[],
  page: { readonly url: string; readonly language: string },
) {
  if (!entries.length) return undefined;
  const questions = entries.map((entry) => {
    const question = normalizeText(entry.question);
    const answer = normalizeText(entry.answer);
    if (!question || !answer)
      throw Error(`FAQ entry on ${page.url} needs a question and an answer`);
    return { question, answer };
  });
  return {
    "@type": "FAQPage",
    "@id": `${page.url}#faq`,
    url: page.url,
    inLanguage: page.language,
    mainEntity: questions.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}
