import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { describe, it, vi } from "vitest";

import { PublicLanguage } from "../../content/site/language.ts";
import { PLANNED_PAGES, SitePageKind, type SitePage } from "../../content/site/pages.ts";
import { sitemap } from "../seo/discovery.ts";
import {
  plannedPageContent,
  plannedPageImageResources,
  plannedPageSource,
} from "./planned-pages.ts";

vi.mock("../static-ui-renderer.ts", () => ({
  publicArticleClasses: () => ({ tableScroll: "table-scroll" }),
  renderPublicUi: (
    kind: string,
    props: { diagram: { steps: { label: string }[] }; label: string },
  ) =>
    `<figure data-kind="${kind}" aria-label="${props.label}">${props.diagram.steps.map((step) => step.label).join(" → ")}</figure>`,
}));

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

  it("render images beside the page markdown and article diagrams", () => {
    const page: SitePage = {
      kind: SitePageKind.Placeholder,
      path: "/zh-CN/compare/sample/",
      language: PublicLanguage.SimplifiedChinese,
      title: "示例",
      document: "compare/articles/sample",
      indexable: false,
    };
    const diagram = JSON.stringify({
      kind: "flow",
      label: "保存流程",
      steps: [{ label: "编码工程" }, { label: "写入文件" }],
    });
    const { html } = plannedPageContent(
      `# 示例\n\n![另存为对话框](images/save-as-browser-or-files.png)\n\n\`\`\`article-diagram\n${diagram}\n\`\`\`\n`,
      page,
    );
    assert.match(
      html,
      /<img src="\/compare\/articles\/images\/save-as-browser-or-files\.png" alt="另存为对话框" width="\d+" height="\d+"/,
    );
    assert.match(
      html,
      /<figure data-kind="article-diagram" aria-label="保存流程">编码工程 → 写入文件<\/figure>/,
    );
    assert.throws(() =>
      plannedPageContent("# 示例\n\n![](images/save-as-browser-or-files.png)\n", page),
    );
    assert.throws(() => plannedPageContent("# 示例\n\n![图](../secret.png)\n", page));
  });

  it("publish every image a written page uses", () => {
    for (const [path, source] of plannedPageImageResources()) {
      assert.match(path, /^\/[a-z-]+\/images\/[a-z0-9-]+\.png$/);
      assert.ok(existsSync(source), source);
    }
  });
});
