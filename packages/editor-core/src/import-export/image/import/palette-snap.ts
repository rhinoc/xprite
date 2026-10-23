import type { PixelBuffer, Rgba } from "$/base/primitives";
import { rgbToLab, labToRgb, type Lab } from "$/import-export/image/import/color-lab";
import { PixelationDither, type PaletteSnapOptions } from "$/import-export/image/import/types";

/**
 * Optional "snap palette" step for a recovered (small) image: collapse the many near-shades that
 * AI art and JPEG sources leave behind into a clean, flat palette, or snap to a palette the user
 * supplies. Rare-but-important colours (skin tones, highlights) are kept by two rules:
 *  - only near-duplicates (within `MERGE_DELTA` in CIE Lab) are ever merged without a budget, and
 *  - k-means is seeded by weighted farthest-point selection, so a colour far from everything else
 *    gets its own palette entry before a frequent shade that is only a little different.
 * Alpha is never clustered: each pixel keeps its own opacity and fully transparent pixels stay put.
 * When Limit colors dithering is on, the built palette is applied per pixel with ordered (Bayer 4×4)
 * or Floyd–Steinberg error diffusion in Lab-nearest space instead of a flat shade remap.
 */
const MIN_COLORS = 2;
const MAX_COLORS = 256;
const DEFAULT_COLORS = 16;
/** CIE76 distance below which two colours are the same shade for practical purposes. */
const MERGE_DELTA = 3;
/** Seeding score = distance * count^SEED_WEIGHT: mostly distance, a little frequency. */
const SEED_WEIGHT = 0.25;
/** Cluster pull = count^PULL_WEIGHT, so large flat areas do not drag centroids off rare colours. */
const PULL_WEIGHT = 0.5;
const MAX_ITERATIONS = 32;
const CHANNELS = 4;
/** Classic Bayer 4×4 threshold matrix (0..15). */
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

interface Shade {
  rgb: [number, number, number];
  lab: Lab;
  count: number;
}

const distance = (a: Lab, b: Lab) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

function histogram(image: PixelBuffer): { shades: Shade[]; index: Int32Array } {
  const { data } = image;
  const pixels = data.length / CHANNELS;
  const seen = new Map<number, number>();
  const shades: Shade[] = [];
  const index = new Int32Array(pixels).fill(-1);
  for (let i = 0; i < pixels; i++) {
    const o = i * CHANNELS;
    if (data[o + 3] === 0) continue;
    const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
    let at = seen.get(key);
    if (at === undefined) {
      at = shades.length;
      seen.set(key, at);
      shades.push({
        rgb: [data[o], data[o + 1], data[o + 2]],
        lab: rgbToLab(data[o], data[o + 1], data[o + 2]),
        count: 0,
      });
    }
    shades[at].count += 1;
    index[i] = at;
  }
  return { shades, index };
}

/** Greedy leader clustering, heaviest first: only colours within MERGE_DELTA share a group. */
function mergeNearDuplicates(shades: readonly Shade[]): number[][] {
  const order = shades.map((_, i) => i).sort((a, b) => shades[b].count - shades[a].count || a - b);
  const groups: number[][] = [];
  for (const i of order) {
    let best = -1,
      bestDistance = MERGE_DELTA;
    for (let g = 0; g < groups.length; g++) {
      const d = distance(shades[i].lab, shades[groups[g][0]].lab);
      if (d <= bestDistance) {
        bestDistance = d;
        best = g;
      }
    }
    if (best < 0) groups.push([i]);
    else groups[best].push(i);
  }
  return groups;
}

interface Point {
  lab: Lab;
  count: number;
  members: number[];
}

function toPoints(shades: readonly Shade[], groups: readonly number[][]): Point[] {
  return groups.map((members) => {
    let count = 0;
    const sum: Lab = [0, 0, 0];
    for (const m of members) {
      count += shades[m].count;
      for (let c = 0; c < 3; c++) sum[c] += shades[m].lab[c] * shades[m].count;
    }
    return {
      lab: [sum[0] / count, sum[1] / count, sum[2] / count],
      count,
      members,
    };
  });
}

/** Weighted farthest-point seeding: start from the commonest colour, then keep adding the colour
 * that is farthest from every seed so far (lightly favouring frequent ones). */
