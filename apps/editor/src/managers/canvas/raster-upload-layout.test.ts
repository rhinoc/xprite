import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { rasterUploadLayout } from "$/managers/canvas/raster-upload-layout";

describe("cel upload margins", () => {
  it("keeps the document edges for full rasters and pads small cels at fractional scales", () => {
    const document = { width: 2048, height: 2048 };
    assert.deepEqual(rasterUploadLayout({ x: 0, y: 0, pixels: document }, document, 0.25), {
      x: 0,
      y: 0,
      width: 2048,
      height: 2048,
      writeX: 0,
      writeY: 0,
    });
    assert.deepEqual(
      rasterUploadLayout({ x: 20, y: 30, pixels: { width: 3, height: 4 } }, document, 0.25),
      { x: 15, y: 25, width: 13, height: 14, writeX: 5, writeY: 5 },
    );
  });

  it("clips source offsets without admitting pixels outside the document", () => {
    const document = { width: 32, height: 32 };
    const clipped = rasterUploadLayout(
      { x: -4, y: 30, pixels: { width: 12, height: 8 } },
      document,
      2,
    );
    assert.deepEqual(clipped, { x: 0, y: 28, width: 10, height: 4, writeX: -4, writeY: 2 });
    const outside = rasterUploadLayout(
      { x: 40, y: 40, pixels: { width: 2, height: 2 } },
      document,
      2,
    );
    assert.equal(outside.width, 0);
    assert.equal(outside.height, 0);
  });
});
