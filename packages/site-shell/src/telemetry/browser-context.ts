import {
  SitePageType,
  SiteToolName,
  type SiteTelemetryProperties,
} from "../managers/ports/telemetry";

const INTERNAL_TRAFFIC_KEY = "xprite:internal-traffic";
const INTERNAL_TRAFFIC_VALUE = "1";
const TOOLS_PREFIX = "/tools/";
const EDITOR_PATH = "/editor";
enum HistoryMethod {
  Push = "pushState",
  Replace = "replaceState",
}
const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;

function toolAtPath(path: string): SiteToolName | null {
  return Object.values(SiteToolName).find((tool) => path === `${TOOLS_PREFIX}${tool}`) ?? null;
}

function pageAtPath(path: string): SitePageType {
  if (path === "/" || path === EDITOR_PATH) return SitePageType.Editor;
  if (path === "/showcase" || path.startsWith("/showcase/")) return SitePageType.Showcase;
  if (path === "/gallery" || path.startsWith("/gallery/")) return SitePageType.Gallery;
  if (
    path === "/compare" ||
    path.startsWith("/compare/") ||
    path === "/learn" ||
    path.startsWith("/learn/")
  )
    return SitePageType.Article;
  if (path === "/help" || path.startsWith("/help/")) return SitePageType.Help;
  if (path === "/tools") return SitePageType.Tools;
  if (toolAtPath(path)) return SitePageType.Tool;
  return SitePageType.Other;
}

function normalizedPath(path: string): string {
  return path.replace(/\/+$/u, "") || "/";
}

export function browserPageContext(): SiteTelemetryProperties {
  let referringDomain: string | null = null;
  try {
    const url = new URL(document.referrer);
    if (url.protocol === "https:" || url.protocol === "http:") referringDomain = url.hostname;
  } catch {
    // Direct entry has no referring domain.
  }
  const path = normalizedPath(location.pathname);
  return {
    $current_url: `${location.origin}${location.pathname}`,
    $pathname: location.pathname,
    page_type: pageAtPath(path),
    page_path: location.pathname,
    tool_name: toolAtPath(path),
    referring_domain: referringDomain,
    entry_referrer_present: Boolean(document.referrer),
    entry_referring_domain: referringDomain,
  };
}

export function internalTraffic(): boolean {
  try {
    return localStorage.getItem(INTERNAL_TRAFFIC_KEY) === INTERNAL_TRAFFIC_VALUE;
  } catch {
    return false;
  }
}

/** Document lifetime, not React lifetime: hash/query changes and hydration do not add visits. */
export function watchPageNavigation(capture: () => void): void {
  let previousPath: string | undefined;
  const changed = () => {
    if (previousPath === location.pathname) return;
    previousPath = location.pathname;
    capture();
  };
  for (const method of Object.values(HistoryMethod)) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>) {
      original.apply(this, args);
      changed();
    };
  }
  window.addEventListener("popstate", changed);
  changed();
}

/** Explicit product destinations, not general automatic click capture or link text collection. */
export function watchSiteLinks(
  capture: (properties: SiteTelemetryProperties, page: SiteTelemetryProperties) => void,
): void {
  const clicked = (event: MouseEvent) => {
    if (event.type === "click" ? event.button !== PRIMARY_BUTTON : event.button !== MIDDLE_BUTTON)
      return;
    const link =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || link.hasAttribute("download") || link.getAttribute("aria-disabled") === "true")
      return;
    const url = new URL(link.href);
    if (url.origin !== location.origin) return;
    const path = normalizedPath(url.pathname);
    const target = pageAtPath(path);
    if (target === SitePageType.Other || path === normalizedPath(location.pathname)) return;
    const page = browserPageContext();
    const properties: SiteTelemetryProperties = {
      cta_target: target === SitePageType.Tool ? toolAtPath(path) : target,
      target_page_path: url.pathname,
    };
    // React menus can prevent navigation after the capture phase, e.g. a current-page link.
    queueMicrotask(() => {
      if (!event.defaultPrevented) capture(properties, page);
    });
  };
  document.addEventListener("click", clicked, true);
  document.addEventListener("auxclick", clicked, true);
}
