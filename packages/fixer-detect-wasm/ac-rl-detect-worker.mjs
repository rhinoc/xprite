import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
/**
 * Node worker_threads runner for Fixer AC+RL WASM detect.
 * Main thread overlaps proposers while this worker runs detectFastAcRl.
 *
 * Protocol (MessageChannel port per job):
 *   { type: 'init' } -> { ok, type:'init', ms }
 *   { type: 'detect', width, height, data: ArrayBuffer } -> { ok, type:'detect', consensus:{cols,rows}|null, ms }
 */
import { parentPort } from "node:worker_threads";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_JS = join(here, "pixelfixer_detect.js");
const WASM_BIN = join(here, "pixelfixer_detect_bg.wasm");

let detectFastAcRl = null;

parentPort.on("message", async (msg) => {
  const { port } = msg;
  if (!port) return;
  try {
    if (msg.type === "init") {
      const t0 = performance.now();
      const mod = await import(pathToFileURL(WASM_JS).href);
      mod.initSync({ module: readFileSync(WASM_BIN) });
      detectFastAcRl = mod.detectFastAcRl;
      port.postMessage({ ok: true, type: "init", ms: performance.now() - t0 });
      return;
    }
    if (msg.type === "detect") {
      if (!detectFastAcRl) {
        port.postMessage({ ok: false, error: "WASM not initialized" });
        return;
      }
      const rgba = new Uint8Array(msg.data);
      const t0 = performance.now();
      const result = detectFastAcRl(rgba, msg.width, msg.height);
      const ms = performance.now() - t0;
      const consensus =
        result.consensus === "fast:ac+rl(S)" ? { cols: result.cols, rows: result.rows } : null;
      port.postMessage({ ok: true, type: "detect", consensus, ms });
      return;
    }
    port.postMessage({ ok: false, error: `unknown type ${msg.type}` });
  } catch (e) {
    port.postMessage({ ok: false, error: String(e && e.stack ? e.stack : e) });
  }
});
