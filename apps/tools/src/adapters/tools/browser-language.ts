import { PublicLanguage } from "@xprite/growth-content/language";
import { TOOLS, translateToolText } from "@xprite/growth-content/tools";
import {
  readBrowserLanguagePreference,
  writeBrowserLanguagePreference,
} from "@xprite/site-shell/browser";

/** The startup HTML selects the same locale before hydration. */
export function readToolLanguage(): PublicLanguage {
  const preference = readBrowserLanguagePreference();
  if (preference === "zh-CN") return PublicLanguage.SimplifiedChinese;
  if (preference === "en") return PublicLanguage.English;
  return document.documentElement.lang === PublicLanguage.SimplifiedChinese
    ? PublicLanguage.SimplifiedChinese
    : PublicLanguage.English;
}

export function writeToolLanguage(language: PublicLanguage) {
  writeBrowserLanguagePreference(language);
  document.documentElement.lang = language;
  const tool = TOOLS.find((item) => window.location.pathname === item.path);
  if (!tool) throw Error(`Unknown tool page: ${window.location.pathname}`);
  document.title = translateToolText(tool.title, language);
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", translateToolText(tool.description, language));
}
