import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { AnimalCrossingManager } from "$/managers/animal-crossing/animal-crossing-manager";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import {
  convertAnimalCrossing,
  defaultAnimalCrossingSettings,
  readAnimalCrossingPattern,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

function pixels(value = 128) {
  return { width: 1, height: 1, data: new Uint8ClampedArray([value, 64, 32, 255]) };
}
function port(patch: Partial<AnimalCrossingPort> = {}): AnimalCrossingPort {
  return {
    readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
    read: async () => ({ pixels: pixels() }),
    example: async () => new File([], "example.png"),
    save: async () => {},
    saveQr: async () => {},
    ...patch,
  };
}

describe("Animal Crossing tool lifecycle", () => {
  it("preserves imported QR bytes through selection and saving", async () => {
    const image = pixels();
    const bytes = convertAnimalCrossing(
      image,
      defaultAnimalCrossingSettings(image),
    ).patterns[0].bytes.slice();
    bytes[0x57] = 123;
    const pattern = readAnimalCrossingPattern(bytes);
    let saved: Uint8Array | undefined;
    const manager = new AnimalCrossingManager(
      port({
        read: async () => ({ pixels: pattern.pixels, pattern }),
        save: async (result, name) => {
          assert.equal(name, "imported-animal-crossing.zip");
          saved = result.patterns[0].bytes;
        },
      }),
    );
    await manager.open(new File([], "imported.acnl"));
    manager.changeSettings({ title: "New name" });
    manager.generate();
    await manager.download();
    assert.equal(manager.getSnapshot().importedQr, true);
    assert.deepEqual(saved, bytes);
    manager.dispose();
  });

  it("keeps conversion drafts while switching project frames and invalidates old QR output", async () => {
    const image = pixels();
    const second = pixels(255);
    const project: SessionProject = {
      image,
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "image", name: "Image", visible: true, locked: false, opacity: 255, flags: 0 },
        ],
        frames: [image, second].map((frame) => ({
          duration: 100,
          cels: [{ pixels: frame, x: 0, y: 0, opacity: 255, zIndex: 0 }],
        })),
      },
    };
    const manager = new AnimalCrossingManager(
      port({ read: async () => ({ pixels: image, project }) }),
    );
    await manager.open(new File([], "frames.aseprite"));
    manager.changeSettings({ title: "Frame draft" });
    manager.generate();
    assert.ok(manager.getSnapshot().qr);
    manager.setFrame(1);
    assert.equal(manager.getSnapshot().frame, 1);
    assert.equal(manager.getSnapshot().settings.title, "Frame draft");
    assert.equal(manager.getSnapshot().source!.data[0], 255);
    assert.equal(manager.getSnapshot().result, null);
    assert.equal(manager.getSnapshot().qr, null);
    assert.equal(project.timeline.activeFrame, 0);
    manager.dispose();
  });

  it("ignores stale reads and post-disposal download completion", async () => {
    let resolveOld!: (source: { pixels: ReturnType<typeof pixels> }) => void;
    let rejectSave!: (reason: Error) => void;
    const manager = new AnimalCrossingManager(
      port({
        read: (file) =>
          file.name === "old.png"
            ? new Promise((resolve) => {
                resolveOld = resolve;
              })
            : Promise.resolve({ pixels: pixels(255) }),
        save: () =>
          new Promise<void>((_resolve, reject) => {
            rejectSave = reject;
          }),
      }),
    );
    const old = manager.open(new File([], "old.png"));
    await manager.open(new File([], "current.png"));
    const current = manager.getSnapshot();
    resolveOld({ pixels: pixels() });
    await old;
    assert.equal(manager.getSnapshot(), current);
    manager.generate();
    const saving = manager.download();
    assert.equal(manager.getSnapshot().downloading, true);
    const downloading = manager.getSnapshot();
    manager.dispose();
    rejectSave(new Error("Old download failed"));
    await saving;
    assert.equal(manager.getSnapshot(), downloading);
  });
});
