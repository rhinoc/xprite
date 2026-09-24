import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { build } from "esbuild";
const { outputFiles } = await build({
  stdin: {
    contents: `export {EditorHistory} from './packages/editor-core/src/history/history.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { EditorHistory } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const rows = [];
for (const frames of [1, 120, 600]) {
  const samples = [];
  for (let pass = 0; pass < 4; pass++) {
    const pixels = { width: 32, height: 32, data: new Uint8ClampedArray(4096) },
      layer = { name: "Layer", pixels, x: 0, y: 0, visible: true, locked: false, opacity: 255 };
    const timeline = {
      activeFrame: 0,
      activeLayer: 0,
      layers: Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        name: i ? "Other" : "Layer",
        visible: true,
        locked: false,
        opacity: 255,
        flags: 3,
      })),
      frames: Array.from({ length: frames }, () => ({
        duration: 100,
        cels: Array.from({ length: 8 }, () => ({ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 })),
      })),
    };
    const doc = {
        name: "history",
        width: 32,
        height: 32,
        layer,
        timeline,
        selection: null,
        palette: [],
      },
      history = new EditorHistory();
    for (let i = 0; i < 80; i++) {
      history.begin(doc);
      history.capture(pixels, { x: 0, y: 0, width: 1, height: 1 });
      pixels.data[0] = i + 1;
      history.commit(doc);
    }
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      history.begin(doc);
      history.capture(pixels, { x: 0, y: 0, width: 1, height: 1 });
      pixels.data[0] = 100 + i;
      history.commit(doc);
    }
    if (pass) samples.push((performance.now() - start) / 20);
  }
  rows.push({
    frames,
    layers: 8,
    linkedCels: true,
    retainedTransactions: 100,
    medianCommitMs: samples.toSorted((a, b) => a - b)[1],
    samples,
  });
}
const report = {
  date: new Date().toISOString(),
  method:
    "Core-only history commit with 80 existing transactions, 20 new commits; 1 warmup and 3 passes. Linked cels share one image.",
  rows,
};
console.log(report);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
