import assert from "node:assert/strict";

import { describe, it, vi } from "vitest";

import { checkStructuredData, htmlToText } from "../../../../infra/structured-data.ts";
import { ARTICLES, localizedArticle } from "../../content/articles/index.ts";
import { PUBLIC_LANGUAGES } from "../../content/site/language.ts";
import { articleHtml } from "./article-pages.ts";
import { readArticleDocument } from "./article-source.ts";

vi.mock("../static-ui-renderer.ts", () => ({
  publicArticleClasses: () => ({}),
  renderPublicUi: (kind: string, props: { content?: string; html?: string }) =>
    `<div data-kind="${kind}">${props.content ?? props.html ?? ""}</div>`,
}));

const JSON_LD_PATTERN = /<script type="application\/ld\+json">(.*?)<\/script>/g;

interface FaqSchema {
  "@type": string;
  url: string;
  inLanguage: string;
  mainEntity: { name: string; acceptedAnswer: { text: string } }[];
}

const jsonLd = (html: string) =>
  [...html.matchAll(JSON_LD_PATTERN)].map(([, json]) => JSON.parse(json) as { "@type": string });

/** `### ` questions between the article's FAQ heading and the closing rule. */
function markdownQuestions(markdown: string): string[] {
  const faq = markdown
    .split(/^## .+$/m)
    .at(-1)!
    .split(/^---$/m)[0];
  return [...faq.matchAll(/^### (.+)$/gm)].map(([, question]) => question.replaceAll("`", ""));
}

describe("compare article FAQ schema", () => {
  const pages = ARTICLES.flatMap((article) =>
    PUBLIC_LANGUAGES.map((language) => ({
      article: localizedArticle(article, language),
      language,
      markdown: readArticleDocument(article, language).body,
    })),
  );

  it("describe every visible FAQ question in a FAQPage, in every language", () => {
    for (const { article, language, markdown } of pages) {
      const html = articleHtml(article.path, true);
      const blocks = jsonLd(html);
      assert.deepEqual(
        blocks.map((block) => block["@type"]),
        ["Article", "BreadcrumbList", "FAQPage"],
        article.path,
      );
      const faq = blocks[2] as unknown as FaqSchema;
      assert.equal(faq.url, `https://xprite.cc${article.path}`);
      assert.equal(faq.inLanguage, language);
      const questions = markdownQuestions(markdown);
      assert.ok(questions.length >= 2, article.path);
      assert.deepEqual(
        faq.mainEntity.map((item) => item.name),
        questions,
        article.path,
      );
      assert.deepEqual(checkStructuredData([{ page: article.path, html }]).issues, []);
    }
  });

  it("answer with the text shown below each question, without markup", () => {
    const html = articleHtml("/compare/aseprite-online/", true);
    const faq = jsonLd(html)[2] as unknown as FaqSchema;
    assert.deepEqual(faq.mainEntity[1], {
      "@type": "Question",
      name: "Is there a difference between .ase and .aseprite?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No, they're the same format. Xprite opens both extensions.",
      },
    });
    assert.equal(
      faq.mainEntity[2].acceptedAnswer.text,
      "The Xprite viewer processes files on your device and doesn't upload them. Projects the editor saves to Browser also stay on the current device.",
    );
    for (const item of faq.mainEntity) {
      assert.doesNotMatch(item.acceptedAnswer.text, /[<>`*]/);
      assert.ok(htmlToText(html).includes(item.acceptedAnswer.text));
    }
  });

  it("leave the collection page without a FAQPage", () => {
    const html = articleHtml("/compare/", true);
    assert.deepEqual(
      jsonLd(html).map((block) => block["@type"]),
      ["CollectionPage", "BreadcrumbList"],
    );
  });
});
