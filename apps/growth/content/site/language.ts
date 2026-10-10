export enum PublicLanguage {
  English = "en",
  SimplifiedChinese = "zh-CN",
}

const LANGUAGE_PARAMETER = "lang";
const LOCAL_SITE_ORIGIN = "https://xprite.cc";

export function publicLanguage(value = "en"): PublicLanguage {
  return value.toLowerCase().startsWith("zh")
    ? PublicLanguage.SimplifiedChinese
    : PublicLanguage.English;
}

/** Localized pages live under one root `/zh-CN/` prefix; English paths stay unprefixed. */
const LOCALIZED_SECTIONS = /^\/(?:learn|compare|help|about|privacy)(?:\/|$)/;
const LOCALIZED_PREFIX = /^\/zh-CN(?=\/|$)/;

export function articleLanguage(path: string): PublicLanguage {
  return LOCALIZED_PREFIX.test(new URL(path, LOCAL_SITE_ORIGIN).pathname)
    ? PublicLanguage.SimplifiedChinese
    : PublicLanguage.English;
}

/** Keep links within the selected language without changing external destinations. */
export function localizedSiteHref(href: string, language: PublicLanguage | string): string {
  if (href.startsWith("#")) return href;
  const url = new URL(href, LOCAL_SITE_ORIGIN);
  if (url.origin !== LOCAL_SITE_ORIGIN) return href;
  const selected = publicLanguage(language);
  const path = url.pathname.replace(LOCALIZED_PREFIX, "") || "/";
  if (LOCALIZED_SECTIONS.test(path) && !/\.[a-z0-9]+$/i.test(path)) {
    url.pathname = selected === PublicLanguage.SimplifiedChinese ? `/zh-CN${path}` : path;
  } else if (/^\/(?:tools|components)(?:\/|$)/.test(url.pathname)) {
    if (selected === PublicLanguage.SimplifiedChinese)
      url.searchParams.set(LANGUAGE_PARAMETER, selected);
    else url.searchParams.delete(LANGUAGE_PARAMETER);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
