import { FEATURE_DETAILS, FEATURE_DETAIL_PATH, FEATURES_PATH } from "../features/index.ts";
import { localizedSiteHref, PUBLIC_LANGUAGES, PublicLanguage } from "./language.ts";

/** A page whose body is one Markdown file per written language. */
export interface SiteDocumentDefinition {
  /** Unprefixed path; each language's URL comes from `localizedSiteHref`. */
  path: string;
  /** Markdown source relative to the repository root. Only written languages are published. */
  sources: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** Matches each source's `# ` heading. */
  title: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** A concise label for menus and the footer when the page title needs more context. */
  navigationTitle?: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** The document `<title>` for search results; the visible heading stays `title`. */
  searchTitle?: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** The meta description; defaults to the visible introduction paragraph. */
  searchDescription?: Partial<Readonly<Record<PublicLanguage, string>>>;
}

const ABOUT_CONTENT = "apps/growth/content/about";

export const SITE_DOCUMENTS: readonly SiteDocumentDefinition[] = [
  ...FEATURE_DETAILS.map((feature) => ({
    path: `${FEATURE_DETAIL_PATH}${feature.slug}/`,
    sources: {
      en: `apps/growth/content/features/details/${feature.slug}.en.md`,
      "zh-CN": `apps/growth/content/features/details/${feature.slug}.zh-CN.md`,
      ja: `apps/growth/content/features/details/${feature.slug}.ja.md`,
      ko: `apps/growth/content/features/details/${feature.slug}.ko.md`,
      ru: `apps/growth/content/features/details/${feature.slug}.ru.md`,
      "pt-BR": `apps/growth/content/features/details/${feature.slug}.pt-BR.md`,
      es: `apps/growth/content/features/details/${feature.slug}.es.md`,
    },
    title: feature.title,
    searchTitle: feature.searchTitle,
    searchDescription: "searchDescription" in feature ? feature.searchDescription : undefined,
  })),
  {
    path: "/privacy/",
    sources: {
      en: "PRIVACY.md",
      "zh-CN": "PRIVACY.zh.md",
      ja: "PRIVACY.ja.md",
      ko: "PRIVACY.ko.md",
      ru: "PRIVACY.ru.md",
      "pt-BR": "PRIVACY.pt-BR.md",
      es: "PRIVACY.es.md",
    },
    title: {
      en: "Privacy Notice",
      "zh-CN": "隐私说明",
      ja: "プライバシーについて",
      ko: "개인정보 안내",
      ru: "Конфиденциальность",
      "pt-BR": "Aviso de privacidade",
      es: "Aviso de privacidad",
    },
    navigationTitle: {
      en: "Privacy",
      "zh-CN": "隐私",
      ja: "プライバシー",
      ko: "개인정보",
      ru: "Конфиденциальность",
      "pt-BR": "Privacidade",
      es: "Privacidad",
    },
    searchDescription: {
      en: "What data the Xprite editor, website and tools use. No account is required. Sites that host Xprite, such as itch.io, may have their own privacy practices.",
      ja: "Xprite のエディター、サイト、ツールが使うデータについて。アカウントは不要です。itch.io など Xprite を掲載するサイトには独自の方針がある場合があります。",
      ko: "Xprite 에디터, 웹사이트, 도구가 사용하는 데이터를 안내합니다. 계정은 필요 없습니다. itch.io처럼 Xprite를 호스팅하는 사이트에는 자체 방침이 있을 수 있습니다.",
      ru: "Какие данные используют редактор, сайт и инструменты Xprite. Аккаунт не нужен. У сайтов, где размещён Xprite, например itch.io, могут быть свои правила.",
      "pt-BR":
        "Quais dados o editor, o site e as ferramentas do Xprite usam. Não é preciso criar conta. Sites que hospedam o Xprite, como o itch.io, podem ter regras próprias.",
      es: "Qué datos usan el editor, el sitio y las herramientas de Xprite. No hace falta cuenta. Los sitios que alojan Xprite, como itch.io, pueden tener sus normas.",
    },
  },
  {
    path: "/about/how-it-works/",
    sources: {
      en: `${ABOUT_CONTENT}/how-it-works.en.md`,
      "zh-CN": `${ABOUT_CONTENT}/how-it-works.zh-CN.md`,
      ja: `${ABOUT_CONTENT}/how-it-works.ja.md`,
      ko: `${ABOUT_CONTENT}/how-it-works.ko.md`,
      ru: `${ABOUT_CONTENT}/how-it-works.ru.md`,
      "pt-BR": `${ABOUT_CONTENT}/how-it-works.pt-BR.md`,
      es: `${ABOUT_CONTENT}/how-it-works.es.md`,
    },
    title: {
      en: "How Xprite Works",
      "zh-CN": "工作原理",
      ja: "Xprite のしくみ",
      ko: "Xprite 작동 방식",
      ru: "Как устроен Xprite",
      "pt-BR": "Como o Xprite funciona",
      es: "Cómo funciona Xprite",
    },
    navigationTitle: {
      en: "How it works",
      ru: "Как это работает",
      "pt-BR": "Como funciona",
      es: "Cómo funciona",
    },
    searchDescription: {
      en: "How Xprite brings the Aseprite editor into the browser: reading and writing .aseprite, crisp Canvas pixels, local storage, offline startup and touch input.",
      "zh-CN":
        "Xprite 怎样把 Aseprite 的编辑器搬进浏览器：读写 .aseprite、用 Canvas 画出不糊的像素、作品存在本地、断网时打开，以及适配触控和手写笔。",
      ja: "Xprite が Aseprite のエディターをブラウザで動かすしくみ：.aseprite の読み書き、Canvas でくっきり描くピクセル、端末内の保存、オフライン起動、タッチとペン操作。",
      ko: "Xprite가 Aseprite 에디터를 브라우저로 옮긴 방법: .aseprite 읽기·쓰기, Canvas로 선명하게 그리는 픽셀, 로컬 저장, 오프라인 시작, 터치와 펜 입력.",
      ru: "Как Xprite переносит редактор Aseprite в браузер: чтение и запись .aseprite, чёткие пиксели на Canvas, локальное хранение, запуск офлайн и сенсорный ввод.",
      "pt-BR":
        "Como o Xprite leva o editor do Aseprite ao navegador: leitura e gravação de .aseprite, pixels nítidos no Canvas, armazenamento local, uso offline e toque.",
      es: "Cómo Xprite lleva el editor de Aseprite al navegador: lectura y escritura de .aseprite, píxeles nítidos en Canvas, guardado local, inicio sin conexión y tacto.",
    },
  },
  {
    path: FEATURES_PATH,
    sources: {
      en: `${ABOUT_CONTENT}/features.en.md`,
      "zh-CN": `${ABOUT_CONTENT}/features.zh-CN.md`,
      ja: `${ABOUT_CONTENT}/features.ja.md`,
      ko: `${ABOUT_CONTENT}/features.ko.md`,
      ru: `${ABOUT_CONTENT}/features.ru.md`,
      "pt-BR": `${ABOUT_CONTENT}/features.pt-BR.md`,
      es: `${ABOUT_CONTENT}/features.es.md`,
    },
    title: {
      en: "Features",
      "zh-CN": "功能",
      ja: "機能",
      ko: "기능",
      ru: "Возможности",
      "pt-BR": "Recursos",
      es: "Funciones",
    },
    searchTitle: {
      en: "Pixel Art Editor Features: Draw, Animate, Export | Xprite",
      "zh-CN": "像素画编辑器功能：绘画、动画与导出 | Xprite",
      ja: "ドット絵エディターの機能：描画・アニメ・書き出し | Xprite",
      ko: "도트 에디터 기능: 그리기, 애니메이션, 내보내기 | Xprite",
      ru: "Возможности пиксель арт редактора и анимации | Xprite",
      "pt-BR": "Recursos do editor de pixel art: desenho e animação | Xprite",
      es: "Funciones del editor de pixel art y animación | Xprite",
    },
  },
];

/** Written languages of a document with their public paths. */
export function documentTranslations(document: SiteDocumentDefinition) {
  return PUBLIC_LANGUAGES.filter((language) => document.sources[language]).map((language) => ({
    language,
    path: localizedSiteHref(document.path, language),
  }));
}

/** Navigation entries for the documents written in one language. */
export function documentLinks(language: PublicLanguage, parent: string) {
  return SITE_DOCUMENTS.filter(
    (document) => document.sources[language] && document.path.startsWith(parent),
  ).map((document) => ({
    label: document.navigationTitle?.[language] ?? document.title[language]!,
    href: localizedSiteHref(document.path, language),
  }));
}
