import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { fieldChanceEvidence, phaseField } from "$/import-export/image/import/grid-phase-field";
import { materializeGridImage } from "$/import-export/image/import/grid-sampling";
import { StripImage } from "$/import-export/image/import/grid-strip-shift";

const STRIDE = 4;
const PITCH = 4;
const CELLS_PER_BAND = 8;
const DRIFT = 2;
const DRIFT_PERIOD = 23;
const digest = (data: Uint8ClampedArray | string): string =>
  createHash("sha256").update(data).digest("hex");
type Field = NonNullable<ReturnType<typeof phaseField>>;

/** Each group of eight columns follows a different row drift, with deterministic cell colors. */
function bandWarp(cells: number): PixelBuffer {
  const width = cells * PITCH;
  const source = new Uint8ClampedArray(cells * cells * STRIDE);
  let state = 7;
  for (let i = 0; i < source.length; i += STRIDE) {
    for (let c = 0; c < STRIDE - 1; c++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      source[i + c] = state >>> 24;
    }
    source[i + STRIDE - 1] = 255;
  }
  const data = new Uint8ClampedArray(width * width * STRIDE);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const band = Math.floor(x / (CELLS_PER_BAND * PITCH));
      const shift = Math.round(
        DRIFT * Math.sin((2 * Math.PI * y) / DRIFT_PERIOD + (band * Math.PI) / 2),
      );
      const sx = Math.max(0, Math.min(cells - 1, Math.floor((x - shift) / PITCH)));
      const from = (Math.floor(y / PITCH) * cells + sx) * STRIDE;
      data.set(source.subarray(from, from + STRIDE), (y * width + x) * STRIDE);
    }
  return { width, height: width, data };
}

const regularCuts = (cells: number): number[] =>
  Array.from({ length: cells + 1 }, (_, i) => i * PITCH);
const offsetCuts = (cells: number): number[] => [
  0,
  ...Array.from({ length: cells }, (_, i) => 1 + i * PITCH),
  cells * PITCH,
];

function readField(strips: StripImage, x: number[], y: number[]): Field {
  const field = phaseField(strips, x, y);
  expect(field).not.toBeNull();
  return field!;
}

function expectSameField(actual: Field, expected: Field): void {
  expect([actual.bandsX, actual.bandsY]).toEqual([expected.bandsX, expected.bandsY]);
  expect(actual.cost).toBeCloseTo(expected.cost, 10);
  expect(actual.straight.sampling).toEqual(expected.straight.sampling);
  expect(materializeGridImage(actual.straight).data).toEqual(
    materializeGridImage(expected.straight).data,
  );
  const actualTwin = actual.twin();
  const expectedTwin = expected.twin();
  expect(actualTwin.sampling).toEqual(expectedTwin.sampling);
  expect(materializeGridImage(actualTwin).data).toEqual(materializeGridImage(expectedTwin).data);
}

