import { publicLanguage, PublicLanguage } from "../site/language.ts";
import { TOOL_SPANISH_TEXT } from "./es.ts";
import { TOOL_JAPANESE_TEXT } from "./ja.ts";
import { TOOL_KOREAN_TEXT } from "./ko.ts";
import { TOOL_PORTUGUESE_TEXT } from "./pt-BR.ts";
import { TOOL_RUSSIAN_TEXT } from "./ru.ts";
import { TOOL_CHINESE_TEXT } from "./zh-CN.ts";

export { ANIMAL_CROSSING_HELP, AnimalCrossingHelpSection } from "./animal-crossing-help.ts";
export { FIX_AI_PIXEL_ART_HELP, FixAiPixelArtHelpSection } from "./fix-ai-pixel-art-help.ts";
export { GIF_SHEET_HELP, GifSheetHelpSection } from "./gif-sheet-help.ts";
export { PIXELATE_HELP, PixelateHelpSection } from "./pixelate-help.ts";
export type { ToolHelpContent } from "./help.ts";
export { VIEWER_EXPORT_HELP, ViewerHelpSection } from "./viewer-help.ts";

interface ToolTextRules {
  dictionary: Readonly<Record<string, string>>;
  closeName: string;
  patterns: readonly (readonly [RegExp, string])[];
  colon: string;
  frames: string;
  workspace: (name: string) => string;
}

