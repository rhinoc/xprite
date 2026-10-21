import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  sprite,
  texturePhoto,
  upscaleBilinear,
  vectorShapes,
} from "$/import-export/image/import/grid-test-images";
import { labToRgb8, rgbToLab8 } from "$/import-export/image/import/line-guided/cv-lab";
import { rgbToGray8 } from "$/import-export/image/import/line-guided/cv-ops";
import { pixeloeGrid, runPixeloe } from "$/import-export/image/import/line-guided/pixeloe-entry";
import REFERENCE from "$/import-export/image/import/line-guided/pixeloe-reference.json";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  detectWithAlgorithm,
  getAlgorithmEntry,
  getListedAlgorithms,
  openingAlgorithm,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import {
  CellColorPicker,
  LineGuideMode,
  PixelationAlgorithm,
} from "$/import-export/image/import/types";

const { Pixeloe, PixeloeLines } = PixelationAlgorithm;
const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
const rgbOf = (image: PixelBuffer) => {
  const rgb = new Uint8Array(image.width * image.height * 3);
  for (let i = 0; i < image.width * image.height; i++)
    rgb.set(image.data.subarray(i * 4, i * 4 + 3), i * 3);
  return rgb;
};
/** Share of pixels whose RGB differs. */
const differing = (a: Uint8Array, b: Uint8Array) => {
  let count = 0;
  for (let i = 0; i < a.length; i += 3)
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
  return count / (a.length / 3);
};
const MODES: Record<string, LineGuideMode | undefined> = {
  plain: undefined,
  union: LineGuideMode.Union,
  replace: LineGuideMode.Replace,
};
/**
 * NumPy's exp (Intel SVML on the reference machine) and JS Math.exp differ in the last bit for a
 * few percent of inputs. In flat areas PixelOE truncates `a * w + a * (1 - w)`, which sits right at
 * an integer, so such a bit can move a pixel by one level, and the contrast pick can then choose a
 * different pixel. Replace mode never takes the sigmoid of PixelOE's weight and matches exactly.
 */
const EXP_ROUNDING_SHARE = 0.02;
const FIXTURES: Record<string, () => PixelBuffer> = {
  shapes: () => vectorShapes(150, 120),
  sprite: () => upscaleBilinear(sprite(40), 4),
  texture: () => texturePhoto(130, 97),
};

describe("OpenCV ports", () => {
  test("Lab and grey conversions match cv2 5.0 bit for bit", () => {
    const { color } = REFERENCE;
    expect(rgbToLab8(bytes(color.rgb))).toEqual(bytes(color.rgbToLab));
    expect(labToRgb8(bytes(color.lab))).toEqual(bytes(color.labToRgb));
    expect(rgbToGray8(bytes(color.rgb))).toEqual(bytes(color.gray));
  });
});

describe("PixelOE against the Python reference", () => {
  for (const [key, expected] of Object.entries(REFERENCE.outputs)) {
    const [name, , mode] = key.split("/");
    test(key, () => {
      const image = FIXTURES[name]();
      const grid = pixeloeGrid(image, { width: expected.width, height: expected.height });
      const out = runPixeloe(image, grid, MODES[mode]);
      expect([out.width, out.height]).toEqual([expected.width, expected.height]);
      const share = differing(rgbOf(out), bytes(expected.rgb));
      if (mode === "replace" || name === "texture") expect(share).toBe(0);
      else expect(share).toBeLessThanOrEqual(EXP_ROUNDING_SHARE);
    });
  }
});

