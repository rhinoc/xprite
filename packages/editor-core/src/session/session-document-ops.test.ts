import { deflateSync } from "node:zlib";

import { describe, expect, test } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { inflateZlibExact } from "$/base/zlib";
import { BatchEditKind, RasterEditor } from "$/editor";
import { AsepriteCelType, decodeAseprite, rasterAnimationProject } from "$/import-export";
import { resolvePixelatedProjectPalette } from "$/session/pixelated-frames-palette";
import {
  clipOverlayToCanvas,
  compositeOverlayRegion,
  computeAlphaBounds,
  encodeEditorDocumentAseprite,
  extractDocumentFramesPalette,
  extractPixelBufferRegion,
  isReadablePixelLayerKind,
  isSessionDocumentBusy,
  resolveDocumentLayerPixels,
} from "$/session/session-document-ops";

function solidPixels(width: number, height: number, color: Rgba): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data };
}

describe("session-document-ops", () => {
  test("encodeEditorDocumentAseprite defaults to compressed cels when deflate is supplied", async () => {
    const project = rasterAnimationProject({
      width: 32,
      height: 32,
      frames: [
        { pixels: solidPixels(32, 32, [40, 80, 160, 255]), durationMs: 100 },
        { pixels: solidPixels(32, 32, [200, 50, 90, 255]), durationMs: 120 },
      ],
    });
    const editor = new RasterEditor(project.image, "demo.aseprite");
    editor.document.loadTimeline(project.timeline, 32, 32, "demo.aseprite");

    const compressed = await encodeEditorDocumentAseprite(editor, {
      deflate: (bytes) => new Uint8Array(deflateSync(bytes)),
    });
    const uncompressed = await encodeEditorDocumentAseprite(editor);

    expect(compressed.byteLength).toBeLessThan(uncompressed.byteLength);
    const decoded = await decodeAseprite(compressed, {
      inflate: (bytes, expected) => inflateZlibExact(bytes, expected),
    });
    expect(
      decoded.frames.flatMap((frame) =>
        frame.cels.filter((cel) => cel.type === AsepriteCelType.Compressed),
      ).length,
    ).toBeGreaterThan(0);
  });

  test("isSessionDocumentBusy checks session prompts and editor previews uniformly", () => {
    const editor = new RasterEditor(solidPixels(4, 4, [0, 0, 0, 0]), "idle.png");
    expect(
      isSessionDocumentBusy(editor, { busy: false, pendingImport: null, replacement: null }),
    ).toBe(false);
    expect(isSessionDocumentBusy(editor, { busy: true })).toBe(true);
    expect(
      isSessionDocumentBusy(editor, {
        replacement: { kind: "close", name: "idle.png" },
      }),
    ).toBe(true);

    editor.importExport.previewSpriteSheet(solidPixels(4, 4, [255, 0, 0, 255]));
    expect(isSessionDocumentBusy(editor, {})).toBe(true);
    editor.importExport.previewSpriteSheet(null);
    expect(isSessionDocumentBusy(editor, {})).toBe(false);
  });

  test("resolveDocumentLayerPixels and extractPixelBufferRegion read both image and tilemap layers", () => {
    const editor = new RasterEditor(solidPixels(4, 4, [0, 0, 0, 0]), "tiles.aseprite");
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#FF0000",
        },
        {
          type: BatchEditKind.ConvertToTilemap,
          layerId,
          tileWidth: 2,
          tileHeight: 2,
        },
      ],
      editor.getContentRevision(),
      "Tilemap setup",
    );

    const doc = editor.getSnapshot().document!;
    expect(isReadablePixelLayerKind(doc.timeline!.layers[0].kind)).toBe(true);
    expect(isReadablePixelLayerKind("group")).toBe(false);

    const resolved = resolveDocumentLayerPixels(doc, 0, 0);
    expect(resolved).not.toBeNull();
    const bounds = computeAlphaBounds(resolved!.pixels);
    expect(bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });

    const region = extractPixelBufferRegion(resolved!.pixels, resolved!.origin, {
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
    expect(Array.from(region.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(region.data.subarray(4, 8))).toEqual([0, 0, 0, 0]);
  });

  test("clipOverlayToCanvas and compositeOverlayRegion clip and alpha-blend accurately", () => {
    expect(
      clipOverlayToCanvas({ width: 2, height: 2 }, { x: 4, y: 0 }, { width: 4, height: 4 }),
    ).toBeNull();
    const rect = clipOverlayToCanvas(
      { width: 2, height: 2 },
      { x: -1, y: 0 },
      { width: 4, height: 4 },
    );
    expect(rect).toEqual({ x: 0, y: 0, width: 1, height: 2 });

    // 2x1 overlay: left pixel transparent, right pixel ~50% red (alpha 128)
    const source: PixelBuffer = {
      width: 2,
      height: 1,
      data: Uint8ClampedArray.of(0, 0, 0, 0, 255, 0, 0, 128),
    };
    const base: PixelBuffer = {
      width: 2,
      height: 1,
      data: Uint8ClampedArray.of(0, 0, 255, 255, 0, 0, 255, 255),
    };
    const composited = compositeOverlayRegion(
      source,
      { x: 0, y: 0 },
      { x: 0, y: 0, width: 2, height: 1 },
      base,
    );
    // Transparent overlay preserves blue base pixel.
    expect(Array.from(composited.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    // Semi-transparent red over opaque blue produces blended magenta with full alpha.
    expect(composited[4]).toBeGreaterThan(120);
    expect(composited[5]).toBe(0);
    expect(composited[6]).toBeGreaterThan(120);
    expect(composited[7]).toBe(255);
  });

  test("extractDocumentFramesPalette and resolvePixelatedProjectPalette span all frames", () => {
    const project = rasterAnimationProject({
      width: 4,
      height: 4,
      frames: [
        { pixels: solidPixels(4, 4, [255, 0, 0, 255]), durationMs: 100 },
        { pixels: solidPixels(4, 4, [0, 255, 0, 255]), durationMs: 100 },
      ],
    });
    const editor = new RasterEditor(project.image, "anim.aseprite");
    editor.document.loadTimeline(project.timeline, 4, 4, "anim.aseprite");

    const extracted = extractDocumentFramesPalette(editor.getSnapshot().document!, 8);
    expect(extracted).toContainEqual([255, 0, 0, 255]);
    expect(extracted).toContainEqual([0, 255, 0, 255]);

    const explicit: Rgba[] = [[10, 20, 30, 255]];
    expect(
      resolvePixelatedProjectPalette([project.image], { reduceColors: true, palette: explicit }),
    ).toEqual(explicit);
  });
});
