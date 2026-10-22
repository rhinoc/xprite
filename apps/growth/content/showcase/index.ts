import { editorApplicationMetadata } from "../application/index.ts";
import { ARTICLES } from "../articles/index.ts";
import { GUIDE_PAGES } from "../help/pages.ts";
import { faqInlineText, faqPageSchema } from "../site/faq.ts";
import { localizedSiteHref, pickText, publicLanguage } from "../site/language.ts";
import { showcaseLabel } from "../site/navigation.ts";
import { TOOLS } from "../tools/index.ts";
import { SHOWCASE_FAQ_COPY } from "./faq.ts";

export const SHOWCASE_SEARCH_ATTRIBUTE = "data-showcase-search";

export const SHOWCASE_HERO_COPY = {
  en: {
    titleLead: "Meet",
    titleOverview: "Choose your device",
    summary: "A free online pixel art and animation editor for your computer, iPad and phone.",
    heroImageAlt:
      "A laptop, a tablet and a phone with blank screens, one for each Xprite device demo",
    open: "Start editing",
    goToEditor: "Go to editor",
    home: showcaseLabel("en"),
    features: "Features",
    help: "User guide",
  },
  "zh-CN": {
    titleLead: "遇见",
    titleOverview: "选择你的设备",
    summary: "免费的在线像素画与动画编辑器，电脑、iPad、手机都能用。",
    heroImageAlt: "一台笔记本电脑、一台平板和一部手机，屏幕未点亮，分别对应 Xprite 的三个设备演示",
    open: "开始编辑",
    goToEditor: "进入编辑器",
    home: showcaseLabel("zh-CN"),
    features: "功能",
    help: "使用指南",
  },
  ja: {
    titleLead: "ドット絵なら",
    titleOverview: "どのデバイスでも",
    summary: "オンラインのドット絵・アニメーションエディター。",
    heroImageAlt:
      "画面が消えたノートパソコン、タブレット、スマートフォン。Xprite の各デバイスのデモに対応",
    open: "編集を始める",
    goToEditor: "エディターへ",
    home: showcaseLabel("ja"),
    features: "機能",
    help: "ユーザーガイド",
  },
  ko: {
    titleLead: "도트는",
    titleOverview: "어떤 기기에서든",
    summary: "온라인 도트·픽셀 아트 애니메이션 에디터.",
    heroImageAlt: "화면이 꺼진 노트북, 태블릿, 휴대폰. 각각 Xprite 기기 데모에 해당합니다",
    open: "편집 시작",
    goToEditor: "에디터로 이동",
    home: showcaseLabel("ko"),
    features: "기능",
    help: "사용 가이드",
  },
  ru: {
    titleLead: "Знакомьтесь:",
    titleOverview: "Выберите устройство",
    summary: "Онлайн-редактор пиксель-арта и анимации.",
    heroImageAlt: "Ноутбук, планшет и телефон с тёмными экранами — по одному на каждое демо Xprite",
    open: "Начать рисовать",
    goToEditor: "В редактор",
    home: showcaseLabel("ru"),
    features: "Возможности",
    help: "Руководство",
  },
  "pt-BR": {
    titleLead: "Conheça o",
    titleOverview: "Escolha seu dispositivo",
    summary: "Um editor de pixel art e animação online.",
    heroImageAlt:
      "Um notebook, um tablet e um celular com a tela apagada, um para cada demonstração do Xprite",
    open: "Começar a editar",
    goToEditor: "Ir para o editor",
    home: showcaseLabel("pt-BR"),
    features: "Recursos",
    help: "Guia do usuário",
  },
  es: {
    titleLead: "Conoce",
    titleOverview: "Elige tu dispositivo",
    summary: "Un editor de pixel art y animación online.",
    heroImageAlt:
      "Un portátil, una tableta y un teléfono con la pantalla apagada, uno para cada demostración de Xprite",
    open: "Empezar a editar",
    goToEditor: "Ir al editor",
    home: showcaseLabel("es"),
    features: "Funciones",
    help: "Guía de usuario",
  },
} as const;

