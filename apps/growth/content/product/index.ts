import type { PlannedPageDefinition } from "../site/planned-page.ts";

export const PRODUCT_PAGES: readonly PlannedPageDefinition[] = [
  {
    path: "/how-it-works/",
    title: {
      en: "How it works",
      "zh-CN": "工作原理",
    },
  },
  {
    path: "/features/",
    title: {
      en: "Features",
      "zh-CN": "功能介绍",
    },
  },
];
