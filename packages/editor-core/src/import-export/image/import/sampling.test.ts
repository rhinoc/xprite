import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { clampByte } from "$/document/pixel-validation";
import { extractPixelationPalette, reduceToPalette } from "$/import-export/image/import/palette";
import { samplePixelation } from "$/import-export/image/import/sampling";
import { PixelationMethod } from "$/import-export/image/import/types";

const CHANNELS = 4;
const OPAQUE = 255;
const METHODS = [PixelationMethod.Structure, PixelationMethod.TwoStage];
const COLORS: Rgba[] = [
  [0, 0, 0, OPAQUE],
  [240, 20, 30, OPAQUE],
  [20, 40, 220, OPAQUE],
  [10, 190, 70, OPAQUE],
  [230, 210, 50, OPAQUE],
];
const OPACITIES = [0, 1, 2, 64, 127, 128, 254, OPAQUE];

function pixels(colors: Rgba[]): PixelBuffer {
  return { width: colors.length, height: 1, data: new Uint8ClampedArray(colors.flat()) };
}

/**
 * The pre-streaming object/Map/filter pipeline is the parity oracle. The fixture has fewer than
 * sixteen RGB colours, so both palette limits retain every colour without quantization.
 */
function objectSampling(
  image: PixelBuffer,
  width: number,
  height: number,
  method: PixelationMethod,
  cuts?: { x: readonly number[]; y: readonly number[] },
): PixelBuffer {
  const palette = extractPixelationPalette(image, { maxColors: 16 }).map((entry) => entry.color);
  const labels = reduceToPalette(image, palette, { preserveAlpha: true }).data;
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const left = Math.max(0, cuts?.x[column] ?? (column * image.width) / width);
      const top = Math.max(0, cuts?.y[row] ?? (row * image.height) / height);
      const right = Math.min(
        image.width,
        cuts?.x[column + 1] ?? ((column + 1) * image.width) / width,
      );
      const bottom = Math.min(
        image.height,
        cuts?.y[row + 1] ?? ((row + 1) * image.height) / height,
      );
      const samples: { index: number; label: number; weight: number; visibleWeight: number }[] = [];
      let area = 0,
        alpha = 0;
      for (let y = Math.floor(top); y < Math.ceil(bottom); y++)
        for (let x = Math.floor(left); x < Math.ceil(right); x++) {
          const coverage =
            (Math.min(right, x + 1) - Math.max(left, x)) *
            (Math.min(bottom, y + 1) - Math.max(top, y));
          if (coverage <= 0) continue;
          const index = (y * image.width + x) * CHANNELS;
          const opacity = image.data[index + 3];
          area += coverage;
          alpha += coverage * opacity;
          if (!opacity && !cuts) continue;
          const fx = (Math.max(left, x) + Math.min(right, x + 1)) / 2;
          const fy = (Math.max(top, y) + Math.min(bottom, y + 1)) / 2;
          const horizontal = 1 - Math.abs((2 * (fx - left)) / (right - left) - 1);
          const vertical = 1 - Math.abs((2 * (fy - top)) / (bottom - top) - 1);
          const weight =
            method === PixelationMethod.TwoStage
              ? coverage * horizontal * vertical
              : coverage * (0.25 + (1 - 0.25) * horizontal * vertical);
          samples.push({
            index,
            label: (labels[index] << 16) | (labels[index + 1] << 8) | labels[index + 2],
            weight,
            visibleWeight: (weight * opacity) / OPAQUE,
          });
        }
      const offset = (row * width + column) * CHANNELS;
      data[offset + 3] = clampByte(area ? alpha / area : 0);
      if (!data[offset + 3] || !samples.length) continue;
      const votes = new Map<number, number>();
      for (const sample of samples)
        votes.set(sample.label, (votes.get(sample.label) ?? 0) + sample.visibleWeight);
      const winner = [...votes].sort(([a, av], [b, bv]) => bv - av || a - b)[0][0];
      const selected = samples.filter((sample) => sample.label === winner);
      if (cuts) {
        const weight = selected.reduce((sum, sample) => sum + sample.weight, 0);
        const opacity = selected.reduce(
          (sum, sample) => sum + sample.weight * image.data[sample.index + 3],
          0,
        );
        data[offset + 3] = clampByte(weight ? opacity / weight : 0);
      }
      const visible = selected.reduce((sum, sample) => sum + sample.visibleWeight, 0);
      for (let channel = 0; channel < 3; channel++) {
        const total = selected.reduce(
          (sum, sample) => sum + image.data[sample.index + channel] * sample.visibleWeight,
          0,
        );
        data[offset + channel] = clampByte(visible ? total / visible : 0);
      }
    }
  return { width, height, data };
}

