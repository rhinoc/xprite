import imageCatalog from "./images/catalog.json";
import englishGuide from "./README.en.md?raw";
import spanishGuide from "./README.es.md?raw";
import japaneseGuide from "./README.ja.md?raw";
import koreanGuide from "./README.ko.md?raw";
import portugueseGuide from "./README.pt-BR.md?raw";
import russianGuide from "./README.ru.md?raw";
import chineseGuide from "./README.zh-CN.md?raw";

const GUIDE_IMAGE_MODULE_PREFIX = "./";
const GUIDE_IMAGES = import.meta.glob<string>("./images/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const GUIDE_IMAGE_SIZES: Readonly<
  Record<string, { width: number; height: number; displayWidth: number; displayHeight: number }>
> = imageCatalog;

/** Shared guide content, with no dependency on either application's runtime. */
export const userGuides = {
  en: englishGuide,
  "zh-CN": chineseGuide,
  ja: japaneseGuide,
  ko: koreanGuide,
  ru: russianGuide,
  "pt-BR": portugueseGuide,
  es: spanishGuide,
};

export function resolveUserGuideImage(source: string) {
  const src = GUIDE_IMAGES[`${GUIDE_IMAGE_MODULE_PREFIX}${source}`];
  const size = GUIDE_IMAGE_SIZES[source];
  return src && size ? { src, width: size.displayWidth, height: size.displayHeight } : undefined;
}
