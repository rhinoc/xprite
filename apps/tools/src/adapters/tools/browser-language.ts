import { localizedSiteHref, PublicLanguage } from "@xprite/growth-content/language";
import { TOOLS, TOOLS_HOME, translateToolText } from "@xprite/growth-content/tools";

/** The startup HTML selects the same locale before hydration. */
export function readToolLanguage(): PublicLanguage {
  return document.documentElement.lang === PublicLanguage.SimplifiedChinese
    ? PublicLanguage.SimplifiedChinese
    : PublicLanguage.English;
}

export function writeToolLanguage(language: PublicLanguage) {
  document.documentElement.lang = language;
  const tool = TOOLS.find((item) => window.location.pathname === item.path) ?? TOOLS_HOME;
  document.title = translateToolText(tool.title, language);
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", translateToolText(tool.description, language));
  window.history.replaceState(
    window.history.state,
    "",
    localizedSiteHref(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      language,
    ),
  );
}
