import type { PlannedPageDefinition } from "../site/planned-page.ts";

export const RESOURCE_PAGES: readonly PlannedPageDefinition[] = [
  {
    path: "/resources/",
    title: {
      en: "Templates and resources",
      "zh-CN": "模板素材",
    },
    children: [
      {
        path: "/resources/templates/",
        title: {
          en: "Templates",
          "zh-CN": "模板中心",
        },
        children: [
          {
            path: "/resources/templates/animation/",
            title: {
              en: "Animation templates",
              "zh-CN": "动画模板",
            },
          },
          {
            path: "/resources/templates/game-art/",
            title: {
              en: "Game art templates",
              "zh-CN": "游戏美术模板",
            },
          },
          {
            path: "/resources/templates/characters/",
            title: {
              en: "Character templates",
              "zh-CN": "角色模板",
            },
          },
        ],
      },
      {
        path: "/resources/assets/",
        title: {
          en: "Assets",
          "zh-CN": "素材库",
        },
        children: [
          {
            path: "/resources/assets/characters/",
            title: {
              en: "Characters and sprites",
              "zh-CN": "角色与精灵",
            },
          },
          {
            path: "/resources/assets/tilesets/",
            title: {
              en: "Tilesets and environments",
              "zh-CN": "瓦片与场景",
            },
          },
          {
            path: "/resources/assets/icons/",
            title: {
              en: "Icons and interface elements",
              "zh-CN": "图标与界面元素",
            },
          },
        ],
      },
      {
        path: "/resources/fonts/",
        title: {
          en: "Fonts",
          "zh-CN": "字体库",
        },
      },
      {
        path: "/resources/palettes/",
        title: {
          en: "Palettes",
          "zh-CN": "色盘库",
        },
      },
    ],
  },
];
