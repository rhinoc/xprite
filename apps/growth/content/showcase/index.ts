import { editorApplicationMetadata } from "../application/index";
import { ARTICLES } from "../articles/index";
import { GUIDE_PAGES } from "../help/pages.ts";
import { localizedSiteHref } from "../site/language.ts";
import { showcaseLabel } from "../site/navigation";
import { TOOLS } from "../tools/index";

export const SHOWCASE_SEARCH_ATTRIBUTE = "data-showcase-search";

export const SHOWCASE_HERO_COPY = {
  en: {
    titleLead: "Meet",
    titleOverview: "Choose your device",
    productDescription: [
      "An online pixel art and animation editor.",
      "Draw sprites with layers, frames and palettes. Open Aseprite projects and export GIF or PNG.",
      "Use your computer, iPad or phone. Your artwork stays on your device.",
    ],
    open: "Start editing",
    goToEditor: "Go to editor",
    home: showcaseLabel("en"),
    tools: "Tools",
    help: "User guide",
    languageSwitch: "Switch to 中文",
  },
  "zh-CN": {
    titleLead: "遇见",
    titleOverview: "选择你的设备",
    productDescription: [
      "在线像素画与动画编辑器。",
      "用图层、动画帧和调色板创作，打开 Aseprite 作品，导出 GIF 或 PNG。",
      "在电脑、iPad 和手机上使用，作品保存在自己的设备上。",
    ],
    open: "开始编辑",
    goToEditor: "进入编辑器",
    home: showcaseLabel("zh-CN"),
    tools: "工具",
    help: "使用指南",
    languageSwitch: "切换到 English",
  },
} as const;

export const SHOWCASE_DISCOVERY_COPY = {
  en: {
    toolsTitle: "Tools",
    allTools: "All tools",
    readme: "Read Me",
    userGuide: "User guide",
    fileGuides: "File guides",
    comparisons: "Editor comparisons",
    resources: "Library",
  },
  "zh-CN": {
    toolsTitle: "工具",
    allTools: "全部工具",
    readme: "工具说明",
    userGuide: "使用指南",
    fileGuides: "文件导出",
    comparisons: "编辑器比较",
    resources: "资料库",
  },
} as const;

const CHINESE_TOOL_COPY = {
  "/tools/viewer/": {
    label: "Aseprite 查看器",
    summary: "查看图层和动画，导出 PNG 图片或 GIF 动画。",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF 转精灵表",
    summary: "将动画帧排成 PNG 精灵表，导出帧坐标和时长数据。",
  },
  "/tools/animal-crossing-qr/": {
    label: "动物森友会设计转换器",
    summary: "将 PNG 或 Aseprite 图块转换成设计二维码，也可以打开已有设计。",
  },
} as const;

/** The landing page links to published tools and articles from their owning registries. */
export function showcaseDiscovery(language: keyof typeof SHOWCASE_DISCOVERY_COPY) {
  return {
    copy: SHOWCASE_DISCOVERY_COPY[language],
    tools: TOOLS.map((tool) => ({
      path: tool.path,
      href: localizedSiteHref(tool.path, language),
      ...(language === "zh-CN"
        ? CHINESE_TOOL_COPY[tool.path]
        : { label: tool.label, summary: tool.summary }),
    })),
    fileGuides: ARTICLES.filter((article) => article.collection === "learn"),
    comparisons: ARTICLES.filter((article) => article.collection === "compare"),
  };
}

/** Keep server metadata and browser language changes in sync without build-code imports. */
export function showcaseSearchMetadata(
  language: keyof typeof SHOWCASE_HERO_COPY,
  page: { path: string; title: string; description: string },
  siteUrl: string,
) {
  const canonical = new URL(page.path, siteUrl).href;
  const application = editorApplicationMetadata();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: page.title,
        description: page.description,
        inLanguage: language,
        mainEntity: { "@id": application["@id"] },
        relatedLink: [
          new URL(GUIDE_PAGES[language].path, siteUrl).href,
          ...TOOLS.map((tool) => new URL(tool.path, siteUrl).href),
          ...ARTICLES.map((article) => new URL(article.path, siteUrl).href),
        ],
      },
      application,
    ],
  };
}

export const SHOWCASE_STORY_COPY = {
  en: {
    createLabel: "02 / CREATE",
    createTitle: "Drawing and animation",
    createDescription: "Draw pixel art with layers and animate it frame by frame.",
    features: ["Drawing tools", "Layers & frames", "GIF & PNG export"],
    screenshot: "The Xprite editor with layers and an eight-frame pixel animation",
    screenshotCaption: "Layers and the animation timeline",
    browserLabel: "03 / MAKE IT YOURS",
    browserTitle: "Workspace layout",
    browserDescription:
      "Draw with a mouse, pen or touch. Move and resize panels to arrange your workspace.",
    fileTitle: "Open Aseprite files",
    fileDescription:
      "Keep working with .ase and .aseprite projects. Export a still frame or an animated GIF.",
    saveTitle: "Save projects",
    saveDescription:
      "Save projects in your browser or as files on your device. Install Xprite for offline editing after your first online visit.",
    layoutAlt: "Moving the Xprite timeline to the right, resizing it, and docking it at the bottom",
    layoutCaption: "Move, resize and dock panels.",
  },
  "zh-CN": {
    createLabel: "02 / 创作",
    createTitle: "绘画与动画",
    createDescription: "用图层组织画面，在时间轴上逐帧制作动画。",
    features: ["绘画工具", "图层与动画帧", "GIF 与 PNG 导出"],
    screenshot: "Xprite 编辑器中的图层与八帧像素动画",
    screenshotCaption: "图层与动画时间轴",
    browserLabel: "03 / 自在创作",
    browserTitle: "工作区布局",
    browserDescription: "使用鼠标、笔或触控绘画，移动和调整面板大小。",
    fileTitle: "打开 Aseprite 文件",
    fileDescription: "打开 .ase 和 .aseprite 作品，继续绘画与制作动画，导出单帧图片或 GIF。",
    saveTitle: "保存作品",
    saveDescription:
      "保存到当前浏览器，或另存为设备上的文件。首次联网准备好资源后，也可安装 Xprite 离线编辑。",
    layoutAlt: "将 Xprite 时间线移到右侧、调整宽度，再停靠到底部",
    layoutCaption: "移动、调整大小和停靠面板。",
  },
} as const;
