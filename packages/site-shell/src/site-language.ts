import type { PatternDefinition } from "@xprite/ui";

/** Languages the site chrome is written in; other values fall back to English. */
export type SiteLanguageCode = "en" | "zh-CN" | "ja" | "ko";

export const SITE_LANGUAGES: readonly SiteLanguageCode[] = ["en", "zh-CN", "ja", "ko"];

export const SITE_LANGUAGE_LABELS: Readonly<Record<SiteLanguageCode, string>> = {
  en: "English",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
};

/** Resolve any BCP 47 tag to a site language by its base subtag. */
export function siteLanguage(value: string | null | undefined): SiteLanguageCode | undefined {
  const base = String(value ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];
  if (base === "zh") return "zh-CN";
  if (base === "en" || base === "ja" || base === "ko") return base;
  return undefined;
}

/** Copy in en, zh-CN, ja and ko order for the selected language. */
export function siteText(language: string, en: string, zh: string, ja: string, ko: string) {
  const selected = siteLanguage(language) ?? "en";
  return { en, "zh-CN": zh, ja, ko }[selected];
}

const PATTERN_LABELS: Readonly<Record<string, readonly [ja: string, ko: string]>> = {
  Solid: ["単色", "단색"],
  "Sparse light dots": ["まばらな明るい点", "드문 밝은 점"],
  "Dotted grid": ["点線グリッド", "점선 격자"],
  "Checker gray": ["市松模様のグレー", "체크무늬 회색"],
  "Fine grid": ["細かいグリッド", "촘촘한 격자"],
  "Vertical stripes": ["縦じま", "세로 줄무늬"],
  "Diagonal stripes": ["斜めじま", "사선 줄무늬"],
  "Wide vertical stripes": ["太い縦じま", "넓은 세로 줄무늬"],
  "Scattered dots": ["散らばった点", "흩어진 점"],
  "Square grid": ["方眼", "정사각 격자"],
  Brickwork: ["レンガ積み", "벽돌 쌓기"],
  "Single dots": ["単独の点", "단일 점"],
  "Broken diagonals": ["途切れた斜線", "끊어진 사선"],
  "Offset dots": ["互い違いの点", "엇갈린 점"],
  "Horizontal stripes": ["横じま", "가로 줄무늬"],
  "Wide horizontal stripes": ["太い横じま", "넓은 가로 줄무늬"],
  "Fine diagonals": ["細い斜線", "가는 사선"],
  "Large grid": ["大きなグリッド", "큰 격자"],
  "Basket weave": ["網代", "바구니 짜임"],
  "Dotted diamonds": ["点のひし形", "점 마름모"],
  "Blue texture": ["青いテクスチャ", "파란 질감"],
  Stars: ["星", "별"],
  "Smiley faces": ["スマイル", "스마일"],
  "Geometric confetti": ["幾何学の紙吹雪", "기하학 색종이"],
  Cats: ["ネコ", "고양이"],
  "Raised squares": ["浮き出た四角", "돌출된 사각형"],
  Circuits: ["回路", "회로"],
  "Embossed Mac OS Logo": ["浮き彫りの Mac OS ロゴ", "양각 Mac OS 로고"],
  "Copland Blue": ["Copland ブルー", "Copland 블루"],
  Fibers: ["繊維", "섬유"],
  "Neon Clouds": ["ネオンの雲", "네온 구름"],
  "Blue Cord": ["青いコード織り", "파란 코드 직물"],
  Granite: ["花崗岩", "화강암"],
  "Bumpy Blue": ["でこぼこの青", "울퉁불퉁한 파랑"],
  "Raised Lavender": ["浮き出たラベンダー", "돌출된 라벤더"],
  "Terra Cotta": ["テラコッタ", "테라코타"],
  "The Rocks": ["岩", "바위"],
  Tulips: ["チューリップ", "튤립"],
  Sidewalk: ["歩道", "보도"],
  "Rubber Bands": ["輪ゴム", "고무줄"],
  Grass: ["芝生", "잔디"],
  Bark: ["樹皮", "나무껍질"],
  Denim: ["デニム", "데님"],
  Bricks: ["レンガ", "벽돌"],
  Notes: ["音符", "음표"],
  "Stained Glass Window": ["ステンドグラス", "스테인드글라스"],
  "Teddy Bears": ["テディベア", "테디 베어"],
  "PowerBook Traditional": ["クラシック PowerBook", "클래식 PowerBook"],
};

/** Desktop pattern names in the site language; numbered and accent names keep their source form. */
export function sitePatternLabel(pattern: PatternDefinition, language: string): string {
  const selected = siteLanguage(language) ?? "en";
  if (selected === "en") return pattern.label;
  if (selected === "zh-CN") return pattern.labelZh;
  const index = selected === "ja" ? 0 : 1;
  const named = PATTERN_LABELS[pattern.label]?.[index];
  if (named) return named;
  const numbered = /^Pattern (\d+)$/.exec(pattern.label);
  if (numbered) return `${selected === "ja" ? "パターン" : "패턴"} ${numbered[1]}`;
  return pattern.label;
}
