import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

import { FIXED_POINT_16_16_SCALE, UINT8_MAX } from "$/base/numeric-constants";
import {
  IccProfileKind,
  colorProfileToSrgb,
  convertPixelsBetweenProfiles,
  parseMatrixIcc,
} from "$/color/icc-profile";
import type { AsepriteColorProfile } from "$/import-export/aseprite/model";

const D50_ILLUMINANT = [0.9642, 1, 0.8249] as const;
const SRGB_D50 = [0x6fa2, 0x6299, 0x24a0, 0x38f5, 0xb785, 0x0f84, 0x0390, 0x18da, 0xb6cf].map(
  (value) => value / FIXED_POINT_16_16_SCALE,
);

function writeSignature(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
}

function writeFixed(view: DataView, offset: number, value: number): void {
  view.setInt32(offset, Math.round(value * FIXED_POINT_16_16_SCALE), false);
}

function buildIccBytes(
  space: "RGB " | "GRAY",
  tags: readonly (readonly [string, Uint8Array])[],
): Uint8Array {
  let size = 132 + tags.length * 12;
  const offsets = tags.map(([, tag]) => {
    const offset = size;
    size += Math.ceil(tag.length / 4) * 4;
    return offset;
  });
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, size, false);
  bytes[8] = 4;
  writeSignature(bytes, 12, "mntr");
  writeSignature(bytes, 16, space);
  writeSignature(bytes, 20, "XYZ ");
  writeSignature(bytes, 36, "acsp");
  D50_ILLUMINANT.forEach((v, i) => writeFixed(view, 68 + i * 4, v));
  view.setUint32(128, tags.length, false);
  tags.forEach(([name, tag], i) => {
    const offset = 132 + i * 12;
    writeSignature(bytes, offset, name);
    view.setUint32(offset + 4, offsets[i], false);
    view.setUint32(offset + 8, tag.length, false);
    bytes.set(tag, offsets[i]);
  });
  return bytes;
}

function gammaCurveTag(gamma: number): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  writeSignature(bytes, 0, "para");
  writeFixed(view, 12, gamma);
  return bytes;
}

function srgbParametricTag(): Uint8Array {
  const bytes = new Uint8Array(12 + 5 * 4);
  const view = new DataView(bytes.buffer);
  writeSignature(bytes, 0, "para");
  view.setUint16(8, 3, false);
  [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045].forEach((v, i) =>
    writeFixed(view, 12 + i * 4, v),
  );
  return bytes;
}

function tableCurveTag(count: number, gamma: number): Uint8Array {
  const bytes = new Uint8Array(12 + count * 2);
  const view = new DataView(bytes.buffer);
  writeSignature(bytes, 0, "curv");
  view.setUint32(8, count, false);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    view.setUint16(12 + i * 2, Math.round(Math.pow(t, gamma) * 65535), false);
  }
  return bytes;
}

function xyzTag(x: number, y: number, z: number): Uint8Array {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  writeSignature(bytes, 0, "XYZ ");
  writeFixed(view, 8, x);
  writeFixed(view, 12, y);
  writeFixed(view, 16, z);
  return bytes;
}

function matrixRgbProfile(trc: Uint8Array): AsepriteColorProfile {
  return {
    type: "icc",
    data: buildIccBytes("RGB ", [
      ["rXYZ", xyzTag(SRGB_D50[0], SRGB_D50[3], SRGB_D50[6])],
      ["gXYZ", xyzTag(SRGB_D50[1], SRGB_D50[4], SRGB_D50[7])],
      ["bXYZ", xyzTag(SRGB_D50[2], SRGB_D50[5], SRGB_D50[8])],
      ["rTRC", trc],
      ["gTRC", trc],
      ["bTRC", trc],
    ]),
  };
}

function matrixGrayProfile(trc: Uint8Array): AsepriteColorProfile {
  return {
    type: "icc",
    data: buildIccBytes("GRAY", [
      ["wtpt", xyzTag(D50_ILLUMINANT[0], D50_ILLUMINANT[1], D50_ILLUMINANT[2])],
      ["kTRC", trc],
    ]),
  };
}

