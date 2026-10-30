/**
 * AC+RL consensus detector via Fixer Rust WASM.
 *
 * Returns grid dimensions when autocorrelation and run-lengths agree
 * on pixel grid size (consensus="fast:ac+rl(S)").
 *
 * Overlap modes:
 * - Node (pixelbench / Vite SSR): worker_threads — beginAcRlConsensusJob + sync
 *   finishAcRlConsensusJob via receiveMessageOnPort (existing Exact harness path).
 * - Browser product (import-worker): nested Worker + Promise join via
 *   beginAcRlConsensusJobAsync / finishAcRlConsensusJobAsync — no COOP/COEP /
 *   SharedArrayBuffer required (sync Atomics.wait join is what needed isolation).
 * - Fallback: on-thread detectAcRlConsensus (sync job).
 *
 * Set XPRITE_AC_RL_WORKER=0 to force sync detect on Node. Product registers a
 * browser worker factory with setAcRlBrowserWorkerFactory from import-worker.
 */

import type { DetectResult } from "@xprite/fixer-detect-wasm";

/**
 * Minimal messaging / Node shapes used by this file only.
 * editor-core tsconfig keeps lib=["ES2020"] and types=[] (no DOM / @types/node),
 * so we must not rely on ambient MessagePort/Worker/process names.
 */
type AcRlTransferable = ArrayBufferLike | AcRlMessagePort;

type AcRlMessagePort = {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage(message: unknown, transfer?: AcRlTransferable[]): void;
  start?: () => void;
  close?: () => void;
  on?: (event: "message", cb: (msg: unknown) => void) => void;
  off?: (event: "message", cb: (msg: unknown) => void) => void;
};

type AcRlBrowserWorker = {
  postMessage(value: unknown, transfer?: AcRlTransferable[]): void;
  terminate(): void;
  onerror: ((ev: unknown) => void) | null;
};

type AcRlMessageChannelCtor = {
  new (): { port1: AcRlMessagePort; port2: AcRlMessagePort };
};

type NodeProcess = {
  versions?: { node?: string };
  env: Record<string, string | undefined>;
  cwd(): string;
};

type NodeRequireLike = {
  (id: string): unknown;
  resolve(id: string): string;
};

type NodeFsLike = {
  readFileSync(path: string): Uint8Array;
};

type NodePathLike = {
  join(...parts: string[]): string;
  dirname(p: string): string;
};

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

function browserMessageChannelCtor(): AcRlMessageChannelCtor | undefined {
  return (globalThis as { MessageChannel?: AcRlMessageChannelCtor }).MessageChannel;
}

let wasmLoaded = false;
let detectFastAcRl: ((rgba: Uint8Array, w: number, h: number) => DetectResult) | null = null;

type Consensus = { cols: number; rows: number };

export type AcRlConsensusJob =
  | {
      mode: "worker";
      port1: {
        onmessage: ((ev: { data: unknown }) => void) | null;
        postMessage(message: unknown, transfer?: AcRlTransferable[]): void;
        start?: () => void;
        close?: () => void;
        on?: (event: "message", cb: (msg: unknown) => void) => void;
        off?: (event: "message", cb: (msg: unknown) => void) => void;
      };
    }
  | {
      mode: "sync";
      imageData: {
        data: Uint8ClampedArray | Uint8Array;
        width: number;
        height: number;
      };
    };

export type AcRlConsensusAsyncJob =
  | { mode: "async"; promise: Promise<Consensus | null> }
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
    postMessage(value: unknown, transfer?: AcRlTransferable[]): void;
    on(event: "error", cb: (err: Error) => void): void;
  };
  MessageChannel: AcRlMessageChannelCtor;
  receiveMessageOnPort: (port: AcRlMessagePort) => { message: unknown } | undefined;
};

type BrowserWorkerFactory = () => AcRlBrowserWorker;

let wtModule: NodeWt | null | undefined;
let detectWorker: InstanceType<NodeWt["Worker"]> | null = null;
let workerReady = false;
let workerFailed = false;

let browserWorkerFactory: BrowserWorkerFactory | null = null;
let browserDetectWorker: AcRlBrowserWorker | null = null;
let browserWorkerReady = false;
let browserWorkerFailed = false;