/** Full-RGBA and inverse-map fingerprints recorded from 27a17deac. */
const CASES = [
  {
    cells: 8,
    cost: 52.91475179386861,
    bandsX: 1,
    bandsY: 1,
    straight: "243785022d7ba0e66d969b92f330270723748ae91e2085e94b6887eabf0a6b1a",
    twin: "61aa19eb7e45cc5d832d82925f4613de16082f1515af9f5410407baf7801c828",
    mapping: "6de950d3d06176b7bfabed11130ace51de40ed104daa2e724320133ce34d82a4",
    chance: 0.3918700551448048,
  },
  {
    cells: 16,
    cost: 2083.9832306902263,
    bandsX: 2,
    bandsY: 2,
    straight: "bb9b99a1df7b67ab14e4146feaa04aa8ab820b0deab5af12a10bda4d2e69124e",
    twin: "9104633c3c5ead6362f96ceaba15302477609b1a27f7f9e3aceb30d166dbec33",
    mapping: "b36b37b12a3cb92d1d040366dfadd99ec4594f4437214fc3be6b3efdf6679d77",
    chance: 0.14873975850411503,
  },
  {
    cells: 24,
    cost: 2308.1995678817516,
    bandsX: 3,
    bandsY: 1,
    straight: "29f6b0c94b7f392813e3ce117ba048d162fcdb547264fae1bba8320329562bdd",
    twin: "04cbcd89ad31eff75a3b2392cb133f17e11ad3ec08ead817535262172dc3aabe",
    mapping: "8d1e153eef1940c29eab308e9a048720cd5317b9a83d8c727d6d0ebad2a40208",
    chance: 0.2025758493080978,
  },
  {
    cells: 32,
    cost: 4204.394170976377,
    bandsX: 4,
    bandsY: 1,
    straight: "af5f26063de24bd5b5aa6d1637c655a49ab62d8e1a3a1bd10152da20c4377975",
    twin: "92546f791072332dc3de6c4bbd5bca957207896920044274beb2b3bbddc6736b",
    mapping: "3825e84e88ec735f01b629f9e9e33b3a75435a97ec22717752d1be74822dfa1f",
    chance: 0.14216042096294662,
  },
];

describe("phase-field energy prefixes and column reuse", () => {
  test.each(CASES)("preserves the $bandsX-band field and its off-pitch evidence", (expected) => {
    const image = bandWarp(expected.cells);
    const cuts = regularCuts(expected.cells);
    const strips = new StripImage(image);
    const field = readField(strips, cuts, cuts);
    expect([field.bandsX, field.bandsY]).toEqual([expected.bandsX, expected.bandsY]);
    expect(field.cost).toBeCloseTo(expected.cost, 10);
    expect(field.straight.sampling?.[0].bands).toEqual(
      Array.from({ length: expected.bandsX + 1 }, (_, i) => i * CELLS_PER_BAND * PITCH),
    );
    expect(digest(materializeGridImage(field.straight).data)).toBe(expected.straight);
    expect(digest(materializeGridImage(field.twin()).data)).toBe(expected.twin);
    expect(digest(JSON.stringify(field.straight.sampling ?? []))).toBe(expected.mapping);
    // Exercise every permitted split count even when the y field prefers fewer bands.
    const maximumBands = expected.cells / CELLS_PER_BAND;
    expect(fieldChanceEvidence(strips, cuts, cuts, maximumBands, maximumBands)).toBeCloseTo(
      expected.chance,
      12,
    );
  });

  test("changing y cuts keeps columns independent and old twins valid after x eviction", () => {
    const cells = 32;
    const image = bandWarp(cells);
    const cuts = regularCuts(cells);
    const shifted = offsetCuts(cells);
    const shared = new StripImage(image);
    const original = readField(shared, cuts, cuts);
    const expectedOriginal = readField(new StripImage(image), cuts, cuts);
    const expectedTwin = expectedOriginal.twin();
    const differentY = readField(shared, cuts, shifted);
    const expectedDifferentY = readField(new StripImage(image), cuts, shifted);
    expectSameField(differentY, expectedDifferentY);
    expect(original.straight.sampling).toEqual(expectedOriginal.straight.sampling);
    expect(materializeGridImage(original.straight).data).toEqual(
      materializeGridImage(expectedOriginal.straight).data,
    );

    // The returned twin keeps its own y anchor after the last x geometry changes.
    phaseField(shared, shifted, cuts);
    const evictedTwin = original.twin();
    expect(evictedTwin.sampling).toEqual(expectedTwin.sampling);
    expect(materializeGridImage(evictedTwin).data).toEqual(materializeGridImage(expectedTwin).data);

    // Reinserting the same x cuts creates a new table; previously returned twins remain valid.
    const restored = readField(shared, cuts, shifted);
    expectSameField(restored, expectedDifferentY);
    const oldTwin = original.twin();
    expect(oldTwin.sampling).toEqual(expectedTwin.sampling);
    expect(materializeGridImage(oldTwin).data).toEqual(materializeGridImage(expectedTwin).data);
  });
});
