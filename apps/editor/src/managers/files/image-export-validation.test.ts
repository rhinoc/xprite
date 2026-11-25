import jpeg from "jpeg-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { changeUiLanguage } from "$/i18n";
import {
  exportDocumentAnimation,
  exportDocumentSpriteSheet,
} from "$/managers/files/export-animation";
import { validateImageExport } from "$/managers/files/image-export-validation";
import {
  decodeImageBlob,
  validateRgbaImage,
  ImageDimensionError,
} from "@xprite/bedrock/browser/images";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  defaultSpriteSheetOptions,
  renderSpriteSheet,
  WebpCompression,
} from "@xprite/editor-core/import-export";

const options = {
  name: "out.png",
  scalePercent: 100,
  area: "canvas" as const,
  layers: "visible" as const,
  frame: 0,
};
const source = (width = 5120, height = 640) =>
  ({ width, height, selection: null }) as EditorDocument;
afterEach(async () => {
  await changeUiLanguage("en");
  vi.restoreAllMocks();
});

describe("final image export validation", () => {
  it("allows wide PNG/JPEG outputs within the portable pixel budget while rejecting bounds early", () => {
    const doc = source();
    for (const scalePercent of [100, 300, 320, 400]) {
      expect(validateImageExport(doc, { ...options, scalePercent })).toBe(1);
      expect(validateImageExport(doc, { ...options, name: "out.jpg", scalePercent })).toBe(1);
    }
    // 5120 × 640 @ 500% = 25600 × 3200 = 81.92M px > 64M px budget.
    expect(() => validateImageExport(doc, { ...options, scalePercent: 500 })).toThrow(
      /25600 × 3200.*Reduce Resize/,
    );
    expect(() => validateImageExport(source(32_768, 1), options)).not.toThrow();
    expect(() => validateImageExport(source(32_769, 1), options)).toThrow();
    expect(() =>
      validateImageExport(source(32_768, 1), { ...options, name: "out.jpg" }),
    ).not.toThrow();
    expect(() => validateImageExport(source(32_769, 1), { ...options, name: "out.jpg" })).toThrow();
    // Browser canvas RGBA validation retains the conservative 16384 canvas guard.
    expect(() =>
      validateRgbaImage({ width: 16_385, height: 1, data: new Uint8ClampedArray() }),
    ).toThrow(ImageDimensionError);
    expect(() => validateImageExport(source(8000, 8000), options)).not.toThrow();
    expect(() => validateImageExport(source(8001, 8000), options)).toThrow();
  });

  it("keeps portable GIF/APNG open to 32768 and preserves WebP 16384/16383 bitstream limits", () => {
    for (const name of ["out.gif", "out.apng", "out.png", "out.jpg"])
      expect(() =>
        validateImageExport(source(20_480, 1), {
          ...options,
          name,
          webpCompression: WebpCompression.Lossless,
        }),
      ).not.toThrow();
    expect(() =>
      validateImageExport(source(16_385, 1), {
        ...options,
        name: "out.webp",
        webpCompression: WebpCompression.Lossless,
      }),
    ).toThrow();
    expect(() =>
      validateImageExport(source(16_384, 1), {
        ...options,
        name: "out.webp",
        webpCompression: WebpCompression.Lossy,
      }),
    ).toThrow();
  });

  it("rejects execution before reading pixels, rendering, encoding, or saving", async () => {
    const doc = source();
    const pixels = vi.fn(() => {
      throw new Error("must not read source pixels");
    });
    Object.defineProperty(doc, "layer", { get: pixels });
    const encodePng = vi.fn(),
      save = vi.fn();
    await expect(
      exportDocumentAnimation(doc, { ...options, scalePercent: 500 }, { encodePng, save }),
    ).rejects.toThrow(/Reduce Resize/);
    expect(pixels).not.toHaveBeenCalled();
    expect(encodePng).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("validates aggregate animation budget before pixels and localizes guidance", async () => {
    const doc = source(6000, 6000);
    Object.assign(doc, { timeline: { frames: [{}, {}], tags: [] } });
    expect(() => validateImageExport(doc, { ...options, frames: "all" })).toThrow(/Reduce Resize/);
    await changeUiLanguage("zh-CN");
    expect(() => validateImageExport(source(), { ...options, scalePercent: 500 })).toThrow(
      /降低缩放百分比/,
    );
  });

  it("streams wide scaled PNG and JPEG exports (>16384px) end-to-end without a browser canvas", async () => {
    const width = 5120;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = 40;
      data[offset + 1] = 160;
      data[offset + 2] = 220;
      data[offset + 3] = 255;
    }
    const doc = {
      ...source(width, height),
      name: "wide.aseprite",
      layer: {
        name: "Layer",
        pixels: { width, height, data },
        x: 0,
        y: 0,
        visible: true,
        locked: false,
      },
    } as EditorDocument;
    const saved: { name: string; blob: Blob }[] = [];
    const save = vi.fn(async (artifact: { name: string; blob: Blob }) => {
      saved.push(artifact);
    });

    await exportDocumentAnimation(
      doc,
      { ...options, name: "wide.png", scalePercent: 400 },
      { save },
    );
    await exportDocumentAnimation(
      doc,
      { ...options, name: "wide.jpg", scalePercent: 400 },
      { save },
    );

    expect(saved.map((item) => item.name)).toEqual(["wide.png", "wide.jpg"]);
    const decodedPng = await decodeImageBlob(saved[0].blob, { maxDimension: 32_768 });
    expect([decodedPng.width, decodedPng.height]).toEqual([20_480, 8]);
    expect(Array.from(decodedPng.data.subarray(0, 4))).toEqual([40, 160, 220, 255]);

    const decodedJpg = jpeg.decode(new Uint8Array(await saved[1].blob.arrayBuffer()), {
      useTArray: true,
    });
    expect([decodedJpg.width, decodedJpg.height]).toEqual([20_480, 8]);
    expect(Math.abs(decodedJpg.data[0] - 40)).toBeLessThanOrEqual(8);
    expect(Math.abs(decodedJpg.data[1] - 160)).toBeLessThanOrEqual(8);
    expect(Math.abs(decodedJpg.data[2] - 220)).toBeLessThanOrEqual(8);
  });

  it("still completes a valid small PNG export with injected encodePng and compressed APNG sheets", async () => {
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(180) };
    const doc = {
      ...source(2, 2),
      name: "source.png",
      layer: { name: "Layer", pixels: image, x: 0, y: 0, visible: true, locked: false },
    } as EditorDocument;
    const encodePng = vi.fn(async () => new Blob(["ok"], { type: "image/png" })),
      save = vi.fn();
    const result = await exportDocumentAnimation(doc, options, { encodePng, save });
    expect(result.names).toEqual(["out.png"]);
    expect(save).toHaveBeenCalledOnce();

    const savedSheets: { name: string; blob: Blob }[] = [];
    await exportDocumentSpriteSheet(
      doc,
      { ...defaultSpriteSheetOptions(doc), imageEnabled: true, name: "sheet.apng" },
      { save: async (artifact) => void savedSheets.push(artifact) },
    );
    expect(savedSheets).toHaveLength(1);
    expect(savedSheets[0].blob.type).toBe("image/apng");
    const decodedSheet = await decodeImageBlob(savedSheets[0].blob);
    expect([decodedSheet.width, decodedSheet.height]).toEqual([2, 2]);
  });

  it("checks assembled sheets before allocating their final output, while preserving metadata-only output", () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const doc = {
      ...source(1, 1),
      name: "source.png",
      layer: { name: "Layer", pixels: image, x: 0, y: 0, visible: true, locked: false },
    } as EditorDocument;
    const wideSheet = {
      ...defaultSpriteSheetOptions(doc),
      imageEnabled: true,
      constraint: "width" as const,
      constraintWidth: 20_480,
    };
    expect(() => renderSpriteSheet(doc, wideSheet)).not.toThrow();
    expect(() => renderSpriteSheet(doc, { ...wideSheet, name: "out.jpg" })).not.toThrow();
    expect(() => renderSpriteSheet(doc, { ...wideSheet, name: "out.webp" })).toThrow();
    expect(() =>
      renderSpriteSheet(doc, { ...wideSheet, name: "out.webp", imageEnabled: false }),
    ).not.toThrow();
    expect(() => renderSpriteSheet(doc, { ...wideSheet, constraintWidth: 32_769 })).toThrow();
  });
});
