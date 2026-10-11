import type { HomeViewFooterSegment } from "$/components/workspace/home-view-base";
import { EDITOR_EXTERNAL_LINKS } from "$/config/external-links";
import { currentUiLanguage } from "$/i18n";
import { showcasePath } from "@xprite/growth-content/navigation";

const AUTHOR_PREFIX = "by";
const BRAND_LABEL = "Xprite";
const WEBSITE_ORIGIN = "https://xprite.cc";

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
      {
        text: BRAND_LABEL,
        href: `${WEBSITE_ORIGIN}${showcasePath(currentUiLanguage())}`,
      },
      { text: AUTHOR_PREFIX, separator: false },
      { text: XPRITE_GITHUB_PROFILE.handle, href: XPRITE_GITHUB_PROFILE.href, separator: false },
    ],
    repositoryHref: EDITOR_EXTERNAL_LINKS.xpriteRepository,
    profile: XPRITE_GITHUB_PROFILE.handle,
    profileHref: XPRITE_GITHUB_PROFILE.href,
  };
}
