import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { PublicLanguage } from "../../content/site/language.ts";
import { PLANNED_PAGES, SitePageKind } from "../../content/site/pages.ts";
import { sitemap } from "../seo/discovery.ts";
import { plannedPageSource } from "./planned-pages.ts";

const documented = PLANNED_PAGES.filter((page) => page.document);

describe("planned page documents", () => {
  it("open each written body with the page title", () => {
    for (const page of documented) {
      const source = plannedPageSource(page);
      if (source) assert.ok(source.startsWith(`# ${page.title}\n`), page.path);
    }
  });

  it("keep English planned pages title-only", () => {
    for (const page of documented.filter((item) => item.language === PublicLanguage.English))
      assert.equal(plannedPageSource(page), undefined, page.path);
  });

  it("keep written planned pages out of discovery", () => {
    const urls = sitemap();
    for (const page of documented) {
      assert.equal(page.kind, SitePageKind.Placeholder);
      assert.equal(page.indexable, false);
      assert.ok(!urls.includes(page.path), page.path);
    }
  });
});
