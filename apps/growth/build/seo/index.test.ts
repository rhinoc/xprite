import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { SHOWCASE_FAQ_COPY } from "../../content/showcase/faq.ts";
import { showcaseSearchMetadata } from "../../content/showcase/index.ts";
import { SHOWCASE_PAGES, SHOWCASE_SITE_URL } from "../../content/showcase/pages.ts";
import { faqInlineText } from "../../content/site/faq.ts";
import { PublicLanguage } from "../../content/site/language.ts";
import { PIXELATE_TOOL } from "../../content/tools/index.ts";
import {
  applyEditorSearchMetadata,
  applyToolSearchMetadata,
  editorSearchMetadata,
} from "./index.ts";

const EDITOR_HTML = `<!doctype html><html lang="en"><head><title>Xprite</title></head><body><div id="root"></div><div id="xse-startup"><section class="xse-startup-copy"><p>Intro</p></section></div></body></html>`;

const graphTypes = (graph: readonly { "@type": string }[]) => graph.map((item) => item["@type"]);

describe("editor search metadata", () => {
  it("describe the site, its publisher and the application on the root", () => {
    const metadata = editorSearchMetadata("1.0.0");
    assert.deepEqual(graphTypes(metadata["@graph"]), ["WebSite", "Organization", "WebApplication"]);
    for (const item of metadata["@graph"]) assert.equal("@context" in item, false);
    const html = applyEditorSearchMetadata(EDITOR_HTML, "1.0.0", true);
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
    assert.ok(json);
    assert.deepEqual(JSON.parse(json), metadata);
  });

  it("keep crawler links visible to script-less visitors only, with no off-screen navigation", () => {
    const html = applyEditorSearchMetadata(EDITOR_HTML, "1.0.0", true);
    assert.doesNotMatch(html, /<nav\b/);
    assert.doesNotMatch(html, /tabindex="-1"/);
    const noscript = html.match(/<section class="xse-startup-copy">[\s\S]*?<\/section>/)?.[0];
    assert.match(
      noscript ?? "",
      /<noscript>[\s\S]*<a href="\/about\/">About Xprite<\/a>[\s\S]*<\/noscript>/,
    );
    const words = (noscript ?? "")
      .replace(/<style>.*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    assert.ok(words >= 150 && words <= 300, `${words} words`);
    assert.match(html, /<h1 style="[^"]*">Xprite: free online pixel art editor<\/h1>/);
  });
});

describe("about page search metadata", () => {
  it("mark the about page with a WebPage and its breadcrumb", () => {
    const metadata = showcaseSearchMetadata("en", SHOWCASE_PAGES.en, SHOWCASE_SITE_URL);
    assert.deepEqual(graphTypes(metadata["@graph"]), [
      "WebPage",
      "BreadcrumbList",
      "WebApplication",
      "FAQPage",
    ]);
    const breadcrumb = metadata["@graph"][1] as {
      itemListElement: readonly { position: number; item: string }[];
    };
    assert.deepEqual(
      breadcrumb.itemListElement.map(({ position, item }) => [position, item]),
      [
        [1, "https://xprite.cc/"],
        [2, "https://xprite.cc/about/"],
      ],
    );
  });

  it("describe the application as a free browser app with its core features", () => {
    const graph = showcaseSearchMetadata("en", SHOWCASE_PAGES.en, SHOWCASE_SITE_URL)["@graph"];
    const application = graph.find((item) => item["@type"] === "WebApplication") as unknown as {
      applicationCategory: string;
      operatingSystem: string;
      offers: { price: string };
      featureList: readonly string[];
    };
    assert.equal(application.applicationCategory, "MultimediaApplication");
    assert.equal(application.operatingSystem, "Any");
    assert.equal(application.offers.price, "0");
    assert.deepEqual(application.featureList, [
      "Pixel art drawing",
      "Frame-by-frame animation",
      "Aseprite .ase/.aseprite import",
      "GIF and PNG export",
    ]);
    assert.equal("aggregateRating" in application, false);
  });

  it("describe the visible FAQ in every language as a FAQPage", () => {
    for (const [language, page] of Object.entries(SHOWCASE_PAGES)) {
      const key = language as keyof typeof SHOWCASE_PAGES;
      const graph = showcaseSearchMetadata(key, page, SHOWCASE_SITE_URL)["@graph"];
      const faq = graph.find((item) => item["@type"] === "FAQPage") as unknown as {
        url: string;
        inLanguage: string;
        mainEntity: { name: string; acceptedAnswer: { "@type": string; text: string } }[];
      };
      assert.equal(faq.url, new URL(page.path, SHOWCASE_SITE_URL).href);
      assert.equal(faq.inLanguage, language);
      assert.deepEqual(
        faq.mainEntity.map((item) => [item.name, item.acceptedAnswer.text]),
        SHOWCASE_FAQ_COPY[key].questions.map((item) => [item.question, faqInlineText(item.answer)]),
        language,
      );
      assert.ok(faq.mainEntity.length >= 7, language);
    }
  });
});

describe("tool page search metadata", () => {
  const TOOL_HTML = `<!doctype html><html lang="ja"><head><link rel="canonical" href="https://xprite.cc/tools/pixelate/"><meta property="og:url" content="https://xprite.cc/tools/pixelate/"></head><body></body></html>`;

  it("name the page itself as canonical and list every language with an English default", () => {
    const html = applyToolSearchMetadata(
      TOOL_HTML,
      PIXELATE_TOOL,
      PublicLanguage.Japanese,
      "1.0.0",
      true,
    );
    assert.deepEqual(
      [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((match) => match[1]),
      ["https://xprite.cc/ja/tools/pixelate/"],
    );
    assert.match(
      html,
      /<meta property="og:url" content="https:\/\/xprite.cc\/ja\/tools\/pixelate\/"/,
    );
    const alternates = [
      ...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g),
    ];
    assert.deepEqual(
      alternates.map((match) => [match[1], match[2]]),
      [
        ["en", "https://xprite.cc/tools/pixelate/"],
        ["zh-CN", "https://xprite.cc/zh-CN/tools/pixelate/"],
        ["ja", "https://xprite.cc/ja/tools/pixelate/"],
        ["ko", "https://xprite.cc/ko/tools/pixelate/"],
        ["ru", "https://xprite.cc/ru/tools/pixelate/"],
        ["pt-BR", "https://xprite.cc/pt-BR/tools/pixelate/"],
        ["es", "https://xprite.cc/es/tools/pixelate/"],
        ["x-default", "https://xprite.cc/tools/pixelate/"],
      ],
    );
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
    assert.ok(json);
    assert.deepEqual((({ url, inLanguage }) => ({ url, inLanguage }))(JSON.parse(json)), {
      url: "https://xprite.cc/ja/tools/pixelate/",
      inLanguage: "ja",
    });
  });

  it("leave preview pages without canonical or alternates", () => {
    const html = applyToolSearchMetadata(
      TOOL_HTML,
      PIXELATE_TOOL,
      PublicLanguage.Japanese,
      "1.0.0",
      false,
    );
    assert.doesNotMatch(html, /rel="(?:canonical|alternate)"/);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
  });
});
