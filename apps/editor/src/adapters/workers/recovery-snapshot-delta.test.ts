import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { decodeRecoverySnapshot } from "$/adapters/workers/recovery-codec";
import {
  RecoveryCodecClient,
  RecoveryCodecSnapshotOwnership,
} from "$/adapters/workers/recovery-codec-client";
import type { RecoveryCodecRequest } from "$/adapters/workers/recovery-codec-worker";
import {
  RecoveryCompression,
  compressRecoveryBytes,
} from "$/adapters/workers/recovery-compression";
import {
  RecoverySnapshotDeltaReceiver,
  RecoverySnapshotDeltaSender,
} from "$/adapters/workers/recovery-snapshot-delta";
import { CommittedPersistenceCapture, type EditorPersistenceSnapshot } from "@xprite/editor-core";

function snapshot(data: Uint8ClampedArray, name = "Art"): EditorPersistenceSnapshot {
  const pixels = { width: 1, height: 1, data };
  return {
    version: 1,
    dirty: true,
    document: {
      name,
      width: 1,
      height: 1,
      selection: null,
      layer: { name: "Pixels", x: 0, y: 0, visible: true, locked: false, pixels },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "layer", name: "Pixels", visible: true, locked: false, opacity: 255, flags: 3 },
        ],
        frames: [{ duration: 100, cels: [{ x: 0, y: 0, opacity: 255, zIndex: 0, pixels }] }],
      },
    },
  };
}

function pauseHash() {
  let begin!: () => void;
  let resume!: () => void;
  let input: Uint8Array | undefined;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const compression = new RecoveryCompression(
    compressRecoveryBytes,
    1024 * 1024,
    512,
    async (bytes) => {
      input = bytes;
      const key = [...bytes].join(",");
      begin();
      await gate;
      return key;
    },
  );
  return { compression, started, resume: () => resume(), input: () => input };
}

function injectCompression(client: RecoveryCodecClient, compression: RecoveryCompression): void {
  // A controllable asynchronous digest reproduces mutations between hash and
  // compression without needing a Worker or executing timing-dependent sleeps.
  (client as unknown as { fallbackCompression: RecoveryCompression }).fallbackCompression =
    compression;
}

