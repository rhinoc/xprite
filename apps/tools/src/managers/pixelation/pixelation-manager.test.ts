import { describe, expect, it, vi } from "vitest";

import { PixelationManager, restoresPixels } from "$/managers/pixelation/pixelation-manager";
import type { PixelationPort } from "$/managers/ports/pixelation";
import {
  CellColorPicker,
  OutlinePrepass,
  PixelationAlgorithm,
  PixelationMode,
} from "@xprite/editor-core/import-export";

const image = (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(255),
});
function port(): PixelationPort {
  return {
    readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
    paletteResources: () => ({ choices: [] }),
    detectGrid: async () => ({ width: 1, height: 1, reliable: false }) as never,
    read: async () => image(8, 6),
    example: async () => new File([], "example.png"),
    convert: vi.fn(async () => image(4, 3)),
    save: async () => {},
    edit: async () => {},
    dispose: () => {},
  };
}

describe("pixelate tool preview", () => {
  it("shares one viewport and refits for every opened file", async () => {
    const manager = new PixelationManager(port());
    expect(manager.getSnapshot().identity).toBe(0);
    await manager.open(new File([], "a.png"));
    expect(manager.getSnapshot()).toMatchObject({ identity: 1, converting: false });
    expect(manager.getSnapshot().result).toMatchObject({ width: 4, height: 3 });
    await manager.open(new File([], "b.png"));
    expect(manager.getSnapshot().identity).toBe(2);
    expect(manager.navigation.getSnapshot().zoom).toBe(1);
    manager.dispose();
  });
  it("blanks the result while a changed setting is converting", async () => {
    const manager = new PixelationManager(port());
    await manager.open(new File([], "a.png"));
    manager.changeSettings({ removeNoise: true });
    expect(manager.getSnapshot()).toMatchObject({ result: null, converting: true });
    manager.dispose();
  });
  it("finds pixels with the chosen algorithm, like the import dialog", async () => {
    const detectGrid = vi.fn(async (_image, algorithm, size) => ({
      width: size?.width ?? 4,
      height: size?.height ?? 3,
      cellWidth: 2,
      cellHeight: 2,
      offsetX: 0,
      offsetY: 0,
      confidence: 1,
      reliable: algorithm !== PixelationAlgorithm.Resize,
    }));
    const manager = new PixelationManager({ ...port(), detectGrid: detectGrid as never });
    await manager.open(new File([], "a.png"));
    await manager.changeAlgorithm(PixelationAlgorithm.CustomSize, { width: 4, height: 3 });
    expect(detectGrid).toHaveBeenLastCalledWith(expect.anything(), PixelationAlgorithm.CustomSize, {
      width: 4,
      height: 3,
    });
    expect(manager.getSnapshot()).toMatchObject({
      algorithm: PixelationAlgorithm.CustomSize,
      converting: false,
    });
    expect(manager.getSnapshot().settings.mode).toBe(PixelationMode.RecoverGrid);
    await manager.changeAlgorithm(PixelationAlgorithm.Resize);
    expect(manager.getSnapshot().settings.mode).toBe(PixelationMode.Convert);
    manager.dispose();
  });
  it("opens pixel art on PixelOE + lines too, and calls it restored only with None", async () => {
    const detectGrid = async () => ({
      width: 4,
      height: 3,
      cellWidth: 2,
      cellHeight: 2,
      offsetX: 0,
      offsetY: 0,
      confidence: 1,
      reliable: true,
    });
    const manager = new PixelationManager({ ...port(), detectGrid: detectGrid as never });
    await manager.open(new File([], "art.png"));
    expect(manager.getSnapshot().settings).toMatchObject({
      mode: PixelationMode.RecoverGrid,
      prepass: OutlinePrepass.PixeloeLines,
      colorPicker: CellColorPicker.Contrast,
      reduceColors: false,
    });
    expect(restoresPixels(manager.getSnapshot())).toBe(false);
    manager.changeSettings({ prepass: OutlinePrepass.None });
    expect(restoresPixels(manager.getSnapshot())).toBe(true);
    manager.dispose();
  });
  it("keeps the automatic palette for the menu while a preset is loaded at the same settings", async () => {
    const red = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const manager = new PixelationManager({ ...port(), convert: vi.fn(async () => red) });
    await manager.open(new File([], "a.png"));
    const settled = () => vi.waitFor(() => expect(manager.getSnapshot().converting).toBe(false));
    manager.changeSettings({ reduceColors: true, maxColors: 8 });
    await settled();
    const automatic = manager.getSnapshot().palettePreview;
    expect(automatic).toEqual([[255, 0, 0, 255]]);
    manager.changeSettings({ palette: [[0, 0, 255, 255]], paletteName: "Blue" });
    await settled();
    expect(manager.getSnapshot().palettePreview).toBe(automatic);
    // Anything else changing under the preset leaves the automatic palette unknown.
    manager.changeSettings({ removeNoise: true });
    await settled();
    expect(manager.getSnapshot().palettePreview).toEqual([]);
    manager.changeSettings({ palette: null, paletteName: "" });
    await settled();
    expect(manager.getSnapshot().palettePreview).toEqual([[255, 0, 0, 255]]);
    manager.dispose();
  });
});
