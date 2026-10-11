import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, it } from "vitest";

import {
  contentVersion,
  findUnversionedReferences,
  isContentAddressed,
  needsContentVersion,
  versionOutputDirectory,
  versionReferences,
} from "./content-versions.ts";

const directories: string[] = [];
async function output(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "content-versions-"));
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

describe("content versions", () => {
  it("leaves content-addressed, external and service worker URLs alone", () => {
    assert.equal(isContentAddressed("/assets/showcase-BEsLzuJ0.css"), true);
    assert.equal(isContentAddressed(`/theme/ssg-assets/${"a".repeat(64)}.png`), true);
    assert.equal(needsContentVersion("/theme/growth-desktop.css"), true);
    assert.equal(needsContentVersion("/assets/showcase-BEsLzuJ0.css"), false);
    assert.equal(needsContentVersion("/sw.js"), false);
    assert.equal(needsContentVersion("/about/"), false);
    const html = [
      '<link rel="stylesheet" href="/theme/growth-desktop.css">',
      '<link rel="stylesheet" href="/assets/showcase-BEsLzuJ0.css">',
      '<link rel="canonical" href="https://xprite.cc/about/">',
      '<link rel="preload" href="/theme/chikarego2.woff2?v=manual#x" as="font">',
      '<a href="/about/">About</a>',
      "<style>@font-face{src:url('./startup.woff2')}</style>",
    ].join("\n");
    assert.equal(
      versionReferences(html, "html", () => "0123456789ab"),
      [
        '<link rel="stylesheet" href="/theme/growth-desktop.css?v=0123456789ab">',
        '<link rel="stylesheet" href="/assets/showcase-BEsLzuJ0.css">',
        '<link rel="canonical" href="https://xprite.cc/about/">',
        '<link rel="preload" href="/theme/chikarego2.woff2?v=0123456789ab#x" as="font">',
        '<a href="/about/">About</a>',
        "<style>@font-face{src:url('./startup.woff2?v=0123456789ab')}</style>",
      ].join("\n"),
    );
  });

  it("versions stylesheets after their own references, so font changes reach every page", async () => {
    const root = await output({
      "theme/chikarego2.woff2": "font-1",
      "theme/fonts.css":
        '@import "../pixel-code/fonts.css";\n@font-face{src:url("./chikarego2.woff2")}',
      "pixel-code/fonts.css": "@font-face{src:url(./pixel-code.woff2)}",
      "pixel-code/pixel-code.woff2": "code-font",
      "about/index.html": '<link rel="stylesheet" href="/theme/fonts.css">',
      "404.html": '<link rel="stylesheet" href="theme/fonts.css">',
    });
    await versionOutputDirectory(root);
    const fonts = await readFile(join(root, "theme/fonts.css"), "utf8");
    const nested = await readFile(join(root, "pixel-code/fonts.css"), "utf8");
    assert.equal(
      nested,
      `@font-face{src:url(./pixel-code.woff2?v=${contentVersion("code-font")})}`,
    );
    assert.equal(
      fonts,
      `@import "../pixel-code/fonts.css?v=${contentVersion(nested)}";\n` +
        `@font-face{src:url("./chikarego2.woff2?v=${contentVersion("font-1")}")}`,
    );
    const link = `<link rel="stylesheet" href="/theme/fonts.css?v=${contentVersion(fonts)}">`;
    assert.equal(await readFile(join(root, "about/index.html"), "utf8"), link);
    assert.equal(await readFile(join(root, "404.html"), "utf8"), link.replace('"/theme', '"theme'));
    assert.deepEqual(await findUnversionedReferences(root), []);
  });

  it("resolves root-absolute references under the app base", async () => {
    const root = await output({
      "menu-icon.svg": "<svg/>",
      "pixelate/index.html":
        '<link rel="icon" href="/tools/menu-icon.svg"><img src="/icon-192.png">',
    });
    await versionOutputDirectory(root, { base: "/tools/" });
    assert.equal(
      await readFile(join(root, "pixelate/index.html"), "utf8"),
      `<link rel="icon" href="/tools/menu-icon.svg?v=${contentVersion("<svg/>")}"><img src="/icon-192.png">`,
    );
  });

  it("reports stable-name references without a version in pages, stylesheets and scripts", async () => {
    const root = await output({
      "theme/macintosh.css": "a{background:url(/theme/paper.png)}",
      "theme/paper.png": "png",
      "about/index.html":
        '<link rel="stylesheet" href="/theme/macintosh.css"><script src="/missing.js"></script>',
      "assets/app-BEsLzuJ0.js": 'link.href="/theme/macintosh.css";register("/sw.js")',
      "sw.js": 'const shell="/theme/macintosh.css";',
    });
    assert.deepEqual(await findUnversionedReferences(root), [
      { file: "about/index.html", reference: "/theme/macintosh.css" },
      { file: "assets/app-BEsLzuJ0.js", reference: "/theme/macintosh.css" },
      { file: "theme/macintosh.css", reference: "/theme/paper.png" },
    ]);
    await versionOutputDirectory(root);
    assert.deepEqual(
      (await findUnversionedReferences(root)).map(({ file }) => file),
      ["assets/app-BEsLzuJ0.js"],
    );
  });
});
