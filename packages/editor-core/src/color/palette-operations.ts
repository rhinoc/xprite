import { UINT8_MAX } from "$/base/numeric-constants";
import { MAX_PALETTE_COLORS } from "$/color/palette-resize";
/** Pure palette commands from ColorBar, doc/palette.cpp and doc/sort_palette.cpp. */
export enum PaletteOperation {
  Reverse = "reverse",
  Gradient = "gradient",
  HueGradient = "hue-gradient",
  Hue = "hue",
  Saturation = "saturation",
  Brightness = "brightness",
  Luminance = "luminance",
  Red = "red",
  Green = "green",
  Blue = "blue",
  Alpha = "alpha",
}
export type PaletteRgba = [number, number, number, number];

/** PaletteView drop target is an index in the preview with selected colors
 * removed. Convert it to pal_ops.cpp's insertion index before remapping. */
export function dropPaletteColors(
  colors: readonly (readonly number[])[],
  selected: readonly number[],
  target: number,
  copy = false,
) {
  const picks = [
    ...new Set(
      selected.filter((index) => Number.isInteger(index) && index >= 0 && index < colors.length),
    ),
  ].sort((a, b) => a - b);
  const original = colors.map(
    (color) => [color[0], color[1], color[2], color[3] ?? UINT8_MAX] as PaletteRgba,
  );
  const capacityExceeded = copy && colors.length + picks.length > MAX_PALETTE_COLORS;
  if (!picks.length || capacityExceeded || !Number.isFinite(target))
    return {
      colors: original,
      selected: picks,
      remap: original.map((_, index) => index),
      capacityExceeded,
    };
  target = Math.max(0, Math.min(MAX_PALETTE_COLORS - picks.length, Math.floor(target)));
  const before = !copy && target > picks[0] ? target + picks.length : target;
  while (original.length < before) original.push([0, 0, 0, UINT8_MAX]);
  const picked = new Set(picks);
  const insertion = copy ? before : before - picks.filter((index) => index < before).length;
  const order = original
    .map((color, index) => ({ color, index }))
    .filter((item) => copy || !picked.has(item.index));
  order.splice(
    insertion,
    0,
    ...picks.map((index) => ({
      color: [...original[index]] as PaletteRgba,
      index,
    })),
  );
  const remap = original.map((_, index) => index);
  order.forEach((item, index) => {
    remap[item.index] = index;
  });
  // Selected source entries map to their copied destination for selection.
  picks.forEach((index, offset) => {
    remap[index] = insertion + offset;
  });
  return {
    colors: order.map((item) => item.color),
    selected: picks.map((_, index) => insertion + index),
    remap,
    capacityExceeded: false,
  };
}

function hsv([r, g, b]: readonly number[]) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    c = max - min;
  const chroma = c / UINT8_MAX,
    value = max / UINT8_MAX;
  if (!c) return [0, 0, value];
  let prime =
    max === r
      ? (g / UINT8_MAX - b / UINT8_MAX) / chroma
      : max === g
        ? (b / UINT8_MAX - r / UINT8_MAX) / chroma + 2
        : (r / UINT8_MAX - g / UINT8_MAX) / chroma + 4;
  while (prime < 0) prime += 6;
  return [(prime % 6) * 60, chroma / value, value];
}

function fromHsv(h: number, s: number, v: number): [number, number, number] {
  const prime = (((h % 360) + 360) % 360) / 60,
    c = v * s;
  const x = c * (1 - Math.abs((prime % 2) - 1));
  const sectors = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  return sectors[Math.trunc(prime)].map((channel) =>
    Math.trunc((channel + v - c) * UINT8_MAX + 0.5),
  ) as [number, number, number];
}

function compare(a: PaletteRgba, b: PaletteRgba, operation: PaletteOperation, ascending: boolean) {
  // Upstream's transparent/transparent predicate violates strict weak ordering.
  // Preserve those ties deterministically, as with all other equal keys.
  if (!a[3] || !b[3]) return !a[3] && !b[3] ? 0 : !a[3] ? -1 : 1;
  const sign = ascending ? 1 : -1;
  const channel = CHANNEL_INDEX[operation];
  if (channel !== undefined) return sign * (a[channel] - b[channel]);
  if (operation === PaletteOperation.Luminance) {
    const luma = (c: PaletteRgba) =>
      Math.trunc((c[0] ** 2 * 2126 + c[1] ** 2 * 7152 + c[2] ** 2 * 722) / 10000);
    return sign * (luma(a) - luma(b));
  }
  const [h1, s1, v1] = hsv(a).map((n, i) => Math.floor(n * (i ? 100 : 1) + 0.5));
  const [h2, s2, v2] = hsv(b).map((n, i) => Math.floor(n * (i ? 100 : 1) + 0.5));
  if (operation === PaletteOperation.Hue)
    return sign * (!s1 && !s2 ? v1 - v2 : !s1 ? -1 : !s2 ? 1 : h1 - h2);
  if (operation === PaletteOperation.Saturation) return sign * (s1 - s2 || v1 - v2);
  return sign * (v1 - v2 || s1 - s2);
}

const CHANNEL_INDEX: Partial<Record<PaletteOperation, number>> = {
  [PaletteOperation.Red]: 0,
  [PaletteOperation.Green]: 1,
  [PaletteOperation.Blue]: 2,
  [PaletteOperation.Alpha]: 3,
};

/** Input channels are RGBA bytes (RGB input defaults to opaque). Never mutates input.
 * Selection is an index set; reverse/sort expand fewer than two picks to all.
 * Gradients require a contiguous selection and leave its endpoints unchanged.
 */
export function operatePalette(
  colors: readonly (readonly number[])[],
  operation: PaletteOperation,
  ascending = true,
  selected: readonly number[] = [],
): PaletteRgba[] {
  const result = colors.map((c) => [c[0], c[1], c[2], c[3] ?? UINT8_MAX] as PaletteRgba);
  let picks = [
    ...new Set(selected.filter((i) => Number.isInteger(i) && i >= 0 && i < result.length)),
  ].sort((a, b) => a - b);
  if (operation === PaletteOperation.Gradient || operation === PaletteOperation.HueGradient) {
    if (picks.length < 3 || picks[picks.length - 1] - picks[0] + 1 !== picks.length) return result;
    const first = picks[0],
      last = picks[picks.length - 1],
      n = last - first;
    const a = result[first],
      b = result[last];
    const [h1, s1, v1] = hsv(a),
      [hue2, s2, v2] = hsv(b);
    const h2 =
      hue2 >= h1 ? (hue2 - h1 > 180 ? hue2 - 360 : hue2) : h1 - hue2 > 180 ? hue2 + 360 : hue2;
    for (let i = first + 1; i < last; i++) {
      const t = (i - first) / n;
      result[i] =
        operation === PaletteOperation.Gradient
          ? (a.map(
              (channel, c) => channel + Math.trunc(((b[c] - channel) * (i - first)) / n),
            ) as PaletteRgba)
          : [
              ...fromHsv(h1 + (h2 - h1) * t, s1 + (s2 - s1) * t, v1 + (v2 - v1) * t),
              Math.trunc(a[3] + (b[3] - a[3]) * t),
            ];
    }
    return result;
  }
  if (picks.length < 2) picks = result.map((_, i) => i);
  const subset = picks.map((i) => result[i]);
  if (operation === PaletteOperation.Reverse) subset.reverse();
  else subset.sort((a, b) => compare(a, b, operation, ascending));
  picks.forEach((index, i) => {
    result[index] = subset[i];
  });
  return result;
}