function seed(points: readonly Point[], k: number): Lab[] {
  let first = 0;
  for (let i = 1; i < points.length; i++) if (points[i].count > points[first].count) first = i;
  const seeds: Lab[] = [points[first].lab];
  const nearest = points.map((p) => distance(p.lab, seeds[0]));
  while (seeds.length < k) {
    let pick = -1,
      pickScore = 0;
    for (let i = 0; i < points.length; i++) {
      const score = nearest[i] * points[i].count ** SEED_WEIGHT;
      if (score > pickScore) {
        pickScore = score;
        pick = i;
      }
    }
    if (pick < 0) break;
    seeds.push(points[pick].lab);
    for (let i = 0; i < points.length; i++)
      nearest[i] = Math.min(nearest[i], distance(points[i].lab, points[pick].lab));
  }
  return seeds;
}

function cluster(points: readonly Point[], k: number): number[] {
  const centers = seed(points, k);
  const assign = new Int32Array(points.length).fill(-1);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0,
        bestDistance = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = distance(points[i].lab, centers[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const weight = points[i].count ** PULL_WEIGHT;
      const s = sums[assign[i]];
      for (let c = 0; c < 3; c++) s[c] += points[i].lab[c] * weight;
      s[3] += weight;
    }
    for (let c = 0; c < centers.length; c++)
      if (sums[c][3] > 0)
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
  }
  return Array.from(assign);
}

function paletteLabs(palette: readonly Rgba[]): { labs: Lab[]; rgb: Rgba[] } {
  const visible = palette.filter((color) => color[3] > 0);
  if (!visible.length) throw new RangeError("Choose a palette containing a visible color.");
  return {
    labs: visible.map((c) => rgbToLab(c[0], c[1], c[2])),
    rgb: visible.map((c) => c),
  };
}

