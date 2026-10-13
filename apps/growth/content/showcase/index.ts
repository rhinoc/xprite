import { editorApplicationMetadata } from "../application/index.ts";
import { ARTICLES } from "../articles/index.ts";
import { GUIDE_PAGES } from "../help/pages.ts";
import { localizedSiteHref, pickText, publicLanguage } from "../site/language.ts";
import { showcaseLabel } from "../site/navigation.ts";
import { TOOLS } from "../tools/index.ts";

export const SHOWCASE_SEARCH_ATTRIBUTE = "data-showcase-search";

export const SHOWCASE_HERO_COPY = {
  en: {
    titleLead: "Meet",
    titleOverview: "Choose your device",
    productDescription: [
      "An online pixel art and animation editor.",
      "Draw sprites with layers, frames and palettes. Open Aseprite projects and export GIF or PNG.",
      "Use your computer, iPad or phone. Your artwork stays on your device.",
    ],
    open: "Start editing",
    goToEditor: "Go to editor",
    home: showcaseLabel("en"),
    features: "Features",
    help: "User guide",
  },
  "zh-CN": {
    titleLead: "遇见",
    titleOverview: "选择你的设备",
    productDescription: [
      "在线像素画与动画编辑器。",
      "用图层、动画帧和调色板创作，打开 Aseprite 作品，导出 GIF 或 PNG。",
      "在电脑、iPad 和手机上使用，作品保存在自己的设备上。",
    ],
    open: "开始编辑",
    goToEditor: "进入编辑器",
    home: showcaseLabel("zh-CN"),
    features: "功能",
    help: "使用指南",
  },
  ja: {
    titleLead: "ドット絵なら",
    titleOverview: "どのデバイスでも",
    productDescription: [
      "オンラインのドット絵・アニメーションエディター。",
      "レイヤー、フレーム、パレットでスプライトを描けます。Aseprite プロジェクトを開いて GIF や PNG でエクスポート。",
      "パソコン、iPad、スマホで使えて、作品は自分の端末に保存されます。",
    ],
    open: "編集を始める",
    goToEditor: "エディターへ",
    home: showcaseLabel("ja"),
    features: "機能",
    help: "ユーザーガイド",
  },
  ko: {
    titleLead: "도트는",
    titleOverview: "어떤 기기에서든",
    productDescription: [
      "온라인 도트·픽셀 아트 애니메이션 에디터.",
      "레이어, 프레임, 팔레트로 스프라이트를 그리세요. Aseprite 프로젝트를 열고 GIF나 PNG로 내보낼 수 있습니다.",
      "컴퓨터, 아이패드, 휴대폰에서 쓸 수 있고 작품은 내 기기에 저장됩니다.",
    ],
    open: "편집 시작",
    goToEditor: "에디터로 이동",
    home: showcaseLabel("ko"),
    features: "기능",
    help: "사용 가이드",
  },
} as const;

export const deviceDemosLabel = (language: string) =>
  pickText(publicLanguage(language), "Device demos", "设备演示", "デバイスのデモ", "기기 데모");

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
} as const;

const CHINESE_TOOL_COPY = {
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

const LOCALIZED_TOOL_COPY = {
  "zh-CN": CHINESE_TOOL_COPY,
  ja: JAPANESE_TOOL_COPY,
  ko: KOREAN_TOOL_COPY,
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
            name: language === "zh-CN" ? "关于" : "About",
            item: canonical,
          },
        ],
      },
      application,
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
    createTitle: "Drawing and animation",
    createDescription: "Draw pixel art with layers and animate it frame by frame.",
    features: ["Drawing tools", "Layers & frames", "GIF & PNG export"],
    screenshot: "The Xprite editor with layers and an eight-frame pixel animation",
    screenshotCaption: "Layers and the animation timeline",
    browserLabel: "03 / MAKE IT YOURS",
    browserTitle: "Workspace layout",
    browserDescription:
      "Draw with a mouse, pen or touch. Move and resize panels to arrange your workspace.",
    fileTitle: "Open Aseprite files",
    fileDescription:
      "Keep working with .ase and .aseprite projects. Export a still frame or an animated GIF.",
    saveTitle: "Save projects",
    saveDescription:
      "Save projects in your browser or as files on your device. Install Xprite for offline editing after your first online visit.",
    layoutAlt: "Moving the Xprite timeline to the right, resizing it, and docking it at the bottom",
    layoutCaption: "Move, resize and dock panels.",
  },
  "zh-CN": {
    createLabel: "02 / 创作",
    createTitle: "绘画与动画",
    createDescription: "用图层组织画面，在时间轴上逐帧制作动画。",
    features: ["绘画工具", "图层与动画帧", "GIF 与 PNG 导出"],
    screenshot: "Xprite 编辑器中的图层与八帧像素动画",
    screenshotCaption: "图层与动画时间轴",
    browserLabel: "03 / 自在创作",
    browserTitle: "工作区布局",
    browserDescription: "使用鼠标、笔或触控绘画，移动和调整面板大小。",
    fileTitle: "打开 Aseprite 文件",
    fileDescription: "打开 .ase 和 .aseprite 作品，继续绘画与制作动画，导出单帧图片或 GIF。",
    saveTitle: "保存作品",
    saveDescription:
      "保存到当前浏览器，或另存为设备上的文件。首次联网准备好资源后，也可安装 Xprite 离线编辑。",
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
} as const;
