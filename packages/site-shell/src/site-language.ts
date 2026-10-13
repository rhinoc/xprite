import type { PatternDefinition } from "@xprite/ui";

/** Languages the site chrome is written in; other values fall back to English. */
export type SiteLanguageCode = "en" | "zh-CN" | "ja" | "ko" | "ru" | "pt-BR" | "es";

export const SITE_LANGUAGES: readonly SiteLanguageCode[] = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "ru",
  "pt-BR",
  "es",
];

export const SITE_LANGUAGE_LABELS: Readonly<Record<SiteLanguageCode, string>> = {
  en: "English",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  "pt-BR": "Português (Brasil)",
  es: "Español",
};

/** Resolve any BCP 47 tag to a site language by its base subtag. */
export function siteLanguage(value: string | null | undefined): SiteLanguageCode | undefined {
  const base = String(value ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];
  if (base === "zh") return "zh-CN";
  if (base === "pt") return "pt-BR";
  if (base === "en" || base === "ja" || base === "ko" || base === "ru" || base === "es")
    return base;
  return undefined;
}

/** Copy in en, zh-CN, ja, ko, ru, pt-BR and es order for the selected language. */
export function siteText(
  language: string,
  en: string,
  zh: string,
  ja: string,
  ko: string,
  ru: string,
  pt: string,
  es: string,
) {
  const selected = siteLanguage(language) ?? "en";
  return { en, "zh-CN": zh, ja, ko, ru, "pt-BR": pt, es }[selected];
}

const PATTERN_LABELS: Readonly<
  Record<string, readonly [ja: string, ko: string, ru: string, pt: string, es: string]>
