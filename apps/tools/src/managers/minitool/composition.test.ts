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
} from "$/managers/minitool/composition";
import { placementRect, type Rect } from "$/managers/minitool/split-geometry";

const grid = { width: 54, height: 64 };
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1e-6 &&
  inner.y >= outer.y - 1e-6 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-6;

describe("export composition", () => {
  it("exports 1080 wide at each ratio, 3:4 frameless by default", () => {
    assert.deepEqual(DEFAULT_LAYOUT, { ratio: ExportRatio.Portrait, frame: ExportFrame.None });
    assert.deepEqual(exportSize(ExportRatio.Portrait), { width: 1080, height: 1440 });
    assert.deepEqual(exportSize(ExportRatio.Square), { width: 1080, height: 1080 });
    assert.deepEqual(exportSize(ExportRatio.Story), { width: 1080, height: 1920 });
  });

  it("scales blocks by whole pixels and keeps them in the canvas", () => {
    for (const ratio of EXPORT_RATIOS) {
      for (const frame of EXPORT_FRAMES) {
        const composition = composeLayout({ ratio, frame }, grid);
        const canvas = { x: 0, y: 0, ...composition.size };
        assert.ok(Number.isInteger(composition.placement.cell), `${ratio} ${frame}`);
        assert.ok(composition.placement.cell >= 1);
        assert.ok(inside(composition.visible, composition.area), `${ratio} ${frame}`);
        assert.ok(inside(composition.area, canvas), `${ratio} ${frame}`);
        if (composition.frame.kind === ExportFrame.Laptop)
          assert.ok(inside(composition.frame.base, canvas), `${ratio} laptop base`);
      }
    }
  });

  it("fills a frameless export and shows every block in framed ones", () => {
    const plain = composeLayout(DEFAULT_LAYOUT, grid);
    assert.deepEqual(plain.visible, { x: 0, y: 0, width: 1080, height: 1440 });
    for (const frame of [ExportFrame.MacOS8, ExportFrame.Phone, ExportFrame.Laptop]) {
      const composition = composeLayout({ ratio: ExportRatio.Portrait, frame }, grid);
      assert.deepEqual(composition.visible, placementRect(composition.placement), frame);
    }
  });

  it("watermarks only device frames, never frameless exports", () => {
    const watermark = (frame: ExportFrame) =>
      composeLayout({ ratio: ExportRatio.Portrait, frame }, grid).watermark !== null;
    assert.equal(watermark(ExportFrame.None), false);
    assert.equal(watermark(ExportFrame.Phone), true);
    assert.equal(watermark(ExportFrame.Laptop), true);
  });
});
