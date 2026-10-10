import { PublicLanguage } from "../site/language.ts";
import { TOOL_CHINESE_TEXT } from "./zh-CN.ts";

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

/** Data-only tool registry, shared by public discovery and the standalone tools app. */
export const TOOLS_HOME = {
  path: "/tools/",
  name: "Xprite Tools",
  title: "Pixel Art Tools | Xprite",
  headline: "Pixel art tools",
  description:
    "Create pixel art, preview Aseprite projects and convert GIF animations into sprite sheets. Files are processed on your device without uploading them to the cloud.",
} as const;

export const VIEWER_TOOL = {
  path: "/tools/viewer/",
  name: "Xprite Aseprite Viewer",
  label: "Aseprite Viewer",
  startTitle: "Inspect an Aseprite file",
  title: "Aseprite Viewer | Xprite",
  headline: "Aseprite Viewer",
  summary: "Preview Aseprite projects and export PNG frames or GIF animations.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Open Aseprite projects, preview layers and animation, and export PNG frames or GIF animations in your browser. Files stay on your device, with no cloud upload.",
  accept: ".ase,.aseprite",
  fileLabel: "Choose an Aseprite file",
  openLabel: "Open file",
  dropLabel: "Drop an .ase or .aseprite file",
  guidePath: "/help/",
} as const;

export const GIF_SHEET_TOOL = {
  path: "/tools/gif-to-sprite-sheet/",
  name: "Xprite GIF to Sprite Sheet",
  label: "GIF to Sprite Sheet",
  startTitle: "Turn a GIF into a sprite sheet",
  title: "GIF to Sprite Sheet | Xprite",
  headline: "GIF to Sprite Sheet",
  summary: "Convert GIF animations into PNG sprite sheets with JSON frame data.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Turn GIF animations into PNG sprite sheets with custom layouts and spacing. Download frame coordinates and timing as JSON. Files stay on your device, with no cloud upload.",
  accept: ".gif,image/gif",
  fileLabel: "Choose a GIF file",
  openLabel: "Open GIF",
  dropLabel: "Drop a GIF file",
  guidePath: "/help/",
} as const;

export const ANIMAL_CROSSING_TOOL = {
  path: "/tools/animal-crossing-qr/",
  name: "Xprite Animal Crossing Design Converter",
  label: "Animal Crossing Design Converter",
  startTitle: "Make a design for your island",
  title: "Animal Crossing Design Converter: PNG & Aseprite | Xprite",
  headline: "Animal Crossing Design Converter",
  summary:
    "Convert PNG images and Aseprite tilemaps into island designs, or open an existing design QR code and export it unchanged.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Create Animal Crossing island design QR codes from PNG images and Aseprite tilemaps, or read normal design QR images and export their original data. Files stay on your device.",
  accept: ".ase,.aseprite,.acnl,.png,.jpg,.jpeg,image/png,image/jpeg",
  fileLabel: "Choose artwork or an Animal Crossing QR image",
  openLabel: "Open file",
  dropLabel: "Drop artwork, a QR image or an .acnl file",
  guidePath: "/help/",
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

export const TOOLS = [VIEWER_TOOL, GIF_SHEET_TOOL, ANIMAL_CROSSING_TOOL];
export const DIRECTORY_TOOLS = [EDITOR_TOOL, ...TOOLS];
export const TOOL_PATHS = [TOOLS_HOME.path, ...TOOLS.map((tool) => tool.path)];
export type PublicTool = (typeof TOOLS)[number];
