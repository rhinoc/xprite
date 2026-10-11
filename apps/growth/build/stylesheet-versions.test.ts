import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it } from "vitest";

import {
  stylesheetVersion,
  versionPublishedStylesheets,
  versionStylesheetLinks,
} from "./stylesheet-versions.ts";

describe("public stylesheet versions", () => {
  it("versions stable stylesheet addresses and leaves hashed assets alone", () => {
    const html = [
      '<link rel="stylesheet" href="/theme/growth-desktop.css" />',
      '<link rel="stylesheet" crossorigin href="/assets/showcase-BEsLzuJ0.css">',
      '<link rel="preload" href="/theme/macintosh.css" as="style">',
      '<link rel="stylesheet" href="/theme/missing.css">',
    ].join("\n");
    const versioned = versionStylesheetLinks(html, (pathname) =>
      pathname === "/theme/growth-desktop.css" ? "0123456789ab" : undefined,
    );
    assert.equal(
      versioned,
      [
        '<link rel="stylesheet" href="/theme/growth-desktop.css?v=0123456789ab" />',
        '<link rel="stylesheet" crossorigin href="/assets/showcase-BEsLzuJ0.css">',
        '<link rel="preload" href="/theme/macintosh.css" as="style">',
        '<link rel="stylesheet" href="/theme/missing.css">',
      ].join("\n"),
    );
  });

  it("rewrites every emitted page with the final stylesheet bytes", async () => {
    const output = await mkdtemp(join(tmpdir(), "growth-stylesheets-"));
    try {
      const css = "[data-ui-window-kind=note]{background:var(--ui-note-paper)}";
      await mkdir(join(output, "theme"));
      await mkdir(join(output, "about"));
      await writeFile(join(output, "theme/growth-desktop.css"), css);
      const link = '<link rel="stylesheet" href="/theme/growth-desktop.css">';
      await writeFile(join(output, "404.html"), link);
      await writeFile(join(output, "about/index.html"), link);
      await versionPublishedStylesheets(output);
      const expected = `<link rel="stylesheet" href="/theme/growth-desktop.css?v=${stylesheetVersion(css)}">`;
      assert.equal(await readFile(join(output, "404.html"), "utf8"), expected);
      assert.equal(await readFile(join(output, "about/index.html"), "utf8"), expected);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
