import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  composeLayout,
  DEFAULT_LAYOUT,
  EXPORT_FRAMES,
  EXPORT_RATIOS,
  ExportFrame,
  ExportRatio,
  exportSize,
  frameThumbnail,
  samplePixels,
} from "$/managers/minitool/composition";
import { placementRect, type Rect } from "$/managers/minitool/split-geometry";

const grid = { width: 54, height: 64 };
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe("export composition", () => {
  it("exports 1080 wide at each ratio, 3:4 frameless by default", () => {
    assert.deepEqual(DEFAULT_LAYOUT, { ratio: ExportRatio.Portrait, frame: ExportFrame.None });
    assert.deepEqual(exportSize(ExportRatio.Portrait), { width: 1080, height: 1440 });
    assert.deepEqual(exportSize(ExportRatio.Square), { width: 1080, height: 1080 });
    assert.deepEqual(exportSize(ExportRatio.Story), { width: 1080, height: 1920 });
  });

  it("offers the retro frames and no modern devices", () => {
    assert.deepEqual(EXPORT_FRAMES, [
      ExportFrame.None,
      ExportFrame.MacOS8,
      ExportFrame.System7,
      ExportFrame.Windows95,
      ExportFrame.OldPhone,
      ExportFrame.Handheld,
      ExportFrame.Crt,
      ExportFrame.Polaroid,
    ]);
  });

  it("fills a frameless export edge to edge", () => {
    const plain = composeLayout(DEFAULT_LAYOUT, grid);
    assert.deepEqual(plain.visible, { x: 0, y: 0, width: 1080, height: 1440 });
    assert.ok(Number.isInteger(plain.placement.cell));
  });

  it("draws frames at whole units around whole-pixel blocks, inside the canvas", () => {
    for (const ratio of EXPORT_RATIOS)
      for (const frame of EXPORT_FRAMES.filter((value) => value !== ExportFrame.None)) {
        const composition = composeLayout({ ratio, frame }, grid);
        const canvas = { x: 0, y: 0, ...composition.size };
        const name = `${ratio} ${frame}`;
        assert.ok(composition.fits, name);
        assert.ok(Number.isInteger(composition.placement.cell), name);
        assert.ok(composition.placement.cell >= 4, name);
        assert.ok(composition.frame.kind !== ExportFrame.None);
        assert.ok(Number.isInteger(composition.frame.unit) && composition.frame.unit >= 3, name);
        assert.ok(inside(composition.frame.body, canvas), name);
        // No letterboxing: the picture is exactly its blocks.
        assert.deepEqual(composition.visible, placementRect(composition.placement), name);
        assert.ok(inside(composition.area, composition.frame.body), name);
      }
  });

  it("fits thumbnails at one device pixel per frame pixel, sampling large pictures", () => {
    for (const frame of EXPORT_FRAMES) {
      const { composition, factor } = frameThumbnail(
        { ratio: ExportRatio.Portrait, frame },
        { width: 128, height: 128 },
        { width: 124, height: 166 },
      );
      assert.ok(composition.fits, frame);
      assert.ok(factor >= 1);
      if (composition.frame.kind !== ExportFrame.None) assert.equal(composition.frame.unit, 1);
    }
  });

  it("samples every nth pixel", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).map((_, index) => index);
    const sampled = samplePixels({ width: 4, height: 4, data }, 2);
    assert.equal(sampled.width, 2);
    assert.equal(sampled.height, 2);
    assert.deepEqual([...sampled.data.subarray(4, 8)], [8, 9, 10, 11]);
    assert.deepEqual([...sampled.data.subarray(8, 12)], [32, 33, 34, 35]);
  });
});
