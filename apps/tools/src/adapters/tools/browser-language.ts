import { publicLanguage, PublicLanguage } from "@xprite/growth-content/language";
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

/** The startup HTML selects the same locale before hydration. */
export function readToolLanguage(): PublicLanguage {
  return publicLanguage(readBrowserLanguagePreference() ?? document.documentElement.lang);
}

export function writeToolLanguage(language: PublicLanguage) {
  writeBrowserLanguagePreference(language);
  document.documentElement.lang = language;
  const tool = TOOLS.find((item) => window.location.pathname === item.path);
  if (!tool) throw Error(`Unknown tool page: ${window.location.pathname}`);
  document.title = translateToolText(tool.title, language);
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", translateToolText(tool.description, language));
  const heading = document.getElementById(TOOL_HEADING_ID);
  if (heading) heading.textContent = toolHeading(tool, language);
}
