import { PublicLanguage } from "../site/language.ts";
import { TOOL_CHINESE_TEXT } from "./zh-CN.ts";

export { ANIMAL_CROSSING_HELP, AnimalCrossingHelpSection } from "./animal-crossing-help.ts";
export { GIF_SHEET_HELP, GifSheetHelpSection } from "./gif-sheet-help.ts";
export { PIXELATE_HELP, PixelateHelpSection } from "./pixelate-help.ts";
export type { ToolHelpContent } from "./help.ts";
export { VIEWER_EXPORT_HELP, ViewerHelpSection } from "./viewer-help.ts";

export function translateToolText(source: string, language: string): string {
  if (source === "ui.close.name")
    return language === PublicLanguage.SimplifiedChinese ? "关闭 {name}" : "Close {name}";
  if (language !== PublicLanguage.SimplifiedChinese) return source;
  const text = source.replace(/\s+/g, " ").trim();
  if (TOOL_CHINESE_TEXT[text]) return TOOL_CHINESE_TEXT[text];
  if (text.startsWith("Accepted files: ")) return text.replace(/^Accepted files: /, "支持文件：");
  if (text.startsWith("Source: ")) return text.replace(/^Source: /, "源图：");
  if (/^Frame \d+ of \d+$/.test(text))
    return text.replace(/^Frame (\d+) of (\d+)$/, "第 $1 帧，共 $2 帧");
  if (/^(?:Select )?[Rr]ow \d+, column \d+$/.test(text))
    return text.replace(/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "第 $1 行，第 $2 列");
  if (/^Download all \d+ designs$/.test(text))
    return text.replace(/^Download all (\d+) designs$/, "下载全部 $1 个设计");
  if (/^\d+ applications$/.test(text)) return text.replace(/ applications$/, " 个应用");
  if (text.endsWith("tiles · select a tile for Preview and QR"))
    return text.replace(
      /tiles · select a tile for Preview and QR$/,
      "个图块 · 选择图块以预览和生成二维码",
    );
  if (text.startsWith("Tag ")) return text.replace(/^Tag /, "标签 ");
  if (/, frame \d+$/.test(text)) return text.replace(/, frame (\d+)$/, "，第 $1 帧");
  if (/^Frame \d+$/.test(text)) return text.replace(/^Frame (\d+)$/, "第 $1 帧");
  if (/^Tile \d+,\d+$/.test(text)) return text.replace(/^Tile (\d+),(\d+)$/, "图块 $1,$2");
  if (text.endsWith(":")) return `${translateToolText(text.slice(0, -1), language)}：`;
  if (text.endsWith(" frames")) return text.replace(/ frames$/, " 帧");
  if (text.endsWith(" workspace"))
    return `${translateToolText(text.replace(/ workspace$/, ""), language)}工作区`;
  if (text.endsWith("…")) return `${translateToolText(text.slice(0, -1), language)}…`;
  return source;
}

export const TOOL_FILE_PRIVACY = "Processed on your device. No cloud upload.";
export const TOOL_HEADING_ID = "tool-page-heading";

/** The visually hidden page heading: the document title without the site name. */
export function toolHeading(tool: { title: string }, language: string): string {
  return translateToolText(tool.title, language).replace(/ \| Xprite$/, "");
}

/** Data-only tool registry, shared by public discovery and the standalone tools app. */
export const VIEWER_TOOL = {
  path: "/tools/viewer/",
  name: "Xprite Aseprite Viewer",
  label: "Aseprite Viewer",
  startTitle: "Inspect an Aseprite file",
  title: "Aseprite Viewer: Open .aseprite & .ase Files Online | Xprite",
  headline: "Aseprite Viewer",
  summary: "Preview Aseprite projects and export PNG frames or GIF animations.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Open Aseprite projects, preview layers and animation, and export PNG frames or GIF animations in your browser. Files stay on your device, with no cloud upload.",
  accept: ".ase,.aseprite",
  fileLabel: "Choose an Aseprite file",
  openLabel: "Open file",
  dropLabel: "Drop an .ase or .aseprite file",
} as const;

export const GIF_SHEET_TOOL = {
  path: "/tools/gif-to-sprite-sheet/",
  name: "Xprite GIF to Sprite Sheet",
  label: "GIF to Sprite Sheet",
  startTitle: "Turn a GIF into a sprite sheet",
  title: "GIF to Sprite Sheet: Free Online Converter | Xprite",
  headline: "GIF to Sprite Sheet",
  summary: "Convert GIF animations into PNG sprite sheets with JSON frame data.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Convert GIF animations into PNG sprite sheets free in your browser. Choose rows, columns and spacing, and download JSON frame data. Files stay on your device.",
  accept: ".gif,image/gif",
  fileLabel: "Choose a GIF file",
  openLabel: "Open GIF",
  dropLabel: "Drop a GIF file",
} as const;

export const ANIMAL_CROSSING_TOOL = {
  path: "/tools/animal-crossing-qr/",
  name: "Xprite Animal Crossing Design Converter",
  label: "Animal Crossing Design Converter",
  startTitle: "Make a design for your island",
  title: "Animal Crossing QR Code Converter: PNG & Aseprite | Xprite",
  headline: "Animal Crossing Design Converter",
  summary:
    "Convert PNG images and Aseprite tilemaps into island designs, or open an existing design QR code and export it unchanged.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Create Animal Crossing design QR codes from PNG images and Aseprite tilemaps, or read design QR images and export their data. Files stay on your device.",
  accept: ".ase,.aseprite,.acnl,.png,.jpg,.jpeg,image/png,image/jpeg",
  fileLabel: "Choose artwork or an Animal Crossing QR image",
  openLabel: "Open file",
  dropLabel: "Drop artwork, a QR image or an .acnl file",
} as const;

export const PIXELATE_TOOL = {
  path: "/tools/pixelate/",
  name: "Xprite Pixel Art Converter",
  label: "Image to Pixel Art",
  startTitle: "Turn an image into pixel art",
  title: "Image to Pixel Art: Free Online Converter | Xprite",
  headline: "Image to pixel art",
  summary: "Convert images to pixel art or recover enlarged pixel grids, with local previews.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Convert photos and illustrations, recover enlarged pixel grids, download PNG or continue editing. Files stay on your device.",
  accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
  fileLabel: "Choose an image to pixelate",
  openLabel: "Open image",
  dropLabel: "Drop a PNG, JPEG or WebP image",
} as const;

export const EDITOR_TOOL = {
  path: "/",
  name: "Xprite Editor",
  headline: "Free online pixel art editor",
  summary: "Draw pixel art and animate sprites with layers, frames and palettes.",
  privacy: "Open and save .aseprite projects.",
  description:
    "Create pixel art and animations in Xprite. Open and save Aseprite projects in your browser.",
} as const;

export const TOOLS = [VIEWER_TOOL, GIF_SHEET_TOOL, PIXELATE_TOOL, ANIMAL_CROSSING_TOOL];
export const TOOL_PATHS = TOOLS.map((tool) => tool.path);
export type PublicTool = (typeof TOOLS)[number];
