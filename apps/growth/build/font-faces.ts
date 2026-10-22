const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
const COMMENT = /\/\*[\s\S]*?\*\//g;

/** One @font-face rule with whitespace, quotes and the optional final semicolon removed. */
function normalizedFontFaces(css: string): string[] {
  return [...css.replace(COMMENT, "").matchAll(FONT_FACE)].map(([rule]) =>
    rule.replace(/\s+/g, "").replaceAll('"', "").replaceAll("'", "").replace(";}", "}"),
  );
}

/** The @font-face rules of `subset` that `stylesheet` does not declare identically. */
export function missingFontFaces(stylesheet: string, subset: string): string[] {
  const declared = new Set(normalizedFontFaces(stylesheet));
  return normalizedFontFaces(subset).filter((rule) => !declared.has(rule));
}
