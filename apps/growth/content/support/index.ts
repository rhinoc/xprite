import type { PlannedPageDefinition } from "../site/planned-page.ts";

export const SUPPORT_PAGES: readonly PlannedPageDefinition[] = [
  {
    path: "/support/",
    title: {
      en: "Help center",
      "zh-CN": "帮助中心",
    },
    children: [
      {
        path: "/support/faq/",
        title: {
          en: "Frequently asked questions",
          "zh-CN": "常见问题",
        },
      },
      {
        path: "/support/files/",
        title: {
          en: "Saving, recovery and files",
          "zh-CN": "保存、恢复与文件问题",
        },
      },
      {
        path: "/support/browsers/",
        title: {
          en: "Browsers and devices",
          "zh-CN": "浏览器与设备问题",
        },
      },
      {
        path: "/support/feedback/",
        title: {
          en: "Feedback",
          "zh-CN": "问题反馈",
        },
      },
    ],
  },
];
