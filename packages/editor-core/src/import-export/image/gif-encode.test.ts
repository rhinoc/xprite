import { describe, expect, it } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { encodeGif, encodeGifRowSources } from "$/import-export/image/encoders";
import type { ExportAnimationFrame } from "$/import-export/image/export-animation";
import { createExportRowSource, materializeExportRaster } from "$/import-export/image/export-plan";
import { decodeGifAnimation } from "$/import-export/image/gif-import";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";

function createPixels(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba,
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

describe("GIF variable-width LZW encoder", () => {
  it("compresses multi-frame pixel art dramatically smaller than uncompressed 9-bit streams and round-trips losslessly", () => {
    const width = 96;
    const height = 96;
    const colors: Rgba[] = [
      [20, 30, 40, 255],
      [220, 60, 40, 255],
      [40, 190, 90, 255],
      [60, 120, 240, 255],
    ];
    const frames: ExportAnimationFrame[] = [0, 1, 2].map((frameIndex) => ({
      pixels: createPixels(width, height, (x, y) => {
        const band = ((x >> 4) + (y >> 4) + frameIndex) % colors.length;
        return colors[band];
      }),
      duration: 80 + frameIndex * 20,
      sourceFrame: frameIndex,
    }));

    const bytes = encodeGif(frames, { loopCount: 0 });
    // Uncompressed 9-bit output would exceed 3 * 96 * 96 * (9 / 8) = 31,104 bytes.
    expect(bytes.length).toBeLessThan(6_000);

    const decoded = decodeGifAnimation(bytes)!;
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.loopCount).toBe(0);
    expect(decoded.frames.map((f) => f.durationMs)).toEqual([80, 100, 120]);
    for (let i = 0; i < frames.length; i++) {
      expect(decoded.frames[i].pixels.data).toEqual(frames[i].pixels.data);
    }
  });

  it("round-trips multi-frame transparency and background disposal across opaque/clear transitions", () => {
    const width = 24;
    const height = 16;
    const frames: ExportAnimationFrame[] = [
      {
        pixels: createPixels(width, height, (x, y) =>
          x < 12 && y < 8 ? [255, 40, 40, 255] : [0, 0, 0, 0],
        ),
        duration: 100,
        sourceFrame: 0,
      },
      {
        pixels: createPixels(width, height, (x, y) =>
          x >= 12 && y >= 8 ? [40, 120, 255, 255] : [0, 0, 0, 0],
        ),
        duration: 100,
        sourceFrame: 1,
      },
      {
        pixels: createPixels(width, height, () => [0, 0, 0, 0]),
        duration: 100,
        sourceFrame: 2,
      },
    ];
    const bytes = encodeGif(frames, { loopCount: 2 });
    const decoded = decodeGifAnimation(bytes)!;
    expect(decoded.loopCount).toBe(2);
    expect(decoded.frames).toHaveLength(3);
    for (let i = 0; i < frames.length; i++) {
      expect(decoded.frames[i].pixels.data).toEqual(frames[i].pixels.data);
    }
  });

  it("round-trips interlaced GIFs across all four interlace passes", () => {
    const width = 19;
    const height = 25;
    const frames: ExportAnimationFrame[] = [0, 1].map((frameIndex) => ({
      pixels: createPixels(width, height, (x, y) =>
        (x + y + frameIndex) % 7 === 0
          ? [0, 0, 0, 0]
          : [((x * 37) % 5) * 50, ((y * 23) % 5) * 50, ((frameIndex * 90 + x * 7) % 5) * 50, 255],
      ),
      duration: 60,
      sourceFrame: frameIndex,
    }));
    const bytes = encodeGif(frames, { interlaced: true, loopCount: 0 });
    const decoded = decodeGifAnimation(bytes)!;
    expect(decoded.frames).toHaveLength(2);
    for (let i = 0; i < frames.length; i++) {
      expect(decoded.frames[i].pixels.data).toEqual(frames[i].pixels.data);
    }
  });

  it("preserves global and per-frame local palette order when palette option is supplied", () => {
    const globalPalette: Rgba[] = [
      [0, 0, 0, 0],
      [250, 10, 20, 255],
      [20, 230, 40, 255],
      [30, 40, 240, 255],
    ];
    const secondPalette: Rgba[] = [
      [0, 0, 0, 0],
      [240, 220, 10, 255],
      [180, 40, 220, 255],
    ];
    const frames: ExportAnimationFrame[] = [
      {
        pixels: createPixels(8, 4, (x) => globalPalette[x % globalPalette.length]),
        duration: 100,
        sourceFrame: 0,
        palette: globalPalette,
      },
      {
        pixels: createPixels(8, 4, (x) => secondPalette[x % secondPalette.length]),
        duration: 120,
        sourceFrame: 1,
        palette: secondPalette,
      },
    ];

    const bytes = encodeGif(frames, { palette: globalPalette, loopCount: 0 });
    // Global color table starts at byte 13 (after GIF89a + 7-byte screen descriptor).
    expect(Array.from(bytes.subarray(13, 13 + 12))).toEqual([
      0, 0, 0, 250, 10, 20, 20, 230, 40, 30, 40, 240,
    ]);

    const decoded = decodeGifAnimation(bytes)!;
    expect(decoded.frames).toHaveLength(2);
    expect(decoded.frames[0].pixels.data).toEqual(frames[0].pixels.data);
    expect(decoded.frames[1].pixels.data).toEqual(frames[1].pixels.data);
  });

  it("handles 9->10->11->12-bit code growth, 4096-entry dictionary resets, and width-boundary EOF", () => {
    // High-entropy 128x128 image forces multiple full 4096-entry dictionary cycles (9->10->11->12->CLEAR).
    let state = 0x12345678;
    const palette: Rgba[] = Array.from({ length: 64 }, (_, i) => [
      (i * 4) & 255,
      (i * 37) & 255,
      (i * 91) & 255,
      255,
    ]);
    const noisy = createPixels(128, 128, () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return palette[(state >>> 24) & 63];
    });
    const encodedNoisy = encodeGif([{ pixels: noisy, duration: 100, sourceFrame: 0 }], {
      loopCount: 1,
    });
    const decodedNoisy = decodeGifAnimation(encodedNoisy, { includeStatic: true })!;
    expect(decodedNoisy.frames[0].pixels.data).toEqual(noisy.data);

    // Exercise exact EOI bit-width transitions around 255..260, 765..770, and 1788..1794 unique pairs.
    for (const width of [255, 256, 257, 258, 511, 512, 513, 767, 768, 769]) {
      let s = (width * 9973) >>> 0;
      const strip = createPixels(width, 1, () => {
        s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
        return palette[(s >>> 24) & 63];
      });
      const bytes = encodeGif([{ pixels: strip, duration: 100, sourceFrame: 0 }], { loopCount: 1 });
      const decoded = decodeGifAnimation(bytes, { includeStatic: true })!;
      expect(decoded.frames[0].pixels.data).toEqual(strip.data);
    }
  });

  it("quantizes >256-color images cleanly via iterative median cut without stack overflow", () => {
    // 128 x 64 = 8,192 distinct RGB colors (well past 255 and many 15-bit quantized bins).
    const width = 128;
    const height = 64;
    const rich = createPixels(width, height, (x, y) => [
      (x * 2) & 255,
      (y * 4) & 255,
      ((x + y) * 3) & 255,
      255,
    ]);
    const bytes = encodeGif([{ pixels: rich, duration: 100, sourceFrame: 0 }], { loopCount: 1 });
    const decoded = decodeGifAnimation(bytes, { includeStatic: true })!;
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    // Verify decoded colors approximate the source gradient (mean channel error well under 16).
    let channelErrorSum = 0;
    for (let i = 0; i < rich.data.length; i += 4) {
      channelErrorSum +=
        Math.abs(decoded.frames[0].pixels.data[i] - rich.data[i]) +
        Math.abs(decoded.frames[0].pixels.data[i + 1] - rich.data[i + 1]) +
        Math.abs(decoded.frames[0].pixels.data[i + 2] - rich.data[i + 2]);
      expect(decoded.frames[0].pixels.data[i + 3]).toBe(255);
    }
    const meanChannelError = channelErrorSum / (width * height * 3);
    expect(meanChannelError).toBeLessThan(16);
  });

  it("streams upscaled ExportRasterPlan frames identically to materialized encodeGif", () => {
    const sourceA = createPixels(5, 3, (x, y) => [x * 50, y * 80, (x + y) * 30, x === 0 ? 0 : 255]);
    const sourceB = createPixels(5, 3, (x, y) => [y * 70, x * 40, 200, y === 2 ? 0 : 255]);
    const plans = [
      {
        source: sourceA,
        bounds: { x: 0, y: 0, width: 5, height: 3 },
        width: 20,
        height: 12,
      },
      {
        source: sourceB,
        bounds: { x: 0, y: 0, width: 5, height: 3 },
        width: 20,
        height: 12,
      },
    ];
    const streamed = joinBytes(
      encodeGifRowSources(
        plans.map((plan, index) => ({
          rowSource: createExportRowSource(plan),
          duration: 100 + index * 50,
        })),
        { loopCount: 0, interlaced: true },
      ),
    );
    const materialized = encodeGif(
      plans.map((plan, index) => ({
        pixels: materializeExportRaster(plan),
        duration: 100 + index * 50,
        sourceFrame: index,
      })),
      { loopCount: 0, interlaced: true },
    );
    expect(streamed).toEqual(materialized);
  });
});
