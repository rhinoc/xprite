import type { PlannedPageDefinition } from "../site/planned-page.ts";

export const DESIGN_SCHOOL_PAGES: readonly PlannedPageDefinition[] = [
  {
    path: "/design-school/",
    title: {
      en: "Design school",
      "zh-CN": "设计学院",
    },
    children: [
      {
        path: "/design-school/pixel-art-basics/",
        title: {
          en: "Pixel art basics",
          "zh-CN": "像素画入门",
        },
      },
      {
        path: "/design-school/animation/",
        title: {
          en: "Animation",
          "zh-CN": "动画制作",
        },
      },
      {
        path: "/design-school/game-art/",
        title: {
          en: "Game art and tilesets",
          "zh-CN": "游戏美术与瓦片",
        },
      },
      {
        path: "/design-school/character-design/",
        title: {
          en: "Character design",
          "zh-CN": "角色设计",
        },
      },
    ],
  },
];
