import type { HomeViewFooterSegment } from "$/components/workspace/home-view-base";
import { EDITOR_EXTERNAL_LINKS } from "$/config/external-links";
import { tUi } from "$/i18n";

const AUTHOR_PREFIX = "by";

const XPRITE_GITHUB_PROFILE = {
  handle: "rhinoc",
  href: EDITOR_EXTERNAL_LINKS.rhinocProfile,
} as const;

export interface EditorHomeAbout {
  attribution: readonly HomeViewFooterSegment[];
  footerSegments: readonly HomeViewFooterSegment[];
  repositoryHref: string;
  profile: string;
  profileHref: string;
}

export function getEditorHomeAbout(): EditorHomeAbout {
  return {
    attribution: [{ text: `${AUTHOR_PREFIX} ` }],
    footerSegments: [
      { text: AUTHOR_PREFIX },
      { text: XPRITE_GITHUB_PROFILE.handle, href: XPRITE_GITHUB_PROFILE.href, separator: false },
      { text: tUi("ui.home.license"), href: EDITOR_EXTERNAL_LINKS.xpriteLicense },
      { text: tUi("ui.home.credits"), href: EDITOR_EXTERNAL_LINKS.xpriteCredits },
    ],
    repositoryHref: EDITOR_EXTERNAL_LINKS.xpriteRepository,
    profile: XPRITE_GITHUB_PROFILE.handle,
    profileHref: XPRITE_GITHUB_PROFILE.href,
  };
}
