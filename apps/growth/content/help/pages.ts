import { PublicLanguage } from "../site/language.ts";

/** Public guide metadata can be read without loading Markdown or image modules. */
export const GUIDE_PAGES = {
  [PublicLanguage.English]: {
    path: "/help/",
    title: "Xprite User Guide",
    description:
      "Save and recover projects, arrange your workspace, use touch and pen input, and install Xprite for offline editing.",
  },
  [PublicLanguage.SimplifiedChinese]: {
    path: "/zh-CN/help/",
    title: "Xprite 使用指南",
    description:
      "Xprite 保存与恢复、打开与导出文件、工作区布局、触摸与手写笔、离线使用、浏览器兼容性和常见问题。",
  },
} as const;
