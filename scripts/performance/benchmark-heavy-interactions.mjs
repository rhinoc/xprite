import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/editor/RasterEditor.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const rows = [];
function make(frames = 60, layers = 8, size = 128) {
  const e = new RasterEditor();
  e.loadTimeline(
    {
      activeLayer: 0,
      activeFrame: 0,
      layers: Array.from({ length: layers }, (_, i) => ({
        id: String(i),
        name: `Layer ${i}`,
        visible: true,
        locked: false,
        opacity: 255,
        flags: 3,
      })),
      frames: Array.from({ length: frames }, () => ({
        duration: 100,
        cels: Array.from({ length: layers }, () => ({
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
          pixels: { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) },
        })),
      })),
    },
    size,
    size,
    "Stress",
  );
  return e;
}
function measure(name, setup, run) {
  const samples = [];
  for (let n = 0; n < 6; n++) {
    const e = setup();
    const start = performance.now();
    run(e);
    if (n) samples.push(performance.now() - start);
  }
  rows.push({ name, medianMs: samples.toSorted((a, b) => a - b)[2], maxMs: Math.max(...samples) });
}
measure("60 frames x 8 layers: single-pixel commit", make, (e) => {
  e.pointerDown({ x: 2, y: 2 });
  e.pointerUp();
});
measure("60 frames x 8 layers: rename layer", make, (e) => e.renameLayer("Renamed"));
measure(
  "60 frames x 8 layers: mark saved",
  () => {
    const e = make();
    e.pointerDown({ x: 2, y: 2 });
    e.pointerUp();
    return e;
  },
  (e) => e.markSaved(),
);
measure("60 frames x 8 layers: 120 navigation changes", make, (e) => {
  for (let i = 0; i < 120; i++) e.selectFrame(i % 60);
});
measure(
  "256 layers: 1000 hover moves",
  () => make(1, 256, 8),
  (e) => {
    for (let i = 0; i < 1000; i++) e.pointerMove({ x: i % 8, y: (i >> 3) % 8 });
  },
);
for (const count of [1000, 10000])
  measure(
    `${count} lasso points, no commit`,
    () => {
      const e = new RasterEditor({
        width: 512,
        height: 512,
        data: new Uint8ClampedArray(512 * 512 * 4),
      });
      e.setSettings({ tool: "lasso" });
      e.pointerDown({ x: 0, y: 0 });
      return e;
    },
    (e) => {
      for (let i = 1; i <= count; i++) e.pointerMove({ x: i % 512, y: Math.floor(i / 512) % 512 });
    },
  );
const report = {
  date: new Date().toISOString(),
  method:
    "Core-only, 1 warmup + 5 samples, excludes setup; unique 128² cel buffers (30 MiB graph), 60 frames and 8 layers unless specified.",
  rows,
};
console.log(report);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
