import { showcaseMedia } from "../showcase/media.ts";
import { publicLanguage, PublicLanguage } from "../site/language.ts";
import { FEATURE_DETAIL_PATH, type FeatureMedia } from "./index.ts";

const ABOUT_IMAGES = "/about/images";
const ARTICLE_IMAGES = "/compare/articles/images";
const GUIDE_IMAGES = "/help/images";
const EXAMPLE_IMAGES = "/showcase/ipad/hello";
const ISLAND_PATTERN = "/tools/animal-crossing/acnh/winding-cobblestone.png";
const ISLAND_PATTERN_SOURCE =
  "https://aforestlife.com/2021/11/11/winding-cobblestone-path-from-bywater-shire-themed-island/";

/** Each feature chooses a relevant original asset; filenames remain owned by their source scope. */
export function featureMedia(href: string, language: string): FeatureMedia | undefined {
  const selected = publicLanguage(language);
  const chinese = selected === PublicLanguage.SimplifiedChinese;
  const suffix = chinese ? "" : "-en";
  const guideLanguage = chinese ? "zh" : "en";
  const text = (en: string, zh: string) => (chinese ? zh : en);
  const shared = showcaseMedia(selected);
  const media: Record<string, FeatureMedia> = {
    [`${FEATURE_DETAIL_PATH}layers-and-colors/`]: {
      src: `${ARTICLE_IMAGES}/editor-with-aseprite${suffix}.png`,
      width: chinese ? 1180 : 1640,
      height: chinese ? 820 : 1240,
      alt: text(
        "The editor with a palette, two layers and animation frames",
        "编辑器中的调色板、两个图层和动画帧",
      ),
      caption: text("Palette and layer controls", "调色板和图层"),
    },
    [`${FEATURE_DETAIL_PATH}frame-animation/`]: shared.animation,
    [`${FEATURE_DETAIL_PATH}workspace-layout/`]: shared.workspace,
    [`${FEATURE_DETAIL_PATH}aseprite-projects/`]: {
      src: `${ABOUT_IMAGES}/save-as-location${suffix}.png`,
      width: 720,
      height: 640,
      alt: text(
        "Save As with the Aseprite project format and device file location",
        "另存为窗口中的 Aseprite 工程格式与资源管理器保存位置",
      ),
      caption: text("Save an Aseprite project", "保存 Aseprite 工程"),
    },
    [`${FEATURE_DETAIL_PATH}export-images-and-animation/`]: {
      src: `${EXAMPLE_IMAGES}/hello-frame-01.png`,
      width: 128,
      height: 80,
      alt: text("A PNG frame of the Hello pixel animation", "Hello 像素动画的一帧 PNG 图片"),
      caption: text("PNG frame example", "PNG 单帧示例"),
    },
    [`${FEATURE_DETAIL_PATH}touch-drawing/`]: {
      src: `${GUIDE_IMAGES}/${guideLanguage}/touch-settings.webp`,
      width: 698,
      height: 458,
      alt: text("Touch settings in the editor preferences", "编辑器首选项中的触控设置"),
      caption: text("Touch settings", "触控设置"),
    },
    [`${FEATURE_DETAIL_PATH}share-artwork/`]: {
      src: `${ABOUT_IMAGES}/share-dialog${suffix}.png`,
      width: 1440,
      height: chinese ? 1360 : 1200,
      alt: text(
        "The share window with a link and choices for sharing frames and layers",
        "分享窗口中的作品链接与帧、图层选项",
      ),
      caption: text("Share a link or QR code", "分享链接或二维码"),
    },
    "/tools/viewer/": {
      src: `${ARTICLE_IMAGES}/viewer-file-menu${suffix}.png`,
      width: 840,
      height: 440,
      alt: text(
        "The viewer's File menu with GIF and PNG export commands",
        "查看器文件菜单中的 GIF 和 PNG 导出命令",
      ),
      caption: text("Export from the viewer", "从查看器导出"),
    },
    "/tools/gif-to-sprite-sheet/": {
      src: `${EXAMPLE_IMAGES}/hello-sheet.png`,
      width: 384,
      height: 240,
      alt: text(
        "Eight Hello animation frames arranged in a sprite sheet",
        "八帧 Hello 动画排列成的精灵表",
      ),
      caption: text("Sprite sheet example", "精灵表示例"),
    },
    "/tools/animal-crossing-qr/": {
      src: ISLAND_PATTERN,
      width: 96,
      height: 96,
      alt: text(
        "The cobblestone path artwork used by the converter example",
        "转换器示例使用的石板路图案",
      ),
      caption: text("Design artwork example", "图案素材示例"),
      credit: { label: "Amy / A Forest Life", href: ISLAND_PATTERN_SOURCE },
    },
  };
  return media[href];
}
