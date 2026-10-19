import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, it } from "vitest";

import {
  BUILD_PLACEHOLDER,
  verifyOfflineManifest,
  writeOfflineManifest,
} from "./offline-manifest.ts";

let directory: string;
const SHELL = "editor-offline-abc.html";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "xprite-offline-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "sw.js"), `// worker\n${BUILD_PLACEHOLDER}\n`);
  await writeFile(join(directory, SHELL), "<html></html>");
  await writeFile(join(directory, "assets/app-AAAAAAAA.js"), "export const a = 1;\n");
  await writeFile(join(directory, "assets/app-AAAAAAAA.js.map"), "{}");
  await writeFile(join(directory, "manifest.webmanifest"), "{}");
});
afterEach(() => rm(directory, { recursive: true, force: true }));

describe("offline manifest", () => {
  it("matches the files it was computed from and skips source maps", async () => {
    await writeOfflineManifest(directory, SHELL);
    const report = await verifyOfflineManifest(directory);
    assert.equal(report.total, 3);
    assert.deepEqual(report.mismatches, []);
    assert.deepEqual(report.unlisted, []);
  });

  it("detects a file rewritten after the manifest (source map injection)", async () => {
    await writeOfflineManifest(directory, SHELL);
    await writeFile(
      join(directory, "assets/app-AAAAAAAA.js"),
      "export const a = 1;\n//# chunkId=1\n",
    );
    const report = await verifyOfflineManifest(directory);
    assert.deepEqual(report.mismatches, [{ url: "assets/app-AAAAAAAA.js", reason: "integrity" }]);
  });

  it("detects missing and unlisted files", async () => {
    await writeOfflineManifest(directory, SHELL);
    await rm(join(directory, "manifest.webmanifest"));
    await writeFile(join(directory, "assets/late-BBBBBBBB.js"), "1");
    const report = await verifyOfflineManifest(directory);
    assert.deepEqual(report.mismatches, [{ url: "manifest.webmanifest", reason: "missing" }]);
    assert.deepEqual(report.unlisted, ["assets/late-BBBBBBBB.js"]);
  });

  it("re-sealing after a rewrite restores a clean manifest with a new version", async () => {
    await writeOfflineManifest(directory, SHELL);
    const before = /"version":"([0-9a-f]+)"/.exec(await readFile(join(directory, "sw.js"), "utf8"));
    await writeFile(join(directory, "assets/app-AAAAAAAA.js"), "export const a = 2;\n");
    assert.equal((await verifyOfflineManifest(directory)).mismatches.length, 1);
    await writeOfflineManifest(directory, SHELL);
    const source = await readFile(join(directory, "sw.js"), "utf8");
    assert.equal((await verifyOfflineManifest(directory)).mismatches.length, 0);
    assert.notEqual(/"version":"([0-9a-f]+)"/.exec(source)?.[1], before?.[1]);
    assert.equal(source.match(/const OFFLINE_BUILD =/g)?.length, 1);
  });
});
