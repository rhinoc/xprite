import { describe, expect, it } from "vitest";

import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { PixelBuffer, Rect } from "$/base/primitives";
import type { EditorDocument } from "$/document/types";
import {
  defaultSpriteSheetOptions,
  renderSpriteSheet,
  SheetLayout,
} from "$/import-export/image/export-sheet";
import { packAsepriteSheetRects } from "$/import-export/image/sheet-packing";

/** Exact naive reference implementation of LAF gfx::PackingRects top-left integer scan. */
function referencePackAsepriteSheetRects(
  sizes: readonly Pick<Rect, "width" | "height">[],
  border: number,
  spacing: number,
  fixedWidth = 0,
  fixedHeight = 0,
): { width: number; height: number; rects: Rect[] } {
  const order = sizes
    .map((size, index) => ({ ...size, index }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const attempt = (width: number, height: number): Rect[] | null => {
    const w = width - border * 2;
    const h = height - border * 2;
    const occupied: Rect[] = [];
    const result: Rect[] = [];
    for (const size of order) {
      let placed = false;
      for (let y = 0; y <= h - size.height && !placed; y++) {
        for (let x = 0; x <= w - size.width;) {
          const cw = size.width + (x === w - size.width ? 0 : spacing);
          const ch = size.height + (y === h - size.height ? 0 : spacing);
          if (x + cw > w || y + ch > h) {
            x++;
            continue;
          }
          let jump = x;
          for (const r of occupied) {
            if (x < r.x + r.width && x + cw > r.x && y < r.y + r.height && y + ch > r.y) {
              jump = Math.max(jump, r.x + r.width);
            }
          }
          if (jump > x) {
            x = jump;
            continue;
          }
          occupied.push({ x, y, width: cw, height: ch });
          result[size.index] = {
            x: x + border,
            y: y + border,
            width: size.width,
            height: size.height,
          };
          placed = true;
          break;
        }
      }
      if (!placed) return null;
    }
    return result;
  };
  if (fixedWidth && fixedHeight) {
    const rects = attempt(fixedWidth, fixedHeight);
    if (!rects) throw new Error("The frames do not fit within the sheet constraints.");
    return { width: fixedWidth, height: fixedHeight, rects };
  }
  const w0 = Math.max(fixedWidth, ...sizes.map((s) => s.width), 1);
  const h0 = Math.max(fixedHeight, ...sizes.map((s) => s.height), 1);
  const needed = sizes.reduce((n, s) => n + s.width * s.height, 0);
  let width = w0;
  let height = h0;
  let step = 0;
  while (
    width + border * 2 <= MAX_IMAGE_DIMENSION &&
    height + border * 2 <= MAX_IMAGE_DIMENSION &&
    (width + border * 2) * (height + border * 2) <= MAX_IMAGE_PIXELS
  ) {
    if (width * height >= needed) {
      const rects = attempt(width + border * 2, height + border * 2);
      if (rects) return { width: width + border * 2, height: height + border * 2, rects };
    }
    if (!fixedWidth && !fixedHeight) {
      if (++step % 2) width += w0;
      else height += h0;
    } else if (!fixedWidth) width += w0;
    else height += h0;
  }
  throw new RangeError("Packed sheet exceeds the image limit.");
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

function makeFrameBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => readonly [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { width, height, data };
}

function makeAnimatedDoc(frames: readonly PixelBuffer[]): EditorDocument {
  const { width, height } = frames[0];
  return {
    name: "sprite.aseprite",
    width,
    height,
    selection: null,
    layer: { name: "Layer 1", pixels: frames[0], x: 0, y: 0, visible: true, locked: false },
    timeline: {
      activeLayer: 0,
      activeFrame: 0,
      layers: [
        {
          id: "layer-1",
          name: "Layer 1",
          visible: true,
          locked: false,
          flags: 1,
          opacity: 255,
        },
      ],
      frames: frames.map((pixels) => ({
        duration: 100,
        cels: [{ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      })),
    },
  };
}

describe("packAsepriteSheetRects", () => {
  it("matches the exact top-left scan order of the reference packer across varied inputs", () => {
    const next = createPrng(0x5eed1234);
    const configs = [
      { border: 0, spacing: 0, fixedWidth: 0, fixedHeight: 0 },
      { border: 2, spacing: 1, fixedWidth: 0, fixedHeight: 0 },
      { border: 3, spacing: 4, fixedWidth: 0, fixedHeight: 0 },
      { border: 1, spacing: 2, fixedWidth: 40, fixedHeight: 0 },
      { border: 1, spacing: 2, fixedWidth: 0, fixedHeight: 36 },
      { border: 2, spacing: 3, fixedWidth: 64, fixedHeight: 64 },
    ];
    for (const config of configs) {
      for (let trial = 0; trial < 15; trial++) {
        const count = 1 + (next() % 18);
        const sizes = Array.from({ length: count }, () => ({
          width: 1 + (next() % 13),
          height: 1 + (next() % 13),
        }));
        let refError: Error | null = null;
        let expected: ReturnType<typeof referencePackAsepriteSheetRects> | null = null;
        try {
          expected = referencePackAsepriteSheetRects(
            sizes,
            config.border,
            config.spacing,
            config.fixedWidth,
            config.fixedHeight,
          );
        } catch (error) {
          refError = error as Error;
        }
        if (refError) {
          expect(() =>
            packAsepriteSheetRects(
              sizes,
              config.border,
              config.spacing,
              config.fixedWidth,
              config.fixedHeight,
            ),
          ).toThrow(refError.message);
        } else {
          expect(
            packAsepriteSheetRects(
              sizes,
              config.border,
              config.spacing,
              config.fixedWidth,
              config.fixedHeight,
            ),
          ).toEqual(expected);
        }
      }
    }
  });

  it("handles empty inputs and packs 256 mixed rectangles quickly without overlap", () => {
    expect(packAsepriteSheetRects([], 0, 0)).toEqual({ width: 1, height: 1, rects: [] });

    const next = createPrng(0xbeefcafe);
    const sizes = Array.from({ length: 256 }, () => ({
      width: 8 + (next() % 49),
      height: 8 + (next() % 49),
    }));
    const border = 2;
    const spacing = 2;
    const start = performance.now();
    const packed = packAsepriteSheetRects(sizes, border, spacing);
    const elapsedMs = performance.now() - start;

    expect(packed.rects).toHaveLength(sizes.length);
    expect(elapsedMs).toBeLessThan(2000);
    for (let i = 0; i < packed.rects.length; i++) {
      const a = packed.rects[i];
      expect(a.width).toBe(sizes[i].width);
      expect(a.height).toBe(sizes[i].height);
      expect(a.x).toBeGreaterThanOrEqual(border);
      expect(a.y).toBeGreaterThanOrEqual(border);
      expect(a.x + a.width).toBeLessThanOrEqual(packed.width - border);
      expect(a.y + a.height).toBeLessThanOrEqual(packed.height - border);
      for (let j = i + 1; j < packed.rects.length; j++) {
        const b = packed.rects[j];
        const separated =
          a.x + a.width + spacing <= b.x ||
          b.x + b.width + spacing <= a.x ||
          a.y + a.height + spacing <= b.y ||
          b.y + b.height + spacing <= a.y;
        expect(separated).toBe(true);
      }
    }
  });
});

describe("renderSpriteSheet deduplication", () => {
  it("deduplicates identical trimmed cels to their earliest occurrence and preserves near-duplicates", () => {
    const f0 = makeFrameBuffer(8, 8, (x, y) =>
      x >= 1 && x < 4 && y >= 1 && y < 4 ? [200, 40, 80, 255] : [0, 0, 0, 0],
    );
    // Same 3x3 sprite shifted to a different offset: identical after trimCels.
    const f1 = makeFrameBuffer(8, 8, (x, y) =>
      x >= 4 && x < 7 && y >= 3 && y < 6 ? [200, 40, 80, 255] : [0, 0, 0, 0],
    );
    // Differs by 1 in a single channel at a single pixel.
    const f2 = makeFrameBuffer(8, 8, (x, y) =>
      x === 1 && y === 1
        ? [201, 40, 80, 255]
        : x >= 1 && x < 4 && y >= 1 && y < 4
          ? [200, 40, 80, 255]
          : [0, 0, 0, 0],
    );
    // Third duplicate of f0 and duplicate of f2.
    const doc = makeAnimatedDoc([f0, f1, f2, f0, f2]);
    const options = {
      ...defaultSpriteSheetOptions(doc),
      layout: SheetLayout.Horizontal,
      trimCels: true,
      mergeDuplicates: true,
      dataFormat: "array" as const,
    };
    const sheet = renderSpriteSheet(doc, options);
    expect(sheet.samples).toHaveLength(5);
    // Only 2 distinct 3x3 frames should be placed on the horizontal strip.
    expect(sheet.pixels.width).toBe(6);
    expect(sheet.pixels.height).toBe(3);
    expect(sheet.samples[1].frame).toEqual(sheet.samples[0].frame);
    expect(sheet.samples[3].frame).toEqual(sheet.samples[0].frame);
    expect(sheet.samples[2].frame).not.toEqual(sheet.samples[0].frame);
    expect(sheet.samples[4].frame).toEqual(sheet.samples[2].frame);
  });

  it("deduplicates and packs 160 frames rapidly with content-hash bucketing", () => {
    const uniqueCount = 40;
    const uniqueFrames = Array.from({ length: uniqueCount }, (_, index) =>
      makeFrameBuffer(24, 24, (x, y) => [
        (x * 11 + index * 17) & 255,
        (y * 13 + index * 29) & 255,
        ((x ^ y) + index * 7) & 255,
        255,
      ]),
    );
    const frames = Array.from({ length: 160 }, (_, i) => uniqueFrames[i % uniqueCount]);
    const doc = makeAnimatedDoc(frames);
    const options = {
      ...defaultSpriteSheetOptions(doc),
      layout: SheetLayout.Packed,
      shapePadding: 1,
      borderPadding: 1,
      mergeDuplicates: true,
      dataFormat: "array" as const,
    };
    const start = performance.now();
    const sheet = renderSpriteSheet(doc, options);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(2000);
    expect(sheet.samples).toHaveLength(160);
    const distinctSlots = new Set(
      sheet.samples.map((s) => `${s.frame.x},${s.frame.y},${s.frame.w},${s.frame.h}`),
    );
    expect(distinctSlots.size).toBe(uniqueCount);
    for (let i = uniqueCount; i < sheet.samples.length; i++) {
      expect(sheet.samples[i].frame).toEqual(sheet.samples[i % uniqueCount].frame);
    }
  });
});
