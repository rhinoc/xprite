import { useUiLanguage } from "$/i18n";
import imageCatalog from "$assets/help/images/catalog.json";
import englishGuide from "$assets/help/README.en.md?raw";
import chineseGuide from "$assets/help/README.zh-CN.md?raw";

const USER_GUIDES = { en: englishGuide, "zh-CN": chineseGuide };
const GUIDE_IMAGE_MODULE_PREFIX = "../../../assets/help/";
const GUIDE_IMAGE_DISPLAY_SCALE = 1.5;
const GUIDE_IMAGES = import.meta.glob<string>("../../../assets/help/images/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const GUIDE_IMAGE_SIZES: Readonly<Record<string, { width: number; height: number }>> = imageCatalog;

export function useUserGuide(): string {
  return USER_GUIDES[useUiLanguage()];
}

export function resolveUserGuideImage(source: string) {
  const src = GUIDE_IMAGES[`${GUIDE_IMAGE_MODULE_PREFIX}${source}`];
  const size = GUIDE_IMAGE_SIZES[source];
  return src && size
    ? {
        src,
        width: size.width * GUIDE_IMAGE_DISPLAY_SCALE,
        height: size.height * GUIDE_IMAGE_DISPLAY_SCALE,
      }
    : undefined;
}
