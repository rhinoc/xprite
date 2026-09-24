import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/selection/operations.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const rows = [];
function measure(name, setup, run) {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const value = setup();
    const start = performance.now();
    run(value);
    if (i) samples.push(performance.now() - start);
  }
  rows.push({ name, medianMs: samples.toSorted((a, b) => a - b)[1], maxMs: Math.max(...samples) });
}
for (const brush of ["square", "circle"])
  for (const operation of ["expand", "contract", "border"])
    measure(
      `${brush} ${operation}, 512² radius 8`,
      () => ({ x: 0, y: 0, width: 512, height: 512, data: new Uint8Array(512 * 512).fill(1) }),
      (mask) => api.modifySelection(mask, operation, 8, brush, 512, 512),
    );
measure(
  "contiguous wand, 1024²",
  () => ({ width: 1024, height: 1024, data: new Uint8ClampedArray(1024 * 1024 * 4) }),
  (image) => api.magicWandSelection(image, { x: 0, y: 0 }),
);
measure(
  "ellipse drag mask, 4096² canvas / 128² selection",
  () => null,
  () => api.ellipseSelection({ x: 100, y: 100 }, { x: 227, y: 227 }, 4096, 4096),
);
const report = {
  date: new Date().toISOString(),
  method:
    "Core-only, one warmup and three measured runs, setup excluded; full masks, transparent wand image, detached output.",
  rows,
};
console.log(report);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
