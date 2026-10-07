import assert from "node:assert/strict";
import fs from "node:fs";

import { build } from "esbuild";
import { zlibSync } from "fflate";
import { describe, it } from "vitest";

describe("recovery-codec", () => {
  it("recovery-codec behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './apps/editor/src/adapters/workers/recovery-codec.ts'; export * from './apps/editor/src/adapters/workers/recovery-codec-client.ts'; export * from './apps/editor/src/adapters/files/aseprite-files.ts'; export * from './packages/editor-core/src/import-export/aseprite/project.ts'; export { activateTimelineCel } from './packages/editor-core/src/document/document.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
    );
    function snapshot(project, name, format = "aseprite") {
      const document = {
        name,
        format,
        width: project.image.width,
        height: project.image.height,
        palette: project.palette,
        timeline: project.timeline,
        selection: null,
        layer: { name: "", visible: true, locked: false, x: 0, y: 0, pixels: project.image },
      };
      api.activateTimelineCel(document, Math.min(2, project.timeline.frames.length - 1), 0);
      return { version: 1, document, dirty: true };
    }
    for (const name of ["xprite.ase"]) {
      const project = await api.decodeAsepriteBlob(
        new Blob([fs.readFileSync("apps/editor/assets/examples/xprite/xprite.ase")]),
        name,
      );
      project.timeline.loopCount = 3;
      const source = snapshot(project, name);
      const before = structuredClone(source);
      const bytes = await api.encodeRecoverySnapshot(source);
      assert.deepEqual(source, before, "encoding cannot mutate or detach the source");
      const restored = await api.decodeRecoverySnapshot(bytes);
      const compressed = await api.encodeRecoverySnapshot(source, zlibSync);
      assert.deepEqual(source, before, "compressed encoding cannot mutate the source");
      const compressedRestored = await api.decodeRecoverySnapshot(compressed);
      assert.deepEqual(compressedRestored.document.layer.pixels, restored.document.layer.pixels);
      assert.equal(compressedRestored.document.timeline.loopCount, 3);
      assert.equal(
        compressedRestored.document.timeline.activeFrame,
        source.document.timeline.activeFrame,
      );
      for (let i = 0; i < restored.document.timeline.frames.length; i++) {
        const expectedFrame = restored.document.timeline.frames[i];
        const compressedFrame = compressedRestored.document.timeline.frames[i];
        assert.equal(compressedFrame.duration, expectedFrame.duration);
        assert.deepEqual(
          compressedFrame.cels.map((cel) => cel?.pixels),
          expectedFrame.cels.map((cel) => cel?.pixels),
        );
      }
      assert.equal(restored.dirty, true);
      assert.equal(restored.document.name, name);
      assert.equal(restored.document.format, "aseprite");
      assert.equal(
        restored.document.timeline.loopCount,
        3,
        "recovery retains finite animation play counts",
      );
      assert.equal(restored.document.timeline.activeFrame, source.document.timeline.activeFrame);
      const expected = api.asepriteFromProject(
        api.projectFromDocument(structuredClone(source.document)),
      );
      const actual = api.asepriteFromProject(api.projectFromDocument(restored.document));
      assert.deepEqual(actual.layers, expected.layers);
      assert.deepEqual(actual.tags, expected.tags);
      assert.deepEqual(actual.palette, expected.palette);
      assert.equal(actual.frames.length, expected.frames.length);
      for (let i = 0; i < actual.frames.length; i++) {
        assert.equal(actual.frames[i].duration, expected.frames[i].duration);
        assert.deepEqual(
          actual.frames[i].cels.map(({ source: _source, ...cel }) => cel),
          expected.frames[i].cels.map(({ source: _source, ...cel }) => cel),
        );
      }
    }
    const png = {
      version: 1,
      dirty: false,
      document: {
        name: "tiny.png",
        format: "png",
        width: 2,
        height: 1,
        selection: null,
        palette: [[255, 0, 0, 255]],
        layer: {
          name: "Pixels",
          x: 0,
          y: 0,
          visible: true,
          locked: false,
          pixels: {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
          },
        },
      },
    };
    const client = new api.RecoveryCodecClient({ worker: null });
    const encoded = await client.encode(png);
    const result = await client.decode(encoded);
    assert.equal(result.document.format, "png");
    assert.equal(result.document.name, "tiny.png");
    assert.equal(result.dirty, false);
    assert.deepEqual(result.document.layer.pixels.data, png.document.layer.pixels.data);
    assert.deepEqual(result.document.palette, png.document.palette);
    const recentSnapshot = {
      width: 32,
      height: 32,
      rgba: new Uint8Array(32 * 32 * 4).fill(17).buffer,
    };
    const packedRecent = await client.packRecent(recentSnapshot);
    assert.ok(packedRecent.compressed.size > 0);
    assert.deepEqual(await client.unpackRecent(structuredClone(packedRecent)), recentSnapshot);
    const capped = structuredClone(png);
    capped.document.width = 32;
    capped.document.layer.pixels = {
      width: 32,
      height: 1,
      data: new Uint8ClampedArray(32 * 4).fill(17),
    };
    const cappedBytes = await api.encodeRecoverySnapshot(capped);
    await assert.rejects(
      api.decodeRecoverySnapshot(cappedBytes, { maxInflatedBytes: 32 * 4 - 1 }),
      /limit/,
      "a per-cel inflation cap must apply without an explicit stream override",
    );
    // Valid editing data must also survive recovery above the old 64 MiB ceiling.
    const width = 2048,
      height = 3072;
    const cels = Array.from({ length: 3 }, (_, index) => {
      const pixels = { width, height, data: new Uint8ClampedArray(width * height * 4) };
      pixels.data.set([index + 1, 12, 27, 255]);
      return { pixels, x: 0, y: 0, opacity: 255, zIndex: 0 };
    });
    const large = structuredClone(png);
    Object.assign(large.document, { width, height, name: "large.aseprite", format: "aseprite" });
    large.document.layer.pixels = cels[0].pixels;
    large.document.timeline = {
      activeFrame: 0,
      activeLayer: 0,
      layers: [
        { id: "large", name: "Large", visible: true, locked: false, opacity: 255, flags: 3 },
      ],
      frames: cels.map((cel) => ({ duration: 100, cels: [cel] })),
    };
    const largeBytes = await api.encodeRecoverySnapshot(large);
    assert.ok(
      largeBytes.byteLength < 1024 * 1024,
      "default worker encoding compresses repeated pixels",
    );
    const largeRestored = await api.decodeRecoverySnapshot(largeBytes);
    assert.equal(largeRestored.document.timeline.frames.length, 3);
    for (let index = 0; index < cels.length; index++) {
      const image = largeRestored.document.timeline.frames[index].cels[0].pixels;
      assert.equal(image.data.byteLength, width * height * 4);
      assert.deepEqual(image.data.subarray(0, 4), cels[index].pixels.data.subarray(0, 4));
    }
    for (const [offset, value, regex] of [
      [0, 0, /magic/],
      [8, 2, /version/],
      [12, 0xff, /bounds|JSON|Unexpected/],
      [16, 0, /bounds/],
    ]) {
      const bad = encoded.slice();
      bad[offset] = value;
      await assert.rejects(client.decode(bad), regex);
    }
    await assert.rejects(client.decode(encoded.subarray(0, encoded.length - 1)), /bounds/);
    await assert.rejects(client.decode(new Uint8Array(10)), /size/);
    client.close();
    await assert.rejects(client.encode(png), /closed/);
    class FakeWorker extends EventTarget {
      terminated = false;
      postMessage(request) {
        const cloned = structuredClone(request);
        queueMicrotask(async () => {
          try {
            const result =
              cloned.operation === "encode"
                ? await api.encodeRecoverySnapshot(cloned.snapshot)
                : await api.decodeRecoverySnapshot(cloned.bytes);
            this.dispatchEvent(
              new MessageEvent("message", { data: { id: cloned.id, ok: true, result } }),
            );
          } catch (error) {
            this.dispatchEvent(
              new MessageEvent("message", {
                data: { id: cloned.id, ok: false, error: error.message },
              }),
            );
          }
        });
      }
      terminate() {
        this.terminated = true;
      }
    }
    const worker = new FakeWorker();
    const threaded = new api.RecoveryCodecClient({ worker });
    const original = structuredClone(png);
    const [a, b] = await Promise.all([threaded.encode(png), threaded.encode(png)]);
    assert.deepEqual(a, b);
    assert.deepEqual(png, original);
    assert.equal((await threaded.decode(a)).document.name, "tiny.png");
    const pending = threaded.encode(png);
    worker.dispatchEvent(new Event("error"));
    await assert.rejects(pending, /worker failed/);
    await assert.rejects(threaded.encode(png), /worker failed/);
    threaded.close();
    assert.equal(worker.terminated, true);
    const workers: FakeWorker[] = [];
    const restarting = new api.RecoveryCodecClient({
      workerFactory: () => {
        const next = new FakeWorker();
        workers.push(next);
        return next;
      },
    });
    const failed = restarting.encode(png);
    workers[0].dispatchEvent(new Event("error"));
    await assert.rejects(failed, /worker failed/);
    const retried = await restarting.encode(png);
    assert.equal(workers.length, 2, "explicit retry replaces the failed worker");
    assert.equal(workers[0].terminated, true);
    assert.equal((await restarting.decode(retried)).document.name, "tiny.png");
    restarting.close();
    for (const composeGroups of [false, true]) {
      const grouped = structuredClone(png);
      const pixels = grouped.document.layer.pixels;
      grouped.document.timeline = {
        composeGroups,
        activeFrame: 0,
        activeLayer: 1,
        layers: [
          {
            id: "group",
            name: "Authored group",
            kind: "group",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 83,
            blendMode: 3,
          },
          {
            id: "pixels",
            name: "Pixels",
            parentId: "group",
            kind: "image",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 255,
            blendMode: 0,
          },
        ],
        frames: [{ duration: 100, cels: [null, { pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }] }],
      };
      const restored = await api.decodeRecoverySnapshot(await api.encodeRecoverySnapshot(grouped));
      assert.equal(
        restored.document.timeline.layers[0].opacity,
        83,
        "recovery retains authored group opacity even when composition is disabled",
      );
      assert.equal(
        restored.document.timeline.layers[0].blendMode,
        3,
        "recovery retains authored group blend mode",
      );
      assert.equal(
        restored.document.timeline.composeGroups,
        composeGroups,
        "envelope retains runtime display setting independently of metadata-preserving ASE flag",
      );
    }
    console.log(
      "Recovery codec: real ASE fixtures, PNG, bounds, versions, worker ownership/failure and fallback passed.",
    );
  }, 60_000);
});
