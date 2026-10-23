import { describe, expect, test } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { rgbToLab } from "$/import-export/image/import/color-lab";
import { snapPalette } from "$/import-export/image/import/palette-snap";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  defaultPixelationSettings,
  pixelationSettingsOptions,
  updatePixelationSettings,
} from "$/import-export/image/import/settings";
import { PixelationDither, PixelationMode } from "$/import-export/image/import/types";

function make(width: number, height: number, paint: (x: number, y: number) => Rgba): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return { width, height, data };
}
const colors = (image: PixelBuffer) => {
  const set = new Set<string>();
  for (let i = 0; i < image.data.length; i += 4)
    if (image.data[i + 3]) set.add(Array.from(image.data.subarray(i, i + 3)).join(","));
  return set;
};
const delta = (a: readonly number[], b: readonly number[]) => {
  const x = rgbToLab(a[0], a[1], a[2]),
    y = rgbToLab(b[0], b[1], b[2]);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const nearestDelta = (image: PixelBuffer, color: readonly number[]) => {
  let best = Infinity;
  for (const key of colors(image)) best = Math.min(best, delta(key.split(",").map(Number), color));
  return best;
};

/** Mostly greens and browns with many shades each, plus a few rare pixels that matter. */
const SKIN: Rgba = [232, 190, 160, 255];
const HIGHLIGHT: Rgba = [255, 250, 235, 255];
function scene(): PixelBuffer {
  return make(40, 40, (x, y) => {
    if (x === 3 && y === 3) return SKIN;
    if (x === 36 && y === 5) return HIGHLIGHT;
    if (x === 20 && y === 30) return [40, 90, 200, 255];
    const shade = ((x * 7 + y * 13) % 12) - 6;
    if (y < 20) return [60 + shade, 150 + shade * 2, 70 + shade, 255];
    return [120 + shade, 80 + shade, 50 + shade * 2, 255];
  });
}

describe("snapPalette (k-means)", () => {
  test("collapses near-shades into the requested number of colours", () => {
    const out = snapPalette(scene(), { colors: 6 });
    expect(colors(out).size).toBeLessThanOrEqual(6);
    expect(colors(scene()).size).toBeGreaterThan(20);
  });
  test("keeps rare-but-distinct colours that plain frequency-weighted clustering would lose", () => {
    const out = snapPalette(scene(), { colors: 6 });
    for (const rare of [SKIN, HIGHLIGHT, [40, 90, 200, 255] as Rgba])
      expect(nearestDelta(out, rare)).toBeLessThan(6);
  });
  test("leaves images that already fit in the budget unchanged", () => {
    const flat = make(8, 8, (x) => (x < 4 ? [10, 20, 30, 255] : [200, 100, 50, 255]));
    expect(Array.from(snapPalette(flat, { colors: 8 }).data)).toEqual(Array.from(flat.data));
  });
  test("merges only near-duplicates when the budget is generous", () => {
    const image = make(8, 8, (x) => (x < 4 ? [100 + (x % 4), 100, 100, 255] : [200, 30, 30, 255]));
    const out = snapPalette(image, { colors: 3 });
    expect(colors(image).size).toBe(5);
    expect(colors(out).size).toBe(2);
    expect(nearestDelta(out, [200, 30, 30])).toBeLessThan(1);
  });
  test("is deterministic and does not modify the source", () => {
    const source = scene();
    const copy = Uint8ClampedArray.from(source.data);
    const a = snapPalette(source, { colors: 8 });
    const b = snapPalette(source, { colors: 8 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(source.data)).toEqual(Array.from(copy));
  });
  test("keeps each pixel's alpha and leaves transparent pixels alone", () => {
    const image = make(20, 20, (x, y) =>
      x < 3 ? [9, 9, 9, 0] : [10 + ((x * y) % 40) * 5, 80, 120, y % 2 ? 255 : 128],
    );
    const out = snapPalette(image, { colors: 4 });
    for (let i = 0; i < image.data.length; i += 4) expect(out.data[i + 3]).toBe(image.data[i + 3]);
    expect(Array.from(out.data.subarray(0, 4))).toEqual([9, 9, 9, 0]);
  });
});

describe("snapPalette (given palette)", () => {
  test("snaps every visible pixel to its nearest Lab entry", () => {
    const palette: Rgba[] = [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [220, 40, 40, 255],
    ];
    const image = make(
      6,
      1,
      (x) =>
        [
          [10, 10, 10, 255],
          [240, 240, 240, 255],
          [200, 60, 50, 255],
          [250, 20, 20, 255],
          [30, 30, 30, 255],
          [255, 255, 250, 255],
        ][x] as Rgba,
    );
    const out = snapPalette(image, { palette });
    expect(colors(out)).toEqual(new Set(["0,0,0", "255,255,255", "220,40,40"]));
    expect(Array.from(out.data.subarray(8, 11))).toEqual([220, 40, 40]);
  });
  test("rejects a palette with no visible colour", () => {
    expect(() => snapPalette(scene(), { palette: [[0, 0, 0, 0]] })).toThrow();
  });
});

describe("Limit colors in the pixelate pipeline", () => {
  test("is off by default; on, it clusters to the colour count", () => {
    const image = scene();
    const plain = pixelateImage(image, {
      blockPicker: true,
      targetWidth: 40,
      targetHeight: 40,
    });
    expect(colors(plain).size).toBeGreaterThan(5);
    const limited = pixelateImage(image, {
      blockPicker: true,
      targetWidth: 40,
      targetHeight: 40,
      paletteSnap: { colors: 5 },
    });
    expect(colors(limited).size).toBeLessThanOrEqual(5);
  });
  test("settings: one Limit colors control, count 2-256, a loaded palette wins over the count", () => {
    const size = { width: 64, height: 64 };
    const base = defaultPixelationSettings(size);
    expect(base.reduceColors).toBe(false);
    expect(
      pixelationSettingsOptions({ ...base, mode: PixelationMode.Convert }).paletteSnap,
    ).toBeUndefined();
    const on = updatePixelationSettings(base, { reduceColors: true, maxColors: 500 }, size);
    expect(on.maxColors).toBe(256);
    expect(pixelationSettingsOptions({ ...on, mode: PixelationMode.Convert }).paletteSnap).toEqual({
      colors: 256,
      dither: PixelationDither.None,
    });
    expect(
      updatePixelationSettings(base, { reduceColors: true, maxColors: 1 }, size).maxColors,
    ).toBe(2);
    const palette: Rgba[] = [[1, 2, 3, 255]];
    expect(
      pixelationSettingsOptions({
        ...on,
        palette,
        mode: PixelationMode.Convert,
      }).paletteSnap,
    ).toEqual({ palette, dither: PixelationDither.None });
  });
  test("saved Limit colors / Snap palette settings become one Limit colors", () => {
    const size = { width: 64, height: 64 };
    const base = defaultPixelationSettings(size);
    const migrate = (saved: Record<string, unknown>) => {
      const next = updatePixelationSettings({ ...base, ...saved } as typeof base, {}, size);
      expect(next).not.toHaveProperty("snapPalette");
      expect(next).not.toHaveProperty("snapColors");
      return [next.reduceColors, next.maxColors];
    };
    // Limit colors on: its own count, whatever Snap palette said.
    expect(
      migrate({ reduceColors: true, maxColors: 12, snapPalette: true, snapColors: 32 }),
    ).toEqual([true, 12]);
    // Only Snap palette on: Snap palette's count.
    expect(
      migrate({ reduceColors: false, maxColors: 12, snapPalette: true, snapColors: 32 }),
    ).toEqual([true, 32]);
    // Both off: off.
    expect(
      migrate({ reduceColors: false, maxColors: 12, snapPalette: false, snapColors: 32 }),
    ).toEqual([false, 12]);
  });
});

describe("snapPalette dithering", () => {
  const grayRamp = () =>
    make(8, 8, (x, y) => {
      const v = Math.round(((x + y * 8) / 63) * 255);
      return [v, v, v, 255];
    });
  const twoTone: Rgba[] = [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
  ];

  test("Off (nearest) matches the previous flat snap", () => {
    const image = grayRamp();
    const none = snapPalette(image, { palette: twoTone, dither: PixelationDither.None });
    const omitted = snapPalette(image, { palette: twoTone });
    expect(Array.from(none.data)).toEqual(Array.from(omitted.data));
    expect(colors(none)).toEqual(new Set(["0,0,0", "255,255,255"]));
  });

  test("Ordered Bayer differs from nearest and stays in the palette", () => {
    const image = grayRamp();
    const nearest = snapPalette(image, { palette: twoTone, dither: PixelationDither.None });
    const ordered = snapPalette(image, { palette: twoTone, dither: PixelationDither.Ordered });
    expect(Array.from(ordered.data)).not.toEqual(Array.from(nearest.data));
    expect(colors(ordered)).toEqual(new Set(["0,0,0", "255,255,255"]));
    // Deterministic.
    expect(
      Array.from(snapPalette(image, { palette: twoTone, dither: PixelationDither.Ordered }).data),
    ).toEqual(Array.from(ordered.data));
  });

  test("Floyd–Steinberg differs from nearest and Ordered, stays in the palette", () => {
    const image = grayRamp();
    const nearest = snapPalette(image, { palette: twoTone, dither: PixelationDither.None });
    const ordered = snapPalette(image, { palette: twoTone, dither: PixelationDither.Ordered });
    const floyd = snapPalette(image, {
      palette: twoTone,
      dither: PixelationDither.FloydSteinberg,
    });
    expect(Array.from(floyd.data)).not.toEqual(Array.from(nearest.data));
    expect(Array.from(floyd.data)).not.toEqual(Array.from(ordered.data));
    expect(colors(floyd)).toEqual(new Set(["0,0,0", "255,255,255"]));
  });

  test("settings default dither Off and unknown values migrate to Off", () => {
    const size = { width: 32, height: 32 };
    const base = defaultPixelationSettings(size);
    expect(base.dither).toBe(PixelationDither.None);
    const limited = updatePixelationSettings(base, { reduceColors: true }, size);
    expect(
      pixelationSettingsOptions({ ...limited, mode: PixelationMode.Convert }).paletteSnap?.dither,
    ).toBe(PixelationDither.None);
    const ordered = updatePixelationSettings(limited, { dither: PixelationDither.Ordered }, size);
    expect(
      pixelationSettingsOptions({ ...ordered, mode: PixelationMode.Convert }).paletteSnap,
    ).toEqual({ colors: 16, dither: PixelationDither.Ordered });
    expect(updatePixelationSettings(limited, { dither: "bogus" as never }, size).dither).toBe(
      PixelationDither.None,
    );
  });
});
