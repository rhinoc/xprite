import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  AnimalCrossingExportManager,
  type AnimalCrossingExportPort,
} from "$/managers/files/animal-crossing-export";
import { defaultAnimalCrossingSettings } from "@xprite/editor-core/import-export";

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

describe("editor Animal Crossing exports", () => {
  it("captures the selected artifact and refuses duplicate downloads while saving", async () => {
    const names: string[] = [];
    let resolveSave!: () => void;
    const port: AnimalCrossingExportPort = {
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
    manager.generate();
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
      save: () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
      saveQr: async () => {},
    };
    const manager = new AnimalCrossingExportManager(source(), port);
    const disconnect = manager.connect();
    manager.generate();
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
});