function nearestPaletteRgb(
  lab: Lab,
  labs: readonly Lab[],
  rgb: readonly Rgba[],
): [number, number, number] {
  let best = 0,
    bestDistance = Infinity;
  for (let i = 0; i < labs.length; i++) {
    const d = distance(lab, labs[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return [rgb[best][0], rgb[best][1], rgb[best][2]];
}

/**
 * Quantize every visible pixel to `palette` with ordered Bayer 4×4 or Floyd–Steinberg diffusion.
 * Nearest colour is CIE Lab (same metric as the flat snap). Transparent pixels are left alone.
 */
function ditherToPalette(
  image: PixelBuffer,
  palette: readonly Rgba[],
  dither: PixelationDither.Ordered | PixelationDither.FloydSteinberg,
): PixelBuffer {
  const { labs, rgb } = paletteLabs(palette);
  const output = new Uint8ClampedArray(image.data);
  const { width, height, data } = image;
  const count = width * height;
  const error =
    dither === PixelationDither.FloydSteinberg ? new Float32Array(count * 3) : undefined;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const at = i * CHANNELS;
      if (data[at + 3] === 0) continue;
      const correction =
        dither === PixelationDither.Ordered ? (BAYER_4[(y & 3) * 4 + (x & 3)] - 7.5) * 2 : 0;
      const sample: [number, number, number] = [
        clampByte(data[at] + correction + (error?.[i * 3] ?? 0)),
        clampByte(data[at + 1] + correction + (error?.[i * 3 + 1] ?? 0)),
        clampByte(data[at + 2] + correction + (error?.[i * 3 + 2] ?? 0)),
      ];
      const chosen = nearestPaletteRgb(rgbToLab(sample[0], sample[1], sample[2]), labs, rgb);
      output[at] = chosen[0];
      output[at + 1] = chosen[1];
      output[at + 2] = chosen[2];
      if (error) {
        for (let channel = 0; channel < 3; channel++) {
          const delta = sample[channel] - chosen[channel];
          if (x + 1 < width) error[(i + 1) * 3 + channel] += (delta * 7) / 16;
          if (y + 1 < height) {
            if (x > 0) error[(i + width - 1) * 3 + channel] += (delta * 3) / 16;
            error[(i + width) * 3 + channel] += (delta * 5) / 16;
            if (x + 1 < width) error[(i + width + 1) * 3 + channel] += delta / 16;
          }
        }
      }
    }
  }
  return { width, height, data: output };
}

/** Build the reduced RGB palette (k-means or the given list); null when the image already fits. */
function buildPalette(shades: readonly Shade[], options: PaletteSnapOptions): Rgba[] | null {
  if (options.palette) return paletteLabs(options.palette).rgb;
  const colors = Math.max(
    MIN_COLORS,
    Math.min(MAX_COLORS, Math.round(options.colors ?? DEFAULT_COLORS)),
  );
  if (shades.length <= colors) return null;
  const groups = mergeNearDuplicates(shades);
  const points = toPoints(shades, groups);
  const assignment = points.length <= colors ? points.map((_, i) => i) : cluster(points, colors);
  const sums = new Map<number, { lab: [number, number, number]; count: number }>();
  points.forEach((point, i) => {
    const entry = sums.get(assignment[i]) ?? { lab: [0, 0, 0], count: 0 };
    for (let c = 0; c < 3; c++) entry.lab[c] += point.lab[c] * point.count;
    entry.count += point.count;
    sums.set(assignment[i], entry);
  });
  const palette: Rgba[] = [];
  for (const { lab, count } of sums.values()) {
    const [r, g, b] = labToRgb(lab[0] / count, lab[1] / count, lab[2] / count);
    palette.push([r, g, b, 255]);
  }
  return palette;
}

/** Flat nearest-shade remap (no positional dither). */
function remapShades(
  image: PixelBuffer,
  shades: readonly Shade[],
  index: Int32Array,
  options: PaletteSnapOptions,
): PixelBuffer {
  const output = new Uint8ClampedArray(image.data);
  let target: [number, number, number][];
  if (options.palette) {
    const { labs, rgb } = paletteLabs(options.palette);
    target = shades.map((shade) => nearestPaletteRgb(shade.lab, labs, rgb));
  } else {
    const colors = Math.max(
      MIN_COLORS,
      Math.min(MAX_COLORS, Math.round(options.colors ?? DEFAULT_COLORS)),
    );
    if (shades.length <= colors) return { width: image.width, height: image.height, data: output };
    const groups = mergeNearDuplicates(shades);
    const points = toPoints(shades, groups);
    const assignment = points.length <= colors ? points.map((_, i) => i) : cluster(points, colors);
    const sums = new Map<number, { lab: [number, number, number]; count: number }>();
    points.forEach((point, i) => {
      const entry = sums.get(assignment[i]) ?? { lab: [0, 0, 0], count: 0 };
      for (let c = 0; c < 3; c++) entry.lab[c] += point.lab[c] * point.count;
      entry.count += point.count;
      sums.set(assignment[i], entry);
    });
    const colorOf = new Map<number, [number, number, number]>();
    for (const [id, { lab, count }] of sums)
      colorOf.set(id, labToRgb(lab[0] / count, lab[1] / count, lab[2] / count));
    target = Array.from({ length: shades.length }, () => [0, 0, 0] as [number, number, number]);
    points.forEach((point, i) => {
      for (const member of point.members) target[member] = colorOf.get(assignment[i])!;
    });
  }
  for (let i = 0; i < index.length; i++) {
    if (index[i] < 0) continue;
    const color = target[index[i]];
    output[i * CHANNELS] = color[0];
    output[i * CHANNELS + 1] = color[1];
    output[i * CHANNELS + 2] = color[2];
  }
  return { width: image.width, height: image.height, data: output };
}

/** The recovered image with its colours snapped; the source is never modified. */
export function snapPalette(image: PixelBuffer, options: PaletteSnapOptions): PixelBuffer {
  const dither = Object.values(PixelationDither).includes(options.dither as PixelationDither)
    ? (options.dither as PixelationDither)
    : PixelationDither.None;
  const { shades, index } = histogram(image);
  if (dither === PixelationDither.None) return remapShades(image, shades, index, options);
  // Ordered / Floyd–Steinberg need a concrete palette, then per-pixel Lab nearest.
  const palette = buildPalette(shades, options);
  if (!palette) {
    // Already within budget and no user palette: dither among the image's own shades.
    if (!shades.length)
      return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    const own: Rgba[] = shades.map((shade) => [shade.rgb[0], shade.rgb[1], shade.rgb[2], 255]);
    return ditherToPalette(image, own, dither);
  }
  return ditherToPalette(image, palette, dither);
}
