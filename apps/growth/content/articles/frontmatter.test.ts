import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  ArticleFrontmatterField,
  parseArticleFrontmatter,
  resolveArticleDates,
} from "./frontmatter.ts";

const FALLBACK_DATE = "2026-01-01";

describe("article frontmatter", () => {
  it("leaves articles without a block unchanged", () => {
    const source = "# Title\n\nBody.\n";
    const parsed = parseArticleFrontmatter(source);
    assert.deepEqual(parsed.frontmatter, {});
    assert.equal(parsed.body, source);
    assert.deepEqual(resolveArticleDates(FALLBACK_DATE, parsed.frontmatter), {
      dateModified: FALLBACK_DATE,
    });
  });

  it("reads published and updated dates and removes the block", () => {
    const parsed = parseArticleFrontmatter(
      `---\n${ArticleFrontmatterField.Published}: 2026-10-01\n${ArticleFrontmatterField.Updated}: 2026-10-10\n---\n# Title\n`,
    );
    assert.deepEqual(parsed.frontmatter, { published: "2026-10-01", updated: "2026-10-10" });
    assert.equal(parsed.body, "# Title\n");
    assert.deepEqual(resolveArticleDates(FALLBACK_DATE, parsed.frontmatter), {
      dateModified: "2026-10-10",
      datePublished: "2026-10-01",
    });
  });

  it("keeps the registry date when only published is set", () => {
    const parsed = parseArticleFrontmatter("---\npublished: 2026-10-10\n---\n");
    assert.deepEqual(resolveArticleDates(FALLBACK_DATE, parsed.frontmatter), {
      dateModified: FALLBACK_DATE,
      datePublished: "2026-10-10",
    });
  });

  it("rejects unknown fields, duplicates, and impossible dates", () => {
    assert.throws(
      () => parseArticleFrontmatter("---\nreviewed: 2026-10-10\n---\n"),
      /Unknown article frontmatter field/,
    );
    assert.throws(
      () => parseArticleFrontmatter("---\nupdated: 2026-10-10\nupdated: 2026-10-11\n---\n"),
      /Duplicate article frontmatter field/,
    );
    assert.throws(
      () => parseArticleFrontmatter("---\nupdated: 2026-02-31\n---\n"),
      /not a real date/,
    );
    assert.throws(() => parseArticleFrontmatter("---\nupdated: 2026-10-10\n"), /must close/);
  });
});
