import assert from "node:assert/strict";

import { afterEach, beforeEach, describe, it, vi } from "vitest";

import { rasterizeEditorTextFont } from "$/adapters/rendering/editor-font";

const fixtures = vi.hoisted(() => {
  const fonts: string[] = [];
  class AtlasCanvas {
    width = 2;
    height = 7;
    constructor(private readonly atlas = false) {}
    getContext() {
      const context = {
        font: "normal normal 7px sans-serif",
        textBaseline: "alphabetic",
        lineJoin: "miter",
        fillStyle: "white",
        strokeStyle: "white",
        lineWidth: 0,
        fontKerning: "none",
        measureText() {
          const size = Number(context.font.match(/(\d+)px/)?.[1] ?? 7);
          return {
            width: size,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: size,
            fontBoundingBoxAscent: Math.ceil(size * 0.8),
            fontBoundingBoxDescent: Math.ceil(size * 0.2),
          };
        },
        fillText() {
          fonts.push(context.font);
        },
        strokeText() {},
        getImageData: () => {
          const data = new Uint8ClampedArray(this.width * this.height * 4);
          const coverage = [0, 64, 127, 128, 192, 255];
          for (let pixel = 0; pixel < data.length / 4; pixel++)
            data[pixel * 4 + 3] = this.atlas
              ? pixel % this.width === 0
                ? 255
                : 0
              : coverage[pixel % coverage.length];
          return { width: this.width, height: this.height, data };
        },
      };
      return context;
    }
  }
  const defaultFont = new AtlasCanvas(true);
  const miniFont = new AtlasCanvas(true);
  miniFont.height = 5;
  return { AtlasCanvas, defaultFont, miniFont, fonts };
});

vi.mock("@xprite/ui/assets", () => ({
  getUiAssets: () => ({
    defaultFont: fixtures.defaultFont,
    miniFont: fixtures.miniFont,
    cjkFontReady: true,
  }),
  uiGlyphAssets: {
    defaultGlyphMetrics: { "65": [0, 0, 2, 7] },
    miniGlyphMetrics: { "65": [0, 0, 2, 5] },
  },
}));

beforeEach(() => {
  fixtures.fonts.length = 0;
  vi.stubGlobal("HTMLCanvasElement", fixtures.AtlasCanvas);
  vi.stubGlobal("document", { createElement: () => new fixtures.AtlasCanvas() });
});
afterEach(() => vi.unstubAllGlobals());

describe("editor font rendering", () => {
  it("uses the Mini sheet and only integer bitmap enlargement", () => {
    const mini = rasterizeEditorTextFont("light", "A", { family: "Aseprite Mini", size: 12 });
    assert.equal(mini.height, 10);
    assert.equal(mini.glyphs.A.advance, 4);
    assert.deepEqual(Array.from(mini.glyphs.A.alpha.slice(0, 4)), [255, 255, 0, 0]);
  });

  it("retains bitmap glyphs when the same line needs a Unicode fallback", () => {
    const original = rasterizeEditorTextFont("light", "A", { family: "Aseprite", size: 14 });
    const mixed = rasterizeEditorTextFont("light", "A中", { family: "Aseprite", size: 14 });
    assert.equal(mixed.glyphs.A.width, original.glyphs.A.width);
    assert.equal(mixed.glyphs.A.advance, original.glyphs.A.advance);
    assert.deepEqual(
      mixed.glyphs.A.alpha.slice(-original.glyphs.A.alpha.length),
      original.glyphs.A.alpha,
    );
    assert.ok(mixed.glyphs["中"]);
    assert.equal(mixed.lineHeight, original.lineHeight);
    assert.equal(mixed.glyphs["中"].advance, 10);
    assert.ok(fixtures.fonts.some((font) => font.includes('10px "FusionPixelZhHans"')));
  });

  it("offers Fusion Pixel as a solid 10px face with integer enlargement", () => {
    const font = rasterizeEditorTextFont("light", "中文", {
      family: "Fusion Pixel",
      size: 29,
      antialias: true,
    });
    assert.equal(font.height, 20);
    assert.equal(font.glyphs["中"].advance, 20);
    assert.ok(font.glyphs["中"].alpha.every((alpha) => alpha === 0 || alpha === 255));
    assert.deepEqual(Array.from(font.glyphs["中"].alpha.slice(0, 6)), [0, 0, 255, 255, 255, 255]);
    assert.ok(fixtures.fonts.every((font) => font.includes('10px "FusionPixelZhHans"')));
  });

  it("does not synthesize bold, italic or outlines on the bundled bitmap", () => {
    const original = rasterizeEditorTextFont("light", "A", { family: "Aseprite", size: 7 });
    const styled = rasterizeEditorTextFont("light", "A", {
      family: "Aseprite",
      size: 7,
      bold: true,
      italic: true,
      strokeWidth: 2,
      fill: false,
    });
    assert.deepEqual(styled, original);
  });

  it("renders system fonts at the requested size with explicit coverage policy", () => {
    const aliased = rasterizeEditorTextFont("light", "A", { family: "sans-serif", size: 17 });
    assert.equal(aliased.height, 17);
    assert.equal(aliased.glyphs.A.advance, 17);
    assert.deepEqual(Array.from(aliased.glyphs.A.alpha.slice(0, 6)), [0, 0, 0, 255, 255, 255]);
    const antialiased = rasterizeEditorTextFont("light", "A", {
      family: "sans-serif",
      size: 17,
      antialias: true,
    });
    assert.deepEqual(
      Array.from(antialiased.glyphs.A.alpha.slice(0, 6)),
      [0, 64, 127, 128, 192, 255],
    );
  });
});
