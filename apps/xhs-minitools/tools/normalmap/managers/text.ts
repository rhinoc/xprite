import { SHARED_CHINESE, SHARED_ENGLISH, type SharedTextKey } from "$/shared/ui/text";

const CHINESE = {
  ...SHARED_CHINESE,
  "empty.title": "选择一张像素画生成法线贴图",
  "empty.hint": "图片在你的手机上处理，不会上传",
  "empty.choose": "选择图片",
  "empty.example": "试试示例",
  "canvas.undo": "撤销",
  "canvas.redo": "重做",
  "canvas.opening": "正在打开图片…",
  "canvas.working": "正在计算…",
  "canvas.preview": "法线预览",
  "view.albedo": "原图",
  "view.normal": "法线",
  "view.lit": "光照",
  "tab.normal": "法线",
  "tab.light": "光照",
  "normal.preset": "预设",
  "preset.architecture": "建筑",
  "preset.character": "角色",
  "preset.object": "物件",
  "preset.terrain": "地形",
  "normal.shape-strength": "形状强度",
  "normal.normal-strength": "法线强度",
  "normal.smoothing": "平滑",
  "normal.facets": "分面",
  "normal.merge-outlines": "合并轮廓",
  "normal.invert-y": "翻转绿通道",
  "normal.delight": "去除原图光影",
  "normal.delight-angle": "光影角度",
  "normal.delight-strength": "去除强度",
  "light.height": "光源高度",
  "light.brightness": "亮度",
  "light.ambient": "环境光",
  "light.color": "光色",
  "light.color.daylight": "日光",
  "light.color.warm": "暖光",
  "light.color.cool": "冷光",
  "light.color.pink": "霓虹",
  "export.content": "导出内容",
  "export.lit": "光照图",
  "export.normal": "法线图",
  "export.trio": "三联图",
  "export.note": "像素块按整数倍放大，发到笔记里依然清晰",
  "error.read": "无法读取这张图片，请换一张试试。",
  "error.size": "请选择不超过 64 MiB 的图片。",
  "error.type": "请选择 PNG、JPEG 或 WebP 图片。",
  "error.example": "示例图片暂时无法打开。",
} as const;

export type MiniToolTextKey = keyof typeof CHINESE;

const ENGLISH: Readonly<Record<MiniToolTextKey, string>> = {
  ...SHARED_ENGLISH,
  "empty.title": "Choose pixel art to make a normal map",
  "empty.hint": "Images are processed on your phone and never uploaded",
  "empty.choose": "Choose image",
  "empty.example": "Try the example",
  "canvas.undo": "Undo",
  "canvas.redo": "Redo",
  "canvas.opening": "Opening image…",
  "canvas.working": "Computing…",
  "canvas.preview": "Normal map preview",
  "view.albedo": "Albedo",
  "view.normal": "Normal",
  "view.lit": "Lit",
  "tab.normal": "Normal",
  "tab.light": "Light",
  "normal.preset": "Preset",
  "preset.architecture": "Architecture",
  "preset.character": "Character",
  "preset.object": "Object",
  "preset.terrain": "Terrain",
  "normal.shape-strength": "Shape strength",
  "normal.normal-strength": "Normal strength",
  "normal.smoothing": "Smoothing",
  "normal.facets": "Facets",
  "normal.merge-outlines": "Merge outlines",
  "normal.invert-y": "Invert green",
  "normal.delight": "Remove painted light",
  "normal.delight-angle": "Light angle",
  "normal.delight-strength": "Delight strength",
  "light.height": "Light height",
  "light.brightness": "Brightness",
  "light.ambient": "Ambient",
  "light.color": "Light color",
  "light.color.daylight": "Daylight",
  "light.color.warm": "Warm",
  "light.color.cool": "Cool",
  "light.color.pink": "Neon",
  "export.content": "Content",
  "export.lit": "Lit image",
  "export.normal": "Normal map",
  "export.trio": "Trio",
  "export.note": "Pixel blocks scale up by whole factors and stay crisp in notes",
  "error.read": "Unable to read this image. Please try another.",
  "error.size": "Choose an image no larger than 64 MiB.",
  "error.type": "Choose a PNG, JPEG or WebP image.",
  "error.example": "The example is unavailable.",
};

export type MiniToolText = (key: MiniToolTextKey | SharedTextKey) => string;

/** The tool's strings in one language; shared keys come from the shared table. */
export function miniToolText(language: "zh-CN" | string): MiniToolText {
  const table: Record<string, string> = language === "zh-CN" ? CHINESE : ENGLISH;
  return (key) => table[key] ?? ENGLISH[key] ?? key;
}

/** Error text for a thrown value, mapped onto a known key when it matches one. */
export function miniToolError(message: string): MiniToolTextKey {
  if (/64 MiB/.test(message)) return "error.size";
  if (/PNG|JPEG|WebP/.test(message)) return "error.type";
  if (/example/i.test(message)) return "error.example";
  if (/read|decode|image/i.test(message)) return "error.read";
  return "error.generic";
}
