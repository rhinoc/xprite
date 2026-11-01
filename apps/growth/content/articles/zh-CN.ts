export const CHINESE_COLLECTIONS = {
  compare: {
    label: "编辑器比较",
    title: "像素画编辑器比较：Aseprite、Piskel 与网页工具 | Xprite",
    headline: "像素画编辑器比较",
    description:
      "比较 iPad 上的 Aseprite 替代方案、浏览器里编辑 .aseprite 的工具，以及 Piskel 的替代工具。按文件格式、动画、触控和价格挑选像素画编辑器。",
  },
} as const;

export const CHINESE_ARTICLES = {
  "aseprite-online": {
    title: "在线编辑 Aseprite：4 个浏览器工具对比 | Xprite",
    description:
      "Aseprite 官方没有网页版。本文对比 Xprite、Novaboard、Manabit 和 Pixelorama：导入保留什么、能否存回 .aseprite、要不要登录、能否离线使用。",
    summary:
      "Xprite 和 Pixelorama 能把改动存回 .aseprite；Novaboard 和 Manabit 更适合在浏览器里从头画动画。",
    topic: "浏览器编辑",
  },
  "aseprite-on-ipad": {
    title: "iPad 上用 Aseprite：免费网页方案与 3 款 App | Xprite",
    description:
      "Aseprite 没有 iPad / iOS 版。用 Xprite 在 Safari 里免费打开并存回 .aseprite，无需安装；也可对比 Pixquare、Resprite 和 Pixaki Pro 三款 App。",
    summary:
      "Xprite 在浏览器里免费打开并保存 .aseprite；需要 Apple Pencil 手势和 iCloud 同步时，可以看 Pixquare、Resprite 和 Pixaki Pro。",
    topic: "iPad 与触控",
  },
  "piskel-alternatives": {
    title: "Piskel 替代工具：Xprite、Piskel 与 Pixelorama 对比 | Xprite",
    description:
      "Xprite 能打开 .aseprite，支持手机和平板；Piskel 在电脑上画小动画更简单，也能打开 .piskel；Pixelorama 同样能打开 .piskel。",
    summary:
      "Xprite 能打开和保存 .aseprite，支持手机和平板；Piskel 画小型桌面动画更简单；Pixelorama 能直接打开 .piskel。",
    topic: "编辑器替代工具",
  },
  "fix-ai-pixel-art": {
    title: "修复 AI 像素画：还原真实网格 | Xprite",
    description:
      "修好偏格、发糊的 AI 像素画。在浏览器里免费还原真实像素网格，再进 Xprite 编辑。不是魔法 AI——文件留在本机。",
    summary:
      "Recover Grid 从发糊或 AI「像素画」重建真正的像素格子；不是生成式修复。然后在 Xprite 编辑或下载 PNG。",
    topic: "转换与网格还原",
  },
  "wplace-palette": {
    title: "Wplace 调色板转换：图片 → 地图颜色 | Xprite",
    description:
      "免费非官方 Wplace map 调色板转换，浏览器本地、不上传。把图片匹配到 Wplace map 颜色，导出 PNG 作 Overlays 参考，再在 wplace.live 上手绘。",
    summary:
      "Pixelate 中的非官方 Wplace map 调色板：本机匹配图片，导出 PNG 作参考叠加层，再在 wplace.live 上手动绘制。",
    topic: "转换与地图调色板",
  },
} as const;
