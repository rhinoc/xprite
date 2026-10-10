import { SITE_PAGES, SITE_REDIRECTS } from "../../content/site/pages.ts";

const REDIRECT_STATUS = 301;
const INDEX_FILENAME = "index.html";

interface RedirectRule {
  source: string;
  destination: string;
  statusCode: number;
}

interface RewriteRule {
  source: string;
  destination: string;
}

interface SiteConfiguration {
  redirects?: readonly RedirectRule[];
  rewrites?: readonly RewriteRule[];
}

/** Generate serving rules from the same page registry used by growth and discovery. */
export function siteServingConfiguration<T extends SiteConfiguration>(configuration: T) {
  const redirects = new Map((configuration.redirects ?? []).map((rule) => [rule.source, rule]));
  for (const [source, destination] of Object.entries(SITE_REDIRECTS)) {
    redirects.set(source, { source, destination, statusCode: REDIRECT_STATUS });
  }
  const rewrites = new Map((configuration.rewrites ?? []).map((rule) => [rule.source, rule]));
  for (const { path } of SITE_PAGES) {
    if (path === "/") continue;
    rewrites.set(path, { source: path, destination: `${path}${INDEX_FILENAME}` });
  }
  return { ...configuration, redirects: [...redirects.values()], rewrites: [...rewrites.values()] };
}
