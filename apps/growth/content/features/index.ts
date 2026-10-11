export const FEATURES_PATH = "/features/";
export const FEATURE_DETAIL_PATH = "/features/";

export const FEATURE_DETAILS = [
  { slug: "draw-pixel-art", title: { en: "Draw pixel art", "zh-CN": "绘制像素画" } },
  { slug: "layers-and-colors", title: { en: "Layers and colors", "zh-CN": "管理图层与颜色" } },
  { slug: "frame-animation", title: { en: "Frame animation", "zh-CN": "制作逐帧动画" } },
  { slug: "tilemaps", title: { en: "Build tilemaps", "zh-CN": "制作瓦片地图" } },
  {
    slug: "aseprite-projects",
    title: { en: "Edit Aseprite projects", "zh-CN": "继续编辑 Aseprite 工程" },
  },
  {
    slug: "export-images-and-animation",
    title: { en: "Export images and animation", "zh-CN": "导出图片与动画" },
  },
  {
    slug: "touch-drawing",
    title: { en: "Draw on tablets and phones", "zh-CN": "在平板和手机上绘画" },
  },
  { slug: "workspace-layout", title: { en: "Arrange your workspace", "zh-CN": "安排工作区" } },
  {
    slug: "drawing-process",
    title: { en: "Record your drawing process", "zh-CN": "录制绘画过程" },
  },
  { slug: "share-artwork", title: { en: "Share artwork", "zh-CN": "分享作品" } },
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
