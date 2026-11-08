import type { Plugin } from "vite";

/**
 * `@xprite/pixelate` ships a Node `worker_threads` / WASM path inside
 * `grid-ac-rl-consensus.js`, behind runtime feature detection. The Xiaohongshu container forbids
 * `Worker` and `WebAssembly` in shipped code at all, so for the mini-tool build we replace that
 * module with a stub that keeps the same exports but always takes the in-thread JS fallback
 * (every consensus call returns null, which the registry already treats as "no WASM hint").
 */
const STUB = `
export function setAcRlBrowserWorkerFactory() {}
export async function preloadWasm() {}
export function beginAcRlConsensusJob(imageData) { return { mode: "sync", imageData }; }
export function finishAcRlConsensusJob() { return null; }
export async function beginAcRlConsensusJobAsync(imageData) { return { mode: "sync", imageData }; }
export async function finishAcRlConsensusJobAsync() { return null; }
export async function warmAcRlBrowserWorker() { return false; }
export function acRlWorkerOverlapActive() { return false; }
export function acRlBrowserWorkerOverlapActive() { return false; }
`;

export function noWorkerModules(): Plugin {
  return {
    name: "xprite-minitool-no-worker-modules",
    enforce: "pre",
    resolveId(source) {
      if (source.endsWith("/grid-ac-rl-consensus.js")) return "\0xprite-ac-rl-stub";
      return null;
    },
    load(id) {
      return id === "\0xprite-ac-rl-stub" ? STUB : null;
    },
  };
}
