/**
 * AC+RL consensus detector via Fixer Rust WASM.
 *
 * Returns grid dimensions when autocorrelation and run-lengths agree
 * on pixel grid size (consensus="fast:ac+rl(S)").
 *
 * Node (pixelbench / Vite SSR harness): optional worker_threads overlap —
 * beginAcRlConsensusJob copies pixels to a persistent worker, proposers run on
 * the main thread, finishAcRlConsensusJob sync-joins via receiveMessageOnPort.
 * Browser product path: recover already runs inside import-worker; nested Worker
 * cannot sync-join without crossOriginIsolated SharedArrayBuffer, so detect stays
 * on-thread. Set XPRITE_AC_RL_WORKER=0 to force sync detect on Node.
 */

import type { DetectResult } from "@xprite/fixer-detect-wasm";

let wasmLoaded = false;
let detectFastAcRl: ((rgba: Uint8Array, w: number, h: number) => DetectResult) | null = null;

type Consensus = { cols: number; rows: number };

export type AcRlConsensusJob =
  | { mode: "worker"; port1: MessagePort }
  | {
      mode: "sync";
      imageData: {
        data: Uint8ClampedArray | Uint8Array;
        width: number;
        height: number;
      };
    };

type NodeWt = {
  Worker: new (
    filename: string,
    options?: object,
  ) => {
    postMessage(value: unknown, transfer?: Transferable[]): void;
    on(event: "error", cb: (err: Error) => void): void;
  };
  MessageChannel: new () => { port1: MessagePort; port2: MessagePort };
  receiveMessageOnPort: (port: MessagePort) => { message: unknown } | undefined;
};

let wtModule: NodeWt | null | undefined;
let detectWorker: InstanceType<NodeWt["Worker"]> | null = null;
let workerReady = false;
let workerFailed = false;

function nodeWorkerEnabled(): boolean {
  if (typeof process === "undefined" || !process.versions?.node) return false;
  if (process.env.XPRITE_AC_RL_WORKER === "0") return false;
  return true;
}

/** Lazy-load worker_threads without a static import (browser-safe). */
function loadWorkerThreads(): NodeWt | null {
  if (wtModule !== undefined) return wtModule;
  if (!nodeWorkerEnabled()) {
    wtModule = null;
    return null;
  }
  const injected = (globalThis as { __XPRITE_WORKER_THREADS__?: NodeWt }).__XPRITE_WORKER_THREADS__;
  if (injected?.Worker && injected.MessageChannel && injected.receiveMessageOnPort) {
    wtModule = injected;
    return wtModule;
  }
  try {
    // eslint-disable-next-line no-new-func
    const nodeRequire = new Function("m", "return require(m)") as (m: string) => unknown;
    wtModule = nodeRequire("node:worker_threads") as NodeWt;
    return wtModule;
  } catch {
    wtModule = null;
    return null;
  }
}

/** Called from preloadWasm (async) so Vite SSR can import worker_threads without sync require. */
async function loadWorkerThreadsAsync(): Promise<NodeWt | null> {
  const existing = loadWorkerThreads();
  if (existing) return existing;
  if (!nodeWorkerEnabled()) return null;
  try {
    const spec = "node:worker_threads";
    const wt = (await import(/* @vite-ignore */ spec)) as unknown as NodeWt;
    wtModule = wt;
    (globalThis as { __XPRITE_WORKER_THREADS__?: NodeWt }).__XPRITE_WORKER_THREADS__ = wt;
    return wt;
  } catch {
    wtModule = null;
    return null;
  }
}

function resolveWorkerPath(): string | null {
  if (typeof process !== "undefined" && process.env.XPRITE_AC_RL_WORKER_PATH) {
    return process.env.XPRITE_AC_RL_WORKER_PATH;
  }
  // Harness should set XPRITE_AC_RL_WORKER_PATH; without it, skip worker rather than invent a path
  return null;
}

function syncCall(
  wt: NodeWt,
  worker: InstanceType<NodeWt["Worker"]>,
  payload: Record<string, unknown>,
  transfer: Transferable[] = [],
): { ok: boolean; consensus?: Consensus | null; error?: string } {
  const { port1, port2 } = new wt.MessageChannel();
  worker.postMessage({ ...payload, port: port2 }, [port2, ...transfer]);
  for (;;) {
    const msg = wt.receiveMessageOnPort(port1);
    if (msg) return msg.message as ReturnType<typeof syncCall>;
  }
}

function ensureDetectWorker(): boolean {
  if (workerFailed) return false;
  if (detectWorker && workerReady) return true;
  const wt = loadWorkerThreads();
  if (!wt) return false;
  const workerPath = resolveWorkerPath();
  if (!workerPath) {
    workerFailed = true;
    return false;
  }
  try {
    if (!detectWorker) {
      detectWorker = new wt.Worker(workerPath);
      // Do not keep the parent process alive (pixel-bench workers must exit)
      const maybeUnref = detectWorker as { unref?: () => void };
      maybeUnref.unref?.();
      detectWorker.on("error", () => {
        workerFailed = true;
        detectWorker = null;
        workerReady = false;
      });
    }
    const init = syncCall(wt, detectWorker, { type: "init" });
    if (!init.ok) {
      workerFailed = true;
      detectWorker = null;
      workerReady = false;
      return false;
    }
    workerReady = true;
    return true;
  } catch {
    workerFailed = true;
    detectWorker = null;
    workerReady = false;
    return false;
  }
}

