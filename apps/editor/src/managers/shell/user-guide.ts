import { useUiLanguage } from "$/i18n";
import {
  resolveUserGuideImage as resolveGuideImage,
  userGuides,
} from "@xprite/growth-content/help";

export function useUserGuide(): string {
  return userGuides[useUiLanguage()];
}

export function resolveUserGuideImage(source: string) {
  return resolveGuideImage(source);
}
