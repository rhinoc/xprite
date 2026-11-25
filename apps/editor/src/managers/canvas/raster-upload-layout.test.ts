import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildViewportSampleMaps,
  copyCroppedRasterPixels,
  isCroppedUploadCovered,
  planRasterUpload,
  RasterUploadMode,
  rasterUploadLayout,
  SAFE_CANVAS_UPLOAD_LIMITS,
  sampleViewportRasterPixels,
} from "$/managers/canvas/raster-upload-layout";

function fillPattern(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + 3) & 255;
      data[i + 1] = (y * 31 + 7) & 255;
      data[i + 2] = ((x ^ y) * 13) & 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

function readRgba(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

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

describe("viewport-clipped raster upload planning", () => {
  it("preserves exact full uploads for ordinary documents and small borrowed cels", () => {
    const document = { width: 4096, height: 4096 };
    const view = {
      viewport: { width: 850, height: 336 },
      origin: { x: -1200, y: -900 },
      zoom: 2,
      backingScale: 2,
      backingViewportRect: { x: 0, y: 0, width: 1700, height: 672 },
      tiledMode: 0 as const,
    };
    const full = planRasterUpload({
      raster: { x: 0, y: 0, pixels: document },
      document,
      view,
    });
    assert.deepEqual(full, {
      mode: RasterUploadMode.Full,
      ...rasterUploadLayout({ x: 0, y: 0, pixels: document }, document, 4),
    });

    const wideDoc = { width: 20480, height: 2560 };
    const smallCel = { x: 100, y: 200, pixels: { width: 64, height: 64 } };
    const smallPlan = planRasterUpload({
      raster: smallCel,
      document: wideDoc,
      view,
    });
    assert.deepEqual(smallPlan, {
      mode: RasterUploadMode.Full,
      ...rasterUploadLayout(smallCel, wideDoc, 4),
    });
  });

  it("clips wide 20480x2560 documents to the visible viewport with overscan and reuses cache while panning", () => {
    const document = { width: 20480, height: 2560 };
    const raster = { x: 0, y: 0, pixels: document };
    const baseView = {
      viewport: { width: 1280, height: 800 },
      origin: { x: -4000, y: -500 },
      zoom: 1,
      backingScale: 2,
      backingViewportRect: { x: 0, y: 0, width: 2560, height: 1600 },
      tiledMode: 0 as const,
    };

    const plan = planRasterUpload({ raster, document, view: baseView });
    assert.equal(plan.mode, RasterUploadMode.Cropped);
    assert.ok(plan.width <= SAFE_CANVAS_UPLOAD_LIMITS.maxDimension);
    assert.ok(plan.height <= SAFE_CANVAS_UPLOAD_LIMITS.maxDimension);
    assert.ok(plan.width * plan.height <= SAFE_CANVAS_UPLOAD_LIMITS.maxPixels);
    assert.ok(plan.x <= plan.visibleRect.x);
    assert.ok(plan.y <= plan.visibleRect.y);
    assert.ok(plan.x + plan.width >= plan.visibleRect.x + plan.visibleRect.width);
    assert.ok(plan.y + plan.height >= plan.visibleRect.y + plan.visibleRect.height);
    assert.equal(plan.writeX, -plan.x);
    assert.equal(plan.writeY, -plan.y);

    // Small pan within the 256px overscan reuses the cached cropped region.
    const smallPanView = { ...baseView, origin: { x: -4120, y: -580 } };
    assert.equal(
      isCroppedUploadCovered(
        { x: plan.x, y: plan.y, width: plan.width, height: plan.height },
        plan.fullRect,
        document,
        smallPanView,
      ),
      true,
    );
    const reused = planRasterUpload({
      raster,
      document,
      view: smallPanView,
      cachedCroppedRect: { x: plan.x, y: plan.y, width: plan.width, height: plan.height },
    });
    assert.equal(reused.mode, RasterUploadMode.Cropped);
    assert.equal(reused.x, plan.x);
    assert.equal(reused.y, plan.y);
    assert.equal(reused.width, plan.width);
    assert.equal(reused.height, plan.height);

    // Panning past the overscan margin invalidates and shifts the cropped window.
    const farPanView = { ...baseView, origin: { x: -12000, y: -500 } };
    assert.equal(
      isCroppedUploadCovered(
        { x: plan.x, y: plan.y, width: plan.width, height: plan.height },
        plan.fullRect,
        document,
        farPanView,
      ),
      false,
    );
    const shifted = planRasterUpload({
      raster,
      document,
      view: farPanView,
      cachedCroppedRect: { x: plan.x, y: plan.y, width: plan.width, height: plan.height },
    });
    assert.equal(shifted.mode, RasterUploadMode.Cropped);
    assert.ok(shifted.x > 11500 && shifted.x <= 12000);
    assert.ok(shifted.x + shifted.width >= 13280);
  });

  it("respects mobile/iOS safe pixel area limits even when both dimensions are below 16384", () => {
    const document = { width: 5000, height: 4000 }; // 20M px > 16.77M px
    const limits = { maxDimension: 1000, maxPixels: 500_000 };
    const plan = planRasterUpload({
      raster: { x: 0, y: 0, pixels: document },
      document,
      view: {
        viewport: { width: 980, height: 490 },
        origin: { x: -500, y: -200 },
        zoom: 1,
        backingScale: 2,
        backingViewportRect: { x: 0, y: 0, width: 1960, height: 980 },
        tiledMode: 0,
      },
      limits,
    });
    assert.equal(plan.mode, RasterUploadMode.Cropped);
    assert.ok(plan.width <= limits.maxDimension);
    assert.ok(plan.height <= limits.maxDimension);
    assert.ok(plan.width * plan.height <= limits.maxPixels);
    assert.ok(plan.x <= plan.visibleRect.x);
    assert.ok(plan.y <= plan.visibleRect.y);
    assert.ok(plan.x + plan.width >= plan.visibleRect.x + plan.visibleRect.width);
    assert.ok(plan.y + plan.height >= plan.visibleRect.y + plan.visibleRect.height);
  });

  it("returns an empty cropped plan when a large document is panned completely offscreen", () => {
    const document = { width: 20480, height: 2560 };
    const plan = planRasterUpload({
      raster: { x: 0, y: 0, pixels: document },
      document,
      view: {
        viewport: { width: 800, height: 600 },
        origin: { x: 5000, y: 5000 },
        zoom: 1,
        backingScale: 2,
        backingViewportRect: { x: 0, y: 0, width: 0, height: 0 },
        tiledMode: 0,
      },
    });
    assert.equal(plan.mode, RasterUploadMode.Cropped);
    assert.equal(plan.width, 0);
    assert.equal(plan.height, 0);
  });

  it("switches to viewport-resolution upload when zoomed out on a wide 20480x2560 document", () => {
    const document = { width: 20480, height: 2560 };
    const plan = planRasterUpload({
      raster: { x: 0, y: 0, pixels: document },
      document,
      view: {
        viewport: { width: 1280, height: 800 },
        origin: { x: 0, y: 320 },
        zoom: 0.0625, // 1/16 -> 1280x160 logical, 2560x320 backing
        backingScale: 2,
        backingViewportRect: { x: 0, y: 640, width: 2560, height: 320 },
        tiledMode: 0,
      },
    });
    assert.equal(plan.mode, RasterUploadMode.Viewport);
    assert.equal(plan.dstX, 0);
    assert.equal(plan.dstY, 640);
    assert.equal(plan.dstWidth, 2560);
    assert.equal(plan.dstHeight, 320);
    assert.equal(plan.width, 2560);
    assert.equal(plan.height, 320);
    assert.ok(plan.width * plan.height <= SAFE_CANVAS_UPLOAD_LIMITS.maxPixels);
  });

  it("clamps viewport-resolution canvas dimensions if even the backing viewport exceeds safe limits", () => {
    const document = { width: 20480, height: 2560 };
    const limits = { maxDimension: 1000, maxPixels: 200_000 };
    const plan = planRasterUpload({
      raster: { x: 0, y: 0, pixels: document },
      document,
      view: {
        viewport: { width: 2000, height: 1000 },
        origin: { x: 0, y: 0 },
        zoom: 0.0625,
        backingScale: 2,
        backingViewportRect: { x: 0, y: 0, width: 4000, height: 2000 },
        tiledMode: 0,
      },
      limits,
    });
    assert.equal(plan.mode, RasterUploadMode.Viewport);
    assert.ok(plan.width > 0 && plan.width <= limits.maxDimension);
    assert.ok(plan.height > 0 && plan.height <= limits.maxDimension);
    assert.ok(plan.width * plan.height <= limits.maxPixels);
  });

  it("handles tiled mode away from and across wrap seams on wide documents", () => {
    const document = { width: 20480, height: 2560 };
    const raster = { x: 0, y: 0, pixels: document };

    // Away from the wrap seam, only one tile intersects -> Cropped mode works.
    const centerPlan = planRasterUpload({
      raster,
      document,
      view: {
        viewport: { width: 800, height: 600 },
        origin: { x: -10000, y: -200 },
        zoom: 1,
        backingScale: 2,
        backingViewportRect: { x: 0, y: 0, width: 1600, height: 1200 },
        tiledMode: 1,
      },
    });
    assert.equal(centerPlan.mode, RasterUploadMode.Cropped);
    assert.ok(centerPlan.width <= SAFE_CANVAS_UPLOAD_LIMITS.maxDimension);

    // Across the X wrap seam (x near 20479 and x near 0 simultaneously), union width
    // spans the full 20480 document -> falls back seamlessly to Viewport mode.
    const seamPlan = planRasterUpload({
      raster,
      document,
      view: {
        viewport: { width: 800, height: 600 },
        origin: { x: -20080, y: -200 },
        zoom: 1,
        backingScale: 2,
        backingViewportRect: { x: 0, y: 0, width: 1600, height: 1200 },
        tiledMode: 1,
      },
    });
    assert.equal(seamPlan.mode, RasterUploadMode.Viewport);
    assert.equal(seamPlan.width, 1600);
    assert.equal(seamPlan.height, 1200);
    assert.deepEqual(seamPlan.tileBounds, { x: -20480, y: 0, width: 61440, height: 2560 });
  });
});

describe("cropped and viewport pixel copy helpers", () => {
  it("copies cropped regions accurately and clips partial dirty rects", () => {
    const srcW = 64;
    const srcH = 48;
    const source = { width: srcW, height: srcH, data: fillPattern(srcW, srcH) };
    const upload = { width: 20, height: 16, writeX: -10, writeY: -8 };
    const target = {
      width: upload.width,
      height: upload.height,
      data: new Uint8ClampedArray(upload.width * upload.height * 4),
    };

    const fullDirty = copyCroppedRasterPixels(source, target, upload);
    assert.deepEqual(fullDirty, { x: 0, y: 0, width: 20, height: 16 });
    assert.deepEqual(readRgba(target.data, 20, 0, 0), readRgba(source.data, srcW, 10, 8));
    assert.deepEqual(readRgba(target.data, 20, 19, 15), readRgba(source.data, srcW, 29, 23));

    // Dirty rect completely outside the cropped region produces null and leaves target intact.
    const outside = copyCroppedRasterPixels(source, target, upload, {
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });
    assert.equal(outside, null);

    // Mutate source inside the cropped window and apply a partial dirty rect partially crossing the border.
    const editedOffset = (10 * srcW + 12) * 4;
    source.data.set([11, 22, 33, 255], editedOffset);
    const partial = copyCroppedRasterPixels(source, target, upload, {
      x: 8,
      y: 9,
      width: 6,
      height: 4,
    });
    assert.deepEqual(partial, { x: 0, y: 1, width: 4, height: 4 });
    assert.deepEqual(readRgba(target.data, 20, 2, 2), [11, 22, 33, 255]);
  });

  it("clears transparent margins around cels when upload extends past source bounds", () => {
    const source = { width: 4, height: 4, data: fillPattern(4, 4) };
    const upload = { width: 8, height: 8, writeX: 2, writeY: 3 };
    const target = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4).fill(99),
    };
    copyCroppedRasterPixels(source, target, upload);
    assert.deepEqual(readRgba(target.data, 8, 0, 0), [0, 0, 0, 0]);
    assert.deepEqual(readRgba(target.data, 8, 7, 7), [0, 0, 0, 0]);
    assert.deepEqual(readRgba(target.data, 8, 2, 3), readRgba(source.data, 4, 0, 0));
    assert.deepEqual(readRgba(target.data, 8, 5, 6), readRgba(source.data, 4, 3, 3));
  });

  it("samples nearest-neighbor viewport pixels with tiled wrapping and partial dirty updates", () => {
    const document = { width: 16, height: 8 };
    const source = { width: 16, height: 8, data: fillPattern(16, 8) };
    const view = {
      viewport: { width: 8, height: 4 },
      origin: { x: -14, y: 0 },
      zoom: 1,
      backingScale: 2,
      backingViewportRect: { x: 0, y: 0, width: 16, height: 8 },
      tiledMode: 1 as const,
    };
    const plan = planRasterUpload({
      raster: { x: 0, y: 0, pixels: document },
      document,
      view,
      // Force Viewport mode on a small test fixture.
      limits: { maxDimension: 12, maxPixels: 256 },
    });
    assert.equal(plan.mode, RasterUploadMode.Viewport);
    const maps = buildViewportSampleMaps(
      plan,
      { x: 0, y: 0, width: source.width, height: source.height },
      document,
      view,
    );
    const target = {
      width: plan.width,
      height: plan.height,
      data: new Uint8ClampedArray(plan.width * plan.height * 4),
    };
    const fullDirty = sampleViewportRasterPixels(source, target, maps);
    assert.deepEqual(fullDirty, { x: 0, y: 0, width: plan.width, height: plan.height });

    // Every sampled pixel matches the exact nearest-neighbor wrapped document pixel.
    for (let oy = 0; oy < plan.height; oy++) {
      for (let ox = 0; ox < plan.width; ox++) {
        const sx = maps.colMap[ox];
        const sy = maps.rowMap[oy];
        assert.deepEqual(
          readRgba(target.data, plan.width, ox, oy),
          sx < 0 || sy < 0 ? [0, 0, 0, 0] : readRgba(source.data, source.width, sx, sy),
        );
      }
    }
    // Verify wrap across seam: first column samples near x = 14, later columns wrap to x = 0..5.
    assert.equal(maps.colMap[0], 14);
    assert.ok(maps.colMap.includes(0));
    assert.ok(maps.colMap.includes(15));

    // Mutate pixel (0, 1) and run a partial dirty update.
    source.data.set([200, 100, 50, 255], (1 * source.width + 0) * 4);
    const partial = sampleViewportRasterPixels(source, target, maps, {
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
    assert.ok(partial !== null);
    for (let oy = 0; oy < plan.height; oy++) {
      for (let ox = 0; ox < plan.width; ox++) {
        if (maps.colMap[ox] === 0 && maps.rowMap[oy] === 1) {
          assert.deepEqual(readRgba(target.data, plan.width, ox, oy), [200, 100, 50, 255]);
        }
      }
    }

    // Dirty rect referencing pixels not sampled on screen returns null.
    const unseen = sampleViewportRasterPixels(source, target, maps, {
      x: 8,
      y: 0,
      width: 1,
      height: 1,
    });
    assert.equal(unseen, null);
  });
});
