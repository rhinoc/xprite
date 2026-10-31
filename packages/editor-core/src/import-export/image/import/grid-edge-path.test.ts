import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { edgePath } from "$/import-export/image/import/grid-edge-path";
import { clearSprite, generatedSprite } from "$/import-export/image/import/grid-test-images";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import { detectWithAlgorithm } from "$/import-export/image/import/pixelation-algorithm-registry";
import { PixelationAlgorithm, PixelationMode } from "$/import-export/image/import/types";

const ART = 36;
const MARGIN = 6;
const PITCH = 17;
const SPREAD = 0.18;

/** The box of the visible pixels: the clear margin has no cells to count. */
function box(image: PixelBuffer) {
  let left = image.width,
    top = image.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (image.data[(y * image.width + x) * 4 + 3] >= 128) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Share of the art's pixels the recovery returns at the right colour (alpha, then RGB within 32). */
function matched(art: PixelBuffer, out: PixelBuffer): number {
  const a0 = box(art),
    b0 = box(out);
  let hits = 0;
  for (let y = 0; y < art.height; y++)
    for (let x = 0; x < art.width; x++) {
      const a = (y * art.width + x) * 4,
        oy = y - a0.top + b0.top,
        ox = x - a0.left + b0.left;
      if (oy < 0 || ox < 0 || oy >= out.height || ox >= out.width) continue;
      const b = (oy * out.width + ox) * 4;
      const clear = art.data[a + 3] < 128;
      if (clear) {
        if (out.data[b + 3] < 128) hits++;
        continue;
      }
      if (out.data[b + 3] < 128) continue;
      let far = false;
      for (let c = 0; c < 3; c++) if (Math.abs(art.data[a + c] - out.data[b + c]) > 32) far = true;
      if (!far) hits++;
    }
  return hits / (art.width * art.height);
}

describe("edge paths", () => {
  test("follow steps that wander off a lattice", () => {
    const profile = new Float64Array(200);
    const edges = [10, 27, 45, 60, 79, 96, 112, 131, 147, 165];
    for (const e of edges) profile[e] = 10;
    const cuts = edgePath(profile, 17)!;
    for (const e of edges) expect(cuts).toContain(e);
  });

  test("keep the pitch across a stretch without steps", () => {
    const profile = new Float64Array(200);
    profile[20] = profile[180] = 10;
    const cuts = edgePath(profile, 20)!;
    const inner = cuts.slice(1, -1);
    for (let i = 1; i < inner.length; i++) {
      expect(inner[i] - inner[i - 1]).toBeGreaterThanOrEqual(15);
      expect(inner[i] - inner[i - 1]).toBeLessThanOrEqual(25);
    }
  });

  test("Auto restores a generated sprite whose cells wander around the pitch", () => {
    const art = clearSprite(ART);
    const image = generatedSprite(art, PITCH, SPREAD, MARGIN);
    const grid = detectWithAlgorithm(image, PixelationAlgorithm.Auto);
    expect(grid.reliable).toBe(true);
    const out = pixelateImage(image, { mode: PixelationMode.RecoverGrid, grid });
    const sprite = box(art),
      found = box(out);
    expect([found.width, found.height]).toEqual([sprite.width, sprite.height]);
    expect(matched(art, out)).toBeGreaterThan(0.95);
  });
});
