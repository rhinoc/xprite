import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";

import {
  createExportRowSource,
  encodeJpeg,
  encodeJpegChunks,
  parseJpegMatte,
} from "$/import-export/image";
import { joinBytes } from "@xprite/bedrock/common/join-bytes";

function decodedPixels(bytes: Uint8Array) {
  return jpeg.decode(bytes, { useTArray: true });
}

describe("streaming Baseline JPEG encoder", () => {
  it.each([
    [1, 1],
    [7, 5],
    [8, 8],
    [13, 9],
    [17, 15],
  ])("round-trips %i × %i pixels accurately through a standard JPEG decoder", (width, height) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = Math.round((x / Math.max(1, width - 1)) * 220) + 16;
        data[offset + 1] = Math.round((y / Math.max(1, height - 1)) * 200) + 24;
        data[offset + 2] = 180;
        data[offset + 3] = 255;
      }
    }
    const encoded = encodeJpeg({ width, height, data }, 95);
    expect(encoded[0]).toBe(0xff);
    expect(encoded[1]).toBe(0xd8);
    expect(encoded[encoded.length - 2]).toBe(0xff);
    expect(encoded[encoded.length - 1]).toBe(0xd9);

    const decoded = decodedPixels(encoded);
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    for (let offset = 0; offset < data.length; offset += 4) {
      expect(Math.abs(decoded.data[offset] - data[offset])).toBeLessThanOrEqual(8);
      expect(Math.abs(decoded.data[offset + 1] - data[offset + 1])).toBeLessThanOrEqual(8);
      expect(Math.abs(decoded.data[offset + 2] - data[offset + 2])).toBeLessThanOrEqual(8);
    }
  });

  it("streams wide scaled images (>16384px) and composites jpegMatte without allocating the scaled raster", () => {
    const sourceWidth = 5120;
    const sourceHeight = 2;
    const sourceData = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
    // Left half opaque red, right half transparent (should composite onto custom matte).
    for (let y = 0; y < sourceHeight; y++) {
      for (let x = 0; x < sourceWidth; x++) {
        const offset = (y * sourceWidth + x) * 4;
        if (x < sourceWidth / 2) {
          sourceData[offset] = 220;
          sourceData[offset + 1] = 40;
          sourceData[offset + 2] = 30;
          sourceData[offset + 3] = 255;
        } else {
          sourceData[offset] = 0;
          sourceData[offset + 1] = 0;
          sourceData[offset + 2] = 0;
          sourceData[offset + 3] = 0;
        }
      }
    }
    const rowSource = createExportRowSource({
      source: { width: sourceWidth, height: sourceHeight, data: sourceData },
      bounds: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
      width: 20_480,
      height: 8,
      jpegMatte: parseJpegMatte("#2060c0"),
    });
    const encoded = joinBytes(encodeJpegChunks(rowSource, 92));
    const decoded = decodedPixels(encoded);
    expect([decoded.width, decoded.height]).toEqual([20_480, 8]);
    // Sample left (red) and right (matte #2060c0 = 32, 96, 192) well away from the midpoint seam.
    const leftOffset = (4 * 20_480 + 16) * 4;
    expect(decoded.data[leftOffset]).toBeGreaterThan(200);
    expect(decoded.data[leftOffset + 1]).toBeLessThan(60);
    expect(decoded.data[leftOffset + 2]).toBeLessThan(50);

    const rightOffset = (4 * 20_480 + 20_460) * 4;
    expect(Math.abs(decoded.data[rightOffset] - 0x20)).toBeLessThanOrEqual(8);
    expect(Math.abs(decoded.data[rightOffset + 1] - 0x60)).toBeLessThanOrEqual(8);
    expect(Math.abs(decoded.data[rightOffset + 2] - 0xc0)).toBeLessThanOrEqual(8);
  });

  it("rejects dimensions above the portable image limits", () => {
    expect(() => encodeJpegChunks({ width: 32_769, height: 1, fillRow: () => false }, 90)).toThrow(
      RangeError,
    );
    expect(() => encodeJpegChunks({ width: 8001, height: 8000, fillRow: () => false }, 90)).toThrow(
      RangeError,
    );
  });
});