export const deviceDemosLabel = (language: string) =>
  pickText(
    publicLanguage(language),
    "Device demos",
    "设备演示",
    "デバイスのデモ",
    "기기 데모",
    "Демо на устройствах",
    "Demonstrações em dispositivos",
    "Demostraciones en dispositivos",
  );

export const SHOWCASE_DISCOVERY_COPY = {
  en: {
    toolsTitle: "Tools",
    allFeatures: "All features",
    readme: "Read Me",
    userGuide: "User guide",
    comparisons: "Comparisons",
    resources: "Library",
  },
  "zh-CN": {
    toolsTitle: "工具",
    allFeatures: "全部功能",
    readme: "工具说明",
    userGuide: "使用指南",
    comparisons: "比较",
    resources: "资料库",
  },
  ja: {
    toolsTitle: "ツール",
    allFeatures: "すべての機能",
    readme: "使い方",
    userGuide: "ユーザーガイド",
    comparisons: "比較",
    resources: "ライブラリ",
  },
  ko: {
    toolsTitle: "도구",
    allFeatures: "모든 기능",
    readme: "사용 방법",
    userGuide: "사용 가이드",
    comparisons: "비교",
    resources: "자료실",
  },
  ru: {
    toolsTitle: "Инструменты",
    allFeatures: "Все возможности",
    readme: "Как пользоваться",
    userGuide: "Руководство",
    comparisons: "Сравнения",
    resources: "Библиотека",
  },
  "pt-BR": {
    toolsTitle: "Ferramentas",
    allFeatures: "Todos os recursos",
    readme: "Como usar",
    userGuide: "Guia do usuário",
    comparisons: "Comparações",
    resources: "Biblioteca",
  },
  es: {
    toolsTitle: "Herramientas",
    allFeatures: "Todas las funciones",
    readme: "Cómo usar",
    userGuide: "Guía de usuario",
    comparisons: "Comparativas",
    resources: "Biblioteca",
  },
} as const;

const CHINESE_TOOL_COPY = {
  "/tools/fuse-beads/": {
    label: "拼豆图纸生成器",
    summary: "选择品牌色卡与格数，导出 PNG 图纸或按底板分页的 PDF。",
  },
  "/tools/viewer/": {
    label: "Aseprite 查看器",
    summary: "查看图层和动画，导出 PNG 图片或 GIF 动画。",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF 转精灵表",
    summary: "将动画帧排成 PNG 精灵表，导出帧坐标和时长数据。",
  },
  "/tools/animal-crossing-qr/": {
    label: "动物森友会设计转换器",
    summary: "将 PNG 或 Aseprite 图块转换成设计二维码，也可以打开已有设计。",
  },
  "/tools/pixelate/": {
    label: "图片转像素画",
    summary: "将图片转换为像素画，或还原放大的像素网格。",
  },
} as const;

const JAPANESE_TOOL_COPY = {
  "/tools/fuse-beads/": {
    label: "ビーズ図案メーカー",
    summary:
      "画像や Aseprite ファイルからビーズ図案を作成。MARD、Artkal、Perler、Hama の色を使い、PNG 図案や PDF を保存できます。",
  },

  "/tools/viewer/": {
    label: "Aseprite ビューアー",
    summary: "レイヤーとアニメーションを確認し、PNG 画像や GIF アニメーションをエクスポート。",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF→スプライトシート変換",
    summary:
      "アニメーションのフレームを PNG スプライトシートに並べ、フレームの座標と時間をエクスポート。",
  },
  "/tools/animal-crossing-qr/": {
    label: "どうぶつの森マイデザイン変換",
    summary:
      "PNG や Aseprite のタイルをマイデザインの QR コードに変換。既存のマイデザインも開けます。",
  },
  "/tools/pixelate/": {
    label: "画像をドット絵に変換",
    summary: "画像をドット絵に変換したり、拡大されたピクセルグリッドを復元したりできます。",
  },
} as const;