/**
 * Preload WASM module asynchronously (call during app/worker initialization).
 * After this completes, detectAcRlConsensus will work synchronously without load overhead.
 *
 * Best practice: Call this during app startup or worker ready event, NOT on first recover call.
 * Reduces first-image latency by ~5-10ms and eliminates async overhead from hot path.
 *
 * Also warms the Node AC+RL detect worker when worker_threads overlap is available.
 *
 * @example
 * // In worker initialization:
 * await preloadWasm();
 *
 * // Or in app init:
 * preloadWasm().catch(console.error);
 */
export async function preloadWasm(): Promise<void> {
  if (!wasmLoaded) {
    const module = await import("@xprite/fixer-detect-wasm");
    try {
      await module.default();
    } catch {
      // Node/Vite SSR: file:// fetch of wasm often fails; initSync from package path
      if (typeof process !== "undefined" && process.versions?.node) {
        // eslint-disable-next-line no-new-func
        const nodeRequire = new Function("m", "return require(m)") as (m: string) => NodeRequire;
        const fs = nodeRequire("node:fs") as typeof import("node:fs");
        const path = nodeRequire("node:path") as typeof import("node:path");
        const req = nodeRequire("module").createRequire(
          `${process.cwd()}/package.json`,
        ) as NodeRequire;
        const wasmJs = req.resolve("@xprite/fixer-detect-wasm");
        const wasmBin = path.join(path.dirname(wasmJs), "pixelfixer_detect_bg.wasm");
        module.initSync({ module: fs.readFileSync(wasmBin) });
      } else {
        throw new Error("WASM preload failed");
      }
    }
    detectFastAcRl = module.detectFastAcRl;
    wasmLoaded = true;
  }
  try {
    await loadWorkerThreadsAsync();
    ensureDetectWorker();
  } catch {
    /* sync fallback remains */
  }
}

/**
 * Detect pixel grid via AC+RL consensus (Fixer Rust WASM).
 * WASM must be preloaded via preloadWasm() first.
 *
 * @param imageData - RGBA image data (Uint8ClampedArray or plain object with data/width/height)
 * @returns Grid dimensions when consensus fires, otherwise null
 */
export function detectAcRlConsensus(imageData: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): Consensus | null {
  if (!wasmLoaded || !detectFastAcRl) {
    // Silently skip if WASM not loaded - will use fallback grid detection
    return null;
  }

  // Convert Uint8ClampedArray to Uint8Array if needed
  const rgba =
    imageData.data instanceof Uint8Array ? imageData.data : new Uint8Array(imageData.data);

  const result = detectFastAcRl(rgba, imageData.width, imageData.height);

  // Only return grid when consensus fires
  if (result.consensus === "fast:ac+rl(S)") {
    return {
      cols: result.cols,
      rows: result.rows,
    };
  }

  return null;
}

/**
 * Start AC+RL detect on a Node worker_threads worker (copy + postMessage).
 * Run proposers on the calling thread, then finishAcRlConsensusJob.
 * Falls back to deferred sync detect when workers are unavailable (browser / disable flag).
 */
export function beginAcRlConsensusJob(imageData: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): AcRlConsensusJob {
  const wt = loadWorkerThreads();
  if (!wt || !ensureDetectWorker() || !detectWorker) {
    return { mode: "sync", imageData };
  }
  try {
    const { port1, port2 } = new wt.MessageChannel();
    const src =
      imageData.data instanceof Uint8Array ? imageData.data : new Uint8Array(imageData.data);
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    detectWorker.postMessage(
      {
        type: "detect",
        width: imageData.width,
        height: imageData.height,
        data: copy.buffer,
        port: port2,
      },
      [copy.buffer, port2],
    );
    return { mode: "worker", port1 };
  } catch {
    return { mode: "sync", imageData };
  }
}

/**
 * Join a job started by beginAcRlConsensusJob. Same consensus semantics as detectAcRlConsensus.
 */
export function finishAcRlConsensusJob(job: AcRlConsensusJob): Consensus | null {
  if (job.mode === "sync") {
    return detectAcRlConsensus(job.imageData);
  }
  const wt = loadWorkerThreads();
  if (!wt) return null;
  for (;;) {
    const msg = wt.receiveMessageOnPort(job.port1);
    if (!msg) continue;
    const body = msg.message as {
      ok: boolean;
      consensus?: Consensus | null;
      error?: string;
    };
    if (!body.ok) return null;
    return body.consensus ?? null;
  }
}

/** Test/harness: whether Node worker overlap is active after preload. */
export function acRlWorkerOverlapActive(): boolean {
  return !workerFailed && workerReady && nodeWorkerEnabled();
}
