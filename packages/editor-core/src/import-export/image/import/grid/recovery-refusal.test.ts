// @cpu-intensive
import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { detectWithAlgorithm } from "$/import-export/image/import/grid/registry";
import {
  boxBlur,
  detailedSprite,
  gradient,
  smoothPhoto,
  sprite,
  texturePhoto,
  vectorShapes,
} from "$/import-export/image/import/grid/test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { PixelationMode } from "$/import-export/image/import/types";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

const { Auto, EdgeGrid, UniformGrid } = PixelationAlgorithm;

describe("images that must be refused", () => {
  const refused: [string, PixelBuffer][] = [
    ["512x512 gradient", gradient(512, 512)],
    ["smooth photo-like field", smoothPhoto(512, 512)],
    ["blurred textured photo", boxBlur(texturePhoto(256, 256), 4)],
    ["textured photo", texturePhoto(512, 512)],
    ["hard-edged shapes with no grid", vectorShapes(512, 512)],
    ["native detailed pixel art", detailedSprite(220, 150, 1)],
    ["native blocky pixel art", sprite(200, 2)],
  ];
  for (const [name, image] of refused)
    test(name, () => {
      for (const algorithm of [Auto, EdgeGrid, UniformGrid])
        expect(detectWithAlgorithm(image, algorithm).reliable).toBe(false);
    });
  test("pixelateImage with Auto falls back to plain conversion instead of inventing a grid", () => {
    const image = gradient(256, 256);
    const out = pixelateImage(image, { algorithm: Auto });
    expect([out.width, out.height]).toEqual([256, 256]);
    expect(() =>
      pixelateImage(image, {
        algorithm: Auto,
        mode: PixelationMode.RecoverGrid,
      }),
    ).toThrow(/No consistent pixel grid/);
  });
});