const KOREAN_TOOL_COPY = {
  "/tools/fuse-beads/": {
    label: "퓨즈 비즈 도안 만들기",
    summary:
      "이미지나 Aseprite 파일로 비즈 도안을 만들고 MARD, Artkal, Perler, Hama 색상으로 PNG 도안이나 PDF를 저장합니다.",
  },

  "/tools/viewer/": {
    label: "Aseprite 뷰어",
    summary: "레이어와 애니메이션을 살펴보고 PNG 이미지나 GIF 애니메이션으로 내보냅니다.",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF 스프라이트 시트 변환기",
    summary: "애니메이션 프레임을 PNG 스프라이트 시트로 배치하고 프레임 좌표와 시간을 내보냅니다.",
  },
  "/tools/animal-crossing-qr/": {
    label: "동물의 숲 마이 디자인 변환기",
    summary: "PNG나 Aseprite 타일을 마이 디자인 QR 코드로 바꾸고, 기존 디자인도 열 수 있습니다.",
  },
  "/tools/pixelate/": {
    label: "이미지 픽셀 아트 변환",
    summary: "이미지를 픽셀 아트로 바꾸거나 확대된 픽셀 격자를 복원합니다.",
  },
} as const;

const RUSSIAN_TOOL_COPY = {
  "/tools/fuse-beads/": {
    label: "Схемы из термобусин",
    summary:
      "Создавайте схемы из изображений или файлов Aseprite с цветами MARD, Artkal, Perler и Hama. Сохраняйте PNG или PDF.",
  },

  "/tools/viewer/": {
    label: "Просмотр Aseprite",
    summary: "Просматривайте слои и анимацию, экспортируйте PNG или анимированный GIF.",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF в спрайт-лист",
    summary:
      "Раскладывает кадры анимации в спрайт-лист PNG и экспортирует координаты и длительность кадров.",
  },
  "/tools/animal-crossing-qr/": {
    label: "Конвертер дизайнов Animal Crossing",
    summary: "Превращает тайлы PNG или Aseprite в QR-коды дизайнов и открывает готовые дизайны.",
  },
  "/tools/pixelate/": {
    label: "Картинка в пиксель-арт",
    summary:
      "Превращает изображение в пиксель-арт или восстанавливает увеличенную пиксельную сетку.",
  },
} as const;

const PORTUGUESE_TOOL_COPY = {
  "/tools/fuse-beads/": {
    label: "Padrões de miçangas termocolantes",
    summary:
      "Crie padrões a partir de imagens ou arquivos Aseprite com as cores MARD, Artkal, Perler e Hama. Exporte PNG ou PDF.",
  },

  "/tools/viewer/": {
    label: "Visualizador de Aseprite",
    summary: "Veja camadas e animações e exporte imagens PNG ou GIFs animados.",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF para sprite sheet",
    summary:
      "Organiza os quadros da animação em uma sprite sheet PNG e exporta coordenadas e durações.",
  },
  "/tools/animal-crossing-qr/": {
    label: "Conversor de designs do Animal Crossing",
    summary:
      "Transforma tiles PNG ou do Aseprite em QR codes de designs e abre designs existentes.",
  },
  "/tools/pixelate/": {
    label: "Imagem para pixel art",
    summary: "Transforma imagens em pixel art ou recupera uma grade de pixels ampliada.",
  },
} as const;

const SPANISH_TOOL_COPY = {
  "/tools/fuse-beads/": {
    label: "Patrones de cuentas termoadhesivas",
    summary:
      "Crea patrones a partir de imágenes o archivos Aseprite con colores MARD, Artkal, Perler y Hama. Exporta PNG o PDF.",
  },

  "/tools/viewer/": {
    label: "Visor de Aseprite",
    summary: "Revisa capas y animaciones y exporta imágenes PNG o GIF animados.",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF a hoja de sprites",
    summary:
      "Coloca los cuadros de la animación en una hoja de sprites PNG y exporta coordenadas y duraciones.",
  },
  "/tools/animal-crossing-qr/": {
    label: "Conversor de diseños de Animal Crossing",
    summary:
      "Convierte tiles PNG o de Aseprite en códigos QR de diseños y abre diseños existentes.",
  },
  "/tools/pixelate/": {
    label: "Imagen a pixel art",
    summary: "Convierte imágenes en pixel art o recupera una cuadrícula de píxeles ampliada.",
  },
} as const;

