/** The about page (the website home; `/` opens the editor). Public language URLs and metadata are shared by the browser and static-page generation. */
export const SHOWCASE_SITE_URL = "https://xprite.cc/";
export const SHOWCASE_PAGES = {
  en: {
    path: "/about/",
    title: "About Xprite — free online pixel art and animation editor",
    description:
      "Xprite is a free, open-source pixel art and animation editor by one developer. Open Aseprite files online on PC, iPad or phone. Your art stays on your device.",
  },
  "zh-CN": {
    path: "/zh-CN/about/",
    title: "关于 Xprite｜免费开源的在线像素画与动画编辑器",
    description:
      "Xprite 是一位开发者独立制作的免费开源像素画与动画编辑器。在电脑、iPad 和手机浏览器中打开和保存 Aseprite 文件，导出 GIF 或 PNG，作品保存在自己的设备上。",
  },
  ja: {
    path: "/ja/about/",
    title: "Xprite｜無料のオンラインドット絵・アニメーションエディター",
    description:
      "パソコン、iPad、スマホのブラウザでドット絵とアニメーションを無料で制作。Aseprite ファイルを編集し、GIF や PNG でエクスポート。作品は自分の端末に保存されます。",
  },
  ko: {
    path: "/ko/about/",
    title: "Xprite - 무료 온라인 도트·픽셀 아트 애니메이션 에디터",
    description:
      "컴퓨터, 아이패드, 휴대폰 브라우저에서 무료로 도트 애니메이션을 만드세요. 에이스프라이트(Aseprite) 파일을 편집하고 GIF·PNG로 내보내며 작품은 기기에 남습니다.",
  },
  ru: {
    path: "/ru/about/",
    title: "Xprite — пиксель арт редактор онлайн, бесплатно",
    description:
      "Бесплатный пиксель арт редактор и анимация в браузере на ПК, iPad и телефоне. Открывайте файлы Aseprite онлайн, экспортируйте GIF и PNG; работы остаются у вас.",
  },
  "pt-BR": {
    path: "/pt-BR/about/",
    title: "Xprite — editor de pixel art online grátis",
    description:
      "Editor de pixel art online grátis para PC, iPad e celular. Crie animações, abra e salve arquivos do Aseprite, exporte GIF ou PNG e guarde sua arte no aparelho.",
  },
  es: {
    path: "/es/about/",
    title: "Xprite — editor de pixel art online gratis",
    description:
      "Editor de pixel art online gratis para PC, iPad y móvil. Crea animaciones, abre y guarda archivos de Aseprite, exporta GIF o PNG y guarda tu arte en tu equipo.",
  },
} as const;
export const SHOWCASE_DEFAULT_PATH = SHOWCASE_PAGES.en.path;
