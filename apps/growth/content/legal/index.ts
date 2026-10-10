import type { PlannedPageDefinition } from "../site/planned-page.ts";

export const LEGAL_PAGES: readonly PlannedPageDefinition[] = [
  {
    path: "/legal/",
    title: {
      en: "Legal and privacy",
      "zh-CN": "法律与隐私",
    },
    children: [
      {
        path: "/legal/privacy/",
        title: {
          en: "Privacy policy",
          "zh-CN": "隐私政策",
        },
      },
      {
        path: "/legal/security/",
        title: {
          en: "Security and local processing",
          "zh-CN": "安全与本地处理",
        },
      },
      {
        path: "/legal/terms/",
        title: {
          en: "Terms of use",
          "zh-CN": "使用条款",
        },
      },
      {
        path: "/legal/licenses/",
        title: {
          en: "Resource licenses and attribution",
          "zh-CN": "素材许可与署名",
        },
      },
    ],
  },
];
