import type { UiStyleDefinition, UiMenuGlyph } from "$/base/theme/theme-types";
import { formatShortcutForPlatform } from "$/base/utils/format-shortcut";

type ShortcutGlyphs = NonNullable<
  NonNullable<UiStyleDefinition["controlParts"]>["menu"]
>["shortcutGlyphs"];

export function menuTextArtwork(
  text: string,
  glyphs: Readonly<Record<string, UiMenuGlyph>> | undefined,
  measure: (text: string) => number,
  scale: number,
) {
  const segments: { text?: string; glyph?: UiMenuGlyph; x: number }[] = [];
  const keys = Object.keys(glyphs ?? {})
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let width = 0;
  let plain = "";
  const flush = () => {
    if (!plain) return;
    segments.push({ text: plain, x: width });
    width += measure(plain);
    plain = "";
  };
  for (let index = 0; index < text.length;) {
    const key = keys.find((key) => text.startsWith(key, index));
    if (key) {
      flush();
      const glyph = glyphs![key];
      segments.push({ glyph, x: width });
      width += glyph.advance * scale;
      index += key.length;
    } else {
      const character = String.fromCodePoint(text.codePointAt(index)!);
      plain += character;
      index += character.length;
    }
  }
  flush();
  return { segments, width };
}

/** A theme can supply modifier artwork when its text font lacks keyboard symbols. */
export function menuShortcutArtwork(
  shortcut: string,
  glyphs: ShortcutGlyphs,
  measure: (text: string) => number,
  scale: number,
) {
  const segments: { text?: string; glyph?: NonNullable<ShortcutGlyphs>[string]; x: number }[] = [];
  let width = 0;
  const add = (value: string) => {
    const glyph = glyphs?.[value.toLowerCase()];
    segments.push({ ...(glyph ? { glyph } : { text: value }), x: width });
    width += glyph ? glyph.advance * scale : measure(value);
  };
  const parts = shortcut.split("+");
  if (glyphs && parts.slice(0, -1).every((part) => glyphs[part.trim().toLowerCase()])) {
    parts.forEach((part) => add(part.trim()));
  } else {
    add(formatShortcutForPlatform(shortcut));
  }
  return { segments, width };
}
