import { FEATURE_DETAIL_PATH, FEATURE_DETAILS } from "../features/index.ts";
import { localizedSiteHref, pickText, publicLanguage } from "../site/language.ts";
import {
  ANIMAL_CROSSING_TOOL,
  BEADS_TOOL,
  FIX_AI_PIXEL_ART_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  translateToolText,
  VIEWER_TOOL,
} from "../tools/index.ts";

/** The editor opens on `/`; `/editor` redirects there and keeps the page link explicit. */
export const LANDING_EDITOR_HREF = "/editor";
const EXAMPLE_ART = "/showcase/ipad/hello";
export const LANDING_SCREENSHOT_ROOT = "/showcase/landing";
const SOURCE_URL = "https://github.com/rhinoc/xprite";

type Text = (
  en: string,
  zh: string,
  ja: string,
  ko: string,
  ru: string,
  pt: string,
  es: string,
) => string;

function texts(language: string): Text {
  const selected = publicLanguage(language);
  return (en, zh, ja, ko, ru, pt, es) => pickText(selected, en, zh, ja, ko, ru, pt, es);
}

/** Feature pages listed on the landing page, in order, with a short description each. */
const LANDING_FEATURES = [
  {
    slug: "draw-pixel-art",
    shortcut: "B · G · M",
    description: (t: Text) =>
      t(
        "Pixel-perfect pencil, shapes, fill, selections and custom brushes.",
        "像素级铅笔、形状、填充、选区和自定义画笔。",
        "ピクセルパーフェクトの鉛筆、図形、塗りつぶし、選択範囲、カスタムブラシ。",
        "픽셀 퍼펙트 연필, 도형, 채우기, 선택 영역, 사용자 브러시.",
        "Пиксельный карандаш, фигуры, заливка, выделения и свои кисти.",
        "Lápis pixel perfect, formas, balde, seleções e pincéis próprios.",
        "Lápiz pixel perfect, formas, relleno, selecciones y pinceles propios.",
      ),
  },
  {
    slug: "frame-animation",
    shortcut: "Tab",
    description: (t: Text) =>
      t(
        "Timeline, onion skin, tags and linked cels.",
        "时间轴、洋葱皮、标签和链接帧。",
        "タイムライン、オニオンスキン、タグ、リンクセル。",
        "타임라인, 어니언 스킨, 태그, 링크된 셀.",
        "Таймлайн, калька, метки и связанные ячейки.",
        "Linha do tempo, papel vegetal, tags e células vinculadas.",
        "Línea de tiempo, papel cebolla, etiquetas y celdas vinculadas.",
      ),
  },
  {
    slug: "layers-and-colors",
    shortcut: "256",
    description: (t: Text) =>
      t(
        "Layers, palettes, color modes and indexed images.",
        "图层、调色板、颜色模式和索引图像。",
        "レイヤー、パレット、カラーモード、インデックス画像。",
        "레이어, 팔레트, 색상 모드, 인덱스 이미지.",
        "Слои, палитры, цветовые режимы и индексированные изображения.",
        "Camadas, paletas, modos de cor e imagens indexadas.",
        "Capas, paletas, modos de color e imágenes indexadas.",
      ),
  },
  {
    slug: "tilemaps",
    shortcut: "16×16",
    description: (t: Text) =>
      t(
        "Tilemap layers and tilesets for game maps.",
        "用瓦片图层和瓦片集制作游戏地图。",
        "ゲームマップ用のタイルマップレイヤーとタイルセット。",
        "게임 맵용 타일맵 레이어와 타일셋.",
        "Слои тайлмапов и тайлсеты для игровых карт.",
        "Camadas de tilemap e tilesets para mapas de jogos.",
        "Capas de tilemap y tilesets para mapas de juegos.",
      ),
  },
  {
    slug: "touch-drawing",
    shortcut: "iPad",
    description: (t: Text) =>
      t(
        "Apple Pencil and touch gestures on iPad and phones.",
        "在 iPad 和手机上用 Apple Pencil 和手势绘画。",
        "iPad とスマホで Apple Pencil とタッチ操作。",
        "iPad와 휴대폰에서 Apple Pencil과 터치 제스처.",
        "Apple Pencil и жесты на iPad и телефоне.",
        "Apple Pencil e gestos de toque no iPad e no celular.",
        "Apple Pencil y gestos táctiles en iPad y móvil.",
      ),
  },
  {
    slug: "export-images-and-animation",
    shortcut: "GIF",
    description: (t: Text) =>
      t(
        "PNG, GIF, APNG, WebP and sprite sheets with JSON.",
        "导出 PNG、GIF、APNG、WebP 和带 JSON 的精灵表。",
        "PNG、GIF、APNG、WebP、JSON 付きスプライトシート。",
        "PNG, GIF, APNG, WebP, JSON 포함 스프라이트 시트.",
        "PNG, GIF, APNG, WebP и спрайт-листы с JSON.",
        "PNG, GIF, APNG, WebP e sprite sheets com JSON.",
        "PNG, GIF, APNG, WebP y sprite sheets con JSON.",
      ),
  },
] as const;

