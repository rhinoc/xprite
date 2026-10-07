const SITE_ORIGIN = "https://xprite.cc";

/** Keep public-page navigation on the current website, including LAN development origins. */
export function siteNavigationHref(href: string): string {
  if (!href.startsWith("https://")) return href;
  const url = new URL(href);
  return url.origin === SITE_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : href;
}
