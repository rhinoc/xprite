import { publicLanguage } from "../site/language.ts";
import { SHOWCASE_STORY_COPY } from "./index.ts";

const DEVICE_MEDIA_ROOT = "/showcase/devices/computer";
const WORKSPACE_MEDIA_ROOT = "/showcase/workspace-layout";

/** Existing captures shared by the About scene and feature windows. */
export function showcaseMedia(language: string) {
  const selected = publicLanguage(language);
  const copy = SHOWCASE_STORY_COPY[selected];
  return {
    animation: {
      src: `${DEVICE_MEDIA_ROOT}/${selected}/animation.png`,
      width: 1440,
      height: 840,
      alt: copy.screenshot,
      caption: copy.screenshotCaption,
    },
    workspace: {
      src: `${WORKSPACE_MEDIA_ROOT}/${selected}/poster.png`,
      animationSrc: `${WORKSPACE_MEDIA_ROOT}/${selected}/layout.gif`,
      width: 1080,
      height: 720,
      alt: copy.layoutAlt,
      caption: copy.layoutCaption,
    },
  };
}