const TOOL_TEXT_RULES: Readonly<Partial<Record<PublicLanguage, ToolTextRules>>> = {
  [PublicLanguage.SimplifiedChinese]: {
    dictionary: TOOL_CHINESE_TEXT,
    closeName: "关闭 {name}",
    patterns: [
      [/^Accepted files: /, "支持文件："],
      [/^Source: /, "源图："],
      [/^Frame (\d+) of (\d+)$/, "第 $1 帧，共 $2 帧"],
      [/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "第 $1 行，第 $2 列"],
      [/^Download all (\d+) designs$/, "下载全部 $1 个设计"],
      [/^(\d+) applications$/, "$1 个应用"],
      [/tiles · select a tile for Preview and QR$/, "个图块 · 选择图块以预览二维码"],
      [/^Tag /, "标签 "],
      [/, frame (\d+)$/, "，第 $1 帧"],
      [/^Frame (\d+)$/, "第 $1 帧"],
      [/^Tile (\d+),(\d+)$/, "图块 $1,$2"],
    ],
    colon: "：",
    frames: " 帧",
    workspace: (name) => `${name}工作区`,
  },
  [PublicLanguage.Japanese]: {
    dictionary: TOOL_JAPANESE_TEXT,
    closeName: "{name} を閉じる",
    patterns: [
      [/^Accepted files: /, "対応ファイル："],
      [/^Source: /, "元画像："],
      [/^Frame (\d+) of (\d+)$/, "フレーム $1 / $2"],
      [/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "$1 行 $2 列"],
      [/^Download all (\d+) designs$/, "マイデザイン $1 枚をすべてダウンロード"],
      [/^(\d+) applications$/, "$1 個のアプリケーション"],
      [
        /tiles · select a tile for Preview and QR$/,
        "枚のタイル · タイルを選ぶとプレビューと QR を表示",
      ],
      [/^Tag /, "タグ "],
      [/, frame (\d+)$/, "、フレーム $1"],
      [/^Frame (\d+)$/, "フレーム $1"],
      [/^Tile (\d+),(\d+)$/, "タイル $1,$2"],
    ],
    colon: "：",
    frames: " フレーム",
    workspace: (name) => `${name}のワークスペース`,
  },
  [PublicLanguage.Korean]: {
    dictionary: TOOL_KOREAN_TEXT,
    closeName: "{name} 닫기",
    patterns: [
      [/^Accepted files: /, "지원 파일: "],
      [/^Source: /, "원본: "],
      [/^Frame (\d+) of (\d+)$/, "프레임 $1/$2"],
      [/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "$1행 $2열"],
      [/^Download all (\d+) designs$/, "마이 디자인 $1개 모두 다운로드"],
      [/^(\d+) applications$/, "응용 프로그램 $1개"],
      [
        /tiles · select a tile for Preview and QR$/,
        "개 타일 · 타일을 선택하면 미리 보기와 QR이 표시됩니다",
      ],
      [/^Tag /, "태그 "],
      [/, frame (\d+)$/, ", 프레임 $1"],
      [/^Frame (\d+)$/, "프레임 $1"],
      [/^Tile (\d+),(\d+)$/, "타일 $1,$2"],
    ],
    colon: ":",
    frames: "프레임",
    workspace: (name) => `${name} 작업 공간`,
  },
  [PublicLanguage.Russian]: {
    dictionary: TOOL_RUSSIAN_TEXT,
    closeName: "Закрыть {name}",
    patterns: [
      [/^Accepted files: /, "Поддерживаемые файлы: "],
      [/^Source: /, "Источник: "],
      [/^Frame (\d+) of (\d+)$/, "Кадр $1 из $2"],
      [/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "Строка $1, столбец $2"],
      [/^Download all (\d+) designs$/, "Скачать все дизайны ($1)"],
      [/^(\d+) applications$/, "Приложений: $1"],
      [
        /tiles · select a tile for Preview and QR$/,
        " — тайлы · выберите тайл для предпросмотра и QR",
      ],
      [/^Tag /, "Метка "],
      [/, frame (\d+)$/, ", кадр $1"],
      [/^Frame (\d+)$/, "Кадр $1"],
      [/^Tile (\d+),(\d+)$/, "Тайл $1,$2"],
    ],
    colon: ":",
    frames: " кадр.",
    workspace: (name) => `Рабочая область: ${name}`,
  },
  [PublicLanguage.BrazilianPortuguese]: {
    dictionary: TOOL_PORTUGUESE_TEXT,
    closeName: "Fechar {name}",
    patterns: [
      [/^Accepted files: /, "Arquivos aceitos: "],
      [/^Source: /, "Origem: "],
      [/^Frame (\d+) of (\d+)$/, "Quadro $1 de $2"],
      [/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "Linha $1, coluna $2"],
      [/^Download all (\d+) designs$/, "Baixar todos os $1 designs"],
      [/^(\d+) applications$/, "$1 aplicativos"],
      [
        /tiles · select a tile for Preview and QR$/,
        "tiles · selecione um tile para ver a pré-visualização e o QR",
      ],
      [/^Tag /, "Tag "],
      [/, frame (\d+)$/, ", quadro $1"],
      [/^Frame (\d+)$/, "Quadro $1"],
      [/^Tile (\d+),(\d+)$/, "Tile $1,$2"],
    ],
    colon: ":",
    frames: " quadros",
    workspace: (name) => `Espaço de trabalho do ${name}`,
  },
  [PublicLanguage.Spanish]: {
    dictionary: TOOL_SPANISH_TEXT,
    closeName: "Cerrar {name}",
    patterns: [
      [/^Accepted files: /, "Archivos admitidos: "],
      [/^Source: /, "Origen: "],
      [/^Frame (\d+) of (\d+)$/, "Cuadro $1 de $2"],
      [/^(?:Select )?[Rr]ow (\d+), column (\d+)$/, "Fila $1, columna $2"],
      [/^Download all (\d+) designs$/, "Descargar los $1 diseños"],
      [/^(\d+) applications$/, "$1 aplicaciones"],
      [
        /tiles · select a tile for Preview and QR$/,
        "tiles · selecciona un tile para ver la vista previa y el QR",
      ],
      [/^Tag /, "Etiqueta "],
      [/, frame (\d+)$/, ", cuadro $1"],
      [/^Frame (\d+)$/, "Cuadro $1"],
      [/^Tile (\d+),(\d+)$/, "Tile $1,$2"],
    ],
    colon: ":",
    frames: " cuadros",
    workspace: (name) => `Espacio de trabajo de ${name}`,
  },
};

