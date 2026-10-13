import { describe, expect, it } from "vitest";

import {
  checkPageMetadata,
  displayWidth,
  formatMetadataIssue,
  metadataLimits,
  readPageMetadata,
  type PageMetadata,
} from "./page-metadata";

const englishDescription = "A".repeat(100);
const page = (overrides: Partial<PageMetadata>): PageMetadata => ({
  page: "/page/",
  language: "en",
  indexable: true,
  title: "Pixel art editor | Xprite",
  description: englishDescription,
  ...overrides,
});
const issuesFor = (overrides: Partial<PageMetadata>) => checkPageMetadata([page(overrides)]);

describe("displayWidth", () => {
  it("counts Latin characters as one unit and CJK characters as two", () => {
    expect(displayWidth("Xprite")).toBe(6);
    expect(displayWidth("像素画")).toBe(6);
    expect(displayWidth("在线 Aseprite 查看器")).toBe(4 + 1 + 8 + 1 + 6);
  });

  it("counts full-width punctuation as wide and astral characters once", () => {
    expect(displayWidth("：、。（）「」")).toBe(14);
    expect(displayWidth("𠀀")).toBe(2);
    expect(displayWidth("é")).toBe(1);
  });
});

describe("metadataLimits", () => {
  it("uses the CJK limits for every zh, ja and ko language tag", () => {
    expect(metadataLimits("zh-CN")).toBe(metadataLimits("zh"));
    expect(metadataLimits("ja")).toBe(metadataLimits("zh-CN"));
    expect(metadataLimits("ko-KR")).toBe(metadataLimits("zh-CN"));
    expect(metadataLimits("en")).not.toBe(metadataLimits("zh-CN"));
    expect(metadataLimits("jam")).toBe(metadataLimits("en"));
  });

  it("uses the English limits for Russian, Brazilian Portuguese and Spanish", () => {
    for (const language of ["ru", "pt-BR", "es"])
      expect(metadataLimits(language)).toBe(metadataLimits("en"));
  });
});

describe("checkPageMetadata", () => {
  it("passes English titles up to 60 characters, warns to 65 and fails above", () => {
    expect(issuesFor({ title: "T".repeat(60) })).toEqual([]);
    expect(issuesFor({ title: "T".repeat(61) })).toMatchObject([{ severity: "warning" }]);
    expect(issuesFor({ title: "T".repeat(65) })).toMatchObject([{ severity: "warning" }]);
    expect(issuesFor({ title: "T".repeat(66) })).toMatchObject([
      { severity: "error", field: "title" },
    ]);
  });

  it("bounds English descriptions at 70–160 ideally and 50–165 at most", () => {
    for (const length of [70, 160])
      expect(issuesFor({ description: "d".repeat(length) })).toEqual([]);
    for (const length of [50, 69, 161, 165])
      expect(issuesFor({ description: "d".repeat(length) })).toMatchObject([
        { severity: "warning" },
      ]);
    for (const length of [49, 166])
      expect(issuesFor({ description: "d".repeat(length) })).toMatchObject([
        { severity: "error", field: "description" },
      ]);
  });

  it("measures Chinese pages in display units", () => {
    const zh = (title: string, description = "描".repeat(50)) =>
      issuesFor({ language: "zh-CN", title, description });
    expect(zh("标".repeat(30))).toEqual([]);
    expect(zh("标".repeat(33))).toMatchObject([{ severity: "warning" }]);
    expect(zh("标".repeat(34))).toMatchObject([{ severity: "error", field: "title" }]);
    expect(zh("标题", "描".repeat(80))).toEqual([]);
    expect(zh("标题", "描".repeat(85))).toMatchObject([{ severity: "warning" }]);
    expect(zh("标题", "描".repeat(86))).toMatchObject([{ severity: "error" }]);
    expect(zh("标题", "描".repeat(19))).toMatchObject([{ severity: "error" }]);
  });

  it("measures kana and hangul as wide characters", () => {
    const ja = issuesFor({ language: "ja", title: "ド".repeat(33), description: "説".repeat(50) });
    expect(ja).toMatchObject([{ severity: "warning", field: "title" }]);
    const ko = issuesFor({ language: "ko", title: "도".repeat(34), description: "설".repeat(50) });
    expect(ko).toMatchObject([{ severity: "error", field: "title" }]);
  });

  it("fails missing or empty values", () => {
    expect(issuesFor({ title: undefined })).toMatchObject([
      { severity: "error", field: "title", message: "missing or empty" },
    ]);
    expect(issuesFor({ description: "" })).toMatchObject([
      { severity: "error", field: "description" },
    ]);
  });

  it("fails duplicates within a language but not across languages", () => {
    const issues = checkPageMetadata([
      page({ page: "/a/" }),
      page({ page: "/b/" }),
      page({ page: "/zh-CN/a/", language: "zh-CN", description: "描".repeat(50) }),
    ]);
    expect(issues.map(({ page, field }) => `${page} ${field}`).sort()).toEqual([
      "/a/ description",
      "/a/ title",
      "/b/ description",
      "/b/ title",
    ]);
  });

  it("skips pages that are not indexable", () => {
    expect(issuesFor({ indexable: false, title: "" })).toEqual([]);
  });

  it("only warns when social titles and descriptions differ", () => {
    expect(issuesFor({ ogTitle: "Other", ogDescription: englishDescription })).toMatchObject([
      { severity: "warning", field: "og:title" },
    ]);
  });

  it("formats the page, field, length and limit", () => {
    const [issue] = issuesFor({ title: "T".repeat(70) });
    expect(formatMetadataIssue(issue)).toBe(
      `✗ /page/ title: 70 chars, allowed 1–65: "${"T".repeat(70)}"`,
    );
  });
});

describe("readPageMetadata", () => {
  const html = `<!doctype html><html lang="zh-CN"><head>
    <title>像素画 &amp; 动画 | Xprite</title>
    <meta
      name="description"
      content="第一行
        第二行"
    />
    <meta content="Social" property="og:title">
    <meta name="robots" content="noindex, follow">
    <script>document.title = "<title>Not this</title>"; const m = '<meta name="description" content="no">';</script>
  </head><body><title>Body</title></body></html>`;

  it("reads the head, decodes entities and collapses whitespace", () => {
    expect(readPageMetadata(html, "/zh-CN/")).toEqual({
      page: "/zh-CN/",
      language: "zh-CN",
      indexable: false,
      title: "像素画 & 动画 | Xprite",
      description: "第一行 第二行",
      ogTitle: "Social",
      ogDescription: undefined,
    });
  });

  it("lets deployment override the page's own robots", () => {
    expect(readPageMetadata(html, "/", { indexable: true }).indexable).toBe(true);
  });

  it("defaults to English when the html element has no language", () => {
    expect(readPageMetadata("<html><head><title>T</title></head></html>", "/").language).toBe("en");
  });
});
