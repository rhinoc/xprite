import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  articleLanguage,
  localizedSiteHref,
  publicLanguage,
  PublicLanguage,
  unlocalizedPath,
} from "./language.ts";

const zh = PublicLanguage.SimplifiedChinese;
const en = PublicLanguage.English;

describe("localized site links", () => {
  it("prefix Chinese pages at the root and keep English unprefixed", () => {
    assert.equal(
      localizedSiteHref("/compare/aseprite-online/", zh),
      "/zh-CN/compare/aseprite-online/",
    );
    assert.equal(localizedSiteHref("/help/#save-and-recover", zh), "/zh-CN/help/#save-and-recover");
    assert.equal(localizedSiteHref("/about/", zh), "/zh-CN/about/");
    assert.equal(localizedSiteHref("/features/", zh), "/zh-CN/features/");
    assert.equal(localizedSiteHref("/privacy/", zh), "/zh-CN/privacy/");
    assert.equal(localizedSiteHref("/zh-CN/learn/aseprite-to-gif/", en), "/learn/aseprite-to-gif/");
    assert.equal(localizedSiteHref("/zh-CN/help/", zh), "/zh-CN/help/");
  });

  it("prefix tool pages but keep tool assets and components independent of language", () => {
    assert.equal(localizedSiteHref("/tools/viewer/", zh), "/zh-CN/tools/viewer/");
    assert.equal(localizedSiteHref("/ja/tools/pixelate/#help", en), "/tools/pixelate/#help");
    assert.equal(
      localizedSiteHref("/tools/viewer/?lang=zh-CN&source=menu", en),
      "/tools/viewer/?source=menu",
    );
    assert.equal(localizedSiteHref("/tools/ssg-assets/a1b2.png", zh), "/tools/ssg-assets/a1b2.png");
    assert.equal(localizedSiteHref("/components/?lang=zh-CN", en), "/components/");
  });

  it("leave the editor, assets and other origins alone", () => {
    assert.equal(localizedSiteHref("/editor", zh), "/editor");
    assert.equal(
      localizedSiteHref("/about/images/share-dialog.png", zh),
      "/about/images/share-dialog.png",
    );
    assert.equal(localizedSiteHref("https://example.com/help/", zh), "https://example.com/help/");
  });

  it("read the language from the root prefix", () => {
    assert.equal(articleLanguage("/zh-CN/compare/"), zh);
    assert.equal(articleLanguage("/compare/"), en);
    assert.equal(articleLanguage("/ja/compare/"), PublicLanguage.Japanese);
    assert.equal(articleLanguage("/ko/help/"), PublicLanguage.Korean);
  });

  it("prefix Japanese and Korean pages and switch between localized prefixes", () => {
    assert.equal(localizedSiteHref("/help/", PublicLanguage.Japanese), "/ja/help/");
    assert.equal(localizedSiteHref("/zh-CN/about/", PublicLanguage.Korean), "/ko/about/");
    assert.equal(localizedSiteHref("/ko/learn/x/", en), "/learn/x/");
    assert.equal(
      localizedSiteHref("/tools/viewer/?lang=ja", PublicLanguage.Korean),
      "/ko/tools/viewer/",
    );
  });

  it("resolve, prefix and read Russian, Brazilian Portuguese and Spanish pages", () => {
    assert.equal(publicLanguage("ru-RU"), PublicLanguage.Russian);
    assert.equal(publicLanguage("pt"), PublicLanguage.BrazilianPortuguese);
    assert.equal(publicLanguage("pt-PT"), PublicLanguage.BrazilianPortuguese);
    assert.equal(publicLanguage("es-419"), PublicLanguage.Spanish);
    assert.equal(publicLanguage("es-ES"), PublicLanguage.Spanish);
    assert.equal(localizedSiteHref("/help/", PublicLanguage.Russian), "/ru/help/");
    assert.equal(
      localizedSiteHref("/ru/about/", PublicLanguage.BrazilianPortuguese),
      "/pt-BR/about/",
    );
    assert.equal(localizedSiteHref("/pt-BR/features/", PublicLanguage.Spanish), "/es/features/");
    assert.equal(articleLanguage("/es/compare/"), PublicLanguage.Spanish);
    assert.equal(articleLanguage("/pt-BR/help/"), PublicLanguage.BrazilianPortuguese);
    assert.equal(unlocalizedPath("/ru/privacy/"), "/privacy/");
    assert.equal(articleLanguage("/esports/"), en);
  });
});
