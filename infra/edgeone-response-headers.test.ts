import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { matchingHeaderValues, responseHeaders, type HeaderRule } from "./edgeone-serving-rules";

const configuration = JSON.parse(
  readFileSync(fileURLToPath(new URL("../edgeone.json", import.meta.url)), "utf8"),
) as { headers: HeaderRule[] };
const rules = configuration.headers;
const HTML_TYPE = "text/html; charset=utf-8";
const IMMUTABLE = "public, max-age=31536000, immutable";

// Directory URLs serve index.html; these cover every depth the site publishes.
const HTML_PATHS = [
  "/",
  "/editor",
  "/editor/",
  "/index.html",
  "/404.html",
  "/about/",
  "/help/",
  "/privacy/",
  "/compare/",
  "/features/",
  "/components/",
  "/ja/about/",
  "/zh-CN/help/",
  "/about/features/",
  "/compare/piskel-alternatives/",
  "/features/tilemaps/",
  "/tools/pixelate/",
  "/tools/viewer/",
  "/tools/fuse-beads/",
  "/ru/about/how-it-works/",
  "/zh-CN/compare/aseprite-online/",
  "/pt-BR/features/frame-animation/",
];
// Content-versioned (`?v=`) or content-addressed files.
const LONG_LIVED_PATHS = [
  "/theme/growth-desktop.css",
  "/theme/macintosh.css",
  "/theme/fonts.css",
  "/theme/ssg-assets/ec44f36e057ab23cc292cb214d659ff54b6dce83ff32b382945fb3903af9384d.woff2",
  "/pixel-code/fonts.css",
  "/tools/assets/bootstrap-BaWKj1Ig.js",
  "/tools/ssg-assets/b38196b4c1bbe27b2bf38371cf48ef92b1d4ec5aa82c357e6a390710a6946eca.png",
  "/assets/public-main-e_E1mfzf.js",
];
// Stable-name files that some page or script loads without a content version.
const REVALIDATED_PATHS = [
  "/showcase/devices/computer/en/animation.png",
  "/showcase/landing/editor-en-light.webp",
  "/showcase/workspace-layout/en/poster.png",
  "/about/images/workspace-compact-en.png",
  "/compare/articles/images/editor-with-aseprite-en.png",
  "/help/guide.css",
  "/help/images/en/save-as.webp",
  "/components/assets/index-mbeP5T0Z.js",
];

describe("EdgeOne response headers", () => {
  it("serves every page as UTF-8 HTML with HSTS and revalidation", () => {
    for (const path of HTML_PATHS)
      expect(responseHeaders(rules, path), path).toMatchObject({
        "content-type": HTML_TYPE,
        "cache-control": "no-cache",
        "strict-transport-security": "max-age=31536000",
      });
  });

  it("never labels a file that is not a page as HTML", () => {
    for (const path of [...LONG_LIVED_PATHS, ...REVALIDATED_PATHS, "/sw.js", "/robots.txt"])
      expect(responseHeaders(rules, path)["content-type"], path).toBeUndefined();
  });

  it("caches versioned assets for a year and revalidates stable-name files", () => {
    for (const path of LONG_LIVED_PATHS)
      expect(responseHeaders(rules, path)["cache-control"], path).toBe(IMMUTABLE);
    for (const path of REVALIDATED_PATHS)
      expect(responseHeaders(rules, path)["cache-control"], path).toBe("no-cache");
  });

  it("lists a long-lived rule after any broader rule it overrides", () => {
    // EdgeOne does not document precedence for overlapping rules; its example puts the specific
    // rule last. Any other order would leave the broader no-cache value, which is still safe.
    for (const path of LONG_LIVED_PATHS) {
      const values = matchingHeaderValues(rules, path, "Cache-Control");
      expect(values.at(-1), path).toBe(IMMUTABLE);
    }
  });

  it("stays within EdgeOne's header rule limit, even with the preview noindex rule", () => {
    // EdgeOne ignores every header rule after the 30th; preview deployments append one more.
    expect(rules.length + 1).toBeLessThanOrEqual(30);
  });

  it("keeps component docs out of search results", () => {
    expect(responseHeaders(rules, "/components/button")["x-robots-tag"]).toBe("noindex, follow");
  });
});
