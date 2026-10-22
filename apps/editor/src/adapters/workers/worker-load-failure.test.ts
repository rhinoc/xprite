import assert from "node:assert/strict";

import { afterEach, describe, it } from "vitest";

import { ImageImportWorkerClient } from "$/adapters/workers/import-client";
import { RecoveryCodecClient } from "$/adapters/workers/recovery-codec-client";
import type { RecoveryCodecRequest } from "$/adapters/workers/recovery-codec-worker";
import {
  CHUNK_LOAD_FAILED_EVENT,
  WORKER_LOAD_ERROR_NAME,
  type ChunkLoadFailureDetail,
} from "$/managers/ports/chunk-load";

class SilentWorker extends EventTarget {
  readonly posted: unknown[] = [];
  terminated = false;
  postMessage(request: unknown): void {
    this.posted.push(request);
  }
  terminate(): void {
    this.terminated = true;
  }
  answer(id: number): void {
    this.dispatchEvent(new MessageEvent("message", { data: { id, ok: true, result: { id } } }));
  }
}

const recentSnapshot = () =>
  ({
    id: "r",
    name: "a.png",
    image: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
  }) as never;

/** Node has no window; give the announcement somewhere to go and record it. */
function listenForChunkFailures(): unknown[] {
  const announced: unknown[] = [];
  const target = new EventTarget();
  target.addEventListener(CHUNK_LOAD_FAILED_EVENT, (event) =>
    announced.push((event as CustomEvent<ChunkLoadFailureDetail>).detail.error),
  );
  (globalThis as { window?: EventTarget }).window = target;
  return announced;
}

afterEach(() => {
  delete (globalThis as { window?: EventTarget }).window;
});

describe("workers whose script could not load", () => {
  it("announce a stale build and reject with a reload message instead of a worker crash", async () => {
    const announced = listenForChunkFailures();
    const worker = new SilentWorker();
    const fatal: Error[] = [];
    const client = new RecoveryCodecClient({
      worker: worker as unknown as WorkerRequestTransportFor<RecoveryCodecRequest>,
      onFatalError: (error) => fatal.push(error),
    });
    const pending = client.packRecent(recentSnapshot());
    // A 404 worker script, or one whose imported module is missing, fires a bare `error` Event.
    worker.dispatchEvent(new Event("error"));
    await assert.rejects(pending, (error: Error) => {
      assert.equal(error.name, WORKER_LOAD_ERROR_NAME);
      assert.match(error.message, /Reload the page to continue/);
      return true;
    });
    assert.equal(fatal.length, 1);
    assert.equal(fatal[0].name, WORKER_LOAD_ERROR_NAME);
    assert.equal(announced.length, 1);
    assert.equal((announced[0] as Error).name, WORKER_LOAD_ERROR_NAME);
    assert.match(
      (announced[0] as Error).message,
      /recovery codec worker script could not be loaded/,
    );
    client.close();
  });

  it("still reports a worker that crashes after starting as a worker failure", async () => {
    const announced = listenForChunkFailures();
    const worker = new SilentWorker();
    const client = new RecoveryCodecClient({
      worker: worker as unknown as WorkerRequestTransportFor<RecoveryCodecRequest>,
    });
    const first = client.unpackRecent({} as never);
    worker.answer((worker.posted[0] as { id: number }).id);
    await first.catch(() => undefined);
    const pending = client.packRecent(recentSnapshot());
    worker.dispatchEvent(new Event("error"));
    await assert.rejects(pending, /Recovery codec worker failed/);
    assert.equal(announced.length, 0);
    client.close();
  });

  it("treats a script error raised while starting as a crash, not a missing file", async () => {
    const announced = listenForChunkFailures();
    const worker = new SilentWorker();
    const client = new RecoveryCodecClient({
      worker: worker as unknown as WorkerRequestTransportFor<RecoveryCodecRequest>,
    });
    const pending = client.packRecent(recentSnapshot());
    worker.dispatchEvent(
      Object.assign(new Event("error"), { message: "Uncaught RangeError: boom", filename: "w.js" }),
    );
    await assert.rejects(pending, /Recovery codec worker failed/);
    assert.equal(announced.length, 0);
    client.close();
  });

  it("applies the same rule to the image import worker", async () => {
    const announced = listenForChunkFailures();
    const worker = new SilentWorker();
    const client = new ImageImportWorkerClient({ worker: worker as never });
    const pending = client.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    worker.dispatchEvent(new Event("error"));
    await assert.rejects(pending, (error: Error) => error.name === WORKER_LOAD_ERROR_NAME);
    assert.equal(announced.length, 1);
    assert.match((announced[0] as Error).message, /image import worker script could not be loaded/);
    client.close();
  });
});

type WorkerRequestTransportFor<Request> =
  import("@xprite/bedrock/browser/worker-request-channel").WorkerRequestTransport<Request>;
