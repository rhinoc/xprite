/** The about page (the website home; `/` opens the editor). Public language URLs and metadata are shared by the browser and static-page generation. */
export const SHOWCASE_SITE_URL = "https://xprite.cc/";
export const SHOWCASE_PAGES = {
  en: {
    path: "/about/",
    title: "Pixel Art Maker & Sprite Editor Online, Free | Xprite",
    description:
      "Free pixel art maker and sprite editor in your browser. Draw, animate frame by frame and open .aseprite files on a computer, iPad or phone. No account.",
  },
  "zh-CN": {
    path: "/zh-CN/about/",
    title: "在线像素画制作与精灵动画编辑器，免费 | Xprite",
    description:
      "免费的在线像素画与精灵动画编辑器。在电脑、iPad 或手机浏览器里画像素画、逐帧做动画、打开 .aseprite 文件，无需注册，作品保存在本机。",
  },
  ja: {
    path: "/ja/about/",
    title: "ドット絵メーカー・スプライトエディター（無料）| Xprite",
    description:
      "ブラウザで使える無料のドット絵メーカー。パソコン、iPad、スマホでスプライトを描き、フレームごとに動かし、.aseprite ファイルを開けます。登録不要。",
  },
  ko: {
    path: "/ko/about/",
    title: "무료 온라인 도트 메이커·스프라이트 에디터 | Xprite",
    description:
      "브라우저에서 쓰는 무료 도트 메이커. 컴퓨터, iPad, 휴대폰에서 스프라이트를 그리고 프레임 단위로 움직이며 .aseprite 파일을 엽니다. 가입 불필요.",
  },
  ru: {
    path: "/ru/about/",
    title: "Пиксель-арт и спрайты онлайн, бесплатно | Xprite",
    description:
      "Бесплатный онлайн-редактор пиксель-арта и спрайтов. Рисуйте, анимируйте покадрово и открывайте файлы .aseprite на ПК, iPad и телефоне без регистрации.",
  },
  "pt-BR": {
    path: "/pt-BR/about/",
    title: "Criador de pixel art e editor de sprites grátis | Xprite",
    description:
      "Faça pixel art no navegador, de graça: desenhe sprites, anime quadro a quadro e abra arquivos .aseprite no PC, iPad ou celular. Sem cadastro.",
  },
  es: {
    path: "/es/about/",
    title: "Creador de pixel art y editor de sprites gratis | Xprite",
    description:
      "Haz pixel art en el navegador, gratis: dibuja sprites, anima cuadro a cuadro y abre archivos .aseprite en PC, iPad o móvil. Sin registro.",
  },
} as const;
export const SHOWCASE_DEFAULT_PATH = SHOWCASE_PAGES.en.path;
