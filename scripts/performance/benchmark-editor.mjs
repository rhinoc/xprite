import { writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const repeat = 5;
const rows = [];
const percentile = (a, p) =>
  [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
function measure(name, size, setup, action) {
  const times = [];
  for (let i = 0; i < repeat + 1; i++) {
    const context = setup();
    const start = performance.now();
    action(context);
    const elapsed = performance.now() - start;
    if (i) times.push(elapsed);
  }
  rows.push({
    name,
    size,
    medianMs: +percentile(times, 0.5).toFixed(3),
    maxMs: +Math.max(...times).toFixed(3),
    samples: repeat,
  });
}
function image(size, flat = false) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = flat ? 80 : (x % 16) * 16;
      data[i + 1] = flat ? 80 : (y % 16) * 16;
      data[i + 2] = 32;
      data[i + 3] = 255;
    }
  return { width: size, height: size, data };
}
measure(
  "empty constructor",
  0,
  () => null,
  () => new RasterEditor(),
);
for (const size of [256, 1024]) {
  const pixels = image(size),
    flat = image(size, true);
  const make = () => new RasterEditor(pixels);
  measure(
    "load + initial palette",
    size,
    () => new RasterEditor(),
    (e) => e.loadImage(pixels),
  );
  measure(
    "pencil 120 pointer moves (no commit)",
    size,
    () => {
      const e = make();
      e.setSettings({ foreground: [255, 17, 9, 255] });
      e.pointerDown({ x: 0, y: 0 });
      return e;
    },
    (e) => {
      for (let i = 1; i <= 120; i++) e.pointerMove({ x: i * 2, y: i });
    },
  );
  measure(
    "pencil commit (full palette)",
    size,
    () => {
      const e = make();
      e.setSettings({ foreground: [255, 17, 9, 255] });
      e.pointerDown({ x: 0, y: 0 });
      e.pointerMove({ x: 200, y: 100 });
      return e;
    },
    (e) => e.pointerUp(),
  );
  measure(
    "pencil commit with sparse palette",
    size,
    () => {
      const e = new RasterEditor(flat);
      e.setSettings({ foreground: [255, 17, 9, 255] });
      e.pointerDown({ x: 0, y: 0 });
      e.pointerMove({ x: 200, y: 100 });
      return e;
    },
    (e) => e.pointerUp(),
  );
  measure(
    "bucket full-image gesture",
    size,
    () => {
      const e = new RasterEditor(flat);
      e.setSettings({ tool: "bucket", foreground: [255, 17, 9, 255] });
      return e;
    },
    (e) => {
      e.pointerDown({ x: 0, y: 0 });
      e.pointerUp();
    },
  );
  measure(
    "blur 32px brush 24 moves + commit",
    size,
    () => {
      const e = make();
      e.setSettings({
        tool: "blur",
        brush: { shape: "circle", size: 32, angle: 0 },
      });
      return e;
    },
    (e) => {
      e.pointerDown({ x: 32, y: 32 });
      for (let i = 1; i <= 24; i++) e.pointerMove({ x: 32 + i * 3, y: 32 + i * 2 });
      e.pointerUp();
    },
  );
  measure(
    "undo stroke (full palette)",
    size,
    () => {
      const e = make();
      e.setSettings({ foreground: [255, 17, 9, 255] });
      e.pointerDown({ x: 0, y: 0 });
      e.pointerMove({ x: 200, y: 100 });
      e.pointerUp();
      return e;
    },
    (e) => e.undo(),
  );
  measure(
    "composite cache miss",
    size,
    () => {
      const e = make();
      e.setView({ grid: true });
      e.setLayerVisible(false);
      e.setLayerVisible(true);
      return e;
    },
    (e) => e.composite(),
  );
}
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    node: process.version,
  },
  method:
    "ESM-bundled pure core, one untimed warmup and five measured fresh-context iterations; elapsed wall clock excludes setup; no browser or rendering included.",
  rows,
};
console.log(JSON.stringify(report, null, 2));
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
