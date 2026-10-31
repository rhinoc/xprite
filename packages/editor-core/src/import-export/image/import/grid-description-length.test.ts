import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  CutModel,
  describeImage,
  descriptionLength,
} from "$/import-export/image/import/grid-description-length";
import {
  resampleBilinear,
  softBilinear,
  sprite,
} from "$/import-export/image/import/grid-test-images";

const CHANNELS = 4;
const OPAQUE = 255;
const SCORE_PRECISION = 12;
const SOFT_SCALE = 6;
const SPARSE_WIDTH = 1024;
const SPARSE_HEIGHT = 513;
const MODELS = [CutModel.Lattice, CutModel.Snapped, CutModel.Free] as const;

enum DescriptorCase {
  Constant = "constant",
  Smooth = "smooth",
  CroppedAlpha = "cropped-alpha",
  Fractional = "fractional",
  SoftenedNarrow = "softened-narrow",
  SoftenedWide = "softened-wide",
  SparseRows = "sparse-rows",
}

interface DescriptorFixture {
  name: DescriptorCase;
  image: () => PixelBuffer;
  cutsX: readonly number[];
  cutsY: readonly number[];
}

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly number[],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * CHANNELS);
  return { width, height, data };
}

function croppedAlpha(): PixelBuffer {
  return image(31, 27, (x, y) => {
    const inside = x >= 5 && x < 26 && y >= 4 && y < 23;
    const visible = inside && (x === 5 || x === 25 || y === 4 || y === 22 || (x + y) % 5 === 0);
    return visible
      ? [200, (x * 17) % 256, (y * 29) % 256, [64, 128, OPAQUE][(x + y) % 3]]
      : [(x * 41) % 256, (y * 43) % 256, (x + y) % 256, 0];
  });
}

const softCuts = Array.from({ length: 9 }, (_, i) => i * SOFT_SCALE);
const fixtures: readonly DescriptorFixture[] = [
  {
    name: DescriptorCase.Constant,
    image: () => image(24, 18, () => [0, 0, 0, OPAQUE]),
    cutsX: [0, 6, 12, 18, 24],
    cutsY: [0, 6, 12, 18],
  },
  {
    name: DescriptorCase.Smooth,
    image: () => image(37, 29, (x, y) => [x * 3, y * 5, (x + y) * 2, OPAQUE]),
    cutsX: [0, 6, 11, 18, 26, 37],
    cutsY: [0, 7, 14, 21, 29],
  },
  {
    name: DescriptorCase.CroppedAlpha,
    image: croppedAlpha,
    cutsX: [0, 5, 9, 13, 17, 21, 26, 31],
    cutsY: [0, 4, 9, 14, 18, 23, 27],
  },
  {
    name: DescriptorCase.Fractional,
    image: () =>
      image(23, 17, (x, y) => [
        (x * 37 + y * 11) % 256,
        (x * 9 + y * 23) % 256,
        ((x - y) * 31 + 512) % 256,
        (x + y) % 3 ? 160 : OPAQUE,
      ]),
    cutsX: [0, 3.25, 8.5, 14.75, 23],
    cutsY: [0, 4.5, 10.25, 17],
  },
  {
    name: DescriptorCase.SoftenedNarrow,
    image: () => softBilinear(sprite(8), SOFT_SCALE, 1.2),
    cutsX: softCuts,
    cutsY: softCuts,
  },
  {
    name: DescriptorCase.SoftenedWide,
    image: () => softBilinear(sprite(8), SOFT_SCALE, 2),
    cutsX: softCuts,
    cutsY: softCuts,
  },
  {
    name: DescriptorCase.SparseRows,
    image: () =>
      image(SPARSE_WIDTH, SPARSE_HEIGHT, (x, y) => [x % 251, y % 241, (x + y) % 239, OPAQUE]),
    cutsX: Array.from({ length: 65 }, (_, i) => i * 16),
    cutsY: Array.from({ length: 34 }, (_, i) => Math.round((i * SPARSE_HEIGHT) / 33)),
  },
];

