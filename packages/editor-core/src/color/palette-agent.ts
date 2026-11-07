import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { rgbaToHsla, hslaToRgba } from "$/color/color";
import { assertPaletteAllocation } from "$/color/palette-resize";
import type { EditorDocument } from "$/document/types";
import { renderTimelineFrame } from "$/timeline/timeline";

const RGBA_CHANNELS = 4;
/** Agent-facing palettes cap at the GIF/indexed range, not the allocation budget. */
export const AGENT_PALETTE_LIMIT = 256;

export function assertAgentPaletteSize(size: number): void {
  if (!Number.isInteger(size) || size < 1 || size > AGENT_PALETTE_LIMIT)
    throw new RangeError(`Palette size must be between 1 and ${AGENT_PALETTE_LIMIT} colors.`);
  assertPaletteAllocation(size);
}

/** Where shading pulls a hue: shadows toward blue, highlights toward yellow. */
const RAMP_SHADOW_HUE = 240;
const RAMP_LIGHT_HUE = 60;
const RAMP_HUE_DEGREES = 25;

/** Rotate `hue` toward `target` along the shorter arc, by at most `degrees`. */
function rotateHueToward(hue: number, target: number, degrees: number): number {
  const delta = ((((target - hue) % 360) + 540) % 360) - 180;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), degrees);
  return (((hue + step) % 360) + 360) % 360;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Shade by hue rotation, not a brightness slider: shadows toward blue and
 * desaturated, highlights toward yellow and saturated. */
function hueShiftShade(color: Rgba, amount: number): Rgba {
  const [hue, saturation, lightness, alpha] = rgbaToHsla(color);
  const reach = Math.abs(amount);
  return hslaToRgba([
    rotateHueToward(hue, amount < 0 ? RAMP_SHADOW_HUE : RAMP_LIGHT_HUE, RAMP_HUE_DEGREES * reach),
    clamp01(saturation + (amount > 0 ? 0.06 : -0.04) * reach * 2),
    clamp01(lightness + amount * 0.5),
    alpha,
  ]);
}

/** Hue-shifted ramp of `steps` colors around `base`, which sits at the midpoint. */
export function buildPaletteRamp(base: Rgba, steps: number, spread: number): Rgba[] {
  if (!Number.isInteger(steps) || steps < 2 || steps > 16)
    throw new RangeError("A ramp needs 2 to 16 steps.");
  if (typeof spread !== "number" || spread < 0.1 || spread > 1)
    throw new RangeError("Ramp spread must be between 0.1 and 1.");
  return Array.from({ length: steps }, (_, index) =>
    hueShiftShade(base, (index / (steps - 1)) * 2 * spread - spread),
  );
}

/** Composite pixels for the frame, honoring the active-layer pending pixels. */
export function compositeDocumentFrame(document: EditorDocument, frameIndex: number): PixelBuffer {
  const timeline = document.timeline;
  if (timeline) return renderTimelineFrame(timeline, document.width, document.height, frameIndex);
  return document.layer.pixels;
}

export interface PaletteColorUsage {
  index: number;
  hex: string;
  pixels: number;
}

