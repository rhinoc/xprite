import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  AnimalCrossingExportManager,
  type AnimalCrossingExportPort,
} from "$/managers/files/animal-crossing-export";
import {
  animalCrossingQrPixels,
  convertAnimalCrossing,
  defaultAnimalCrossingSettings,
} from "@xprite/editor-core/import-export";

const pixels = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
};
function source() {
  return {
    name: "village.aseprite",
    pixels,
    settings: { ...defaultAnimalCrossingSettings(pixels), cellWidth: 1 },
  };
}

const preview: AnimalCrossingExportPort["preview"] = async (pixels, settings, selected) => {
  const result = convertAnimalCrossing(pixels, settings);
  return { result, selected, qr: animalCrossingQrPixels(result.patterns[selected].bytes) };
};

describe("editor Animal Crossing exports", () => {
  it("captures the selected artifact and refuses duplicate downloads while saving", async () => {
    const names: string[] = [];
    let resolveSave!: () => void;
    const port: AnimalCrossingExportPort = {
      releasePreview: () => {},
      preview,
      save: async (_result, name) => {
        names.push(name);
      },
      saveQr: (_pixels, name) => {
        names.push(name);
        return new Promise<void>((resolve) => {
          resolveSave = resolve;
        });
      },
    };
    const manager = new AnimalCrossingExportManager(source(), port);
    await manager.generate();
    manager.select(1);
    const saving = manager.downloadQr();
    manager.select(0);
    manager.changeSettings({ title: "Changed during export" });
    await manager.download();
    await manager.downloadQr();
    assert.equal(manager.getSnapshot().busy, true);
    assert.deepEqual(names, ["r1-c2-qr.png"]);
    assert.notEqual(manager.getSnapshot().settings.title, "Changed during export");
    resolveSave();
    await saving;
    assert.equal(manager.getSnapshot().busy, false);
    await manager.download();
    assert.deepEqual(names, ["r1-c2-qr.png", "village-animal-crossing.zip"]);
  });

  it("ignores a failed old export after cleanup and a new connection", async () => {
    let rejectSave!: (reason: Error) => void;
    const port: AnimalCrossingExportPort = {
      releasePreview: () => {},
      preview,
      save: () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
      saveQr: async () => {},
    };
    const manager = new AnimalCrossingExportManager(source(), port);
    const disconnect = manager.connect();
    await manager.generate();
    const saving = manager.download();
    disconnect();
    const disconnectAgain = manager.connect();
    const current = manager.getSnapshot();
    rejectSave(new Error("Old export failed"));
    await saving;
    assert.equal(manager.getSnapshot(), current);
    assert.equal(manager.getSnapshot().error, null);
    assert.equal(manager.getSnapshot().busy, false);
    await manager.downloadQr();
    assert.equal(manager.getSnapshot().error, null);
    disconnectAgain();
  });
  it("rejects stale preview completions and prevents downloading a pending draft", async () => {
    type Preview = Awaited<ReturnType<AnimalCrossingExportPort["preview"]>>;
    const calls: { signal: AbortSignal; complete(): Promise<void> }[] = [];
    let downloads = 0;
    const port: AnimalCrossingExportPort = {
      releasePreview: () => {},
      preview: (pixels, settings, selected, signal) =>
        new Promise<Preview>((resolve) => {
          calls.push({
            signal,
            complete: async () => resolve(await preview(pixels, settings, selected, signal)),
          });
        }),
      save: async () => {
        downloads++;
      },
      saveQr: async () => {
        downloads++;
      },
    };
    const manager = new AnimalCrossingExportManager(source(), port);
    const first = manager.generate();
    await calls[0].complete();
    await first;
    manager.changeSettings({ title: "Superseded" });
    await manager.downloadQr();
    assert.equal(downloads, 0);
    const obsolete = manager.generate();
    manager.changeSettings({ title: "Latest" });
    assert.equal(calls[1].signal.aborted, true);
    const latest = manager.generate();
    await calls[2].complete();
    await latest;
    const current = manager.getSnapshot();
    assert.equal(current.result!.patterns[0].title, "Latest 1-1");
    await calls[1].complete();
    await obsolete;
    assert.equal(manager.getSnapshot(), current);
    assert.equal(current.pending, false);
  });
});
