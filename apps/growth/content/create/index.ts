import type { PlannedPageDefinition } from "../site/planned-page.ts";

export const CREATE_PAGES: readonly PlannedPageDefinition[] = [
  {
    path: "/create/",
    title: {
      en: "Design scenes",
      "zh-CN": "设计场景",
    },
    children: [
      {
        path: "/create/pixel-art-animation/",
        title: {
          en: "Pixel art animation",
          "zh-CN": "像素动画",
        },
      },
      {
        path: "/create/pixel-art-game-art/",
        title: {
          en: "Game art",
          "zh-CN": "游戏美术",
        },
        children: [
          {
            path: "/create/tilesets/",
            title: {
              en: "Tilesets and environments",
              "zh-CN": "瓦片与场景",
            },
          },
          {
            path: "/create/game-sprites/",
            title: {
              en: "Game sprites",
              "zh-CN": "角色精灵",
            },
          },
        ],
      },
      {
        path: "/create/original-character/",
        title: {
          en: "Original character",
          "zh-CN": "原创角色",
        },
      },
    ],
  },
];
