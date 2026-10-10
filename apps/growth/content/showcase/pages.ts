/** Public language URLs and metadata are shared by the browser and static-page generation. */
export const SHOWCASE_SITE_URL = "https://xprite.cc/";
export const SHOWCASE_PAGES = {
  en: {
    path: "/showcase/en/",
    title: "Xprite — Free Online Pixel Art & Animation Editor",
    description:
      "Draw pixel art and animate sprites free on your computer, iPad or phone. Edit Aseprite projects, export GIF or PNG, and keep your artwork on your device.",
  },
  "zh-CN": {
    path: "/showcase/zh-CN/",
    title: "Xprite｜免费的在线像素画与动画编辑器",
    description:
      "在电脑、iPad 和手机的浏览器中使用 Xprite 创作像素画与动画，编辑 Aseprite 文件，导出 GIF 或 PNG，作品保存在自己的设备上。",
  },
} as const;
export const SHOWCASE_DEFAULT_PATH = SHOWCASE_PAGES.en.path;