/** Tools listed with what they take and what they make. */
const LANDING_TOOLS = [
  { tool: VIEWER_TOOL, input: ".aseprite", output: "PNG · GIF" },
  { tool: GIF_SHEET_TOOL, input: "GIF", output: "PNG" },
  { tool: PIXELATE_TOOL, input: "JPG · PNG", output: "PNG" },
  { tool: FIX_AI_PIXEL_ART_TOOL, input: "PNG", output: "PNG" },
  { tool: BEADS_TOOL, input: "PNG", output: "PNG · PDF" },
  { tool: ANIMAL_CROSSING_TOOL, input: "PNG", output: "QR" },
] as const;

export function landingCopy(language: string) {
  const t = texts(language);
  return {
    status: [
      { label: t("Free", "免费", "無料", "무료", "Бесплатно", "Grátis", "Gratis") },
      {
        label: t(
          "No account",
          "无需注册",
          "登録不要",
          "가입 불필요",
          "Без регистрации",
          "Sem cadastro",
          "Sin registro",
        ),
      },
      {
        label: t(
          "Open source",
          "开源",
          "オープンソース",
          "오픈 소스",
          "Открытый код",
          "Código aberto",
          "Código abierto",
        ),
        href: SOURCE_URL,
      },
    ],
    titleLead: t(
      "Pixel art and animation,",
      "像素画与动画，",
      "ドット絵とアニメーションを、",
      "도트와 애니메이션을,",
      "Пиксель-арт и анимация —",
      "Pixel art e animação,",
      "Pixel art y animación,",
    ),
    titleSelection: t(
      "in your browser",
      "在浏览器里画",
      "ブラウザで",
      "브라우저에서",
      "прямо в браузере",
      "no navegador",
      "en el navegador",
    ),
    lead: t(
      "Draw sprites, animate them frame by frame and open your .aseprite projects on a computer, iPad or phone. Files stay on your device.",
      "画像素画、逐帧做动画，在电脑、iPad 和手机上打开 .aseprite 工程。作品只保存在你的设备上。",
      "パソコン、iPad、スマホでスプライトを描き、フレームごとに動かし、.aseprite プロジェクトを開けます。ファイルは端末に残ります。",
      "컴퓨터, iPad, 휴대폰에서 스프라이트를 그리고 프레임 단위로 움직이며 .aseprite 프로젝트를 여세요. 파일은 기기에 남습니다.",
      "Рисуйте спрайты, анимируйте их покадрово и открывайте проекты .aseprite на компьютере, iPad или телефоне. Файлы остаются у вас.",
      "Desenhe sprites, anime quadro a quadro e abra projetos .aseprite no computador, iPad ou celular. Os arquivos ficam no seu aparelho.",
      "Dibuja sprites, anímalos cuadro a cuadro y abre proyectos .aseprite en el ordenador, iPad o móvil. Los archivos se quedan en tu equipo.",
    ),
    openEditor: t(
      "Open editor",
      "打开编辑器",
      "エディターを開く",
      "에디터 열기",
      "Открыть редактор",
      "Abrir editor",
      "Abrir editor",
    ),
    features: t("Features", "功能", "機能", "기능", "Возможности", "Recursos", "Funciones"),
    screenshotAlt: t(
      "The Xprite editor in the Moss theme with an eight-frame pixel animation",
      "苔藓主题下的 Xprite 编辑器，打开一段八帧像素动画",
      "モステーマの Xprite エディターと 8 フレームのドット絵アニメーション",
      "모스 테마의 Xprite 에디터와 8프레임 도트 애니메이션",
      "Редактор Xprite в теме «Мох» с пиксельной анимацией из восьми кадров",
      "O editor Xprite no tema Musgo com uma animação de oito quadros",
      "El editor Xprite con el tema Musgo y una animación de ocho cuadros",
    ),
    phoneAlt: t(
      "The same animation open in the Xprite phone layout",
      "同一段动画在 Xprite 手机布局中打开",
      "スマホ用レイアウトの Xprite で開いた同じアニメーション",
      "Xprite 휴대폰 레이아웃에서 연 같은 애니메이션",
      "Та же анимация в мобильной раскладке Xprite",
      "A mesma animação aberta no layout de celular do Xprite",
      "La misma animación abierta en el diseño móvil de Xprite",
    ),
    facts: [
      {
        key: t("Files", "文件", "ファイル", "파일", "Файлы", "Arquivos", "Archivos"),
        value: ".aseprite",
        text: t(
          "Open and save the original format.",
          "打开和保存原生格式。",
          "元の形式で開いて保存。",
          "원래 형식으로 열고 저장.",
          "Открывайте и сохраняйте исходный формат.",
          "Abra e salve o formato original.",
          "Abre y guarda el formato original.",
        ),
      },
      {
        key: t("Input", "输入", "入力", "입력", "Ввод", "Entrada", "Entrada"),
        value: t(
          "Pen + touch",
          "笔与触控",
          "ペン＋タッチ",
          "펜 + 터치",
          "Перо и касание",
          "Caneta + toque",
          "Lápiz + tacto",
        ),
        text: t(
          "Apple Pencil, fingers or a mouse.",
          "Apple Pencil、手指或鼠标。",
          "Apple Pencil、指、マウス。",
          "Apple Pencil, 손가락, 마우스.",
          "Apple Pencil, пальцы или мышь.",
          "Apple Pencil, dedos ou mouse.",
          "Apple Pencil, dedos o ratón.",
        ),
      },
      {
        key: t("Storage", "存储", "保存", "저장", "Хранение", "Armazenamento", "Almacenamiento"),
        value: t(
          "On device",
          "存在本地",
          "端末内",
          "기기에 저장",
          "На устройстве",
          "No aparelho",
          "En tu equipo",
        ),
        text: t(
          "Nothing uploads. Works offline.",
          "不上传，可离线使用。",
          "アップロードなし。オフラインで動作。",
          "업로드 없음. 오프라인 작동.",
          "Ничего не загружается. Работает офлайн.",
          "Nada é enviado. Funciona offline.",
          "No se sube nada. Funciona sin conexión.",
        ),
      },
      {
        key: t("Price", "价格", "料金", "가격", "Цена", "Preço", "Precio"),
        value: t("Free", "免费", "無料", "무료", "Бесплатно", "Grátis", "Gratis"),
        text: t(
          "No account. Open source.",
          "无需注册，开源。",
          "登録不要。オープンソース。",
          "가입 불필요. 오픈 소스.",
          "Без регистрации. Открытый код.",
          "Sem cadastro. Código aberto.",
          "Sin registro. Código abierto.",
        ),
      },
    ],
    featuresTitle: t(
      "Everything a sprite needs",
      "画精灵需要的都在这里",
      "スプライトに必要なものがそろう",
      "스프라이트에 필요한 모든 것",
      "Всё, что нужно для спрайтов",
      "Tudo o que um sprite precisa",
      "Todo lo que necesita un sprite",
    ),
    featuresLead: t(
      "The tools Aseprite users know, with a workspace you can move, resize and dock on any screen.",
      "Aseprite 用户熟悉的工具，以及可以在任何屏幕上移动、缩放和停靠的工作区。",
      "Aseprite ユーザーになじみのツールと、どの画面でも移動・リサイズ・ドッキングできるワークスペース。",
      "Aseprite 사용자에게 익숙한 도구와, 어떤 화면에서도 옮기고 크기를 바꾸고 도킹할 수 있는 작업 공간.",
      "Привычные пользователям Aseprite инструменты и рабочая область, которую можно перемещать, масштабировать и закреплять на любом экране.",
      "As ferramentas que quem usa Aseprite conhece, com um espaço de trabalho que você move, redimensiona e encaixa em qualquer tela.",
      "Las herramientas que conocen los usuarios de Aseprite, con un espacio de trabajo que puedes mover, redimensionar y acoplar en cualquier pantalla.",
    ),
    toolsTitle: t(
      "One-job tools",
      "单一用途小工具",
      "ひとつの用途に絞ったツール",
      "한 가지 일을 하는 도구",
      "Инструменты для одной задачи",
      "Ferramentas de uma tarefa",
      "Herramientas de una sola tarea",
    ),
    toolsLead: t(
      "Drop a file and get the result. Each tool runs on the page and can open the result in the editor.",
      "拖入文件就能得到结果。每个工具都在网页里运行，结果可以继续在编辑器里打开。",
      "ファイルをドロップするだけ。各ツールはページ内で動き、結果をエディターで開けます。",
      "파일을 놓으면 결과가 나옵니다. 각 도구는 페이지에서 실행되고 결과를 에디터에서 열 수 있습니다.",
      "Перетащите файл и получите результат. Каждый инструмент работает на странице и может открыть результат в редакторе.",
      "Solte um arquivo e receba o resultado. Cada ferramenta roda na página e pode abrir o resultado no editor.",
      "Suelta un archivo y obtén el resultado. Cada herramienta funciona en la página y puede abrir el resultado en el editor.",
    ),
    galleryTitle: t(
      "Made in Xprite",
      "用 Xprite 制作",
      "Xprite で制作",
      "Xprite로 만든 작품",
      "Сделано в Xprite",
      "Feito no Xprite",
      "Hecho en Xprite",
    ),
    galleryLead: t(
      "Each file opens in the editor with its layers and frames.",
      "每个文件都可以带着图层和帧在编辑器里打开。",
      "どのファイルもレイヤーとフレームごとエディターで開けます。",
      "각 파일은 레이어와 프레임 그대로 에디터에서 열립니다.",
      "Каждый файл открывается в редакторе со слоями и кадрами.",
      "Cada arquivo abre no editor com suas camadas e quadros.",
      "Cada archivo se abre en el editor con sus capas y cuadros.",
    ),
    gallery: [
      {
        src: `${EXAMPLE_ART}/hello.gif`,
        width: 128,
        height: 80,
        alt: t(
          "The hello animation drawn in Xprite",
          "在 Xprite 中绘制的 hello 动画",
          "Xprite で描いた hello アニメーション",
          "Xprite로 그린 hello 애니메이션",
          "Анимация hello, нарисованная в Xprite",
          "A animação hello desenhada no Xprite",
          "La animación hello dibujada en Xprite",
        ),
        tag: t(
          "hello.aseprite · 8 frames",
          "hello.aseprite · 8 帧",
          "hello.aseprite · 8 フレーム",
          "hello.aseprite · 8프레임",
          "hello.aseprite · 8 кадров",
          "hello.aseprite · 8 quadros",
          "hello.aseprite · 8 cuadros",
        ),
      },
      {
        src: `${EXAMPLE_ART}/hello-sheet.png`,
        width: 384,
        height: 240,
        alt: t(
          "The hello animation exported as a sprite sheet",
          "导出为精灵表的 hello 动画",
          "スプライトシートに書き出した hello アニメーション",
          "스프라이트 시트로 내보낸 hello 애니메이션",
          "Анимация hello, экспортированная в спрайт-лист",
          "A animação hello exportada como sprite sheet",
          "La animación hello exportada como sprite sheet",
        ),
        tag: t(
          "Sprite sheet · 8 frames",
          "精灵表 · 8 帧",
          "スプライトシート · 8 フレーム",
          "스프라이트 시트 · 8프레임",
          "Спрайт-лист · 8 кадров",
          "Sprite sheet · 8 quadros",
          "Sprite sheet · 8 cuadros",
        ),
      },
    ],
    closingTitle: t(
      "Your canvas is ready",
      "画布已经准备好了",
      "キャンバスの準備はできています",
      "캔버스가 준비되었습니다",
      "Холст уже готов",
      "Sua tela está pronta",
      "Tu lienzo está listo",
    ),
    featureList: LANDING_FEATURES.map((feature) => ({
      href: localizedSiteHref(`${FEATURE_DETAIL_PATH}${feature.slug}/`, language),
      slug: feature.slug,
      title: FEATURE_DETAILS.find((detail) => detail.slug === feature.slug)!.title[
        publicLanguage(language)
      ],
      shortcut: feature.shortcut,
      description: feature.description(t),
    })),
    toolList: LANDING_TOOLS.map(({ tool, input, output }) => ({
      href: localizedSiteHref(tool.path, language),
      label: translateToolText(tool.label, language),
      input,
      output,
    })),
  };
}
