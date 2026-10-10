import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { describe, it, vi } from "vitest";

import { PublicLanguage } from "../../content/site/language.ts";
import { DOCUMENT_PAGES, SitePageKind, type SitePage } from "../../content/site/pages.ts";
import { sitemap } from "../seo/discovery.ts";
import {
  documentContent,
  documentHtml,
  documentImageResources,
  documentSource,
} from "./document-pages.ts";

vi.mock("../static-ui-renderer.ts", () => ({
  publicArticleClasses: () => ({ tableScroll: "table-scroll" }),
  renderPublicUi: (
    kind: string,
    props: { diagram?: { steps?: { label: string }[] }; label?: string; html?: string },
  ) =>
    props.diagram
      ? `<figure data-kind="${kind}" aria-label="${props.label}">${(props.diagram.steps ?? []).map((step) => step.label).join(" → ")}</figure>`
      : `<div data-kind="${kind}">${props.html ?? ""}</div>`,
}));

describe("document pages", () => {
  it("open each written body with the page title", () => {
    for (const page of DOCUMENT_PAGES)
      assert.ok(documentSource(page).startsWith(`# ${page.title}\n`), page.path);
  });

  it("publish the privacy notice and the about articles in both languages", () => {
    assert.deepEqual(
      DOCUMENT_PAGES.map((page) => page.path),
      [
        "/privacy/",
        "/zh-CN/privacy/",
        "/about/how-it-works/",
        "/zh-CN/about/how-it-works/",
        "/about/features/",
        "/zh-CN/about/features/",
      ],
    );
  });

  it("list every document in the sitemap", () => {
    const urls = sitemap();
    for (const page of DOCUMENT_PAGES) {
      assert.equal(page.kind, SitePageKind.Document);
      assert.equal(page.indexable, true);
      assert.ok(urls.includes(`<loc>https://xprite.cc${page.path}</loc>`), page.path);
    }
  });

  it("pair each translated document with its other language", () => {
    const privacy = documentHtml("/zh-CN/privacy/", true);
    assert.match(privacy, /<link rel="canonical" href="https:\/\/xprite\.cc\/zh-CN\/privacy\/">/);
    assert.match(privacy, /hreflang="en" href="https:\/\/xprite\.cc\/privacy\/"/);
    assert.match(privacy, /hreflang="x-default" href="https:\/\/xprite\.cc\/privacy\/"/);
    const article = documentHtml("/zh-CN/about/how-it-works/", true);
    assert.match(article, /hreflang="en" href="https:\/\/xprite\.cc\/about\/how-it-works\/"/);
    assert.match(article, /<title>工作原理 \| Xprite<\/title>/);
    const english = documentHtml("/about/how-it-works/", true);
    assert.match(
      english,
      /hreflang="zh-CN" href="https:\/\/xprite\.cc\/zh-CN\/about\/how-it-works\/"/,
    );
    assert.match(english, /<title>How Xprite Works<\/title>/);
  });

  it("drop the repository language link and describe the page from its introduction", () => {
    const page = DOCUMENT_PAGES.find((item) => item.path === "/privacy/")!;
    const { html, description } = documentContent(documentSource(page), page);
    assert.doesNotMatch(html, /PRIVACY\.zh\.md/);
    assert.doesNotMatch(description, /^Last updated/);
    assert.ok(description.length > 40, description);
  });

  it("render images beside the page markdown and article diagrams", () => {
    const page: SitePage = {
      kind: SitePageKind.Document,
      path: "/zh-CN/compare/sample/",
      language: PublicLanguage.SimplifiedChinese,
      title: "示例",
      document: "apps/growth/content/compare/articles/sample.zh-CN.md",
      indexable: true,
    };
    const diagram = JSON.stringify({
      kind: "flow",
      label: "保存流程",
      steps: [{ label: "编码工程" }, { label: "写入文件" }],
    });
    const { html } = documentContent(
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
      documentContent("# 示例\n\n![](images/save-as-browser-or-files.png)\n", page),
    );
    assert.throws(() => documentContent("# 示例\n\n![图](../secret.png)\n", page));
  });

  it("refuse images for documents outside the growth content folder", () => {
    const page = DOCUMENT_PAGES.find((item) => item.path === "/privacy/")!;
    assert.throws(() => documentContent("# Xprite Privacy Notice\n\n![a](images/a.png)\n", page));
  });

  it("publish every image a document uses", () => {
    const resources = documentImageResources();
    assert.ok(resources.size > 0);
    for (const [path, source] of resources) {
      assert.match(path, /^\/about\/images\/[a-z0-9-]+\.png$/);
      assert.ok(existsSync(source), source);
    }
  });
});
