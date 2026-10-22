import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, it } from "vitest";

import { findOutputConflicts, mergeSiteOutputs } from "./site-assembly.ts";

const directories: string[] = [];
async function output(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "site-assembly-"));
  directories.push(root);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("site assembly", () => {
  it("merges outputs and allows identical files at one path", async () => {
    const editor = await output({ "assets/font-a1b2c3d4.woff2": "font", "index.html": "editor" });
    const growth = await output({ "assets/font-a1b2c3d4.woff2": "font", "about/index.html": "a" });
    const tools = await output({ "assets/font-a1b2c3d4.woff2": "other font" });
    const site = await output({});
    await mergeSiteOutputs(site, [
      { label: "editor", directory: editor },
      { label: "growth", directory: growth },
      { label: "tools", directory: tools, prefix: "tools" },
    ]);
    assert.equal(await readFile(join(site, "index.html"), "utf8"), "editor");
    assert.equal(await readFile(join(site, "about/index.html"), "utf8"), "a");
    assert.equal(
      await readFile(join(site, "tools/assets/font-a1b2c3d4.woff2"), "utf8"),
      "other font",
    );
  });

  it("refuses an app whose copy would replace different bytes from another app", async () => {
    // Production injects PostHog debug IDs into the editor's copy of a chunk that growth also emits.
    const chunk = "assets/module.full.no-external-CcsgZOCp.js";
    const editor = await output({ [chunk]: "injected();\n//# chunkId=1" });
    const growth = await output({ [chunk]: "original();", "about/index.html": "a" });
    const site = await output({});
    const outputs = [
      { label: "editor", directory: editor },
      { label: "growth", directory: growth },
    ];
    assert.deepEqual(await findOutputConflicts(outputs), [
      { path: chunk, labels: ["editor", "growth"] },
    ]);
    await assert.rejects(
      mergeSiteOutputs(site, outputs),
      /module\.full\.no-external-CcsgZOCp\.js \(editor vs growth\)/,
    );
    await assert.rejects(readFile(join(site, "about/index.html")));
  });
});
