import { describe, expect, it } from "vitest";

import {
  adaptiveTolerance,
  colorKeyDistance,
  edgeSeededFloodAlpha,
  modeBorderColor,
  removeBackground,
  RemoveBackgroundMode,
  sampleKeyColor,
} from "$/import-export/image/import/remove-background";

function rgba(
  width: number,
  height: number,
  fill: (x: number, y: number) => readonly [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(fill(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe("remove-background classical flood", () => {
  it("measures RGB key distance", () => {
    expect(colorKeyDistance(0, 0, 0, [0, 0, 0, 255])).toBe(0);
    expect(colorKeyDistance(3, 4, 0, [0, 0, 0])).toBe(5);
  });

  it("picks the mode border color on a flat background", () => {
    const image = rgba(5, 5, (x, y) => {
      const border = x === 0 || y === 0 || x === 4 || y === 4;
      return border ? [100, 150, 200, 255] : [10, 20, 30, 255];
    });
    expect(modeBorderColor(image).slice(0, 3)).toEqual([100, 148, 204]);
  });

  it("clears edge-connected background and keeps an enclosed hole", () => {
    // 5×5: blue border+outer ring, red subject ring, blue hole at center.
    const blue: readonly [number, number, number, number] = [0, 0, 255, 255];
    const red: readonly [number, number, number, number] = [255, 0, 0, 255];
    const image = rgba(5, 5, (x, y) => {
      if (x === 0 || y === 0 || x === 4 || y === 4) return blue;
      if (x === 2 && y === 2) return blue;
      return red;
    });
    const alpha = edgeSeededFloodAlpha(image, [0, 0, 255], 8);
    // Outer blue cleared.
    expect(alpha[0]).toBe(0);
    expect(alpha[4]).toBe(0);
    // Subject kept.
    expect(alpha[1 * 5 + 1]).toBe(255);
    // Enclosed center hole kept (not edge-connected through red).
    expect(alpha[2 * 5 + 2]).toBe(255);
  });

  it("Auto removes a solid light border around a solid subject", () => {
    const image = rgba(8, 8, (x, y) => {
      const inner = x >= 2 && x <= 5 && y >= 2 && y <= 5;
      return inner ? [220, 40, 40, 255] : [148, 180, 252, 255];
    });
    const out = removeBackground(image, { mode: RemoveBackgroundMode.Auto });
    expect(out.data[3]).toBe(0);
    expect(out.data[(3 * 8 + 3) * 4 + 3]).toBe(255);
  });

  it("Manual uses the eyedropper key and tolerance", () => {
    const image = rgba(4, 4, (x, y) =>
      x === 0 || y === 0 ? [10, 10, 10, 255] : [200, 50, 50, 255],
    );
    const key = sampleKeyColor(image, 0, 0);
    expect(key?.slice(0, 3)).toEqual([10, 10, 10]);
    const out = removeBackground(image, {
      mode: RemoveBackgroundMode.Manual,
      keyColor: key,
      tolerance: 4,
    });
    expect(out.data[3]).toBe(0);
    expect(out.data[(2 * 4 + 2) * 4 + 3]).toBe(255);
  });

  it("adaptiveTolerance returns a candidate in the Auto sweep set", () => {
    const image = rgba(6, 6, (x, y) => {
      const inner = x >= 1 && x <= 4 && y >= 1 && y <= 4;
      return inner ? [30, 30, 30, 255] : [240, 240, 240, 255];
    });
    const key = modeBorderColor(image);
    const tol = adaptiveTolerance(image, key);
    expect([16, 24, 32, 40, 48, 64, 80, 100]).toContain(tol);
  });
});
