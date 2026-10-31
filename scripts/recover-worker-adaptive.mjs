import { readFileSync, writeFileSync } from "fs";
import * as workerThreads from "node:worker_threads";
import path from "path";
import readline from "readline";

import { PNG } from "pngjs";
/**
 * Product-ish Exact harness: RecoverGrid Auto + TwoStage + Adaptive Limit colors.
 * Matches SPEED-VERIFY-2a479a5e worker settings shape. WASM preload via initSync harness.
 */
import { createServer } from "vite";
globalThis.__XPRITE_WORKER_THREADS__ = workerThreads;

const root = process.env.XPRITE_RECOVER_CWD || "/workspace/xprite";
process.env.XPRITE_AC_RL_WORKER_PATH ||= path.join(
  root,
  "packages/fixer-detect-wasm/ac-rl-detect-worker.mjs",
);
if (process.env.XPRITE_AC_RL_WORKER !== "0")
  process.env.XPRITE_AC_RL_WORKER = process.env.XPRITE_AC_RL_WORKER || "1";
const server = await createServer({
  root,
  configFile: path.join(root, "infra/vitest.config.ts"),
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});
const mod = await server.ssrLoadModule(
  "/packages/editor-core/src/import-export/image/import/index.ts",
);
const reg = await server.ssrLoadModule(
  "/packages/editor-core/src/import-export/image/import/grid/registry.ts",
);
const consMod = await server.ssrLoadModule(
  "/packages/editor-core/src/import-export/image/import/grid/period/ac-rl-consensus.ts",
);
const {
  pixelateImage,
  detectWithAlgorithm,
  snapPalette,
  PixelationMode,
  PixelationAlgorithm,
  CellColorPicker,
  PaletteColorMode,
} = mod;
const { recoverWithGrid } = reg;

// Node/Vite SSR: consensus overlay uses initSync(abs path); keep fetch patch as backup
const wasmBinPath = path.join(root, "packages/fixer-detect-wasm/pixelfixer_detect_bg.wasm");
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("pixelfixer_detect_bg.wasm") || url.endsWith(".wasm")) {
    const buf = readFileSync(wasmBinPath);
    return new Response(buf, { status: 200, headers: { "Content-Type": "application/wasm" } });
  }
  return realFetch(input, init);
};
if (typeof consMod.preloadWasm === "function") {
  await consMod.preloadWasm();
}
globalThis.fetch = realFetch;
if (typeof consMod.acRlWorkerOverlapActive === "function") {
  console.error(
    JSON.stringify({
      ac_rl_worker_overlap: consMod.acRlWorkerOverlapActive(),
      worker_path: process.env.XPRITE_AC_RL_WORKER_PATH,
    }),
  );
}

function uniqueOpaque(image) {
  const seen = new Set();
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  return seen.size;
}

function recover(image) {
  const settingsSnippet = {
    mode: "RecoverGrid",
    algorithm: "Auto",
    colorPicker: "TwoStage",
    reduceColors: true,
    paletteColorMode: PaletteColorMode.Adaptive,
    dither: "none",
  };
  try {
    const result = pixelateImage(image, {
      mode: PixelationMode.RecoverGrid,
      algorithm: PixelationAlgorithm.Auto,
      colorPicker: CellColorPicker.TwoStage,
      paletteSnap: { adaptive: true },
    });
    return {
      result,
      meta: {
        path: "auto",
        paletteMode: "adaptive",
        reduceColors: true,
        settings: settingsSnippet,
        uniqueOut: uniqueOpaque(result),
      },
    };
  } catch {}
  for (const algo of [
    PixelationAlgorithm.Auto,
    PixelationAlgorithm.EdgeGrid,
    PixelationAlgorithm.UniformGrid,
  ]) {
    const grid = detectWithAlgorithm(image, algo);
    if (grid && grid.width > 1 && grid.height > 1) {
      try {
        const recovered = recoverWithGrid(image, grid, CellColorPicker.TwoStage);
        const uniqueBefore = uniqueOpaque(recovered);
        const result = snapPalette(recovered, { adaptive: true });
        return {
          result,
          meta: {
            path: "force-" + algo,
            reliable: !!grid.reliable,
            confidence: grid.confidence,
            w: grid.width,
            h: grid.height,
            paletteMode: "adaptive",
            reduceColors: true,
            settings: settingsSnippet,
            uniqueBefore,
            uniqueOut: uniqueOpaque(result),
          },
        };
      } catch {}
    }
  }
  return {
    result: image,
    meta: {
      path: "passthrough",
      paletteMode: "adaptive",
      reduceColors: true,
      settings: settingsSnippet,
    },
  };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
console.log(
  JSON.stringify({
    ready: true,
    worker: "recover-worker-adaptive",
    paletteColorMode: "adaptive",
    reduceColors: true,
    preloadWasm: true,
    root,
  }),
);
for await (const line of rl) {
  if (!line.trim()) continue;
  let job;
  try {
    job = JSON.parse(line);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e) }));
    continue;
  }
  if (job.cmd === "quit") break;
  try {
    const png = PNG.sync.read(readFileSync(job.in));
    const image = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
    const { result, meta } = recover(image);
    const out = new PNG({ width: result.width, height: result.height });
    out.data = Buffer.from(result.data);
    writeFileSync(job.out, PNG.sync.write(out));
    console.log(JSON.stringify({ ok: true, w: result.width, h: result.height, ...meta }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String((e && e.stack) || e) }));
  }
}
await server.close();
process.exit(0);
