import { describe, expect, it, vi } from "vitest";

import { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import type { PixelationPort } from "$/managers/ports/pixelation";

const image = (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(255),
});
function port(): PixelationPort {
  return {
    readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
    paletteResources: () => ({ choices: [], defaultPalette: [] }),
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
});
