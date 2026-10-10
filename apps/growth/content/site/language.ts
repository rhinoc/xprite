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

export function articleLanguage(path: string): PublicLanguage {
  return path.split("/").includes(PublicLanguage.SimplifiedChinese)
    ? PublicLanguage.SimplifiedChinese
    : PublicLanguage.English;
}

/** Keep links within the selected language without changing external destinations. */
export function localizedSiteHref(href: string, language: PublicLanguage | string): string {
  if (href.startsWith("#")) return href;
  const url = new URL(href, LOCAL_SITE_ORIGIN);
  if (url.origin !== LOCAL_SITE_ORIGIN) return href;
  const selected = publicLanguage(language);
  if (
    /^\/(?:learn|compare|create|resources|design-school|support|legal|how-it-works|features)(?:\/|$)/.test(
      url.pathname,
    ) &&
    !/\.[a-z]+$/i.test(url.pathname)
  ) {
    const path = url.pathname.replace(/\/zh-CN(?=\/|$)/, "");
    url.pathname =
      selected === PublicLanguage.SimplifiedChinese
        ? path.replace(
            /^\/(learn|compare|create|resources|design-school|support|legal|how-it-works|features)/,
            "/$1/zh-CN",
          )
        : path;
  } else if (/^\/(?:showcase|help)\/(?:en|zh-CN)(?:\/|$)/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/(en|zh-CN)(?=\/|$)/, `/${selected}`);
  } else if (/^\/(?:tools|gallery)(?:\/|$)/.test(url.pathname)) {
    if (selected === PublicLanguage.SimplifiedChinese)
      url.searchParams.set(LANGUAGE_PARAMETER, selected);
    else url.searchParams.delete(LANGUAGE_PARAMETER);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
