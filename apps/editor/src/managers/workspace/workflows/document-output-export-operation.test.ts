import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { describe, it } from "vitest";

import { createAnimalCrossingExportSource } from "$/managers/files/animal-crossing-export";
import { DocumentOutputExportOperation } from "$/managers/workspace/workflows/document-output-export-operation";
import type { RasterEditor } from "@xprite/editor-core";
import { cloneGraph, PixelStorageFormat } from "@xprite/editor-core/base";
import { createEncodedPixelBuffer, type EditorDocument } from "@xprite/editor-core/document";
import {
  defaultSpriteSheetOptions,
  renderExportAnimation,
  renderSpriteSheet,
} from "@xprite/editor-core/import-export";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const owner = (key: string) => ({ core: {} as RasterEditor, key });

describe("document output ownership", () => {
  it("keeps lazy linked cel storage readable by animation, sheet and Animal Crossing exports", () => {
    const rgba = new Uint8ClampedArray([32, 64, 128, 255]);
    const pixels = createEncodedPixelBuffer(1, 1, {
      format: PixelStorageFormat.ZlibRgba,
      byteLength: rgba.byteLength,
      bytes: new Uint8Array(deflateSync(rgba)),
      hasHiddenRgb: false,
    });
    const document: EditorDocument = {
      name: "linked.aseprite",
      width: 1,
      height: 1,
      selection: null,
      layer: { name: "Image", pixels, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "image", name: "Image", visible: true, locked: false, opacity: 255, flags: 1 },
        ],
        frames: Array.from({ length: 2 }, () => ({
          duration: 100,
          cels: [{ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }],
        })),
      },
    };
    const detached = cloneGraph(document);
    const stored = detached.timeline!.frames[0].cels[0]!.pixels;
    assert.notEqual(stored, pixels);
    assert.equal(stored, detached.timeline!.frames[1].cels[0]!.pixels);
    assert.equal(stored, detached.layer.pixels);
    assert.notEqual(stored.encoded!.bytes, pixels.encoded!.bytes);
    assert.equal(Object.getOwnPropertyDescriptor(stored, "data")!.enumerable, false);
    const options = defaultSpriteSheetOptions(detached);
    const frames = renderExportAnimation(detached, options);
    assert.equal(frames.length, 2);
    for (const frame of frames) assert.deepEqual(frame.pixels.data, rgba);
    const sheet = renderSpriteSheet(detached, options);
    assert.deepEqual([...sheet.pixels.data], [...rgba, ...rgba]);
    assert.deepEqual(createAnimalCrossingExportSource(detached).pixels.data, rgba);
    assert.equal(Object.getOwnPropertyDescriptor(pixels, "data")!.enumerable, false);
  });

  it("finishes authorized writes while suppressing an old owner's app callbacks", async () => {
    let active = owner("first");
    const busy: boolean[] = [];
    const effects: string[] = [];
    const operation = new DocumentOutputExportOperation(
      () => active,
      (value) => busy.push(value),
    );
    const disconnect = operation.connect();
    const write = deferred<void>();
    const first = operation.run(
      active,
      async (isCurrent) => {
        await write.promise;
        effects.push("file written");
        if (isCurrent()) effects.push("export preference written");
        return "generated image";
      },
      () => effects.push("open generated image"),
      () => effects.push("error"),
    );
    active = owner("second");
    write.resolve();
    await first;
    assert.deepEqual(effects, ["file written"]);
    assert.equal(operation.busy, false);
    disconnect();
    const disconnectSecond = operation.connect();
    await operation.run(
      active,
      async () => "new image",
      (result) => effects.push(result),
      () => effects.push("error"),
    );
    assert.deepEqual(effects, ["file written", "new image"]);
    assert.deepEqual(busy, [false, true, false, true, false]);
    disconnectSecond();
  });

  it("does not revive disconnected promises or release a new export during reconnect", async () => {
    const active = owner("document");
    const busy: boolean[] = [];
    const effects: string[] = [];
    const operation = new DocumentOutputExportOperation(
      () => active,
      (value) => busy.push(value),
    );
    const disconnect = operation.connect();
    const oldWrite = deferred<void>();
    const old = operation.run(
      active,
      async () => oldWrite.promise,
      () => effects.push("old complete"),
      () => effects.push("old error"),
    );
    disconnect();
    const reconnectCleanup = operation.connect();
    const newWrite = deferred<void>();
    const current = operation.run(
      active,
      async () => newWrite.promise,
      () => effects.push("new complete"),
      () => effects.push("new error"),
    );
    await operation.run(
      active,
      async () => effects.push("duplicate"),
      undefined,
      () => {},
    );
    oldWrite.reject(new Error("old write failed"));
    await old;
    assert.deepEqual(effects, []);
    assert.equal(operation.busy, true);
    assert.deepEqual(busy, [false, true, false, true]);
    newWrite.resolve();
    await current;
    assert.deepEqual(effects, ["new complete"]);
    assert.equal(operation.busy, false);
    assert.deepEqual(busy, [false, true, false, true, false]);
    reconnectCleanup();
  });

  it("suppresses post-disconnect completion and busy publication", async () => {
    const active = owner("disposed");
    const busy: boolean[] = [];
    const effects: string[] = [];
    const operation = new DocumentOutputExportOperation(
      () => active,
      (value) => busy.push(value),
    );
    const disconnect = operation.connect();
    const write = deferred<void>();
    const saving = operation.run(
      active,
      async () => write.promise,
      () => effects.push("completed"),
      () => effects.push("error"),
    );
    disconnect();
    write.resolve();
    await saving;
    assert.deepEqual(effects, []);
    assert.deepEqual(busy, [false, true]);
    assert.equal(operation.busy, false);
  });
});