describe("recovery worker snapshot deltas", () => {
  it("captures workerless mutable recovery input before imports and delayed hashing", async () => {
    for (const hasTimeline of [true, false]) {
      const client = new RecoveryCodecClient({ worker: null });
      const delayed = pauseHash();
      injectCompression(client, delayed.compression);
      const data = new Uint8ClampedArray([1, 2, 3, 255]);
      const mutable = snapshot(data);
      if (!hasTimeline) delete mutable.document.timeline;
      const encoding = client.encode(mutable);
      data[0] = 42; // Before lazy codec imports finish.
      await delayed.started;
      data[0] = 99; // After hashing, before asynchronous deflate resumes.
      delayed.resume();
      const decoded = await decodeRecoverySnapshot(await encoding);
      assert.deepEqual(decoded.document.layer.pixels.data, new Uint8ClampedArray([1, 2, 3, 255]));
      assert.equal(data[0], 99);
      client.close();
    }
  });

  it("captures mutable recent input before yielding and borrows explicit immutable recent bytes", async () => {
    for (const ownership of [
      RecoveryCodecSnapshotOwnership.Copy,
      RecoveryCodecSnapshotOwnership.Immutable,
    ]) {
      const client = new RecoveryCodecClient({ worker: null });
      const delayed = pauseHash();
      injectCompression(client, delayed.compression);
      const pixels = new Uint8Array(32 * 32 * 4).fill(17);
      const source = { width: 32, height: 32, rgba: pixels.buffer };
      const packing = client.packRecent(source, ownership);
      if (ownership === RecoveryCodecSnapshotOwnership.Copy) pixels[0] = 42;
      await delayed.started;
      assert.equal(
        delayed.input()!.buffer === pixels.buffer,
        ownership === RecoveryCodecSnapshotOwnership.Immutable,
        "only explicit immutable borrowing keeps the caller buffer",
      );
      if (ownership === RecoveryCodecSnapshotOwnership.Copy) pixels[0] = 99;
      delayed.resume();
      const restored = await client.unpackRecent(await packing);
      assert.deepEqual(new Uint8Array(restored.rgba), new Uint8Array(32 * 32 * 4).fill(17));
      assert.equal(pixels.byteLength, 32 * 32 * 4);
      client.close();
    }
  });

  it("uses deltas only for branded immutable snapshots and resets after failed encoding", async () => {
    class Worker extends EventTarget {
      readonly receiver = new RecoverySnapshotDeltaReceiver();
      readonly messages: RecoveryCodecRequest[] = [];
      failNext = false;
      postMessage(request: RecoveryCodecRequest): void {
        const copy = structuredClone(request);
        this.messages.push(copy);
        if (copy.operation === "encode-delta") this.receiver.decode(copy.delta);
        const failed = this.failNext;
        this.failNext = false;
        queueMicrotask(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: failed
                ? { id: copy.id, ok: false, error: "Failed encode" }
                : { id: copy.id, ok: true, result: new Uint8Array([1]) },
            }),
          );
        });
      }
    }
    const worker = new Worker();
    const client = new RecoveryCodecClient({ worker });
    const mutable = snapshot(new Uint8ClampedArray([1, 2, 3, 4]));
    await client.encode(mutable);
    await client.encode(mutable);
    assert.equal(worker.messages[0].operation, "encode");
    assert.equal(worker.messages[1].operation, "encode");
    const capture = new CommittedPersistenceCapture();
    const trusted = capture.capture(mutable, 0, () => 0);
    await client.encode(trusted);
    await client.encode(trusted);
    const repeated = worker.messages[3];
    assert.equal(repeated.operation, "encode-delta");
    if (repeated.operation === "encode-delta") assert.equal(repeated.delta.additions.size, 0);
    worker.failNext = true;
    await assert.rejects(client.encode(trusted), /Failed encode/);
    await client.encode(trusted);
    const retry = worker.messages[5];
    assert.equal(retry.operation, "encode-delta");
    if (retry.operation === "encode-delta") {
      assert.equal(retry.delta.reset, true);
      assert.ok(retry.delta.additions.size > 0);
    }
    assert.equal(trusted.document.layer.pixels.data.byteLength, 4);
    client.close();
  });

  it("omits retained pixels, preserves shared identity and never detaches caller buffers", () => {
    const sender = new RecoverySnapshotDeltaSender();
    const receiver = new RecoverySnapshotDeltaReceiver();
    const pixels = new Uint8ClampedArray([12, 34, 56, 255]);
    const first = sender.encode(snapshot(pixels));
    assert.equal(first.additions.size, 1);
    const a = receiver.decode(structuredClone(first));
    const second = sender.encode(snapshot(pixels, "Renamed"));
    assert.equal(second.additions.size, 0);
    const b = receiver.decode(structuredClone(second));
    assert.equal(b.document.name, "Renamed");
    assert.equal(b.document.layer.pixels.data, a.document.layer.pixels.data);
    assert.equal(b.document.layer.pixels, b.document.timeline!.frames[0].cels[0]!.pixels);
    assert.deepEqual(pixels, new Uint8ClampedArray([12, 34, 56, 255]));
    assert.notEqual(a.document.layer.pixels.data, pixels);
    const nextPixels = pixels.slice();
    nextPixels[0] = 42;
    const third = sender.encode(snapshot(nextPixels));
    assert.equal(third.additions.size, 1);
    const c = receiver.decode(structuredClone(third));
    assert.equal(c.document.layer.pixels.data[0], 42);
    assert.equal(a.document.layer.pixels.data[0], 12, "in-flight older snapshots remain immutable");
    sender.clear();
    const retry = sender.encode(snapshot(nextPixels));
    assert.equal(retry.reset, true);
    assert.equal(retry.additions.size, 1);
    assert.deepEqual(receiver.decode(structuredClone(retry)), c);
  });

  it("evicts retained buffers and counts full backing allocations for slice views", () => {
    const sender = new RecoverySnapshotDeltaSender(8, 1);
    const receiver = new RecoverySnapshotDeltaReceiver(8, 1);
    const a = new Uint8ClampedArray([1, 2, 3, 4]);
    const b = new Uint8ClampedArray([5, 6, 7, 8]);
    receiver.decode(structuredClone(sender.encode(snapshot(a))));
    receiver.decode(structuredClone(sender.encode(snapshot(b))));
    const evicted = sender.encode(snapshot(a));
    assert.equal(evicted.additions.size, 1);
    assert.equal(evicted.retained.length, 1);
    assert.deepEqual(receiver.decode(structuredClone(evicted)).document.layer.pixels.data, a);
    const big = new Uint8ClampedArray(16).subarray(0, 4);
    const inline = sender.encode(snapshot(big));
    assert.equal(inline.additions.size, 0, "small view does not hide a large backing buffer");
    assert.deepEqual(receiver.decode(structuredClone(inline)).document.layer.pixels.data, big);
    assert.equal(sender.encode(snapshot(big)).additions.size, 0);
  });

  it("rejects missing cached buffers so the client can reset and retry", () => {
    const sender = new RecoverySnapshotDeltaSender();
    const receiver = new RecoverySnapshotDeltaReceiver();
    const source = snapshot(new Uint8ClampedArray([1, 2, 3, 4]));
    sender.encode(source); // Lost first packet / restarted worker.
    assert.throws(() => receiver.decode(structuredClone(sender.encode(source))), /Missing/);
    sender.clear();
    assert.deepEqual(receiver.decode(structuredClone(sender.encode(source))), source);
  });
});
