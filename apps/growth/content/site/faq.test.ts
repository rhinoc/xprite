import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { faqInlineText, faqPageSchema } from "./faq.ts";

const PAGE = { url: "https://xprite.cc/about/", language: "en" };

describe("FAQ schema", () => {
  it("read rich answers as the text a reader sees", () => {
    assert.equal(
      faqInlineText([
        "Opens ",
        { code: ".ase" },
        " files; see the ",
        { label: "guide", href: "/help/" },
        ".  ",
      ]),
      "Opens .ase files; see the guide.",
    );
  });

  it("list each question with its accepted answer, in page order", () => {
    const schema = faqPageSchema(
      [
        { question: "Is it free?", answer: "Yes.\n It is free." },
        { question: " Can I work offline? ", answer: "Yes." },
      ],
      PAGE,
    );
    assert.deepEqual(schema, {
      "@type": "FAQPage",
      "@id": "https://xprite.cc/about/#faq",
      url: "https://xprite.cc/about/",
      inLanguage: "en",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is it free?",
          acceptedAnswer: { "@type": "Answer", text: "Yes. It is free." },
        },
        {
          "@type": "Question",
          name: "Can I work offline?",
          acceptedAnswer: { "@type": "Answer", text: "Yes." },
        },
      ],
    });
  });

  it("add no FAQPage to a page without visible questions", () => {
    assert.equal(faqPageSchema([], PAGE), undefined);
  });

  it("refuse a question without an answer instead of dropping it", () => {
    assert.throws(() => faqPageSchema([{ question: "Is it free?", answer: " " }], PAGE));
  });
});