const LOCALIZED_TOOL_COPY = {
  "zh-CN": CHINESE_TOOL_COPY,
  ja: JAPANESE_TOOL_COPY,
  ko: KOREAN_TOOL_COPY,
  ru: RUSSIAN_TOOL_COPY,
  "pt-BR": PORTUGUESE_TOOL_COPY,
  es: SPANISH_TOOL_COPY,
} as const;

/** The landing page links to published tools and articles from their owning registries. */
export function showcaseDiscovery(language: keyof typeof SHOWCASE_DISCOVERY_COPY) {
  return {
    copy: SHOWCASE_DISCOVERY_COPY[language],
    tools: TOOLS.map((tool) => ({
      path: tool.path,
      href: localizedSiteHref(tool.path, language),
      ...(language === "en"
        ? { label: tool.label, summary: tool.summary }
        : LOCALIZED_TOOL_COPY[language][tool.path]),
    })),
    comparisons: ARTICLES.filter((article) => article.collection === "compare"),
  };
}

/** Keep server metadata and browser language changes in sync without build-code imports. */
export function showcaseSearchMetadata(
  language: keyof typeof SHOWCASE_HERO_COPY,
  page: { path: string; title: string; description: string },
  siteUrl: string,
) {
  const canonical = new URL(page.path, siteUrl).href;
  const { "@context": context, ...application } = editorApplicationMetadata();
  const faq = faqPageSchema(
    SHOWCASE_FAQ_COPY[language].questions.map((item) => ({
      question: item.question,
      answer: faqInlineText(item.answer),
    })),
    { url: canonical, language },
  );
  return {
    "@context": context,
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: page.title,
        description: page.description,
        inLanguage: language,
        isPartOf: { "@id": `${siteUrl}#website` },
        about: { "@id": application["@id"] },
        mainEntity: { "@id": application["@id"] },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
        relatedLink: [
          new URL(GUIDE_PAGES[language].path, siteUrl).href,
          ...TOOLS.map((tool) => new URL(tool.path, siteUrl).href),
          ...ARTICLES.map((article) => new URL(article.path, siteUrl).href),
        ],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Xprite", item: siteUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: showcaseLabel(language),
            item: canonical,
          },
        ],
      },
      application,
      ...(faq ? [{ ...faq, isPartOf: { "@id": `${siteUrl}#website` } }] : []),
    ],
  };
}

/** Feature pages linked from each item of the story `features` list, in order. */
export const SHOWCASE_STORY_FEATURE_SLUGS = [
  "draw-pixel-art",
  "layers-and-colors",
  "export-images-and-animation",
] as const;