> = {
  Solid: ["単色", "단색", "Сплошной", "Sólido", "Sólido"],
  "Sparse light dots": [
    "まばらな明るい点",
    "드문 밝은 점",
    "Редкие светлые точки",
    "Pontos claros esparsos",
    "Puntos claros dispersos",
  ],
  "Dotted grid": [
    "点線グリッド",
    "점선 격자",
    "Пунктирная сетка",
    "Grade pontilhada",
    "Cuadrícula punteada",
  ],
  "Checker gray": [
    "市松模様のグレー",
    "체크무늬 회색",
    "Серая шахматка",
    "Xadrez cinza",
    "Damero gris",
  ],
  "Fine grid": ["細かいグリッド", "촘촘한 격자", "Мелкая сетка", "Grade fina", "Cuadrícula fina"],
  "Vertical stripes": [
    "縦じま",
    "세로 줄무늬",
    "Вертикальные полосы",
    "Listras verticais",
    "Rayas verticales",
  ],
  "Diagonal stripes": [
    "斜めじま",
    "사선 줄무늬",
    "Диагональные полосы",
    "Listras diagonais",
    "Rayas diagonales",
  ],
  "Wide vertical stripes": [
    "太い縦じま",
    "넓은 세로 줄무늬",
    "Широкие вертикальные полосы",
    "Listras verticais largas",
    "Rayas verticales anchas",
  ],
  "Scattered dots": [
    "散らばった点",
    "흩어진 점",
    "Разбросанные точки",
    "Pontos espalhados",
    "Puntos dispersos",
  ],
  "Square grid": [
    "方眼",
    "정사각 격자",
    "Квадратная сетка",
    "Grade quadrada",
    "Cuadrícula cuadrada",
  ],
  Brickwork: ["レンガ積み", "벽돌 쌓기", "Кирпичная кладка", "Tijolos", "Ladrillos"],
  "Single dots": ["単独の点", "단일 점", "Одиночные точки", "Pontos isolados", "Puntos sueltos"],
  "Broken diagonals": [
    "途切れた斜線",
    "끊어진 사선",
    "Прерывистые диагонали",
    "Diagonais interrompidas",
    "Diagonales discontinuas",
  ],
  "Offset dots": [
    "互い違いの点",
    "엇갈린 점",
    "Точки в шахматном порядке",
    "Pontos alternados",
    "Puntos alternos",
  ],
  "Horizontal stripes": [
    "横じま",
    "가로 줄무늬",
    "Горизонтальные полосы",
    "Listras horizontais",
    "Rayas horizontales",
  ],
  "Wide horizontal stripes": [
    "太い横じま",
    "넓은 가로 줄무늬",
    "Широкие горизонтальные полосы",
    "Listras horizontais largas",
    "Rayas horizontales anchas",
  ],
  "Fine diagonals": [
    "細い斜線",
    "가는 사선",
    "Тонкие диагонали",
    "Diagonais finas",
    "Diagonales finas",
  ],
  "Large grid": ["大きなグリッド", "큰 격자", "Крупная сетка", "Grade grande", "Cuadrícula grande"],
  "Basket weave": ["網代", "바구니 짜임", "Плетёнка", "Trama de cesto", "Tejido de cesta"],
  "Dotted diamonds": [
    "点のひし形",
    "점 마름모",
    "Пунктирные ромбы",
    "Losangos pontilhados",
    "Rombos punteados",
  ],
  "Blue texture": ["青いテクスチャ", "파란 질감", "Синяя текстура", "Textura azul", "Textura azul"],
  Stars: ["星", "별", "Звёзды", "Estrelas", "Estrellas"],
  "Smiley faces": ["スマイル", "스마일", "Смайлики", "Carinhas sorridentes", "Caritas sonrientes"],
  "Geometric confetti": [
    "幾何学の紙吹雪",
    "기하학 색종이",
    "Геометрическое конфетти",
    "Confete geométrico",
    "Confeti geométrico",
  ],
  Cats: ["ネコ", "고양이", "Котики", "Gatos", "Gatos"],
  "Raised squares": [
    "浮き出た四角",
    "돌출된 사각형",
    "Выпуклые квадраты",
    "Quadrados em relevo",
    "Cuadrados en relieve",
  ],
  Circuits: ["回路", "회로", "Схемы", "Circuitos", "Circuitos"],
  "Embossed Mac OS Logo": [
    "浮き彫りの Mac OS ロゴ",
    "양각 Mac OS 로고",
    "Тиснёный логотип Mac OS",
    "Logo do Mac OS em relevo",
    "Logo de Mac OS en relieve",
  ],
  "Copland Blue": [
    "Copland ブルー",
    "Copland 블루",
    "Синий Copland",
    "Azul Copland",
    "Azul Copland",
  ],
  Fibers: ["繊維", "섬유", "Волокна", "Fibras", "Fibras"],
  "Neon Clouds": ["ネオンの雲", "네온 구름", "Неоновые облака", "Nuvens neon", "Nubes de neón"],
  "Blue Cord": [
    "青いコード織り",
    "파란 코드 직물",
    "Синий вельвет",
    "Veludo cotelê azul",
    "Pana azul",
  ],
  Granite: ["花崗岩", "화강암", "Гранит", "Granito", "Granito"],
  "Bumpy Blue": [
    "でこぼこの青",
    "울퉁불퉁한 파랑",
    "Синий рельеф",
    "Azul texturizado",
    "Azul rugoso",
  ],
  "Raised Lavender": [
    "浮き出たラベンダー",
    "돌출된 라벤더",
    "Рельефная лаванда",
    "Lavanda em relevo",
    "Lavanda en relieve",
  ],
  "Terra Cotta": ["テラコッタ", "테라코타", "Терракота", "Terracota", "Terracota"],
  "The Rocks": ["岩", "바위", "Камни", "Pedras", "Rocas"],
  Tulips: ["チューリップ", "튤립", "Тюльпаны", "Tulipas", "Tulipanes"],
  Sidewalk: ["歩道", "보도", "Тротуар", "Calçada", "Acera"],
  "Rubber Bands": ["輪ゴム", "고무줄", "Резинки", "Elásticos", "Ligas"],
  Grass: ["芝生", "잔디", "Трава", "Grama", "Césped"],
  Bark: ["樹皮", "나무껍질", "Кора", "Casca de árvore", "Corteza"],
  Denim: ["デニム", "데님", "Деним", "Jeans", "Mezclilla"],
  Bricks: ["レンガ", "벽돌", "Кирпичи", "Tijolos", "Ladrillos"],
  Notes: ["音符", "음표", "Ноты", "Notas musicais", "Notas musicales"],
  "Stained Glass Window": ["ステンドグラス", "스테인드글라스", "Витраж", "Vitral", "Vitral"],
  "Teddy Bears": [
    "テディベア",
    "테디 베어",
    "Плюшевые мишки",
    "Ursinhos de pelúcia",
    "Ositos de peluche",
  ],
  "PowerBook Traditional": [
    "クラシック PowerBook",
    "클래식 PowerBook",
    "PowerBook классический",
    "PowerBook clássico",
    "PowerBook clásico",
  ],
};

/** Desktop pattern names in the site language; numbered and accent names keep their source form. */
export function sitePatternLabel(pattern: PatternDefinition, language: string): string {
  const selected = siteLanguage(language) ?? "en";
  if (selected === "en") return pattern.label;
  if (selected === "zh-CN") return pattern.labelZh;
  const index = ({ ja: 0, ko: 1, ru: 2, "pt-BR": 3, es: 4 } as const)[selected];
  const named = PATTERN_LABELS[pattern.label]?.[index];
  if (named) return named;
  const numbered = /^Pattern (\d+)$/.exec(pattern.label);
  if (numbered) {
    const word = { ja: "パターン", ko: "패턴", ru: "Узор", "pt-BR": "Padrão", es: "Patrón" }[
      selected
    ];
    return `${word} ${numbered[1]}`;
  }
  return pattern.label;
}
