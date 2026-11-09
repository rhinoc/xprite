import assert from "node:assert/strict";

import { afterEach, describe, it } from "vitest";

import { importAsepriteInWorker } from "$/adapters/workers/aseprite-import-client";
import { ImageImportWorkerClient } from "$/adapters/workers/import-client";
import { RecoveryCodecClient } from "$/adapters/workers/recovery-codec-client";
import type { RecoveryCodecRequest } from "$/adapters/workers/recovery-codec-worker";
import { importWithRetry } from "$/adapters/workers/worker-load-failure";
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
  it("announce a stale build and keep packing on the main thread instead of crashing", async () => {
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
    const packed = await pending;
    assert.equal(typeof packed, "object");
    assert.equal(fatal.length, 1);
    assert.equal(fatal[0].name, WORKER_LOAD_ERROR_NAME);
    assert.match(fatal[0].message, /Reload the page to continue/);
    assert.equal(announced.length, 1);
    assert.equal((announced[0] as Error).name, WORKER_LOAD_ERROR_NAME);
    assert.match(
      (announced[0] as Error).message,
      /recovery codec worker script could not be loaded/,
    );
    assert.equal(worker.terminated, true);
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

/** Answers each posted request unless told to fail to load, like a cancelled script fetch. */
class AnsweringWorker extends SilentWorker {
  constructor(private readonly loads: boolean) {
    super();
  }
  override postMessage(request: unknown): void {
    super.postMessage(request);
    queueMicrotask(() => {
      if (!this.loads) this.dispatchEvent(new Event("error"));
      else this.answer((request as { id: number }).id);
    });
  }
}

const tinySnapshot = () =>
  ({
    version: 1,
    dirty: false,
    document: {
      name: "tiny.png",
      format: "png",
      width: 1,
      height: 1,
      selection: null,
      palette: [],
      layer: {
        name: "Pixels",
        x: 0,
        y: 0,
        visible: true,
        locked: false,
        pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      },
    },
  }) as never;

function restartingCodec(loads: boolean[], fatal: Error[] = []) {
  const workers: AnsweringWorker[] = [];
  const client = new RecoveryCodecClient({
    workerFactory: () => {
      const worker = new AnsweringWorker(loads[workers.length] ?? true);
      workers.push(worker);
      return worker as unknown as WorkerRequestTransportFor<RecoveryCodecRequest>;
    },
    onFatalError: (error) => fatal.push(error),
    workerLoadRetryDelayMs: 1,
  });
  return { client, workers };
}

describe("workers whose script load was cancelled", () => {
  it("start the recovery codec worker again without announcing a stale build", async () => {
    const announced = listenForChunkFailures();
    const fatal: Error[] = [];
    const { client, workers } = restartingCodec([false, true], fatal);
    const packed = (await client.packRecent(recentSnapshot())) as unknown as { id: number };
    assert.equal(workers.length, 2);
    assert.equal(workers[0].terminated, true);
    assert.equal(packed.id, (workers[1].posted[0] as { id: number }).id, "answered by worker 2");
    assert.equal(announced.length, 0);
    assert.equal(fatal.length, 0);
    client.close();
  });

  it("keeps encode order and finishes the encode on the restarted worker", async () => {
    const announced = listenForChunkFailures();
    const { client, workers } = restartingCodec([false, true]);
    const [first, second] = await Promise.all([
      client.encode(tinySnapshot()),
      client.encode(tinySnapshot()),
    ]);
    assert.equal(workers.length, 2);
    const ids = workers[1].posted.map((request) => (request as { id: number }).id);
    assert.deepEqual(
      [first, second].map((result) => (result as unknown as { id: number }).id),
      ids,
    );
    assert.equal(announced.length, 0);
    client.close();
  });

  it("announces once and packs on the main thread when the restarted worker fails too", async () => {
    const announced = listenForChunkFailures();
    const fatal: Error[] = [];
    const { client, workers } = restartingCodec([false, false], fatal);
    const packed = await client.packRecent(recentSnapshot());
    assert.ok(packed && typeof packed === "object" && "image" in packed);
    await client.packRecent(recentSnapshot());
    assert.equal(workers.length, 2, "the worker is not started a third time");
    assert.equal(announced.length, 1);
    assert.match((announced[0] as Error).message, /recovery codec worker script/);
    assert.equal(fatal.length, 1);
    assert.match(fatal[0].message, /Reload the page to continue/);
    client.close();
  });

  it("does not start a worker after the client closes during the pause", async () => {
    listenForChunkFailures();
    const { client, workers } = restartingCodec([false, true]);
    const pending = client.packRecent(recentSnapshot());
    await new Promise((resolve) => setTimeout(resolve, 0));
    client.close();
    await assert.rejects(pending, /closed/);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(workers.length, 1);
  });

  it("retries a fallback module import that failed once", async () => {
    let calls = 0;
    const value = await importWithRetry(async () => {
      if (calls++ === 0) throw new TypeError("Importing a module script failed.");
      return 7;
    }, 1);
    assert.equal(value, 7);
    assert.equal(calls, 2);
  });
});

/** The subset of Worker that runWorkerJob uses. */
class JobWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  constructor(private readonly loads: boolean) {}
  postMessage(): void {
    queueMicrotask(() => {
      if (!this.loads) this.onerror?.(new Event("error"));
      else
        this.onmessage?.(
          new MessageEvent("message", {
            data: { ok: true, project: { timeline: { frames: [] } } },
          }),
        );
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe("Aseprite import worker", () => {
  const request = () => ({ bytes: new Uint8Array(8), fileName: "a.aseprite", limits: {} }) as never;
  const workersFor = (loads: boolean[]) => {
    const workers: JobWorker[] = [];
    const createWorker = () => {
      const worker = new JobWorker(loads[workers.length] ?? true);
      workers.push(worker);
      return worker as unknown as Worker;
    };
    return { workers, createWorker };
  };

  it("opens the project on a second worker after a cancelled script load", async () => {
    const announced = listenForChunkFailures();
    const { workers, createWorker } = workersFor([false, true]);
    const project = await importAsepriteInWorker(request(), undefined, {
      createWorker,
      retryDelayMs: 1,
    });
    assert.ok(project);
    assert.equal(workers.length, 2);
    assert.equal(workers[0].terminated, true);
    assert.equal(announced.length, 0);
  });

  it("announces a stale build once when the second worker also fails to load", async () => {
    const announced = listenForChunkFailures();
    const { workers, createWorker } = workersFor([false, false]);
    await assert.rejects(
      importAsepriteInWorker(request(), undefined, { createWorker, retryDelayMs: 1 })!,
      (error: Error) => error.name === WORKER_LOAD_ERROR_NAME,
    );
    assert.equal(workers.length, 2);
    assert.equal(announced.length, 1);
    assert.match((announced[0] as Error).message, /Aseprite import worker script/);
  });

  it("stops waiting for the retry when the open is cancelled", async () => {
    listenForChunkFailures();
    const { workers, createWorker } = workersFor([false, true]);
    const controller = new AbortController();
    const pending = importAsepriteInWorker(request(), controller.signal, {
      createWorker,
      retryDelayMs: 50,
    })!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await assert.rejects(pending, (error: Error) => error.name === "AbortError");
    assert.equal(workers.length, 1);
  });
});

type WorkerRequestTransportFor<Request> =
  import("@xprite/bedrock/browser/worker-request-channel").WorkerRequestTransport<Request>;
