import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  UserPresetsManager,
  DEFAULT_USER_BRUSH_FLAGS,
  restoreUserShade,
  type UserBrushSlot,
} from "$/managers/preferences/user-presets";
import { AsepriteInk } from "@xprite/editor-core";

function storage() {
  let value: unknown = null;
  return {
    load: async () => structuredClone(value),
    save: async (next: unknown) => {
      value = structuredClone(next);
    },
    close: () => {},
  };
}
function brush(id: number, locked: boolean): UserBrushSlot {
  return {
    id,
    locked,
    flags: { ...DEFAULT_USER_BRUSH_FLAGS, foreground: true, pixelPerfect: true },
    value: {
      shape: "image",
      size: 3,
      angle: -45,
      image: {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([10, 20, 30, 255]),
        mask: new Uint8Array([1]),
      },
    },
    pixelPerfect: true,
    foreground: [1, 2, 3, 255],
    background: [4, 5, 6, 255],
    ink: AsepriteInk.LockAlpha,
    opacity: 90,
    shade: [{ color: [7, 8, 9, 255], paletteIndex: 3 }],
  };
}
describe("user preset persistence", () => {
  it("restores only locked slots with image bytes, flags and attached settings", async () => {
    const port = storage();
    const manager = new UserPresetsManager(port);
    await manager.initialize();
    manager.setBrushes(() => [brush(1, true), brush(2, false)]);
    await manager.flush();
    const reopened = new UserPresetsManager(port);
    await reopened.initialize();
    const slots = reopened.getSnapshot().brushes;
    assert.equal(slots.length, 1);
    assert.deepEqual(slots[0], brush(1, true));
    assert.ok(slots[0].value.image?.data instanceof Uint8ClampedArray);
    manager.setBrushes((items) => items.map((slot) => ({ ...slot, locked: true })));
    await manager.flush();
    const locked = new UserPresetsManager(port);
    await locked.initialize();
    assert.equal(locked.getSnapshot().brushes.length, 2);
  });
  it("preserves shade palette indices and independently resets brushes and shades", async () => {
    const port = storage();
    const manager = new UserPresetsManager(port);
    await manager.initialize();
    manager.setBrushes(() => [brush(1, true)]);
    manager.saveShade([
      Object.assign([255, 0, 0, 255] as const, { paletteIndex: 5 }),
      [0, 0, 0, 255],
    ]);
    await manager.flush();
    const reopened = new UserPresetsManager(port);
    await reopened.initialize();
    assert.equal(restoreUserShade(reopened.getSnapshot().shades[0])[0].paletteIndex, 5);
    reopened.resetBrushes();
    await reopened.flush();
    const cleared = new UserPresetsManager(port);
    await cleared.initialize();
    assert.equal(cleared.getSnapshot().brushes.length, 0);
    assert.equal(cleared.getSnapshot().shades.length, 1);
    cleared.resetShades();
    await cleared.flush();
    const empty = new UserPresetsManager(port);
    await empty.initialize();
    assert.equal(empty.getSnapshot().shades.length, 0);
  });
  it("serializes writes so an older save cannot resurrect a deleted preset", async () => {
    const port = storage();
    const manager = new UserPresetsManager(port);
    await manager.initialize();
    manager.setBrushes(() => [brush(1, true)]);
    manager.resetBrushes();
    await manager.flush();
    const reopened = new UserPresetsManager(port);
    await reopened.initialize();
    assert.equal(reopened.getSnapshot().brushes.length, 0);
  });
});
