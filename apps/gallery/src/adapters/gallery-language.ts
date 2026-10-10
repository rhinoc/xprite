import { localizedSiteHref, publicLanguage, PublicLanguage } from "@xprite/growth-content/language";

export function readGalleryLanguage() {
  return publicLanguage(new URLSearchParams(window.location.search).get("lang") ?? "en");
}
export function writeGalleryLanguage(language: PublicLanguage) {
  document.documentElement.lang = language;
  document.title =
    language === PublicLanguage.SimplifiedChinese ? "Xprite UI 组件库" : "Xprite UI Gallery";
  window.history.replaceState(
    window.history.state,
    "",
    localizedSiteHref(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      language,
    ),
  );
}
