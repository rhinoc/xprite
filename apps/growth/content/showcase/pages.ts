/** The about page (the website home; `/` opens the editor). Public language URLs and metadata are shared by the browser and static-page generation. */
export const SHOWCASE_SITE_URL = "https://xprite.cc/";
export const SHOWCASE_PAGES = {
  en: {
    path: "/about/",
    title: "Xprite — Free Pixel Art & Animation App for iPad, Phone & PC",
    description:
      "Xprite is a free pixel art and animation app for iPad, phone and PC browsers. Open and save Aseprite files, export GIF or PNG, and keep your art on your device.",
  },
  "zh-CN": {
    path: "/zh-CN/about/",
    title: "Xprite｜免费的在线像素画与动画编辑器",
    description:
      "在电脑、iPad 和手机的浏览器中使用 Xprite 创作像素画与动画，编辑 Aseprite 文件，导出 GIF 或 PNG，作品保存在自己的设备上。",
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
} as const;
export const SHOWCASE_DEFAULT_PATH = SHOWCASE_PAGES.en.path;