describe.each(METHODS)("%s streaming colour groups", (method) => {
  test("equal visible votes choose the smaller RGB key rather than the first group", () => {
    const image = pixels([
      [255, 0, 0, OPAQUE],
      [0, 0, 255, OPAQUE],
    ]);
    expect([...samplePixelation(image, 1, 1, method).data]).toEqual([0, 0, 255, OPAQUE]);
  });

  test("transparent pixels retain the black RGB group during recovery", () => {
    const image = pixels([
      [0, 0, 0, OPAQUE],
      [255, 0, 0, 0],
    ]);
    const cuts = { x: [0, 2], y: [0, 1] };
    expect([...samplePixelation(image, 1, 1, method, cuts).data]).toEqual([0, 0, 0, 128]);
  });

  test("conversion keeps area alpha while recovery keeps the winning region alpha", () => {
    const image = pixels([
      [0, 0, 255, OPAQUE],
      [255, 0, 0, 0],
    ]);
    expect([...samplePixelation(image, 1, 1, method).data]).toEqual([0, 0, 255, 128]);
    expect([...samplePixelation(image, 1, 1, method, { x: [0, 2], y: [0, 1] }).data]).toEqual([
      0,
      0,
      255,
      OPAQUE,
    ]);
  });

  test("resets only the active labels across many subpixel cells in a 48-colour image", () => {
    const image = { width: 12, height: 4, data: new Uint8ClampedArray(48 * CHANNELS) };
    const scale = 4;
    for (let index = 0; index < image.width * image.height; index++)
      image.data.set(
        [
          (index % 6) * 40 + 10,
          Math.floor(index / 6) * 25 + 5,
          ((index * 37) % 200) + 20,
          1 + ((index * 29) % OPAQUE),
        ],
        index * CHANNELS,
      );
    const width = image.width * scale;
    const height = image.height * scale;
    const expected = new Uint8ClampedArray(width * height * CHANNELS);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const source = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * CHANNELS;
        expected.set(image.data.subarray(source, source + CHANNELS), (y * width + x) * CHANNELS);
      }
    const cuts = {
      x: Array.from({ length: width + 1 }, (_, index) => index / scale),
      y: Array.from({ length: height + 1 }, (_, index) => index / scale),
    };
    expect(samplePixelation(image, width, height, method).data).toEqual(expected);
    expect(samplePixelation(image, width, height, method, cuts).data).toEqual(expected);
  });

  test("a transparent cell between repeated labels leaves no stale votes or colour sums", () => {
    const image = pixels([
      [240, 20, 30, OPAQUE],
      [240, 20, 30, 0],
      [20, 40, 220, OPAQUE],
      [240, 20, 30, 1],
    ]);
    const expected = new Uint8ClampedArray(image.data);
    expected.fill(0, CHANNELS, CHANNELS * 2);
    const cuts = { x: [0, 1, 2, 3, 4], y: [0, 1] };
    expect(samplePixelation(image, 4, 1, method).data).toEqual(expected);
    expect(samplePixelation(image, 4, 1, method, cuts).data).toEqual(expected);
  });

  test("matches the object pipeline across fractional cells, alpha and successive groups", () => {
    const image = { width: 13, height: 9, data: new Uint8ClampedArray(13 * 9 * CHANNELS) };
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const index = y * image.width + x;
        const color = COLORS[(x * 11 + y * 7 + x * y) % COLORS.length];
        image.data.set(
          [...color.slice(0, 3), OPACITIES[(index * 3) % OPACITIES.length]],
          index * CHANNELS,
        );
      }
    const original = new Uint8ClampedArray(image.data);
    const cuts = { x: [-0.7, 0.5, 1, 1.2, 6.5, 12.4, 13.8], y: [-0.5, 0.4, 3.7, 7, 9.2] };
    expect(samplePixelation(image, 7, 5, method)).toEqual(objectSampling(image, 7, 5, method));
    expect(samplePixelation(image, 6, 4, method, cuts)).toEqual(
      objectSampling(image, 6, 4, method, cuts),
    );
    expect(image.data).toEqual(original);
  });
});

describe("TwoStage adaptive palette", () => {
  test.each([
    [333, 127],
    [334, 128],
  ])("one-pixel shades at 1/%i coverage retain the expected cell colour", (width, red) => {
    const rare: readonly (readonly number[])[] = [
      [16, 16, 16],
      [16, 16, 240],
      [16, 240, 16],
      [16, 240, 240],
      [240, 16, 16],
      [240, 16, 240],
      [240, 240, 16],
      [127, 80, 80],
      [128, 80, 80],
      [16, 128, 240],
      [240, 128, 16],
      [128, 240, 16],
      [16, 240, 128],
      [128, 16, 240],
      [240, 16, 128],
      [16, 128, 16],
    ];
    const data = new Uint8ClampedArray(width * CHANNELS);
    for (let x = 0; x < width; x++)
      data.set([...(rare[x] ?? [240, 240, 240]), OPAQUE], x * CHANNELS);
    // Seventeen occupied bins qualify at 333 pixels; at 334 the one-pixel bins fall below
    // 0.3%, leaving a sixteen-colour budget. Only then do the two central shades share a region.
    const output = samplePixelation({ width, height: 1, data }, 2, 1, PixelationMethod.TwoStage, {
      x: [0, rare.length, width],
      y: [0, 1],
    });
    expect([...output.data]).toEqual([red, 80, 80, OPAQUE, 240, 240, 240, OPAQUE]);
  });

  test("a large distinct-colour image retains its recorded TwoStage RGBA output", () => {
    const side = 257;
    const image = {
      width: side,
      height: side,
      data: new Uint8ClampedArray(side * side * CHANNELS),
    };
    for (let index = 0; index < side * side; index++)
      image.data.set(
        [
          index & OPAQUE,
          (index >>> 8) & OPAQUE,
          (index >>> 16) * 128 + ((index * 17) & 127),
          OPAQUE,
        ],
        index * CHANNELS,
      );
    const output = samplePixelation(image, 17, 19, PixelationMethod.TwoStage);
    // Recorded on the pre-optimization 27a17deac implementation, with 66,049 distinct RGB colours.
    expect(createHash("sha256").update(output.data).digest("hex")).toBe(
      "a3890745fd6547b0354e39ecae44f9f16638d52df3a3a9513b6727184a1225f0",
    );
  });
});
