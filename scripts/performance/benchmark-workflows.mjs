import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { build } from "esbuild";
const { outputFiles } = await build({
  stdin: {
    contents: `export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts'; export {renderExport} from './packages/editor-core/src/import-export/image/export-plan.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor, renderExport } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const data = new Uint8ClampedArray(1024 * 1024 * 4);
for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : i % 251;
const make = () => new RasterEditor({ width: 1024, height: 1024, data });
const rows = [];
function measure(name, prepare, run) {
  const samples = [];
  for (let i = 0; i < 6; i++) {
    const value = prepare();
    const start = performance.now();
    run(value);
    if (i) samples.push(performance.now() - start);
  }
  rows.push({ name, medianMs: samples.toSorted((a, b) => a - b)[2], maxMs: Math.max(...samples) });
}
for (const scalePercent of [100, 200, 50])
  measure(
    `export ${scalePercent}%`,
    () => make().getSnapshot().document,
    (doc) =>
      renderExport(doc, {
        name: "test.png",
        scalePercent,
        area: "canvas",
        layers: "visible",
        frame: 0,
      }),
  );
measure(
  "marquee 512x512",
  () => {
    const e = make();
    e.setSettings({ tool: "marquee" });
    return e;
  },
  (e) => {
    e.pointerDown({ x: 50, y: 50 });
    e.pointerUp({ x: 561, y: 561 });
  },
);
measure(
  "invert full selection",
  () => {
    const e = make();
    e.selectAll();
    return e;
  },
  (e) => e.invertSelection(),
);
measure(
  "merged clipboard copy",
  () => {
    const e = make();
    e.selectAll();
    return e;
  },
  (e) => e.copySelection(true),
);
measure("recovery detached snapshot", make, (e) => e.getPersistenceSnapshot());
measure("flip horizontal", make, (e) => e.flipCanvas("horizontal"));
const result = {
  date: new Date().toISOString(),
  method:
    "1024x1024 core workflows, 1 warmup and 5 measured contexts; excludes setup, browser encoding, file IO and workers.",
  rows,
};
console.log(result);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
