/**
 * Browser nested Worker for Fixer AC+RL WASM detect.
 * Spawned from import-worker so Auto can overlap WASM with proposers via
 * Promise join (no COOP/COEP / SharedArrayBuffer sync-join).
 *
 * Protocol (MessageChannel port per job) — matches Node ac-rl-detect-worker.mjs:
 *   { type: 'init', port } -> { ok, type:'init', ms }
 *   { type: 'detect', width, height, data: ArrayBuffer, port } ->
 *     { ok, type:'detect', consensus:{cols,rows}|null, ms }
 */
import init, { detectFastAcRl } from "@xprite/fixer-detect-wasm";

let detect: typeof detectFastAcRl | null = null;
let initializing: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (detect) return;
  // Warm-up and the first jobs can arrive while WASM is still loading.
  initializing ??= init()
    .then(() => {
      detect = detectFastAcRl;
    })
    .finally(() => {
      initializing = null;
    });
  await initializing;
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
};

scope.onmessage = async (event: MessageEvent) => {
  const msg = event.data as {
    type?: string;
    port?: MessagePort;
    width?: number;
    height?: number;
    data?: ArrayBuffer;
  };
  const port = msg.port;
  if (!port) return;
  try {
    if (msg.type === "init") {
      const t0 = performance.now();
      await ensureInit();
      port.postMessage({ ok: true, type: "init", ms: performance.now() - t0 });
      return;
    }
    if (msg.type === "detect") {
      await ensureInit();
      if (!detect) {
        port.postMessage({ ok: false, error: "WASM not initialized" });
        return;
      }
      const rgba = new Uint8Array(msg.data!);
      const t0 = performance.now();
      const result = detect(rgba, msg.width!, msg.height!);
      const ms = performance.now() - t0;
      const consensus =
        result.consensus === "fast:ac+rl(S)" ? { cols: result.cols, rows: result.rows } : null;
      port.postMessage({ ok: true, type: "detect", consensus, ms });
      return;
    }
    port.postMessage({ ok: false, error: `unknown type ${msg.type}` });
  } catch (e) {
    const err = e as Error;
    port.postMessage({ ok: false, error: String(err?.stack ?? err) });
  }
};
