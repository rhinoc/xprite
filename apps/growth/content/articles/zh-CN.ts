export const CHINESE_COLLECTIONS = {
  learn: {
    label: "文件导出指南",
    title: "Aseprite 转 PNG、GIF：文件导出指南 | Xprite",
    headline: "Aseprite 文件导出指南",
    description:
      "在浏览器里打开 Aseprite 工程，免费导出透明 PNG 单帧或 GIF 动画。按步骤说明 Xprite 查看器的操作，以及导出后尺寸、透明度和帧时长的变化。",
  },
  compare: {
    label: "编辑器比较",
    title: "像素画编辑器比较 | Xprite",
    headline: "像素画编辑器比较",
    description:
      "比较 iPad 上的 Aseprite 替代方案、浏览器里编辑 .aseprite 的工具，以及 Piskel 的替代工具。按文件格式、动画、触控和价格挑选像素画编辑器。",
  },
} as const;

export const CHINESE_ARTICLES = {
  "aseprite-online": {
    title: "在线编辑 Aseprite：4 个浏览器工具对比 | Xprite",
    description:
      "Aseprite 官方没有网页版。Xprite、Novaboard、Manabit 和 Pixelorama 都能在浏览器里打开 .aseprite，本文按导入保留的内容、能否存回 .aseprite、是否要登录和离线使用对比这四个工具。",
    summary:
      "Xprite 和 Pixelorama 能把改动存回 .aseprite；Novaboard 和 Manabit 更适合在浏览器里从头画动画。",
    topic: "浏览器编辑",
  },
  "aseprite-on-ipad": {
    title: "iPad 上能用 Aseprite 吗？免费方案和 3 款 App 对比 | Xprite",
    description:
      "Aseprite 没有 iPad 版。Xprite 在 Safari 浏览器里免费打开 .aseprite，保留图层、帧和动画，改完再存回原格式；Pixquare、Resprite 和 Pixaki Pro 则支持轻点两下笔身、轻捏和 iCloud 同步。本文从价格、导入导出、动画和离线等方面对比这四个编辑器。",
    summary:
      "Xprite 在浏览器里免费打开并保存 .aseprite；需要 Apple Pencil 手势和 iCloud 同步时，可以看 Pixquare、Resprite 和 Pixaki Pro。",
    topic: "iPad 与触控",
  },
  "piskel-alternatives": {
    title: "Piskel 替代工具：3 款像素动画编辑器对比 | Xprite",
    description:
      "Piskel 适合画小型精灵动画。要继续编辑 .piskel、在浏览器里改 .aseprite、用笔和手指画，或者把作品发到社区，本文对比 Pixelorama、Xprite 和 Pixilart，并说明怎样把 Piskel 作品搬到 Xprite。",
    summary:
      "Pixelorama 能直接打开 .piskel；Xprite 适合编辑 .aseprite 和触控绘画；Pixilart 适合分享作品。",
    topic: "编辑器替代工具",
  },
  "aseprite-to-gif": {
    title: "Aseprite 转 GIF：在浏览器里导出动画 | Xprite",
    description:
      "用 Xprite 查看器在浏览器里打开 .aseprite，选择动画标签，免费导出 GIF，不用安装 Aseprite。文件在本地处理，本文也说明 GIF 对帧时长、颜色和透明度的影响。",
    summary: "4 步把整段动画或一个标签导出为 GIF，并说明帧时长、颜色和透明度的变化。",
    topic: "动画导出",
  },
  "aseprite-to-png": {
    title: "Aseprite 转 PNG：导出透明背景的单帧图片 | Xprite",
    description:
      "用 Xprite 查看器在浏览器里打开 .aseprite，选择帧和可见图层，免费导出透明 PNG，尺寸和画布一致。文件在本地处理，不用安装 Aseprite。",
    summary: "4 步导出任意一帧为透明 PNG，保留原始尺寸和半透明像素。",
    topic: "透明图片",
  },
} as const;
