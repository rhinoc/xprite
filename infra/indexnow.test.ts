import { describe, expect, it } from "vitest";

import {
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_MAX_URLS,
  contentSignature,
  indexNowPayloads,
  publishedFilePath,
  sitemapUrls,
} from "./indexnow.ts";

describe("IndexNow", () => {
  it("uses an 8 to 128 character hexadecimal key served from the site root", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{8,128}$/);
    expect(INDEXNOW_KEY_FILE).toBe(`${INDEXNOW_KEY}.txt`);
    expect(INDEXNOW_KEY_LOCATION).toBe(`https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
  });

  it("reads unique URLs of this host from a sitemap", () => {
    const xml = `<urlset><url><loc>https://xprite.cc/about/</loc></url>
      <url><loc> https://xprite.cc/tools/pixelate/ </loc></url>
      <url><loc>https://xprite.cc/about/</loc></url>
      <url><loc>https://example.com/other/</loc></url></urlset>`;
    expect(sitemapUrls(xml)).toEqual([
      "https://xprite.cc/about/",
      "https://xprite.cc/tools/pixelate/",
    ]);
  });

  it("maps public URLs to built files", () => {
    expect(publishedFilePath("https://xprite.cc/")).toBe("index.html");
    expect(publishedFilePath("https://xprite.cc/zh-CN/about/")).toBe("zh-CN/about/index.html");
    expect(publishedFilePath("https://xprite.cc/sitemap.xml")).toBe("sitemap.xml");
  });

  it("ignores hashed build assets but not page content or structured data", () => {
    const page = (hash: string, body: string, data = "{}") =>
      `<head><link rel="modulepreload" href="/a-${hash}.js"><link rel="stylesheet" href="/s-${hash}.css">
      <script type="module" src="/m-${hash}.js"></script><script>boot("${hash}")</script>
      <style>.x_${hash}{color:red}</style><script type="application/ld+json">${data}</script></head><body>${body}</body>`;
    expect(contentSignature(page("aaa", "Hello"))).toBe(contentSignature(page("bbb", "Hello")));
    expect(contentSignature(page("aaa", "Hello"))).not.toBe(
      contentSignature(page("aaa", "Hello!")),
    );
    expect(contentSignature(page("aaa", "Hello"))).not.toBe(
      contentSignature(page("aaa", "Hello", '{"a":1}')),
    );
  });

  it("splits submissions at the protocol limit and skips empty ones", () => {
    expect(indexNowPayloads([])).toEqual([]);
    const urls = Array.from({ length: INDEXNOW_MAX_URLS + 1 }, (_, i) => `https://xprite.cc/${i}/`);
    const payloads = indexNowPayloads(urls);
    expect(payloads.map((payload) => payload.urlList.length)).toEqual([INDEXNOW_MAX_URLS, 1]);
    expect(payloads[0]).toMatchObject({ host: INDEXNOW_HOST, key: INDEXNOW_KEY });
  });
});
