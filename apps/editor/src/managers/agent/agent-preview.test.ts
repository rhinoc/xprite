import { describe, expect, it } from "vitest";

import { composeAgentPreview, previewOptions } from "$/managers/agent/agent-preview";
import type { ExportRasterText } from "@xprite/editor-core/import-export";

const source = () => ({
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
});
const text: ExportRasterText = {
  measure: (value) => ({ width: value.length * 5, height: 7 }),
  draw: () => {},
};

describe("agent review presentation", () => {
  it("shows unchanged native pixels beside a nearest-neighbor enlargement", () => {
    const pixels = source();
    const original = pixels.data.slice();
    const review = composeAgentPreview(
      [{ pixels, frameIndex: 3, duration: 120 }],
      previewOptions({ scale: 3, compareNative: true, background: "#FFFFFF" }),
    );
    const frame = review.frameRects[0];
    expect(frame.nativeRect).toEqual({ x: 0, y: 0, width: 2, height: 1 });
    expect(frame.duration).toBe(120);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 6; x++) {
        const at = ((frame.y + y) * review.width + frame.x + x) * 4;
        expect(Array.from(review.pixels.data.slice(at, at + 4))).toEqual(
          x < 3 ? [255, 0, 0, 255] : [255, 255, 255, 255],
        );
      }
    expect(pixels.data).toEqual(original);
  });

  it("places captions outside every frame's image region", () => {
    const review = composeAgentPreview(
      [
        { pixels: source(), frameIndex: 0, duration: 80 },
        { pixels: source(), frameIndex: 12, duration: 240 },
      ],
      previewOptions({ labels: true }, { layout: "grid", scale: 2 }),
      text,
    );
    for (const frame of review.frameRects) {
      expect(frame.y).toBeGreaterThan(0);
      const at = (frame.y * review.width + frame.x) * 4;
      expect(Array.from(review.pixels.data.slice(at, at + 4))).toEqual([255, 0, 0, 255]);
    }
    expect(review.frameRects.map(({ frameIndex, duration }) => [frameIndex, duration])).toEqual([
      [0, 80],
      [12, 240],
    ]);
  });

  it("rejects oversized review canvases before allocation", () => {
    const pixels = { width: 129, height: 1, data: new Uint8ClampedArray(129 * 4) };
    expect(() =>
      composeAgentPreview(
        [{ pixels, frameIndex: 0, duration: 100 }],
        previewOptions({ scale: 16 }),
      ),
    ).toThrow("exceeds");
    expect(() => previewOptions({ background: "#00000000" })).toThrow("background");
  });
});
