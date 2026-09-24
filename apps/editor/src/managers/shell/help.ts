import { EDITOR_EXTERNAL_LINKS } from "$/config/external-links";

export enum HelpLink {
  Repository = "repository",
  Author = "author",
  Credits = "credits",
  License = "license",
  Donate = "donate",
}

export const HELP_LINKS: Readonly<Record<HelpLink, string>> = {
  [HelpLink.Repository]: EDITOR_EXTERNAL_LINKS.xpriteRepository,
  [HelpLink.Author]: EDITOR_EXTERNAL_LINKS.rhinocProfile,
  [HelpLink.Credits]: EDITOR_EXTERNAL_LINKS.xpriteCredits,
  [HelpLink.License]: EDITOR_EXTERNAL_LINKS.xpriteLicense,
  [HelpLink.Donate]: EDITOR_EXTERNAL_LINKS.donate,
};

export enum HelpDocumentTab {
  Guide = "guide",
}
