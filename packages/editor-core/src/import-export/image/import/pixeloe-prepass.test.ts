import { describe, expect, it } from "vitest";

import { pixelateImage } from "$/import-export/image/import/pixelate";
import { pixeloePrepass } from "$/import-export/image/import/pixeloe-prepass";
import { CellColorPicker, PixelationMode } from "$/import-export/image/import/types";

function gradient(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const v = x < width / 2 ? 40 : 220;
      data.set([v, v, (y * 255) / height, 255], o);
    }
  return { width, height, data };
}

describe("PixelOE pre-pass", () => {
  it("keeps dimensions and alpha, and changes pixels", () => {
    const image = gradient(32, 32);
    const out = pixeloePrepass(image, 8);
    expect([out.width, out.height]).toEqual([32, 32]);
    expect(out.data.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
    expect(out.data).not.toEqual(image.data);
  });
  it("is a no-op for cells under 2px", () => {
    const image = gradient(8, 8);
    expect(pixeloePrepass(image, 1)).toBe(image);
  });
  it("is independent of the colour picker and off by default", () => {
    const image = gradient(32, 32);
    const base = {
      mode: PixelationMode.Convert,
      blockPicker: true,
      targetWidth: 4,
      targetHeight: 4,
      colorPicker: CellColorPicker.Median,
    };
    const off = pixelateImage(image, base);
    const on = pixelateImage(image, { ...base, pixeloePrepass: true });
    expect(pixelateImage(image, { ...base, pixeloePrepass: false })).toEqual(off);
    expect(on.width).toBe(off.width);
    expect(on.data).not.toEqual(off.data);
  });
});
