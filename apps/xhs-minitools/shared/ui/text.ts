/** Strings every mini tool shares: the top row, the export sheet, frames and common errors. */
export const SHARED_CHINESE = {
  "top.photo": "换照片",
  "top.export": "导出",
  "frame.none": "无边框",
  "frame.mac-os-8": "Mac OS 8",
  "frame.mac-os-8-long": "Mac OS 8 窗口",
  "frame.system-7": "System 7",
  "frame.windows-95": "95 窗口",
  "frame.old-phone": "老手机",
  "frame.handheld": "游戏机",
  "frame.crt": "老显示器",
  "frame.polaroid": "拍立得",
  "export.title": "导出图片",
  "export.close": "关闭",
  "export.save": "保存到相册",
  "export.post": "发布笔记",
  "export.saving": "正在保存…",
  "export.posting": "正在打开…",
  "toast.saved": "已保存到相册",
  "toast.downloaded": "已下载图片（浏览器预览）",
  "error.app": "请在小红书 App 中打开这个小工具后再保存或发布。",
  "error.generic": "出了点问题，请重试。",
} as const;

export type SharedTextKey = keyof typeof SHARED_CHINESE;

export const SHARED_ENGLISH: Readonly<Record<SharedTextKey, string>> = {
  "top.photo": "Photo",
  "top.export": "Export",
  "frame.none": "None",
  "frame.mac-os-8": "Mac OS 8",
  "frame.mac-os-8-long": "Mac OS 8 window",
  "frame.system-7": "System 7",
  "frame.windows-95": "95 window",
  "frame.old-phone": "Old phone",
  "frame.handheld": "Handheld",
  "frame.crt": "CRT",
  "frame.polaroid": "Instant photo",
  "export.title": "Export image",
  "export.close": "Close",
  "export.save": "Save to album",
  "export.post": "Post to note",
  "export.saving": "Saving…",
  "export.posting": "Opening…",
  "toast.saved": "Saved to your album",
  "toast.downloaded": "Image downloaded (browser preview)",
  "error.app": "Open this tool in the Xiaohongshu app to save or post.",
  "error.generic": "Something went wrong. Please try again.",
};

export type SharedText = (key: SharedTextKey) => string;
