import {
  LOCALIZED_PREFIX,
  localizedSiteHref,
  publicLanguage,
  PublicLanguage,
  unlocalizedPath,
} from "@xprite/growth-content/language";
import {
  TOOL_HEADING_ID,
  TOOLS,
  toolHeading,
  translateToolText,
} from "@xprite/growth-content/tools";
import {
  readBrowserLanguagePreference,
  writeBrowserLanguagePreference,
} from "@xprite/site-shell/browser";

/**
 * A localized address such as `/ja/tools/pixelate/` always opens in its own language. The
 * English address keeps following a saved choice; the startup HTML selects the same locale
 * before hydration in both cases.
 */
export function readToolLanguage(): PublicLanguage {
  const prefix = LOCALIZED_PREFIX.exec(window.location.pathname);
  if (prefix) return publicLanguage(prefix[1]);
  return publicLanguage(readBrowserLanguagePreference() ?? document.documentElement.lang);
}

/** Switch the page in place and move to that language's address, keeping the loaded file. */
export function writeToolLanguage(language: PublicLanguage) {
  const tool = TOOLS.find((item) => unlocalizedPath(window.location.pathname) === item.path);
  if (!tool) throw Error(`Unknown tool page: ${window.location.pathname}`);
  writeBrowserLanguagePreference(language);
  document.documentElement.lang = language;
  document.title = translateToolText(tool.title, language);
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", translateToolText(tool.description, language));
  const heading = document.getElementById(TOOL_HEADING_ID);
  if (heading) heading.textContent = toolHeading(tool, language);
  const url = new URL(window.location.href);
  url.pathname = localizedSiteHref(tool.path, language);
  const canonical = document.querySelector('link[rel="canonical"]');
  canonical?.setAttribute("href", new URL(url.pathname, canonical.getAttribute("href")!).href);
  // Replace rather than push: the page keeps no per-language history to restore on Back.
  if (url.pathname !== window.location.pathname)
    window.history.replaceState(window.history.state, "", url);
}
