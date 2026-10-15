import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { AnimalCrossingManager } from "$/managers/animal-crossing/animal-crossing-manager";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import {
  animalCrossingQrPixels,
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
    preview: async (pixels, settings, selected) => {
      const result = convertAnimalCrossing(pixels, settings);
      return { result, selected, qr: animalCrossingQrPixels(result.patterns[selected].bytes) };
    },
    releasePreview: () => {},
    readWheel: () => ({ precise: false, magnify: false, zoom: false, shift: false, unit: 1 }),
    read: async () => ({ pixels: pixels() }),
    example: async () => new File([], "example.png"),
    save: async () => {},
    saveQr: async () => {},
    edit: async () => {},
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
    await manager.generate();
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
    await manager.generate();
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
    await manager.generate();
    const saving = manager.download();
    assert.equal(manager.getSnapshot().downloading, true);
    const downloading = manager.getSnapshot();
    manager.dispose();
    rejectSave(new Error("Old download failed"));
    await saving;
    assert.equal(manager.getSnapshot(), downloading);
  });

  it("opens the converted design in the editor as a PNG-named result", async () => {
    const edited: { pixels: unknown; name: string }[] = [];
    const manager = new AnimalCrossingManager(
      port({ edit: async (pixels, name) => void edited.push({ pixels, name }) }),
    );
    await manager.open(new File([], "garden.png"));
    await manager.edit();
    assert.equal(edited.length, 1);
    assert.equal(edited[0].name, "garden-animal-crossing.png");
    assert.equal(edited[0].pixels, manager.getSnapshot().result!.pixels);
    manager.dispose();
  });
  it("reports an editor hand-off failure and stays usable", async () => {
    const manager = new AnimalCrossingManager(
      port({
        edit: async () => {
          throw new Error("storage unavailable");
        },
      }),
    );
    await manager.open(new File([], "garden.png"));
    await manager.edit();
    const snapshot = manager.getSnapshot();
    assert.equal(snapshot.error, "The editor could not be opened. Please try again.");
    assert.equal(snapshot.downloading, false);
    manager.dispose();
  });
  it("does not open the editor before there is a result", async () => {
    let calls = 0;
    const manager = new AnimalCrossingManager(port({ edit: async () => void calls++ }));
    await manager.edit();
    assert.equal(calls, 0);
    manager.dispose();
  });
});
