import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, it } from "vitest";

import {
  ASSET_ARCHIVE_INDEX,
  PREVIOUS_RELEASES_KEPT,
  assetArchiveName,
  carryOverPreviousAssets,
  extractAssetArchive,
  isImmutableAsset,
  selectPreviousArchives,
  writeAssetArchive,
  type Release,
} from "./previous-release-assets.ts";

const directories: string[] = [];
async function directory(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "previous-assets-"));
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

const sha = (seed: string) => seed.repeat(40).slice(0, 40);
const DIGEST = "0b5f9ca845059c44228980110882aecea8ed9cbeb1f7ed420d551bb630548cca";

async function snapshot(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries.filter((item) => item.isFile()))
    files[join(entry.parentPath, entry.name).slice(root.length + 1)] = await readFile(
      join(entry.parentPath, entry.name),
      "utf8",
    );
  return files;
}

describe("immutable asset classification", () => {
  it("accepts content-hashed files in every app's asset folders", () => {
    for (const path of [
      "assets/editor-index-BwuJOsYd.js",
      "assets/editor-preview-worker-Dl2o1R_k.js",
      "assets/zstd-CV7N7xSg.wasm",
      "assets/aseprite-pas5qDb-.woff2",
      "assets/index-aDlu07tY.css",
      "tools/assets/pixelation-worker-BEP4I2BU.js",
      "components/assets/index-CuM4iW_9.js",
      `theme/ssg-assets/${DIGEST}.png`,
      `tools/ssg-assets/${DIGEST}.svg`,
    ])
      assert.equal(isImmutableAsset(path), true, path);
  });

  it("never carries pages, workers, metadata or stable-name files", () => {
    for (const path of [
      "index.html",
      "sw.js",
      "release.json",
      "edgeone.json",
      "middleware.js",
      "sitemap.xml",
      "robots.txt",
      "manifest.webmanifest",
      "assets/manifest.webmanifest",
      "assets/sw.js",
      "assets/page-BwuJOsYd.html",
      "assets/data-BwuJOsYd.json",
      "assets/index-aDlu07tY.js.map",
      "theme/fonts.css",
      "theme/chikarego2.woff2",
      `editor-offline-${DIGEST}.html`,
      "about/images/save-as-location-en.png",
      "showcase/ipad/hello/hello-frame-01.png",
      "assets/fonts.css",
      "../assets/editor-index-BwuJOsYd.js",
      "/assets/editor-index-BwuJOsYd.js",
      "assets/../editor-index-BwuJOsYd.js",
    ])
      assert.equal(isImmutableAsset(path), false, path);
  });
});

const OLD_CHUNK = "assets/feedback-BpIBQzSL.js";
const OLD_TOOL_CHUNK = "tools/assets/pixelate-Cv504V3a.js";
const SHARED_FONT = "assets/pixel-code-5o0DEeso.woff2";
const INJECTED = "assets/module.full.no-external-CcsgZOCp.js";

function previousBuild(version: string) {
  return {
    "index.html": `<script src="/assets/editor-index-${version}.js"></script>`,
    "sw.js": `const OFFLINE_BUILD = ${version};`,
    "release.json": `{"ref":"${version}"}`,
    "theme/fonts.css": `/* ${version} */`,
    [OLD_CHUNK]: "old feedback chunk",
    [OLD_TOOL_CHUNK]: "old pixelate tool chunk",
    [SHARED_FONT]: "font",
    [INJECTED]: "chunk();//# chunkId=old",
  };
}

const currentBuild = {
  "index.html": '<script src="/assets/editor-index-NEWHASH1.js"></script>',
  "assets/editor-index-NEWHASH1.js": "new entry",
  "sw.js": "const OFFLINE_BUILD = new;",
  "release.json": '{"ref":"v0.1.15"}',
  "theme/fonts.css": "/* new */",
  [SHARED_FONT]: "font",
  [INJECTED]: "chunk();//# chunkId=new",
};