export function translateToolText(source: string, language: string): string {
  const rules = TOOL_TEXT_RULES[publicLanguage(language)];
  if (source === "ui.close.name") return rules?.closeName ?? "Close {name}";
  if (!rules) return source;
  const text = source.replace(/\s+/g, " ").trim();
  if (rules.dictionary[text]) return rules.dictionary[text];
  for (const [pattern, replacement] of rules.patterns) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  if (text.endsWith(":")) return `${translateToolText(text.slice(0, -1), language)}${rules.colon}`;
  if (text.endsWith(" frames")) return text.replace(/ frames$/, rules.frames);
  if (text.endsWith(" workspace"))
    return rules.workspace(translateToolText(text.replace(/ workspace$/, ""), language));
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
    "Free Aseprite viewer: open .aseprite and .ase files online without Aseprite. Preview layers and animation, export PNG or GIF. Files never leave your device.",
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
  title: "GIF to Sprite Sheet Converter: Free, No Upload | Xprite",
  headline: "GIF to Sprite Sheet",
  summary: "Convert GIF animations into PNG sprite sheets with JSON frame data.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Convert a GIF to a PNG sprite sheet free in your browser. Set rows, columns and spacing; get JSON frame data for game engines. Files stay on your device.",
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
  title: "Image to Pixel Art Converter: Free, No Upload | Xprite",
  headline: "Image to pixel art",
  summary: "Convert images to pixel art or recover enlarged pixel grids, with local previews.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Turn any photo into pixel art free in your browser. Pick the size, colors and palette, or restore an enlarged pixel grid. Files stay on your device.",
  accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
  fileLabel: "Choose an image to pixelate",
  openLabel: "Open image",
  dropLabel: "Drop a PNG, JPEG or WebP image",
} as const;

export const FIX_AI_PIXEL_ART_TOOL = {
  path: "/tools/fix-ai-pixel-art/",
  name: "Xprite Fix AI Pixel Art",
  label: "Fix AI Pixel Art",
  startTitle: "Fix AI-generated pixel art",
  title: "Fix AI Pixel Art: Recover Real Pixel Grid | Xprite",
  headline: "Fix AI pixel art",
  summary: "Fix soft or AI-generated pixel art by snapping it to a real pixel grid.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Fix blurry or AI-generated pixel art free in your browser. Automatically recover the pixel grid from upscaled or soft images. Files stay on your device.",
  accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
  fileLabel: "Choose an AI-generated pixel art image",
  openLabel: "Open image",
  dropLabel: "Drop a PNG, JPEG or WebP image",
} as const;

export const BEADS_TOOL = {
  path: "/tools/fuse-beads/",
  name: "Xprite Fuse Bead Pattern Maker",
  label: "Fuse Bead Pattern Maker",
  startTitle: "Make a fuse bead pattern",
  title: "Fuse Bead Pattern Maker: PNG & PDF | Xprite",
  headline: "Fuse bead pattern maker",
  summary: "Create bead charts with MARD, Artkal, Perler or Hama colors and a material list.",
  privacy: TOOL_FILE_PRIVACY,
  description:
    "Open artwork, choose MARD, Artkal, Perler or Hama colors, preview bead boards and download PNG charts or paginated PDFs. Files stay on your device.",
  accept: ".png,.jpg,.jpeg,.webp,.ase,.aseprite,image/png,image/jpeg,image/webp",
  fileLabel: "Choose an image or Aseprite file for a bead pattern",
  openLabel: "Open artwork",
  dropLabel: "Drop a PNG, JPEG, WebP or Aseprite file",
} as const;

export const BEAD_ARTIFACT_ATTRIBUTION = {
  name: "Xprite",
  url: `https://xprite.cc${BEADS_TOOL.path}`,
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

export const TOOLS = [
  VIEWER_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  FIX_AI_PIXEL_ART_TOOL,
  ANIMAL_CROSSING_TOOL,
  BEADS_TOOL,
];
export const TOOL_PATHS = TOOLS.map((tool) => tool.path);
export type PublicTool = (typeof TOOLS)[number];
