// IndexNow (https://www.indexnow.org/documentation): tells Bing, Yandex and other
// participating engines which URLs changed. The key is public by design. Search engines
// fetch it from the site root to confirm that the submitter controls the host, so it is not a
// secret and nothing here reads an environment variable.

export const INDEXNOW_HOST = "xprite.cc";
export const INDEXNOW_KEY = "e6a5fd0ba086746848ba81c2b4ce2734";
export const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY_FILE}`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol accepts at most 10,000 URLs per request. */
export const INDEXNOW_MAX_URLS = 10_000;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** Absolute `<loc>` URLs of a sitemap, kept to this host and without duplicates. */
export function sitemapUrls(xml: string): string[] {
  const urls = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), (match) => match[1]);
  return [...new Set(urls)].filter((url) => new URL(url).host === INDEXNOW_HOST);
}

/** Path of the built file that serves a public URL: `/about/` is `about/index.html`. */
export function publishedFilePath(url: string): string {
  const { pathname } = new URL(url);
  return pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
}

/**
 * A page's content without build noise. Every build renames hashed scripts, styles and preload
 * links, so those are dropped; JSON-LD structured data stays because it is page content.
 */
export function contentSignature(html: string): string {
  return html
    .replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
}

/** One payload per 10,000 URLs; none when there is nothing to submit. */
export function indexNowPayloads(urls: readonly string[]): IndexNowPayload[] {
  const payloads: IndexNowPayload[] = [];
  for (let start = 0; start < urls.length; start += INDEXNOW_MAX_URLS) {
    payloads.push({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: urls.slice(start, start + INDEXNOW_MAX_URLS),
    });
  }
  return payloads;
}
