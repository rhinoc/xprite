import { localizedSiteHref, PublicLanguage } from "../../content/site/language.ts";
import { PLANNED_PAGES } from "../../content/site/pages.ts";
import { publicDesktopWindow } from "../public-theme.ts";
import { publicDocumentHtml } from "./document-page.ts";

/** Planned destinations render only their title and shared website navigation. */
export function plannedPageHtml(path: string, canonical = false): string {
  const page = PLANNED_PAGES.find((item) => item.path === path);
  if (!page || !page.language) throw Error(`Unknown planned page path: ${path}`);
  const language = page.language;
  const chinese = language === PublicLanguage.SimplifiedChinese;
  const otherLanguage = chinese ? PublicLanguage.English : PublicLanguage.SimplifiedChinese;
  return publicDocumentHtml(
    {
      language,
      path: page.path,
      title: page.title,
      description: "",
      navigation: chinese ? "网站导航" : "Website navigation",
      canonical,
    },
    false,
    `<div></div>${publicDesktopWindow(page.title, "", "data-public-document", "", true)}<div></div>`,
    [
      { label: chinese ? "打开编辑器" : "Open editor", href: "/" },
      {
        label: chinese ? "使用指南" : "User guide",
        href: `/help/${language}/`,
        icon: "help",
        end: true,
      },
      {
        label: chinese ? "English" : "简体中文",
        href: localizedSiteHref(page.path, otherLanguage),
        hrefLang: otherLanguage,
        icon: "language",
      },
    ],
  );
}
