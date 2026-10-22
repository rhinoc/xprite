import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it } from "vitest";

import { PublicLanguage } from "../../growth/content/site/language.ts";
import { TOOLS } from "../../growth/content/tools/index.ts";
import { localizedToolPage } from "./localized-pages.ts";

const META = [
  'name="description"',
  'property="og:title"',
  'property="og:description"',
  'property="og:locale"',
  'property="og:image:alt"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="application-name"',
]
  .map((selector) => `<meta ${selector} content="English" />`)
  .join("");
const locale = (language: string) =>
  ["light", "dark"]
    .map(
      (theme) =>
        `<template data-tool-locale="${language}-${theme}"><p>${language} ${theme}</p></template>`,
    )
    .join("");
const PAGE = `<!doctype html><html lang="en"><head><title>Pixelate</title>${META}</head><body><h1 id="tool-page-heading">Pixelate</h1><div id="pixelation-root" data-tool-startup-view><p>en light</p></div><template data-tool-theme="dark"><p>en dark</p></template>${locale("zh-CN")}${locale("ja")}<script id="tool-initial-artwork" type="application/json">{}</script><noscript>Enable JavaScript to convert images to pixel art.</noscript></body></html>`;

describe("localized tool pages", () => {
  it("leave the English page unchanged", () => {
    assert.equal(localizedToolPage(PAGE, PublicLanguage.English), PAGE);
  });

  it("serve one language's prerendered markup as the first paint", () => {
    const html = localizedToolPage(PAGE, PublicLanguage.Japanese);
    assert.match(html, /<html lang="ja">/);
    assert.match(
      html,
      /<div id="pixelation-root" data-tool-startup-view><p>ja light<\/p><\/div><template data-tool-theme="dark"><p>ja dark<\/p><\/template><script id="tool-initial-artwork"/,
    );
    assert.doesNotMatch(html, /data-tool-locale|en light|zh-CN/);
    assert.match(html, /<meta property="og:locale" content="ja_JP" \/>/);
    assert.doesNotMatch(html, /content="English"/);
    assert.doesNotMatch(html, /<title>Pixelate<\/title>|>Enable JavaScript/);
  });

  it("refuse a page whose metadata it cannot translate", () => {
    assert.throws(
      () =>
        localizedToolPage(
          PAGE.replace('<meta name="application-name" content="English" />', ""),
          PublicLanguage.Japanese,
        ),
      /application-name/,
    );
  });
});

describe("English tool page sources", () => {
  it("describe each tool the same way in search results and link previews", () => {
    for (const tool of TOOLS) {
      const html = readFileSync(
        fileURLToPath(
          new URL(`../${tool.path.slice("/tools/".length)}index.html`, import.meta.url),
        ),
        "utf8",
      );
      const content = (selector: string) =>
        new RegExp(`<meta\\s+${selector}\\s+content="([^"]*)"`).exec(html)?.[1];
      for (const selector of [
        'name="description"',
        'property="og:description"',
        'name="twitter:description"',
      ])
        assert.equal(content(selector), tool.description, `${tool.path} ${selector}`);
    }
  });
});
