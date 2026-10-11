import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { MAX_PALETTE_COLORS, MIN_PALETTE_COLORS } from "$/color/palette-resize";

export const EDITOR_DEFAULT_PALETTE_KEY = "xse.palette.default.v2";
export const EDITOR_PALETTE_PRESETS_KEY = "xse.palette.presets.v1";
export interface PalettePreset {
  name: string;
  colors: Rgba[];
}

export function copyStoredPalette(value: unknown): Rgba[] | null {
  if (
    !Array.isArray(value) ||
    value.length < MIN_PALETTE_COLORS ||
    value.length > MAX_PALETTE_COLORS
  )
    return null;
  const result: Rgba[] = [];
  for (const color of value) {
    if (
      !Array.isArray(color) ||
      color.length !== 4 ||
      color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > UINT8_MAX)
    )
      return null;
    result.push([color[0], color[1], color[2], color[3]]);
  }
  return result;
}

/** Match Aseprite's base::compare_filenames for preset resource names. */
export function comparePaletteResourceNames(a: string, b: string): number {
  let ai = 0,
    bi = 0;
  while (ai < a.length && bi < b.length) {
    const ac = a.charCodeAt(ai),
      bc = b.charCodeAt(bi);
    const aDigit = ac >= 48 && ac <= 57,
      bDigit = bc >= 48 && bc <= 57;
    if (aDigit && bDigit) {
      let an = 0,
        bn = 0;
      while (ai < a.length) {
        const digit = a.charCodeAt(ai) - 48;
        if (digit < 0 || digit > 9) break;
        an = an * 10 + digit;
        ai++;
      }
      while (bi < b.length) {
        const digit = b.charCodeAt(bi) - 48;
        if (digit < 0 || digit > 9) break;
        bn = bn * 10 + digit;
        bi++;
      }
      if (an !== bn) return an < bn ? -1 : 1;
      continue;
    }
    const lowerA = ac >= 65 && ac <= 90 ? ac + 32 : ac;
    const lowerB = bc >= 65 && bc <= 90 ? bc + 32 : bc;
    if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
    ai++;
    bi++;
  }
  if (ai === a.length && bi === b.length) return 0;
  return ai === a.length ? -1 : 1;
}

function byte(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > UINT8_MAX)
    throw new Error(`Palette entries must contain bytes from 0 to ${UINT8_MAX}.`);
  return n;
}

/** Parse the GIMP Palette `Channels: RGBA` extension when present. */
export function parsePaletteText(source: string): Rgba[] {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
  if (lines[0] === "GIMP Palette") {
    const rgba = lines.some((line) => /^Channels:\s*RGBA$/i.test(line));
    const colors: Rgba[] = [];
    for (const line of lines.slice(1)) {
      if (!line || line.startsWith("#") || /^[A-Za-z][A-Za-z ]*:/.test(line)) continue;
      const values = line.split(/\s+/);
      if (values.length < (rgba ? 4 : 3)) throw new Error("Invalid GIMP palette entry.");
      colors.push([
        byte(values[0]),
        byte(values[1]),
        byte(values[2]),
        rgba ? byte(values[3]) : UINT8_MAX,
      ]);
    }
    if (colors.length < MIN_PALETTE_COLORS || colors.length > MAX_PALETTE_COLORS)
      throw new Error(
        `Palette size must be between ${MIN_PALETTE_COLORS} and ${MAX_PALETTE_COLORS}.`,
      );
    return colors;
  }
  if (lines[0] === "JASC-PAL" && lines[1] === "0100") {
    const count = Number(lines[2]);
    if (!Number.isInteger(count) || count < MIN_PALETTE_COLORS || count > MAX_PALETTE_COLORS)
      throw new Error(
        `Palette size must be between ${MIN_PALETTE_COLORS} and ${MAX_PALETTE_COLORS}.`,
      );
    const colors = lines.slice(3, 3 + count).map((line) => {
      const values = line.split(/\s+/);
      if (values.length < 3) throw new Error("Invalid JASC palette entry.");
      return [byte(values[0]), byte(values[1]), byte(values[2]), UINT8_MAX] as Rgba;
    });
    if (colors.length !== count) throw new Error("Palette file ended before all colors were read.");
    return colors;
  }
  throw new Error("Choose a GIMP (.gpl) or JASC (.pal) palette file.");
}

export function readStoredPalette(source: string | null): Rgba[] | null {
  try {
    return copyStoredPalette(JSON.parse(source ?? "null"));
  } catch {
    return null;
  }
}
export function readStoredPalettePresets(source: string | null): PalettePreset[] {
  let saved: unknown;
  try {
    saved = JSON.parse(source ?? "null");
  } catch {
    return [];
  }
  if (!Array.isArray(saved)) return [];
  return saved
    .flatMap((entry): PalettePreset[] => {
      if (!entry || typeof entry !== "object") return [];
      const name = (entry as { name?: unknown }).name;
      const colors = copyStoredPalette((entry as { colors?: unknown }).colors);
      return typeof name === "string" && name.trim() && colors ? [{ name, colors }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
