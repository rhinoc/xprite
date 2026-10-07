import { afterEach, describe, expect, it, vi } from "vitest";

import { atlasRegion } from "$/base/theme/atlas-region-cache";
import type { UiBitmap } from "$/base/theme/theme-assets-store";

interface BitmapFixture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  naturalWidth?: number;
  naturalHeight?: number;
}

function bitmap(width: number, height: number, pixels: number[]): UiBitmap {
  return { width, height, data: new Uint8ClampedArray(pixels) } as unknown as UiBitmap;
}

// Readback fixtures already represent native Canvas RGBA bytes, including alpha
// rounding. Browser sampling itself is left to Canvas in the fractional path.
function installCanvasReadback() {
  const drawings: unknown[][] = [];
  const reads: number[][] = [];
  const createElement = vi.fn(() => {
    let width = 0;
    let height = 0;
    let drawing: unknown[];
    const context = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => {
        drawing = args;
        drawings.push(args);
      },
      getImageData: (x: number, y: number, readWidth: number, readHeight: number) => {
        reads.push([x, y, readWidth, readHeight]);
        const [sheet, sourceX, sourceY] = drawing as [BitmapFixture, number, number];
        const data = new Uint8ClampedArray(readWidth * readHeight * 4);
        const bitmapWidth = sheet.naturalWidth ?? sheet.width;
        const bitmapHeight = sheet.naturalHeight ?? sheet.height;
        for (let y = 0; y < readHeight; y++)
          for (let x = 0; x < readWidth; x++) {
            const sx = Math.floor(sourceX + x);
            const sy = Math.floor(sourceY + y);
            if (sx < 0 || sy < 0 || sx >= bitmapWidth || sy >= bitmapHeight) continue;
            const at = (sy * bitmapWidth + sx) * 4;
            data.set(sheet.data.subarray(at, at + 4), (y * readWidth + x) * 4);
          }
        return { data };
      },
    };
    return {
      get width() {
        return width;
      },
      set width(value: number) {
        width = Math.trunc(value);
      },
      get height() {
        return height;
      },
      set height(value: number) {
        height = Math.trunc(value);
      },
      getContext: () => context,
    };
  });
  vi.stubGlobal("document", { createElement });
  return { drawings, reads, createElement };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme atlas region cache", () => {
  it("reads one complete bitmap for multiple integer regions and reuses region runs", () => {
    const { drawings, reads, createElement } = installCanvasReadback();
    const red = [255, 0, 0, 255];
    const blue = [0, 0, 255, 255];
    const sheet = bitmap(3, 2, [...red, ...red, ...blue, ...red, ...red, ...blue]);
    const source = { x: 0, y: 0, width: 2, height: 2 };
    const first = atlasRegion(sheet, source);
    expect(first.runs).toEqual([
      { x: 0, y: 0, width: 2, height: 2, color: "rgba(255,0,0,1)", opacity: 1 },
    ]);
    expect(atlasRegion(sheet, source)).toBe(first);
    expect(atlasRegion(sheet, { x: 2, y: 0, width: 1, height: 2 }).runs).toEqual([
      { x: 0, y: 0, width: 1, height: 2, color: "rgba(0,0,255,1)", opacity: 1 },
    ]);
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(drawings).toEqual([[sheet, 0, 0, 3, 2, 0, 0, 3, 2]]);
    expect(reads).toEqual([[0, 0, 3, 2]]);
  });

  it("pads every outside edge transparently without sampling neighboring atlas regions", () => {
    installCanvasReadback();
    const sheet = bitmap(2, 2, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    expect(atlasRegion(sheet, { x: -1, y: -1, width: 4, height: 4 }).runs).toEqual([
      { x: 1, y: 1, width: 1, height: 1, color: "rgba(255,0,0,1)", opacity: 1 },
      { x: 2, y: 1, width: 1, height: 1, color: "rgba(0,255,0,1)", opacity: 1 },
      { x: 1, y: 2, width: 1, height: 1, color: "rgba(0,0,255,1)", opacity: 1 },
      { x: 2, y: 2, width: 1, height: 1, color: "rgba(255,255,0,1)", opacity: 1 },
    ]);
    for (const source of [
      { x: -4, y: 0, width: 2, height: 2 },
      { x: 4, y: 0, width: 2, height: 2 },
      { x: 0, y: -4, width: 2, height: 2 },
      { x: 0, y: 4, width: 2, height: 2 },
    ])
      expect(atlasRegion(sheet, source).runs).toEqual([]);
  });

  it("preserves translucent readback bytes and keeps separated rows as distinct runs", () => {
    installCanvasReadback();
    const color = [17, 34, 51, 128];
    const transparent = [0, 0, 0, 0];
    const sheet = bitmap(2, 3, [
      ...color,
      ...color,
      ...transparent,
      ...transparent,
      ...color,
      ...color,
    ]);
    expect(atlasRegion(sheet, { x: 0, y: 0, width: 2, height: 3 }).runs).toEqual([
      { x: 0, y: 0, width: 2, height: 1, color: `rgba(17,34,51,${128 / 255})`, opacity: 128 / 255 },
      { x: 0, y: 2, width: 2, height: 1, color: `rgba(17,34,51,${128 / 255})`, opacity: 128 / 255 },
    ]);
  });

  it("uses intrinsic image dimensions and gives each replacement bitmap its own pixels", () => {
    const { reads } = installCanvasReadback();
    const sheet = bitmap(2, 1, [255, 0, 0, 255, 0, 0, 255, 255]);
    Object.assign(sheet, { width: 20, height: 10, naturalWidth: 2, naturalHeight: 1 });
    const replacement = bitmap(2, 1, [0, 255, 0, 255, 0, 0, 0, 0]);
    const source = { x: 0, y: 0, width: 1, height: 1 };
    const first = atlasRegion(sheet, source);
    expect(atlasRegion(replacement, source).runs[0].color).toBe("rgba(0,255,0,1)");
    expect(atlasRegion(sheet, source)).toBe(first);
    expect(reads).toEqual([
      [0, 0, 2, 1],
      [0, 0, 2, 1],
    ]);
  });

  it("keeps native fractional cropping and dimension coercion separate from the full atlas", () => {
    const { drawings, reads } = installCanvasReadback();
    const sheet = bitmap(
      3,
      2,
      Array.from({ length: 3 * 2 * 4 }, () => 255),
    );
    const source = { x: 0.25, y: 0.5, width: 2.75, height: 1.75 };
    const first = atlasRegion(sheet, source);
    expect(atlasRegion(sheet, source)).toBe(first);
    atlasRegion(sheet, { x: 0, y: 0, width: 1, height: 1 });
    expect(drawings).toEqual([
      [sheet, 0.25, 0.5, 2.75, 1.75, 0, 0, 2.75, 1.75],
      [sheet, 0, 0, 3, 2, 0, 0, 3, 2],
    ]);
    expect(reads).toEqual([
      [0, 0, 2, 1],
      [0, 0, 3, 2],
    ]);
  });
});