// Recorded with the original descriptor before the rendering-loop optimizations.
const BASELINE_LENGTHS: Record<DescriptorCase, readonly [number, number, number]> = {
  constant: [1.4156040067584976, 4.107003400404462, 2.510568126842309],
  smooth: [1.585643110169862, 3.111021438458441, 2.283175771462521],
  "cropped-alpha": [4.018876178982638, 10.497131223220288, 6.612324201567761],
  fractional: [4.085506688629101, 7.059124433015436, 5.278455819092348],
  "softened-narrow": [1.5456975097768069, 2.9859426735746015, 2.259425227550246],
  "softened-wide": [1.6567533731552242, 3.096998536953019, 2.3704810909286635],
  "sparse-rows": [2.878243120465179, 2.9198649550937597, 2.9126970950719655],
};

const nearTieImage = () => resampleBilinear(sprite(12), SOFT_SCALE);
const nearTieCutsX = Array.from({ length: 13 }, (_, i) =>
  i === 0 || i === 12 ? i * SOFT_SCALE : i * SOFT_SCALE + 0.25,
);
const nearTieCutsY = Array.from({ length: 13 }, (_, i) => i * SOFT_SCALE);
const perturbedCutsX = nearTieCutsX.map((x, i) => (i === 6 ? x + 1e-6 : x));
const NEAR_TIE_LENGTHS = [1.6003974340615794, 1.6003975122437684] as const;

describe("grid description lengths", () => {
  test.each(fixtures)("retains the $name description across all cut models", (fixture) => {
    const source = fixture.image();
    const original = source.data.slice();
    const description = describeImage(source);
    for (const [index, model] of MODELS.entries())
      expect(
        descriptionLength(description, {
          cutsX: fixture.cutsX,
          cutsY: fixture.cutsY,
          model,
          radiusX: 2,
          radiusY: 3,
        }),
      ).toBeCloseTo(BASELINE_LENGTHS[fixture.name][index], SCORE_PRECISION);
    expect(source.data).toEqual(original);
    if (fixture.name === DescriptorCase.Constant) {
      expect(description.values.every((value) => value === 0)).toBe(true);
      expect([
        description.left,
        description.top,
        description.content.width,
        description.content.height,
      ]).toEqual([0, 0, 24, 18]);
    }
    if (fixture.name === DescriptorCase.SparseRows) {
      expect(description.lines).toHaveLength(512);
      expect([description.lines[0], description.lines[description.lines.length - 1]]).toEqual([
        0, 512,
      ]);
      expect(description.lines).not.toContain(256);
      expect(description.samples).toBe(512 * SPARSE_WIDTH * 3);
    }
  });

  test("transparent RGB does not change cropped premultiplied colors or scores", () => {
    const source = croppedAlpha();
    const changed = { ...source, data: source.data.slice() };
    for (let offset = 0; offset < changed.data.length; offset += CHANNELS)
      if (!changed.data[offset + 3]) changed.data.set([OPAQUE, 1, 250], offset);
    const original = describeImage(source);
    const hiddenRgbChanged = describeImage(changed);
    expect([original.left, original.top, original.content.width, original.content.height]).toEqual([
      5, 4, 21, 19,
    ]);
    expect(hiddenRgbChanged.values).toEqual(original.values);
    const fixture = fixtures.find(({ name }) => name === DescriptorCase.CroppedAlpha)!;
    for (const model of MODELS) {
      const cuts = { cutsX: fixture.cutsX, cutsY: fixture.cutsY, model, radiusX: 2, radiusY: 3 };
      expect(descriptionLength(hiddenRgbChanged, cuts)).toBe(descriptionLength(original, cuts));
    }
  });

  test("close fractional phases preserve their score ordering", () => {
    const description = describeImage(nearTieImage());
    const base = descriptionLength(description, {
      cutsX: nearTieCutsX,
      cutsY: nearTieCutsY,
      model: CutModel.Lattice,
    });
    const perturbed = descriptionLength(description, {
      cutsX: perturbedCutsX,
      cutsY: nearTieCutsY,
      model: CutModel.Lattice,
    });
    expect(base).toBeCloseTo(NEAR_TIE_LENGTHS[0], SCORE_PRECISION);
    expect(perturbed).toBeCloseTo(NEAR_TIE_LENGTHS[1], SCORE_PRECISION);
    expect(Math.abs(base - perturbed)).toBeGreaterThan(0);
    expect(Math.abs(base - perturbed)).toBeLessThan(1e-7);
    expect(base < perturbed).toBe(NEAR_TIE_LENGTHS[0] < NEAR_TIE_LENGTHS[1]);
  });
});