describe("PixelOE entries", () => {
  const image = vectorShapes(150, 120);
  test("both are listed, run their own pipeline, and only one reads the line guide", () => {
    expect(getListedAlgorithms()).toEqual(expect.arrayContaining([Pixeloe, PixeloeLines]));
    expect(getAlgorithmEntry(Pixeloe)).toMatchObject({ standalone: true, lineGuided: false });
    expect(getAlgorithmEntry(PixeloeLines)).toMatchObject({ standalone: true, lineGuided: true });
    expect(getAlgorithmEntry(PixelationAlgorithm.CustomSize).standalone).toBe(false);
  });
  test("size like PixelOE for a 64 px target (64 x 64 pixels in total), or as asked", () => {
    expect(detectWithAlgorithm(image, PixeloeLines)).toMatchObject({
      width: 71,
      height: 57,
      reliable: true,
      algorithm: PixeloeLines,
    });
    expect(detectWithAlgorithm(image, Pixeloe, { width: 40, height: 32 })).toMatchObject({
      width: 40,
      height: 32,
    });
  });
  test("pixelateImage runs the guide mode and ignores the pre-pass and colour rule", () => {
    const grid = detectWithAlgorithm(image, PixeloeLines, { width: 30, height: 24 });
    const run = (options: object) => pixelateImage(image, { grid, ...options });
    const union = run({ lineGuide: LineGuideMode.Union });
    expect(run({})).toEqual(union);
    expect(run({ pixeloePrepass: true, colorPicker: CellColorPicker.Median })).toEqual(union);
    expect(run({ lineGuide: LineGuideMode.Replace }).data).not.toEqual(union.data);
    const plain = pixelateImage(image, {
      grid: detectWithAlgorithm(image, Pixeloe, { width: 30, height: 24 }),
      lineGuide: LineGuideMode.Replace,
    });
    expect(plain.data).not.toEqual(union.data);
    expect([plain.width, plain.height]).toEqual([30, 24]);
  });
  test("transparent cells stay empty and drawn cells opaque", () => {
    const art = upscaleBilinear(sprite(40), 4);
    for (let y = 0; y < art.height; y++)
      for (let x = 0; x < 40; x++) art.data[(y * art.width + x) * 4 + 3] = 0;
    const out = runPixeloe(art, pixeloeGrid(art, { width: 32, height: 32 }), LineGuideMode.Union);
    const alpha = (x: number, y: number) => out.data[(y * out.width + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(31, 31)).toBe(255);
    expect(out.data.every((v, i) => i % 4 !== 3 || v === 0 || v === 255)).toBe(true);
  });
  test("an image without a pixel grid opens on line-guided PixelOE", () => {
    expect(openingAlgorithm(detectWithAlgorithm(image))).toBe(PixeloeLines);
    expect(openingAlgorithm({ ...detectWithAlgorithm(image), reliable: true })).toBe(
      PixelationAlgorithm.Auto,
    );
  });
});

// The reference images are not in the repository. Point XPRITE_LINEGUIDED_REFS at the dumps of the
// Python reference (<name>/input.rgb, meta.json, t64|t48/{v0,xdog_union,xdog_replace}.rgb).
const references = process.env.XPRITE_LINEGUIDED_REFS;
describe.skipIf(!references || !existsSync(`${references}/chibi/meta.json`))(
  "reference images",
  () => {
    const load = (name: string): PixelBuffer => {
      const { width, height } = JSON.parse(readFileSync(`${references}/${name}/meta.json`, "utf8"));
      const rgb = readFileSync(`${references}/${name}/input.rgb`);
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      for (let i = 0; i < width * height; i++) data.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
      return { width, height, data };
    };
    for (const name of ["chibi", "griffith"])
      for (const target of [64, 48])
        for (const [file, mode] of [
          ["v0", "plain"],
          ["xdog_union", "union"],
          ["xdog_replace", "replace"],
        ])
          test(`${name} ${target} ${mode}`, () => {
            const image = load(name);
            const dir = `${references}/${name}/t${target}`;
            const [width, height] = JSON.parse(readFileSync(`${dir}/meta.json`, "utf8")).out;
            const out = runPixeloe(image, pixeloeGrid(image, { width, height }), MODES[mode]);
            const share = differing(rgbOf(out), new Uint8Array(readFileSync(`${dir}/${file}.rgb`)));
            console.info(`${name} ${target} ${mode}: ${(share * 100).toFixed(3)}% pixels differ`);
            expect(share).toBeLessThanOrEqual(EXP_ROUNDING_SHARE);
          });
  },
);
