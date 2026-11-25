import { afterEach, describe, expect, it, vi } from "vitest";

import { changeUiLanguage } from "$/i18n";
import { exportDocumentAnimation } from "$/managers/files/export-animation";
import { validateImageExport } from "$/managers/files/image-export-validation";
import { validateRgbaImage, ImageDimensionError } from "@xprite/bedrock/browser/images";
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
  it("uses the encoder's exact edge boundary without rendering or silently changing scale", () => {
    const doc = source();
    for (const scalePercent of [100, 300, 320])
      expect(validateImageExport(doc, { ...options, scalePercent })).toBe(1);
    expect(() => validateImageExport(doc, { ...options, scalePercent: 400 })).toThrow(
      /20480 × 2560.*Reduce Resize/,
    );
    expect(() => validateImageExport(source(16384, 1), options)).not.toThrow();
    expect(() => validateImageExport(source(16385, 1), options)).toThrow();
    expect(() =>
      validateRgbaImage({ width: 16385, height: 1, data: new Uint8ClampedArray() }),
    ).toThrow(ImageDimensionError);
    expect(() => validateImageExport(source(8000, 8000), options)).not.toThrow();
    expect(() => validateImageExport(source(8001, 8000), options)).toThrow();
  });
  it("does not apply canvas bounds to portable GIF/APNG or change WebP codec boundaries", () => {
    for (const name of ["out.gif", "out.apng"])
      expect(() =>
        validateImageExport(source(20480, 1), {
          ...options,
          name,
          webpCompression: WebpCompression.Lossless,
        }),
      ).not.toThrow();
    expect(() => validateImageExport(source(20480, 1), { ...options, name: "out.jpg" })).toThrow();
    expect(() =>
      validateImageExport(source(20480, 1), {
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
      exportDocumentAnimation(doc, { ...options, scalePercent: 400 }, { encodePng, save }),
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
    expect(() => validateImageExport(source(), { ...options, scalePercent: 400 })).toThrow(
      /降低缩放百分比/,
    );
  });
  it("still completes a valid small PNG export", async () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const doc = {
      ...source(1, 1),
      name: "source.png",
      layer: { name: "Layer", pixels: image, x: 0, y: 0, visible: true, locked: false },
    } as EditorDocument;
    const encodePng = vi.fn(async () => new Blob(["ok"], { type: "image/png" })),
      save = vi.fn();
    const result = await exportDocumentAnimation(doc, options, { encodePng, save });
    expect(result.names).toEqual(["out.png"]);
    expect(save).toHaveBeenCalledOnce();
  });
  it("checks assembled sheets before allocating their final output, while preserving metadata-only output", () => {
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const doc = {
      ...source(1, 1),
      name: "source.png",
      layer: { name: "Layer", pixels: image, x: 0, y: 0, visible: true, locked: false },
    } as EditorDocument;
    const sheet = {
      ...defaultSpriteSheetOptions(doc),
      imageEnabled: true,
      constraint: "width" as const,
      constraintWidth: 16385,
    };
    expect(() => renderSpriteSheet(doc, sheet)).toThrow(/16385/);
    expect(() => renderSpriteSheet(doc, { ...sheet, imageEnabled: false })).not.toThrow();
    expect(() => renderSpriteSheet(doc, { ...sheet, name: "out.apng" })).not.toThrow();
  });
});
