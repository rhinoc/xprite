export const FEATURES_PATH = "/features/";
export const FEATURE_DETAIL_PATH = "/features/";

/** `searchTitle` and `searchDescription` only feed `<title>` and the meta description; the page shows `title` and its introduction. */
export const FEATURE_DETAILS = [
  {
    slug: "draw-pixel-art",
    title: { en: "Draw pixel art", "zh-CN": "绘制像素画" },
    searchTitle: {
      en: "Draw Pixel Art Online: Pencils, Fills and Shapes | Xprite",
      "zh-CN": "在线绘制像素画：铅笔、填充和形状工具 | Xprite",
    },
  },
  {
    slug: "layers-and-colors",
    title: { en: "Layers and colors", "zh-CN": "管理图层与颜色" },
    searchTitle: {
      en: "Pixel Art Layers, Palettes and Color Modes | Xprite",
      "zh-CN": "像素画图层、调色板与颜色模式 | Xprite",
    },
  },
  {
    slug: "frame-animation",
    title: { en: "Frame animation", "zh-CN": "制作逐帧动画" },
    searchTitle: {
      en: "Pixel Art Animation Online: Frames and Onion Skin | Xprite",
      "zh-CN": "在线制作像素动画：逐帧、标签与洋葱皮 | Xprite",
    },
  },
  {
    slug: "tilemaps",
    title: { en: "Build tilemaps", "zh-CN": "制作瓦片地图" },
    searchTitle: {
      en: "Tilemap Editor for Pixel Art Game Maps | Xprite",
      "zh-CN": "像素游戏瓦片地图编辑器 | Xprite",
    },
  },
  {
    slug: "aseprite-projects",
    title: { en: "Edit Aseprite projects", "zh-CN": "继续编辑 Aseprite 工程" },
    searchTitle: {
      en: "Edit Aseprite Files Online: Open and Save .aseprite | Xprite",
      "zh-CN": "在线编辑 Aseprite 文件：打开并保存 .aseprite | Xprite",
    },
  },
  {
    slug: "export-images-and-animation",
    title: { en: "Export images and animation", "zh-CN": "导出图片与动画" },
    searchTitle: {
      en: "Export Pixel Art as PNG, GIF and Sprite Sheets | Xprite",
      "zh-CN": "导出像素画：PNG、GIF 动画和精灵表 | Xprite",
    },
  },
  {
    slug: "touch-drawing",
    title: { en: "Draw on tablets and phones", "zh-CN": "在平板和手机上绘画" },
    searchTitle: {
      en: "Pixel Art on iPad and Phones: Touch and Pen Drawing | Xprite",
      "zh-CN": "在 iPad 和手机上画像素画：触控与手写笔 | Xprite",
    },
    searchDescription: {
      en: "Draw pixel art with touch or a pen. Pan with two fingers, pinch to zoom, tap with two fingers to undo, and use the shortcut toolbar for modifier keys.",
    },
  },
  {
    slug: "workspace-layout",
    title: { en: "Arrange your workspace", "zh-CN": "安排工作区" },
    searchTitle: {
      en: "Customizable Pixel Art Workspace, Offline Editing | Xprite",
      "zh-CN": "自定义像素画工作区与离线编辑 | Xprite",
    },
  },
  {
    slug: "drawing-process",
    title: { en: "Record your drawing process", "zh-CN": "录制绘画过程" },
    searchTitle: {
      en: "Record Your Pixel Art Process and Export a GIF | Xprite",
      "zh-CN": "录制像素画绘画过程并导出 GIF | Xprite",
    },
  },
  {
    slug: "share-artwork",
    title: { en: "Share artwork", "zh-CN": "分享作品" },
    searchTitle: {
      en: "Share Pixel Art with a Link or QR Code | Xprite",
      "zh-CN": "用链接或二维码分享像素画 | Xprite",
    },
  },
] as const;

export enum FeatureIcon {
  Application = "application",
  Document = "document",
  Folder = "folder",
  Image = "image",
  Map = "map",
  NotePad = "note-pad",
  Search = "search",
}

export interface FeatureItem {
  title: string;
  description: string;
  href: string;
  icon: FeatureIcon;
  contentHtml?: string;
  media?: FeatureMedia;
}

export interface FeatureMedia {
  src: string;
  animationSrc?: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  credit?: { label: string; href: string };
}

export interface FeatureGroup {
  id: string;
  title: string;
  items: readonly FeatureItem[];
}