export const SHOWCASE_STORY_COPY = {
  en: {
    createLabel: "02 / CREATE",
    createTitle: "Draw and animate pixel art",
    createDescription: "Draw sprites with layers and palettes, then animate them frame by frame.",
    features: ["Drawing tools", "Layers & frames", "GIF & PNG export"],
    screenshot: "The Xprite editor with layers and an eight-frame pixel animation",
    screenshotCaption: "Layers and the animation timeline",
    browserLabel: "03 / MAKE IT YOURS",
    browserTitle: "Set up your workspace",
    browserDescription:
      "Draw with a mouse, pen or finger on a computer, iPad or phone. Move, resize and dock panels.",
    fileTitle: "Open Aseprite files",
    fileDescription:
      "Open and save .ase and .aseprite projects. Export a PNG frame or an animated GIF.",
    saveTitle: "Save on your device",
    saveDescription:
      "Projects save in your browser or as files on your device, and nothing is uploaded. After your first online visit, install Xprite to edit offline.",
    layoutAlt: "Moving the Xprite timeline to the right, resizing it, and docking it at the bottom",
    layoutCaption: "Move, resize and dock panels.",
  },
  "zh-CN": {
    createLabel: "02 / 创作",
    createTitle: "画像素画，做逐帧动画",
    createDescription: "用图层和调色板画像素画，在时间轴上逐帧做动画。",
    features: ["绘画工具", "图层与动画帧", "GIF 与 PNG 导出"],
    screenshot: "Xprite 编辑器中的图层与八帧像素动画",
    screenshotCaption: "图层与动画时间轴",
    browserLabel: "03 / 自在创作",
    browserTitle: "按习惯布置工作区",
    browserDescription: "在电脑、iPad 或手机上用鼠标、笔或手指绘画，移动、缩放和停靠面板。",
    fileTitle: "打开 Aseprite 文件",
    fileDescription: "打开和保存 .ase、.aseprite 工程，导出 PNG 单帧或 GIF 动画。",
    saveTitle: "保存在本地",
    saveDescription:
      "作品保存在浏览器或设备上的文件里，不会上传。首次联网准备好资源后，可以安装 Xprite 离线编辑。",
    layoutAlt: "将 Xprite 时间线移到右侧、调整宽度，再停靠到底部",
    layoutCaption: "移动、调整大小和停靠面板。",
  },
  ja: {
    createLabel: "02 / つくる",
    createTitle: "描画とアニメーション",
    createDescription: "レイヤーでドット絵を描き、フレームごとにアニメーションを付けられます。",
    features: ["描画ツール", "レイヤーとフレーム", "GIF・PNG エクスポート"],
    screenshot: "レイヤーと 8 フレームのドット絵アニメーションを表示した Xprite エディター",
    screenshotCaption: "レイヤーとアニメーションのタイムライン",
    browserLabel: "03 / 自分好みに",
    browserTitle: "ワークスペースのレイアウト",
    browserDescription:
      "マウス、ペン、タッチで描画。パネルを移動・リサイズしてワークスペースを整えられます。",
    fileTitle: "Aseprite ファイルを開く",
    fileDescription:
      ".ase・.aseprite プロジェクトの作業を続けられます。静止フレームやアニメーション GIF をエクスポート。",
    saveTitle: "プロジェクトを保存",
    saveDescription:
      "プロジェクトはブラウザか端末のファイルに保存できます。初回にオンラインで開いた後は、Xprite をインストールしてオフラインでも編集できます。",
    layoutAlt: "Xprite のタイムラインを右に移動し、サイズを変えて、下にドッキングする様子",
    layoutCaption: "パネルを移動・リサイズ・ドッキング。",
  },
  ko: {
    createLabel: "02 / 창작",
    createTitle: "그리기와 애니메이션",
    createDescription: "레이어로 도트를 찍고 프레임 단위로 애니메이션을 만드세요.",
    features: ["그리기 도구", "레이어와 프레임", "GIF·PNG 내보내기"],
    screenshot: "레이어와 8프레임 도트 애니메이션이 보이는 Xprite 에디터",
    screenshotCaption: "레이어와 애니메이션 타임라인",
    browserLabel: "03 / 나에게 맞게",
    browserTitle: "작업 공간 레이아웃",
    browserDescription:
      "마우스, 펜, 터치로 그리세요. 패널을 옮기고 크기를 바꿔 작업 공간을 정리할 수 있습니다.",
    fileTitle: "Aseprite 파일 열기",
    fileDescription:
      ".ase와 .aseprite 프로젝트로 계속 작업하세요. 정지 프레임이나 애니메이션 GIF로 내보낼 수 있습니다.",
    saveTitle: "프로젝트 저장",
    saveDescription:
      "프로젝트를 브라우저나 기기 파일로 저장하세요. 처음 온라인으로 연 뒤에는 Xprite를 설치해 오프라인에서도 편집할 수 있습니다.",
    layoutAlt: "Xprite 타임라인을 오른쪽으로 옮기고 크기를 바꾼 뒤 아래쪽에 도킹하는 모습",
    layoutCaption: "패널을 옮기고, 크기를 바꾸고, 도킹하세요.",
  },
  ru: {
    createLabel: "02 / ТВОРИТЕ",
    createTitle: "Рисунок и анимация",
    createDescription: "Рисуйте пиксель-арт на слоях и анимируйте его покадрово.",
    features: ["Инструменты рисования", "Слои и кадры", "Экспорт GIF и PNG"],
    screenshot: "Редактор Xprite со слоями и пиксельной анимацией из восьми кадров",
    screenshotCaption: "Слои и таймлайн анимации",
    browserLabel: "03 / ПОД СЕБЯ",
    browserTitle: "Рабочая область",
    browserDescription:
      "Рисуйте мышью, пером или пальцем. Перемещайте панели и меняйте их размер, как вам удобно.",
    fileTitle: "Открывайте файлы Aseprite",
    fileDescription:
      "Продолжайте работу над проектами .ase и .aseprite. Экспортируйте отдельный кадр или анимированный GIF.",
    saveTitle: "Сохраняйте проекты",
    saveDescription:
      "Сохраняйте проекты в браузере или файлами на устройстве. После первого визита онлайн Xprite можно установить и работать офлайн.",
    layoutAlt: "Таймлайн Xprite перемещают вправо, меняют его размер и закрепляют внизу",
    layoutCaption: "Перемещайте, масштабируйте и закрепляйте панели.",
  },
  "pt-BR": {
    createLabel: "02 / CRIE",
    createTitle: "Desenho e animação",
    createDescription: "Desenhe pixel art com camadas e anime quadro a quadro.",
    features: ["Ferramentas de desenho", "Camadas e quadros", "Exportação GIF e PNG"],
    screenshot: "O editor Xprite com camadas e uma animação em pixel art de oito quadros",
    screenshotCaption: "Camadas e a linha do tempo da animação",
    browserLabel: "03 / DO SEU JEITO",
    browserTitle: "Layout do espaço de trabalho",
    browserDescription:
      "Desenhe com mouse, caneta ou toque. Mova e redimensione os painéis para organizar seu espaço.",
    fileTitle: "Abra arquivos do Aseprite",
    fileDescription:
      "Continue trabalhando em projetos .ase e .aseprite. Exporte um quadro estático ou um GIF animado.",
    saveTitle: "Salve projetos",
    saveDescription:
      "Salve projetos no navegador ou como arquivos no seu dispositivo. Depois da primeira visita online, instale o Xprite para editar offline.",
    layoutAlt:
      "Movendo a linha do tempo do Xprite para a direita, redimensionando e encaixando embaixo",
    layoutCaption: "Mova, redimensione e encaixe painéis.",
  },
  es: {
    createLabel: "02 / CREA",
    createTitle: "Dibujo y animación",
    createDescription: "Dibuja pixel art con capas y anímalo cuadro a cuadro.",
    features: ["Herramientas de dibujo", "Capas y cuadros", "Exportación GIF y PNG"],
    screenshot: "El editor Xprite con capas y una animación pixel art de ocho cuadros",
    screenshotCaption: "Capas y la línea de tiempo de la animación",
    browserLabel: "03 / A TU MANERA",
    browserTitle: "Diseño del espacio de trabajo",
    browserDescription:
      "Dibuja con mouse, lápiz o el dedo. Mueve y cambia el tamaño de los paneles para organizar tu espacio.",
    fileTitle: "Abre archivos de Aseprite",
    fileDescription:
      "Sigue trabajando en proyectos .ase y .aseprite. Exporta un cuadro fijo o un GIF animado.",
    saveTitle: "Guarda proyectos",
    saveDescription:
      "Guarda proyectos en el navegador o como archivos en tu dispositivo. Tras la primera visita online, instala Xprite para editar sin conexión.",
    layoutAlt:
      "Se mueve la línea de tiempo de Xprite a la derecha, se cambia su tamaño y se acopla abajo",
    layoutCaption: "Mueve, cambia el tamaño y acopla paneles.",
  },
} as const;