function nodeWorkerEnabled(): boolean {
  const process = nodeProcess();
  if (!process?.versions?.node) return false;
  if (process.env.XPRITE_AC_RL_WORKER === "0") return false;
  return true;
}

/**
 * Product import-worker: register nested Worker factory (Vite `new URL(..., import.meta.url)`).
 * Param is `() => unknown` so DOM `Worker` from apps/editor assigns without sharing DOM libs.
 */
export function setAcRlBrowserWorkerFactory(factory: (() => unknown) | null): void {
  browserWorkerFactory = factory ? () => factory() as AcRlBrowserWorker : null;
  if (browserDetectWorker) {
    try {
      browserDetectWorker.terminate();
    } catch {
      /* ignore */
    }
  }
  browserDetectWorker = null;
  browserWorkerReady = false;
  browserWorkerFailed = false;
}

/** Lazy-load worker_threads without a static import (browser-safe). */
function loadWorkerThreads(): NodeWt | null {
  if (wtModule !== undefined) return wtModule;
  if (!nodeWorkerEnabled()) {
    wtModule = null;
    return null;
  }
  const injected = (globalThis as { __XPRITE_WORKER_THREADS__?: NodeWt }).__XPRITE_WORKER_THREADS__;
  if (
    injected &&
    typeof injected.Worker === "function" &&
    typeof injected.MessageChannel === "function" &&
    typeof injected.receiveMessageOnPort === "function"
  ) {
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
  const process = nodeProcess();
  if (process?.env.XPRITE_AC_RL_WORKER_PATH) {
    return process.env.XPRITE_AC_RL_WORKER_PATH;
  }
  // Harness should set XPRITE_AC_RL_WORKER_PATH; without it, skip worker rather than invent a path
  return null;
}

function syncCall(
  wt: NodeWt,
  worker: InstanceType<NodeWt["Worker"]>,
  payload: Record<string, unknown>,
  transfer: AcRlTransferable[] = [],
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

function portMessagePromise(
  port1: AcRlMessagePort,
): Promise<{ ok: boolean; consensus?: Consensus | null; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (body: { ok: boolean; consensus?: Consensus | null; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(body);
    };
    // Node worker_threads MessagePort is an EventEmitter (prefer over onmessage).
    const process = nodeProcess();
    if (typeof port1.on === "function" && process?.versions?.node) {
      const onMsg = (msg: unknown) => {
        port1.off?.("message", onMsg);
        finish(msg as { ok: boolean; consensus?: Consensus | null; error?: string });
      };
      port1.on("message", onMsg);
      port1.start?.();
      return;
    }
    // Browser MessagePort
    port1.onmessage = (ev: { data: unknown }) => {
      port1.onmessage = null;
      finish(ev.data as { ok: boolean; consensus?: Consensus | null; error?: string });
    };
  });
}

async function ensureBrowserDetectWorker(): Promise<boolean> {
  if (browserWorkerFailed || !browserWorkerFactory) return false;
  if (browserDetectWorker && browserWorkerReady) return true;
  try {
    if (!browserDetectWorker) {
      browserDetectWorker = browserWorkerFactory();
      browserDetectWorker.onerror = () => {
        browserWorkerFailed = true;
        browserDetectWorker = null;
        browserWorkerReady = false;
      };
    }
    const MessageChannel = browserMessageChannelCtor();
    if (!MessageChannel) throw new Error("MessageChannel unavailable");
    const { port1, port2 } = new MessageChannel();
    const initPromise = portMessagePromise(port1);
    browserDetectWorker.postMessage({ type: "init", port: port2 }, [port2]);
    const init = await initPromise;
    if (!init.ok) {
      browserWorkerFailed = true;
      browserDetectWorker = null;
      browserWorkerReady = false;
      return false;
    }
    browserWorkerReady = true;
    return true;
  } catch {
    browserWorkerFailed = true;
    browserDetectWorker = null;
    browserWorkerReady = false;
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
 * Also warms the Node AC+RL detect worker when worker_threads overlap is available,
 * and the browser nested Worker when a factory was registered.
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
      const process = nodeProcess();
      if (process?.versions?.node) {
        // eslint-disable-next-line no-new-func
        const nodeRequire = new Function("m", "return require(m)") as (
          m: string,
        ) => NodeRequireLike;
        const fs = nodeRequire("node:fs") as unknown as NodeFsLike;
        const path = nodeRequire("node:path") as unknown as NodePathLike;
        const mod = nodeRequire("module") as unknown as {
          createRequire: (filename: string) => NodeRequireLike;
        };
        const req = mod.createRequire(`${process.cwd()}/package.json`);
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
  try {
    await ensureBrowserDetectWorker();
  } catch {
    /* sync / Node path remains */
  }
}

/**
 * Detect pixel grid via AC+RL consensus (Fixer Rust WASM).
 * WASM must be preloaded via preloadWasm() first.
 *
 * @param imageData - RGBA image data (Uint8ClampedArray or plain object with data/width/height)
 * @returns Grid dimensions when consensus fires, otherwise null
 */
function detectAcRlConsensus(imageData: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): Consensus | null {
  if (!wasmLoaded || !detectFastAcRl) {
    // Silently skip if WASM not loaded - will use fallback grid detection
    return null;
  }

  // Convert Uint8ClampedArray to Uint8Array if needed
  const rgba = rgbaBytes(imageData);

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
    const copy = copyRgba(imageData);
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

/** Reinterpret the exact typed-array slice without copying or including adjacent pixels. */
function rgbaBytes(imageData: { data: Uint8ClampedArray | Uint8Array }): Uint8Array {
  const { data } = imageData;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function copyRgba(imageData: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): Uint8Array {
  // One owned allocation is required because transfer must not detach the caller's buffer.
  return new Uint8Array(rgbaBytes(imageData));
}

/**
 * Start AC+RL detect for async Auto: Node worker_threads or browser nested Worker.
 * Promise is attached before proposers run; finishAcRlConsensusJobAsync awaits it
 * (no SAB / COOP/COEP). Falls back to deferred sync detect when no worker is available.
 * Async so browser nested Worker can be warmed on first use.
 */
export async function beginAcRlConsensusJobAsync(imageData: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): Promise<AcRlConsensusAsyncJob> {
  // Prefer Node worker_threads when available (harness / SSR).
  const wt = loadWorkerThreads();
  if (wt && ensureDetectWorker() && detectWorker) {
    try {
      const { port1, port2 } = new wt.MessageChannel();
      const copy = copyRgba(imageData);
      const promise = portMessagePromise(port1).then((body) =>
        body.ok ? (body.consensus ?? null) : null,
      );
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
      return { mode: "async", promise };
    } catch {
      /* fall through */
    }
  }

  // Browser nested Worker (product import-worker) — async join, no COOP/COEP.
  if (browserWorkerFactory && !browserWorkerFailed) {
    await ensureBrowserDetectWorker();
  }
  if (browserDetectWorker && browserWorkerReady && !browserWorkerFailed) {
    try {
      const MessageChannel = browserMessageChannelCtor();
      if (!MessageChannel) throw new Error("MessageChannel unavailable");
      const { port1, port2 } = new MessageChannel();
      const copy = copyRgba(imageData);
      const promise = portMessagePromise(port1).then((body) =>
        body.ok ? (body.consensus ?? null) : null,
      );
      browserDetectWorker.postMessage(
        {
          type: "detect",
          width: imageData.width,
          height: imageData.height,
          data: copy.buffer,
          port: port2,
        },
        [copy.buffer, port2],
      );
      return { mode: "async", promise };
    } catch {
      /* fall through */
    }
  }

  return { mode: "sync", imageData };
}

/**
 * Await a job from beginAcRlConsensusJobAsync. Same consensus semantics as detectAcRlConsensus.
 */
export async function finishAcRlConsensusJobAsync(
  job: AcRlConsensusAsyncJob,
): Promise<Consensus | null> {
  if (job.mode === "sync") {
    return detectAcRlConsensus(job.imageData);
  }
  return job.promise;
}

/** Kick off browser nested Worker warm-up after setAcRlBrowserWorkerFactory (non-blocking OK). */
export async function warmAcRlBrowserWorker(): Promise<boolean> {
  return ensureBrowserDetectWorker();
}

/** Test/harness: whether Node worker overlap is active after preload. */
export function acRlWorkerOverlapActive(): boolean {
  return !workerFailed && workerReady && nodeWorkerEnabled();
}

/** Test/harness: whether browser nested-Worker async overlap is ready. */
export function acRlBrowserWorkerOverlapActive(): boolean {
  return !browserWorkerFailed && browserWorkerReady && browserWorkerFactory !== null;
}
