import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { articleLanguage, localizedSiteHref, PublicLanguage } from "./language.ts";

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
    assert.equal(localizedSiteHref("/privacy/", zh), "/zh-CN/privacy/");
    assert.equal(localizedSiteHref("/zh-CN/learn/aseprite-to-gif/", en), "/learn/aseprite-to-gif/");
    assert.equal(localizedSiteHref("/zh-CN/help/", zh), "/zh-CN/help/");
  });

  it("switch tools and component docs with a query", () => {
    assert.equal(localizedSiteHref("/tools/viewer/", zh), "/tools/viewer/?lang=zh-CN");
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
  });
});
