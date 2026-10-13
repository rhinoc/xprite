import type { PixelBuffer } from "$/base";

const BEAD_GLYPH_WIDTH = 3;
export const BEAD_GLYPH_HEIGHT = 5;
export const BEAD_GLYPH_ADVANCE = 4;
const GLYPHS: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["111", "100", "101", "101", "111"],
  H: ["101", "101", "111", "101", "101"],
  M: ["101", "111", "111", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
  L: ["100", "100", "100", "100", "111"],
  N: ["101", "111", "111", "111", "101"],
  P: ["111", "101", "111", "100", "100"],
  T: ["111", "010", "010", "010", "010"],
  "-": ["000", "000", "111", "000", "000"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "111"],
  K: ["101", "110", "100", "110", "101"],
  O: ["111", "101", "101", "101", "111"],
  Q: ["111", "101", "101", "111", "001"],
  R: ["110", "101", "110", "101", "101"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  ":": ["000", "010", "000", "010", "000"],
  ".": ["000", "000", "000", "000", "010"],
  "/": ["001", "001", "010", "100", "100"],
  "|": ["010", "010", "010", "010", "010"],
  "?": ["110", "001", "010", "000", "010"],
};

const CHANNELS = 4;
export function beadTextWidth(value: string, scale: number): number {
  return Math.max(0, value.length * BEAD_GLYPH_ADVANCE - 1) * scale;
}

export function drawBeadText(
  target: PixelBuffer,
  value: string,
  x: number,
  y: number,
  scale: number,
  rgb: readonly number[],
): void {
  const label = value.toUpperCase();
  for (let letter = 0; letter < label.length; letter++) {
    if (label[letter] === " ") continue;
    const glyph = GLYPHS[label[letter]] ?? GLYPHS["?"];
    for (let gy = 0; gy < BEAD_GLYPH_HEIGHT; gy++)
      for (let gx = 0; gx < BEAD_GLYPH_WIDTH; gx++)
        if (glyph[gy][gx] === "1")
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) {
              const px = x + letter * BEAD_GLYPH_ADVANCE * scale + gx * scale + sx;
              const py = y + gy * scale + sy;
              if (px < 0 || py < 0 || px >= target.width || py >= target.height) continue;
              const offset = (py * target.width + px) * CHANNELS;
              target.data[offset] = rgb[0];
              target.data[offset + 1] = rgb[1];
              target.data[offset + 2] = rgb[2];
            }
  }
}