async function archiveOf(files: Record<string, string>, ref: string, release: string, at: string) {
  const site = await directory(files);
  const out = await directory();
  const path = join(out, assetArchiveName(ref));
  const manifest = await writeAssetArchive(site, path, { ref, release, createdAt: at });
  return { path, manifest };
}

describe("previous release carry-over", () => {
  it("archives only immutable files", async () => {
    const { path, manifest } = await archiveOf(
      previousBuild("OLDHASH1"),
      "v0.1.14",
      sha("b"),
      "2026-10-21T00:00:00.000Z",
    );
    assert.deepEqual(
      manifest.files.map(({ path: file }) => file),
      [OLD_CHUNK, INJECTED, SHARED_FONT, OLD_TOOL_CHUNK].sort(),
    );
    const extracted = await directory();
    assert.deepEqual(await extractAssetArchive(path, extracted), manifest);
  });

  it("adds old chunks without changing any file of the new build", async () => {
    const { path } = await archiveOf(
      previousBuild("OLDHASH1"),
      "v0.1.14",
      sha("b"),
      "2026-10-21T00:00:00.000Z",
    );
    const archives = dirname(path);
    const deployment = await directory(currentBuild);
    const report = await carryOverPreviousAssets(deployment, archives, {
      currentRelease: sha("c"),
      currentRef: "v0.1.15",
    });
    const files = await snapshot(deployment);
    assert.equal(files[OLD_CHUNK], "old feedback chunk");
    assert.equal(files[OLD_TOOL_CHUNK], "old pixelate tool chunk");
    for (const [name, content] of Object.entries(currentBuild)) assert.equal(files[name], content);
    assert.deepEqual(
      Object.keys(files).sort(),
      [...Object.keys(currentBuild), OLD_CHUNK, OLD_TOOL_CHUNK].sort(),
    );
    assert.deepEqual(report.carried, [OLD_CHUNK, OLD_TOOL_CHUNK]);
    assert.deepEqual(report.releases, [
      {
        ref: "v0.1.14",
        release: sha("b"),
        added: 2,
        addedBytes: 41,
        identical: 1,
        kept: [INJECTED],
      },
    ]);
  });

  it("carries nothing on the first deployment", async () => {
    const deployment = await directory(currentBuild);
    for (const archives of [join(deployment, "missing"), await directory()]) {
      const report = await carryOverPreviousAssets(deployment, archives, {
        currentRelease: sha("c"),
      });
      assert.deepEqual(report, { releases: [], carried: [], carriedBytes: 0 });
    }
    assert.deepEqual(await snapshot(deployment), currentBuild);
  });

  it(`keeps the newest ${PREVIOUS_RELEASES_KEPT} previous releases, newest copy first`, async () => {
    const archives = await directory();
    const releases = [
      ["v0.1.11", "1", "2026-10-18T00:00:00.000Z"],
      ["v0.1.12", "2", "2026-10-19T00:00:00.000Z"],
      ["v0.1.13", "3", "2026-10-20T00:00:00.000Z"],
      ["v0.1.14", "4", "2026-10-21T00:00:00.000Z"],
      ["v0.1.15", "c", "2026-10-22T00:00:00.000Z"],
    ];
    for (const [ref, seed, at] of releases) {
      const { path } = await archiveOf(
        { [`assets/only-${ref.replaceAll(".", "_")}x.js`]: ref, "assets/shared-ABCDEFGH.js": ref },
        ref,
        sha(seed),
        at,
      );
      await writeFile(join(archives, assetArchiveName(ref)), await readFile(path));
    }
    const deployment = await directory(currentBuild);
    const report = await carryOverPreviousAssets(deployment, archives, {
      currentRelease: sha("c"),
      currentRef: "v0.1.15",
    });
    assert.deepEqual(
      report.releases.map(({ ref }) => ref),
      ["v0.1.14", "v0.1.13", "v0.1.12"],
    );
    const files = await snapshot(deployment);
    assert.equal(files["assets/only-v0_1_12x.js"], "v0.1.12");
    assert.equal(files["assets/only-v0_1_11x.js"], undefined);
    assert.equal(files["assets/only-v0_1_15x.js"], undefined);
    assert.equal(files["assets/shared-ABCDEFGH.js"], "v0.1.14");

    // index.json (download order: latest production deployment first) wins over archive time.
    await writeFile(
      join(archives, ASSET_ARCHIVE_INDEX),
      JSON.stringify(
        ["v0.1.12", "v0.1.11", "v0.1.14"].map((ref) => ({ name: assetArchiveName(ref) })),
      ),
    );
    const redeploy = await directory(currentBuild);
    const ordered = await carryOverPreviousAssets(redeploy, archives, { currentRelease: sha("c") });
    assert.deepEqual(
      ordered.releases.map(({ ref }) => ref),
      ["v0.1.12", "v0.1.11", "v0.1.14"],
    );
    assert.equal((await snapshot(redeploy))["assets/shared-ABCDEFGH.js"], "v0.1.12");
  });

  it("rejects archives that hold anything but verified immutable files", async () => {
    const tamper = async (edit: (root: string) => Promise<void>) => {
      const { path } = await archiveOf(
        previousBuild("OLDHASH1"),
        "v0.1.14",
        sha("b"),
        "2026-10-21T00:00:00.000Z",
      );
      const root = await directory();
      execFileSync("tar", ["-xzf", path, "-C", root]);
      await edit(root);
      execFileSync("tar", ["-czf", path, "-C", root, "manifest.json", "files"]);
      return path;
    };
    const page = await tamper(async (root) => {
      const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
      manifest.files.push({ path: "index.html", sha256: "0", size: 1 });
      await writeFile(join(root, "files/index.html"), "<html>");
      await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    });
    await assert.rejects(
      extractAssetArchive(page, await directory()),
      /index\.html is not an immutable/,
    );
    const changed = await tamper((root) => writeFile(join(root, "files", OLD_CHUNK), "changed"));
    await assert.rejects(
      extractAssetArchive(changed, await directory()),
      /does not match its digest/,
    );
    const extra = await tamper((root) => writeFile(join(root, "files/sw.js"), "worker"));
    await assert.rejects(
      extractAssetArchive(extra, await directory()),
      /files\/sw\.js is not listed/,
    );
  });
});