function exactInvertCurve(curve: (x: number) => number, value: number): number {
  if (value <= curve(0)) return 0;
  if (value >= curve(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(mid) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

describe("color-profile-display", () => {
  it("preserves default sRGB values and alpha when converting display RGB", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/color/icc-profile.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { colorProfileToSrgb: bundledColorProfileToSrgb } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const value = [128, 128, 64, 128];
    const defaultSrgb = bundledColorProfileToSrgb(value, undefined);
    const explicitSrgb = bundledColorProfileToSrgb(value, { type: "srgb" });
    const gammaDisplay = bundledColorProfileToSrgb(value, { type: "srgb", gamma: 1 });

    assert.deepEqual(defaultSrgb, value);
    assert.deepEqual(explicitSrgb, value);
    assert.notDeepEqual(gammaDisplay.slice(0, 3), value.slice(0, 3));
    assert.equal(gammaDisplay[3], value[3]);
    assert.deepEqual(colorProfileToSrgb([128, 128, 64, 128], undefined), value);
  });

  it("matches exact binary-search TRC curve inversion across gamma, sRGB parametric, table, and gray profiles", () => {
    const decodeSrgb = (v: number) =>
      v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const rampData = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      rampData[i * 4] = i;
      rampData[i * 4 + 1] = 255 - i;
      rampData[i * 4 + 2] = (i * 7) & 255;
      rampData[i * 4 + 3] = 255;
    }
    const ramp = { width: 256, height: 1, data: rampData };

    const rgbTargets: [string, AsepriteColorProfile][] = [
      ["gamma-1.0", matrixRgbProfile(gammaCurveTag(1))],
      ["gamma-1.8", matrixRgbProfile(gammaCurveTag(1.8))],
      ["gamma-2.2", matrixRgbProfile(gammaCurveTag(2.2))],
      ["gamma-2.6", matrixRgbProfile(gammaCurveTag(2.6))],
      ["srgb-para", matrixRgbProfile(srgbParametricTag())],
      ["table-curv", matrixRgbProfile(tableCurveTag(256, 2.2))],
    ];

    for (const [label, target] of rgbTargets) {
      assert.equal(target.type, "icc");
      const parsed = parseMatrixIcc(target.data);
      assert.equal(parsed.kind, IccProfileKind.Matrix);
      const converted = convertPixelsBetweenProfiles(ramp, undefined, target);
      // Verify exact endpoints (0 -> 0, 255 -> 255).
      assert.equal(converted.data[0], 0, `${label}: black R`);
      assert.equal(converted.data[255 * 4], 255, `${label}: white R`);
      assert.equal(converted.data[1], 255, `${label}: white G`);
      assert.equal(converted.data[255 * 4 + 1], 0, `${label}: black G`);
      for (let i = 0; i < 256; i++) {
        for (let c = 0; c < 3; c++) {
          const linear = decodeSrgb(rampData[i * 4 + c] / UINT8_MAX);
          const expected = Math.round(exactInvertCurve(parsed.curves[c], linear) * UINT8_MAX);
          const actual = converted.data[i * 4 + c];
          assert.ok(
            Math.abs(actual - expected) <= 1,
            `${label} pixel ${i} channel ${c}: expected ${expected}, got ${actual}`,
          );
        }
      }
      // Second call hits the cached inverse curve LUT and stays bit-identical.
      const second = convertPixelsBetweenProfiles(ramp, undefined, target);
      assert.deepEqual(second.data, converted.data);
    }

    // Grayscale matrix/TRC profile inversion.
    const grayTarget = matrixGrayProfile(gammaCurveTag(2.2));
    assert.equal(grayTarget.type, "icc");
    const grayParsed = parseMatrixIcc(grayTarget.data);
    const grayConverted = convertPixelsBetweenProfiles(ramp, undefined, grayTarget);
    for (let i = 0; i < 256; i++) {
      const r = decodeSrgb(rampData[i * 4] / UINT8_MAX);
      const g = decodeSrgb(rampData[i * 4 + 1] / UINT8_MAX);
      const b = decodeSrgb(rampData[i * 4 + 2] / UINT8_MAX);
      const y = SRGB_D50[3] * r + SRGB_D50[4] * g + SRGB_D50[5] * b;
      const expected = Math.round(exactInvertCurve(grayParsed.curves[0], y) * UINT8_MAX);
      const actual = grayConverted.data[i * 4];
      assert.ok(
        Math.abs(actual - expected) <= 1,
        `gray pixel ${i}: expected ${expected}, got ${actual}`,
      );
      assert.equal(grayConverted.data[i * 4 + 1], actual);
      assert.equal(grayConverted.data[i * 4 + 2], actual);
    }

    // Large multi-color image sanity check (4096 distinct colors).
    const grid = 64;
    const bigData = new Uint8ClampedArray(grid * grid * 4);
    for (let i = 0; i < grid * grid; i++) {
      bigData[i * 4] = (i & 63) * 4;
      bigData[i * 4 + 1] = ((i >> 6) & 63) * 4;
      bigData[i * 4 + 2] = (i * 5) & 255;
      bigData[i * 4 + 3] = 255;
    }
    const bigOut = convertPixelsBetweenProfiles(
      { width: grid, height: grid, data: bigData },
      undefined,
      rgbTargets[2][1],
    );
    assert.equal(bigOut.data.length, bigData.length);
  });
});
