export enum PublicLanguage {
  English = "en",
  SimplifiedChinese = "zh-CN",
  Japanese = "ja",
  Korean = "ko",
  Russian = "ru",
  BrazilianPortuguese = "pt-BR",
  Spanish = "es",
}

/** Every public language in switcher, hreflang and sitemap order. */
export const PUBLIC_LANGUAGES: readonly PublicLanguage[] = [
  PublicLanguage.English,
  PublicLanguage.SimplifiedChinese,
  PublicLanguage.Japanese,
  PublicLanguage.Korean,
  PublicLanguage.Russian,
  PublicLanguage.BrazilianPortuguese,
  PublicLanguage.Spanish,
];

/** Languages served under a root path prefix; English paths stay unprefixed. */
export const LOCALIZED_LANGUAGES: readonly PublicLanguage[] = PUBLIC_LANGUAGES.filter(
  (language) => language !== PublicLanguage.English,
);

/** Native names shown in language switchers. */
export const PUBLIC_LANGUAGE_LABELS: Readonly<Record<PublicLanguage, string>> = {
  [PublicLanguage.English]: "English",
  [PublicLanguage.SimplifiedChinese]: "简体中文",
  [PublicLanguage.Japanese]: "日本語",
  [PublicLanguage.Korean]: "한국어",
  [PublicLanguage.Russian]: "Русский",
  [PublicLanguage.BrazilianPortuguese]: "Português (Brasil)",
  [PublicLanguage.Spanish]: "Español",
};

/** Copy for one string in every public language. */
export type LocalizedText = Readonly<Record<PublicLanguage, string>>;

/** Pick one language's copy, falling back to English when a translation is missing. */
export function localizedText<T>(
  language: PublicLanguage | string,
  copy: Readonly<Partial<Record<PublicLanguage, T>>> & { en: T },
): T {
  return copy[publicLanguage(language)] ?? copy.en;
}

/** Positional helper matching PUBLIC_LANGUAGES order: en, zh-CN, ja, ko, ru, pt-BR, es. */
export function pickText(
  language: PublicLanguage | string,
  en: string,
  zh: string,
  ja: string,
  ko: string,
  ru: string,
  pt: string,
  es: string,
): string {
  return localizedText(language, { en, "zh-CN": zh, ja, ko, ru, "pt-BR": pt, es });
}

const LOCAL_SITE_ORIGIN = "https://xprite.cc";

export function publicLanguage(value = "en"): PublicLanguage {
  const base = value.toLowerCase().split(/[-_]/)[0];
  if (base === "zh") return PublicLanguage.SimplifiedChinese;
  if (base === "ja") return PublicLanguage.Japanese;
  if (base === "ko") return PublicLanguage.Korean;
  if (base === "ru") return PublicLanguage.Russian;
  if (base === "pt") return PublicLanguage.BrazilianPortuguese;
  if (base === "es") return PublicLanguage.Spanish;
  return PublicLanguage.English;
}

/** Path prefix for one language: "" for English, "/zh-CN", "/ja", "/ko", "/ru", "/pt-BR" or "/es" otherwise. */
export function languagePrefix(language: PublicLanguage | string): string {
  const selected = publicLanguage(language);
  return selected === PublicLanguage.English ? "" : `/${selected}`;
}

/** Localized pages live under one root `/<lang>/` prefix; English paths stay unprefixed. */
const LOCALIZED_SECTIONS = /^\/(?:learn|compare|help|about|features|privacy|tools)(?:\/|$)/;
export const LOCALIZED_PREFIX = /^\/(zh-CN|ja|ko|ru|pt-BR|es)(?=\/|$)/;

export function articleLanguage(path: string): PublicLanguage {
  const match = LOCALIZED_PREFIX.exec(new URL(path, LOCAL_SITE_ORIGIN).pathname);
  return match ? publicLanguage(match[1]) : PublicLanguage.English;
}

/** Remove a localized language prefix, keeping the English path. */
export function unlocalizedPath(path: string): string {
  return path.replace(LOCALIZED_PREFIX, "") || "/";
}

/** Keep links within the selected language without changing external destinations. */
export function localizedSiteHref(href: string, language: PublicLanguage | string): string {
  if (href.startsWith("#")) return href;
  const url = new URL(href, LOCAL_SITE_ORIGIN);
  if (url.origin !== LOCAL_SITE_ORIGIN) return href;
  const path = unlocalizedPath(url.pathname);
  if (LOCALIZED_SECTIONS.test(path) && !/\.[a-z0-9]+$/i.test(path)) {
    url.pathname = `${languagePrefix(language)}${path}`;
  }
  // Tool pages carry their language in the path; components have a single language.
  if (/^\/(?:tools|components)(?:\/|$)/.test(path)) url.searchParams.delete("lang");
  return `${url.pathname}${url.search}${url.hash}`;
}

export const pageScrollLabel = (language: string) =>
  pickText(
    publicLanguage(language),
    "Page scroll",
    "页面滚动",
    "ページのスクロール",
    "페이지 스크롤",
    "Прокрутка страницы",
    "Rolagem da página",
    "Desplazamiento de página",
  );
