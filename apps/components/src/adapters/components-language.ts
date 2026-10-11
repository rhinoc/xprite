import { localizedSiteHref, publicLanguage, PublicLanguage } from "@xprite/growth-content/language";

export function readComponentsLanguage() {
  return publicLanguage(new URLSearchParams(window.location.search).get("lang") ?? "en");
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
