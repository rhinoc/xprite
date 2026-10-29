/**
 * AC+RL consensus detector via Fixer Rust WASM.
 *
 * Returns grid dimensions when autocorrelation and run-lengths agree
 * on pixel grid size (consensus="fast:ac+rl(S)").
 */

import type { DetectResult } from "@xprite/fixer-detect-wasm";

let wasmLoaded = false;
let detectFastAcRl: ((rgba: Uint8Array, w: number, h: number) => DetectResult) | null = null;

/**
 * Preload WASM module asynchronously (call during app/worker initialization).
 * After this completes, detectAcRlConsensus will work synchronously without load overhead.
 *
 * Best practice: Call this during app startup or worker ready event, NOT on first recover call.
 * Reduces first-image latency by ~5-10ms and eliminates async overhead from hot path.
 *
 * @example
 * // In worker initialization:
 * await preloadWasm();
 *
 * // Or in app init:
 * preloadWasm().catch(console.error);
 */
export async function preloadWasm(): Promise<void> {
  if (wasmLoaded) return;

  const module = await import("@xprite/fixer-detect-wasm");
  await module.default();
  detectFastAcRl = module.detectFastAcRl;
  wasmLoaded = true;
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
}): { cols: number; rows: number } | null {
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
