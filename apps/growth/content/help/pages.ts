import { PublicLanguage } from "../site/language.ts";

/** Public guide metadata can be read without loading Markdown or image modules. */
export const GUIDE_PAGES = {
  [PublicLanguage.English]: {
    path: "/help/en/",
    title: "Xprite User Guide",
    description:
      "Save and recover projects, arrange your workspace, use touch and pen input, and install Xprite for offline editing.",
  },
  [PublicLanguage.SimplifiedChinese]: {
    path: "/help/zh-CN/",
    title: "Xprite 使用指南",
    description:
      "Xprite 浏览器保存与恢复、工作区布局、触摸与手写笔、快捷操作栏及安装与离线使用指南。",
  },
} as const;
