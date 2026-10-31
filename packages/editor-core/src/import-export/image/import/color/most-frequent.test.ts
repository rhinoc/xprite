import { describe, expect, it } from "vitest";

import { pixelateImage } from "$/import-export/image/import/pixelate";
import { PixelationMethod } from "$/import-export/image/import/types";

describe("shared image pixelation sampling", () => {
  it("preserves partial alpha when retaining an existing pixel grid", () => {
    const source = { width: 1, height: 1, data: new Uint8ClampedArray([40, 80, 120, 64]) };
    expect(
      pixelateImage(source, {
        method: PixelationMethod.MostFrequent,
        targetWidth: 1,
        targetHeight: 1,
      }).data,
    ).toEqual(source.data);
  });
  it("distinguishes one-pixel, most-frequent-color and area-average sampling", () => {
    const source = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
    };
    const before = source.data.slice();
    expect([
      ...pixelateImage(source, {
        targetWidth: 1,
        targetHeight: 1,
        method: PixelationMethod.Nearest,
        alphaMode: "premultiplied",
      }).data,
    ]).toEqual([0, 255, 0, 255]);
    expect([
      ...pixelateImage(source, {
        targetWidth: 1,
        targetHeight: 1,
        method: PixelationMethod.MostFrequent,
        alphaMode: "premultiplied",
      }).data,
    ]).toEqual([255, 0, 0, 255]);
    expect([
      ...pixelateImage(source, {
        targetWidth: 1,
        targetHeight: 1,
        method: PixelationMethod.Box,
        alphaMode: "premultiplied",
      }).data,
    ]).toEqual([191, 64, 0, 255]);
    expect(source.data).toEqual(before);
  });
  it("treats transparent pixels as empty votes and excludes hidden RGB from average colors", () => {
    const source = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 255]),
    };
    expect([
      ...pixelateImage(source, {
        targetWidth: 1,
        targetHeight: 1,
        method: PixelationMethod.MostFrequent,
        alphaMode: "premultiplied",
      }).data,
    ]).toEqual([0, 0, 0, 0]);
    expect([
      ...pixelateImage(source, {
        targetWidth: 1,
        targetHeight: 1,
        method: PixelationMethod.Box,
        alphaMode: "premultiplied",
      }).data,
    ]).toEqual([0, 255, 0, 64]);
  });
});
