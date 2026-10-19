import { describe, expect, it } from "vitest";

import {
  clampSplit,
  resultClipLeft,
  splitFromKey,
  splitFromPointer,
} from "$/components/pixelation/compare-split";

describe("pixelate compare divider", () => {
  it("clamps to the preview and ignores non-finite values", () => {
    expect(clampSplit(-4)).toBe(0);
    expect(clampSplit(140)).toBe(100);
    expect(clampSplit(Number.NaN)).toBe(50);
  });
  it("maps a pointer to a percentage of the preview width", () => {
    const rect = { left: 100, width: 200 };
    expect(splitFromPointer(200, rect)).toBe(50);
    expect(splitFromPointer(50, rect)).toBe(0);
    expect(splitFromPointer(900, rect)).toBe(100);
    expect(splitFromPointer(200, { left: 0, width: 0 })).toBeNull();
  });
  it("moves with arrows, Shift and Home/End, and ignores other keys", () => {
    expect(splitFromKey(50, "ArrowLeft")).toBe(45);
    expect(splitFromKey(50, "ArrowRight")).toBe(55);
    expect(splitFromKey(50, "ArrowRight", true)).toBe(60);
    expect(splitFromKey(2, "ArrowLeft")).toBe(0);
    expect(splitFromKey(50, "Home")).toBe(0);
    expect(splitFromKey(50, "End")).toBe(100);
    expect(splitFromKey(50, "a")).toBeNull();
  });
  it("starts the result layer at the divider, never outside the layer", () => {
    const layer = { left: 20, width: 100 };
    expect(resultClipLeft(50, 200, layer)).toBe(80);
    expect(resultClipLeft(0, 200, layer)).toBe(0);
    expect(resultClipLeft(100, 200, layer)).toBe(100);
  });
});
