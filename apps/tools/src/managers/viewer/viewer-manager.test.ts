import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { ViewerPort } from "$/managers/ports/viewer";
import { ViewerManager } from "$/managers/viewer/viewer-manager";
import type { SessionProject } from "@xprite/editor-core/session";
import { AppearanceMode } from "@xprite/editor-ui/appearance";

function project(gamma: number): SessionProject {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray([128, 64, 32, 255]) };
  return {
    image,
    timeline: {
      activeFrame: 0,
      activeLayer: 0,
      colorProfile: { type: "srgb", gamma },
      layers: [
        { id: "image", name: "Image", visible: true, locked: false, opacity: 255, flags: 0 },
      ],
      frames: [100, 200].map((duration) => ({
        duration,
        cels: [{ pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      })),
    },
  };
}

describe("viewer presentation frame reuse", () => {
  it("reuses immutable frames while preserving duration, visibility and file/profile changes", async () => {
    let imported = project(1.8);
    const port: ViewerPort = {
      readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
      readAppearance: () => AppearanceMode.Light,
      watchAppearance: () => () => {},
      read: async () => imported,
      example: async () => new File([], "example.ase"),
      saveFrame: async () => {},
      saveAnimation: async () => {},
      edit: async () => {},
    };
    const manager = new ViewerManager(port);
    const file = new File([], "animation.ase");
    await manager.open(file);
    const first = manager.getSnapshot().pixels!;
    const firstBytes = first.data.slice();
    manager.selectFrame(1);
    const second = manager.getSnapshot().pixels!;
    assert.notEqual(second, first);
    assert.equal(manager.getSnapshot().duration, 200);
    manager.selectFrame(0);
    assert.equal(manager.getSnapshot().pixels, first);
    assert.equal(manager.getSnapshot().duration, 100);
    manager.toggleLayer("image");
    const hidden = manager.getSnapshot().pixels!;
    assert.notEqual(hidden, first);
    assert.equal(hidden.data[3], 0);
    manager.toggleLayer("image");
    assert.equal(manager.getSnapshot().pixels, first);
    manager.setAppearanceMode(AppearanceMode.Dark);
    manager.selectFrame(0);
    assert.equal(manager.getSnapshot().pixels, first);
    imported = project(2.2);
    await manager.open(file);
    const replaced = manager.getSnapshot().pixels!;
    assert.notEqual(replaced, first);
    assert.notDeepEqual(replaced.data, firstBytes);
    assert.deepEqual(first.data, firstBytes);
    assert.deepEqual([...imported.image.data], [128, 64, 32, 255]);
    manager.dispose();
  });
});
