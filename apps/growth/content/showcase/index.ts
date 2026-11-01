import { editorApplicationMetadata } from "../application/index.ts";
import { ARTICLES } from "../articles/index.ts";
import { GUIDE_PAGES } from "../help/pages.ts";
import { faqInlineText, faqPageSchema } from "../site/faq.ts";
import { showcaseLabel } from "../site/navigation.ts";
import { TOOLS } from "../tools/index.ts";
import { SHOWCASE_FAQ_COPY } from "./faq.ts";
import type { SHOWCASE_PAGES } from "./pages.ts";

export const SHOWCASE_SEARCH_ATTRIBUTE = "data-showcase-search";

/** About page structured data, built from the same FAQ entries the page shows. */
export function showcaseSearchMetadata(
  language: keyof typeof SHOWCASE_PAGES,
  page: { path: string; title: string; description: string },
  siteUrl: string,
) {
  const canonical = new URL(page.path, siteUrl).href;
  const { "@context": context, ...application } = editorApplicationMetadata();
  const faq = faqPageSchema(
    SHOWCASE_FAQ_COPY[language].questions.map((item) => ({
      question: item.question,
      answer: faqInlineText(item.answer),
    })),
    { url: canonical, language },
  );
  return {
    "@context": context,
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: page.title,
        description: page.description,
        inLanguage: language,
        isPartOf: { "@id": `${siteUrl}#website` },
        about: { "@id": application["@id"] },
        mainEntity: { "@id": application["@id"] },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
        relatedLink: [
          new URL(GUIDE_PAGES[language].path, siteUrl).href,
          ...TOOLS.map((tool) => new URL(tool.path, siteUrl).href),
          ...ARTICLES.map((article) => new URL(article.path, siteUrl).href),
        ],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Xprite", item: siteUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: showcaseLabel(language),
            item: canonical,
          },
        ],
      },
      application,
      ...(faq ? [{ ...faq, isPartOf: { "@id": `${siteUrl}#website` } }] : []),
    ],
  };
}