const toHex = (color: readonly number[]) =>
  `#${color
    .slice(0, color[3] === undefined || color[3] === UINT8_MAX ? 3 : 4)
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();

export function paletteColorHex(color: readonly number[]): string {
  return toHex(color);
}

/**
 * Per-entry pixel counts across visible cels of every frame. A composite pixel
 * counts only toward an entry it matches exactly, so near-misses report as
 * off-palette rather than inflating the nearest entry.
 */
export function paletteUsageAcrossFrames(
  document: EditorDocument,
  palette: readonly Rgba[],
): PaletteColorUsage[] {
  const usage = palette.map((color, index) => ({ index, hex: toHex(color), pixels: 0 }));
  const exact = new Map<string, number>();
  palette.forEach((color, index) => {
    const key = color.join(",");
    if (!exact.has(key)) exact.set(key, index);
  });
  const frames = document.timeline?.frames.length ?? 1;
  for (let frame = 0; frame < frames; frame++) {
    const pixels = compositeDocumentFrame(document, frame);
    const data = pixels.data;
    for (let at = 0; at < data.length; at += RGBA_CHANNELS) {
      if (!data[at + 3]) continue;
      const index = exact.get(`${data[at]},${data[at + 1]},${data[at + 2]},${data[at + 3]}`);
      if (index !== undefined) usage[index].pixels++;
    }
  }
  return usage;
}

export interface PaletteAnalysis {
  size: number;
  unusedIndices: number[];
  nearDuplicates: { a: string; b: string; deltaE: number }[];
  offPaletteColors: { hex: string; pixels: number }[];
  lowestContrastPair: { a: string; b: string; ratio: number } | null;
  verdict: string;
}

const DELTA_E_NEAR_DUPLICATE = 3;
const LARGE_PALETTE_SIZE = 64;
const CONTRAST_SAMPLE_LIMIT = 32;
const OFF_PALETTE_LIMIT = 64;

function srgbToLinear(channel: number): number {
  const value = channel / UINT8_MAX;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

interface Lab {
  l: number;
  a: number;
  b: number;
}
const LAB_WHITE_X = 0.95047;
const LAB_WHITE_Z = 1.08883;

function rgbToLab([r, g, b]: readonly number[]): Lab {
  const x =
    (0.4124564 * srgbToLinear(r) + 0.3575761 * srgbToLinear(g) + 0.1804375 * srgbToLinear(b)) /
    LAB_WHITE_X;
  const y = 0.2126729 * srgbToLinear(r) + 0.7151522 * srgbToLinear(g) + 0.072175 * srgbToLinear(b);
  const z =
    (0.0193339 * srgbToLinear(r) + 0.119192 * srgbToLinear(g) + 0.9503041 * srgbToLinear(b)) /
    LAB_WHITE_Z;
  const pivot = 216 / 24389;
  const f = (t: number) => (t > pivot ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116);
  const fx = f(x),
    fy = f(y),
    fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deltaE = (a: Lab, b: Lab) => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);

export interface PaletteSnapRegion {
  layerId: string;
  frameIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  rgba: number[];
}

/**
 * Repaint every image cel's non-palette pixels to the nearest palette color in
 * CIELAB, preserving alpha and transparent pixels. Returns one cell-sized RGBA
 * patch per changed cel; the caller replays them as `pixels` ops so the snap is
 * a single undoable batch. Indexed/grayscale cels without RGBA pixels are
 * skipped — they already resolve through the palette.
 */
export function snapDocumentToPalette(
  document: EditorDocument,
  palette: readonly Rgba[],
): PaletteSnapRegion[] {
  const timeline = document.timeline;
  if (!timeline || !palette.length) return [];
  const onPalette = new Set(palette.map((color) => color.join(",")));
  const labs = palette.map((color) => rgbToLab(color));
  const regions: PaletteSnapRegion[] = [];
  for (let frameIndex = 0; frameIndex < timeline.frames.length; frameIndex++) {
    const frame = timeline.frames[frameIndex];
    for (let layerIndex = 0; layerIndex < frame.cels.length; layerIndex++) {
      const cel = frame.cels[layerIndex];
      if (!cel?.pixels) continue;
      const data = cel.pixels.data;
      const next = new Uint8ClampedArray(data);
      let changed = false;
      for (let at = 0; at < data.length; at += RGBA_CHANNELS) {
        const alpha = data[at + 3];
        if (!alpha) continue;
        const key = `${data[at]},${data[at + 1]},${data[at + 2]},${alpha}`;
        if (onPalette.has(key)) continue;
        const lab = rgbToLab([data[at], data[at + 1], data[at + 2]]);
        let nearest = 0,
          distance = Infinity;
        for (let index = 0; index < labs.length; index++) {
          const delta = deltaE(lab, labs[index]);
          if (delta < distance) {
            distance = delta;
            nearest = index;
          }
        }
        const color = palette[nearest];
        next[at] = color[0];
        next[at + 1] = color[1];
        next[at + 2] = color[2];
        next[at + 3] = Math.round((alpha / UINT8_MAX) * color[3]);
        changed = true;
      }
      if (!changed) continue;
      const left = Math.max(0, cel.x),
        top = Math.max(0, cel.y),
        right = Math.min(document.width, cel.x + cel.pixels.width),
        bottom = Math.min(document.height, cel.y + cel.pixels.height);
      if (right <= left || bottom <= top) continue;
      const clippedWidth = right - left,
        clippedHeight = bottom - top;
      const clipped: number[] = [];
      for (let row = top - cel.y; row < bottom - cel.y; row++)
        for (let column = left - cel.x; column < right - cel.x; column++) {
          const at = (row * cel.pixels.width + column) * RGBA_CHANNELS;
          clipped.push(next[at], next[at + 1], next[at + 2], next[at + 3]);
        }
      regions.push({
        layerId: timeline.layers[layerIndex].id,
        frameIndex,
        rect: {
          x: left,
          y: top,
          width: clippedWidth,
          height: clippedHeight,
        },
        rgba: clipped,
      });
    }
  }
  return regions;
}

const luminance = (color: readonly number[]) =>
  0.2126 * srgbToLinear(color[0]) +
  0.7152 * srgbToLinear(color[1]) +
  0.0722 * srgbToLinear(color[2]);

function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const la = luminance(a),
    lb = luminance(b);
  const [high, low] = la > lb ? [la, lb] : [lb, la];
  return (high + 0.05) / (low + 0.05);
}

const round = (value: number) => Math.round(value * 100) / 100;

export function analyzePalette(
  document: EditorDocument,
  palette: readonly Rgba[],
): PaletteAnalysis {
  const usage = paletteUsageAcrossFrames(document, palette);
  const unusedIndices = usage.filter((entry) => entry.pixels === 0).map((entry) => entry.index);

  const labs = palette.map((color) => rgbToLab(color));
  const nearDuplicates: PaletteAnalysis["nearDuplicates"] = [];
  for (let i = 0; i < palette.length; i++)
    for (let j = i + 1; j < palette.length; j++) {
      const distance = deltaE(labs[i], labs[j]);
      if (distance < DELTA_E_NEAR_DUPLICATE)
        nearDuplicates.push({ a: usage[i].hex, b: usage[j].hex, deltaE: round(distance) });
    }

  const onPalette = new Set(palette.map((color) => color.join(",")));
  const offPalette = new Map<string, number>();
  const frames = document.timeline?.frames.length ?? 1;
  for (let frame = 0; frame < frames; frame++) {
    const pixels = compositeDocumentFrame(document, frame);
    const data = pixels.data;
    for (let at = 0; at < data.length; at += RGBA_CHANNELS) {
      if (!data[at + 3]) continue;
      if (onPalette.has(`${data[at]},${data[at + 1]},${data[at + 2]},${data[at + 3]}`)) continue;
      const color = toHex([data[at], data[at + 1], data[at + 2], data[at + 3]]);
      offPalette.set(color, (offPalette.get(color) ?? 0) + 1);
    }
  }
  const offPaletteColors = [...offPalette.entries()]
    .map(([color, pixels]) => ({ hex: color, pixels }))
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, OFF_PALETTE_LIMIT);

  let lowestContrastPair: PaletteAnalysis["lowestContrastPair"] = null;
  const used = usage.filter((entry) => entry.pixels > 0).slice(0, CONTRAST_SAMPLE_LIMIT);
  for (let i = 0; i < used.length; i++)
    for (let j = i + 1; j < used.length; j++) {
      const ratio = contrastRatio(palette[used[i].index], palette[used[j].index]);
      if (!lowestContrastPair || ratio < lowestContrastPair.ratio)
        lowestContrastPair = { a: used[i].hex, b: used[j].hex, ratio: round(ratio) };
    }

  const problems: string[] = [];
  if (offPaletteColors.length > 0)
    problems.push(`${offPaletteColors.length} color(s) in the art are not in the palette`);
  if (nearDuplicates.length > 0)
    problems.push(`${nearDuplicates.length} near-duplicate palette entries (deltaE < 3)`);
  if (palette.length > LARGE_PALETTE_SIZE)
    problems.push(
      `${palette.length} colors is large for pixel art; most sprites read better under 32`,
    );

  return {
    size: palette.length,
    unusedIndices,
    nearDuplicates,
    offPaletteColors,
    lowestContrastPair,
    verdict: problems.length === 0 ? "clean" : problems.join("; "),
  };
}

/** Budget check for agent exports: one decoded frame times the frame count. */
export function assertExportPixelBudget(document: EditorDocument, frames: number, scale = 1): void {
  const pixels = document.width * document.height * frames * scale * scale;
  if (pixels > MAX_IMAGE_PIXELS)
    throw new RangeError("Export exceeds the pixel budget; reduce frames or scale.");
}
