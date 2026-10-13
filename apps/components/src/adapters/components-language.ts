import { localizedSiteHref, publicLanguage, PublicLanguage } from "@xprite/growth-content/language";

/** The internal component gallery is written in English and Simplified Chinese only. */
export function readComponentsLanguage() {
  const language = publicLanguage(new URLSearchParams(window.location.search).get("lang") ?? "en");
  return language === PublicLanguage.SimplifiedChinese ? language : PublicLanguage.English;
}
export function writeComponentsLanguage(language: PublicLanguage) {
  document.documentElement.lang = language;
  document.title =
    language === PublicLanguage.SimplifiedChinese ? "Xprite 网页组件" : "Xprite Web Components";
  window.history.replaceState(
    window.history.state,
    "",
    localizedSiteHref(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      language,
    ),
  );
}
