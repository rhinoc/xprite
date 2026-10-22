import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { checkStructuredData, htmlToText } from "./structured-data.ts";

const FAQ = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "AboutPage", "@id": "https://xprite.cc/about/#page" },
    {
      "@type": "FAQPage",
      url: "https://xprite.cc/about/",
      mainEntity: [
        {
          "@type": "Question",
          name: "Can I open .ase files?",
          acceptedAnswer: { "@type": "Answer", text: "Yes. See the guide." },
        },
      ],
    },
  ],
};
const BODY =
  '<details><summary><span>Can I open .ase files?</span></summary><div><p>Yes. See the <a href="/help/">guide</a>.</p></div></details>';

const page = (schema: string, body = BODY) => ({
  page: "/about/",
  html: `<html><head><script type="application/ld+json">${schema}</script></head><body>${body}</body></html>`,
});

describe("structured data check", () => {
  it("read visible text without markup, scripts or entities", () => {
    assert.equal(
      htmlToText("<p>Tom&#39;s <code>.ase</code></p><p>&amp; more</p><script>x()</script>"),
      "Tom's .ase & more",
    );
  });

  it("accept a FAQPage that matches the visible FAQ", () => {
    const result = checkStructuredData([page(JSON.stringify(FAQ))]);
    assert.deepEqual(result.issues, []);
    assert.equal(result.blocks, 1);
    assert.equal(result.faqPages, 1);
    assert.equal(result.questions, 1);
  });

  it("report JSON-LD that does not parse or lacks the schema.org context", () => {
    const result = checkStructuredData([
      page("{"),
      page(JSON.stringify({ "@type": "WebPage", name: "x" })),
    ]);
    assert.equal(result.issues.length, 2);
    assert.match(result.issues[0].message, /does not parse/);
    assert.match(result.issues[1].message, /@context/);
  });

  it("report questions and answers the page does not show", () => {
    const result = checkStructuredData([page(JSON.stringify(FAQ), "<p>Other copy</p>")]);
    assert.deepEqual(
      result.issues.map((issue) => issue.message.split(":")[0]),
      [
        "FAQPage question 1 is not shown on the page",
        "FAQPage question 1 answer is not shown on the page",
      ],
    );
  });

  it("report malformed questions and a FAQPage for another URL", () => {
    const broken = structuredClone(FAQ);
    const faq = broken["@graph"][1] as { url: string; mainEntity: unknown[] };
    faq.url = "https://xprite.cc/compare/";
    faq.mainEntity.push({ "@type": "Question", name: "Can I open .ase files?" });
    const messages = checkStructuredData([page(JSON.stringify(broken))]).issues.map(
      (issue) => issue.message,
    );
    assert.ok(
      messages.some((message) => /acceptedAnswer/.test(message)),
      messages.join("\n"),
    );
    assert.ok(
      messages.some((message) => /repeats/.test(message)),
      messages.join("\n"),
    );
    assert.ok(
      messages.some((message) => /does not match the page/.test(message)),
      messages.join("\n"),
    );
  });
});