describe("previous archive selection", () => {
  const asset = (ref: string, updated: string, extra = {}) => ({
    id: 1,
    name: assetArchiveName(ref),
    state: "uploaded",
    updated_at: updated,
    url: `https://api.github.com/assets/${ref}`,
    size: 10,
    ...extra,
  });
  const releases: Release[] = [
    { tag_name: "v0.1.15", assets: [asset("v0.1.15", "2026-10-25T00:00:00Z")] },
    { tag_name: "v0.1.14", assets: [asset("v0.1.14", "2026-10-21T00:00:00Z")] },
    { tag_name: "v0.1.13", assets: [asset("v0.1.13", "2026-10-24T00:00:00Z")] },
    { tag_name: "v0.1.12", assets: [] },
    { tag_name: "v0.1.11", assets: [asset("v0.1.11", "2026-10-19T00:00:00Z", { state: "new" })] },
    { tag_name: "v0.1.10", assets: [asset("v0.1.10", "2026-10-18T00:00:00Z")] },
    { tag_name: "v0.1.9", assets: [asset("v0.1.9", "2026-10-17T00:00:00Z")] },
  ];

  it("picks the most recently deployed archives other than the current release", () => {
    assert.deepEqual(
      selectPreviousArchives(releases, "v0.1.15").map(({ ref }) => ref),
      ["v0.1.13", "v0.1.14", "v0.1.10"],
    );
    assert.deepEqual(
      selectPreviousArchives(releases, "v0.1.16").map(({ ref }) => ref),
      ["v0.1.15", "v0.1.13", "v0.1.14"],
    );
    assert.deepEqual(selectPreviousArchives([], "v0.1.15"), []);
  });
});
