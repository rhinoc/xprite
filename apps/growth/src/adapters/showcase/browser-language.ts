import { SHOWCASE_SEARCH_ATTRIBUTE, showcaseSearchMetadata } from "$content/showcase/index";
import { SHOWCASE_PAGES, SHOWCASE_SITE_URL } from "$content/showcase/pages";

import { SHOWCASE_COPY, ShowcaseLanguage } from "$/managers/showcase/showcase-language";

export function readShowcaseLanguage(): ShowcaseLanguage {
  return window.location.pathname === SHOWCASE_PAGES[ShowcaseLanguage.Chinese].path
    ? ShowcaseLanguage.Chinese
    : ShowcaseLanguage.English;
}

export function applyShowcaseLanguage(language: ShowcaseLanguage): void {
  const copy = SHOWCASE_COPY[language];
  document.documentElement.lang = language;
  document.title = copy.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", copy.description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", copy.title);
  document
    .querySelector('meta[property="og:description"]')
    ?.setAttribute("content", copy.description);
  const url = new URL(window.location.href);
  const path = SHOWCASE_PAGES[language].path;
  const canonical = new URL(path, SHOWCASE_SITE_URL).href;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
  document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", copy.title);
  document
    .querySelector('meta[name="twitter:description"]')
    ?.setAttribute("content", copy.description);
  const schema = document.querySelector<HTMLScriptElement>(`script[${SHOWCASE_SEARCH_ATTRIBUTE}]`);
  if (schema)
    schema.textContent = JSON.stringify(
      showcaseSearchMetadata(language, SHOWCASE_PAGES[language], SHOWCASE_SITE_URL),
    );
  if (url.pathname === path && !url.search) return;
  url.pathname = path;
  url.search = "";
  window.history.pushState(window.history.state, "", url);
}

export function observeShowcaseLanguage(callback: (language: ShowcaseLanguage) => void) {
  const changed = () => callback(readShowcaseLanguage());
  window.addEventListener("popstate", changed);
  return () => window.removeEventListener("popstate", changed);
}
