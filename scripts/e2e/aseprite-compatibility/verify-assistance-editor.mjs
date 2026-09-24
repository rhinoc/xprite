import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { build } from "esbuild";
Error.stackTraceLimit = 0;
execFileSync(process.execPath, ["scripts/e2e/aseprite-compatibility/verify-assistance.mjs"], {
  stdio: "pipe",
});
execFileSync(
  process.execPath,
  ["scripts/e2e/aseprite-compatibility/verify-assistance-tiled-grid.mjs"],
  {
    stdio: "pipe",
  },
);
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
const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  lit = (e) => {
    const p = e.exportComposite(),
      out = [];
    for (let i = 3; i < p.data.length; i += 4) if (p.data[i]) out.push((i - 3) / 4);
    return out;
  };
const expected = (file) =>
  fs
    .readFileSync(".tmp/assistance-oracle/" + file, "utf8")
    .split(",")
    .filter(Boolean)
    .map(Number);
let index = 0;
const failures = [];
for (const mode of [0, 1, 2, 3, 4, 8, 12, 15, 5])
  for (const [shape, size, angle] of [
    ["circle", 1, 0],
    ["square", 4, 0],
    ["line", 5, 35],
    ["square", 5, 30],
  ])
    for (const axes of [
      [6, 5],
      [5.5, 4.5],
    ]) {
      const e = new RasterEditor(blank(12, 10));
      e.setSettings({
        tool: "pencil",
        foreground: [255, 0, 0, 255],
        brush: { shape, size, angle },
        symmetryEnabled: true,
      });
      e.setView({ symmetryMode: mode, symmetryX: axes[0], symmetryY: axes[1] });
      e.pointerDown({ x: 2, y: 3 });
      e.pointerUp();
      const pixels = lit(e),
        want = expected(index + ".txt");
      if (JSON.stringify(pixels) !== JSON.stringify(want))
        failures.push({
          kind: "symmetry",
          index,
          mode,
          shape,
          size,
          axes,
          actual: pixels,
          expected: want,
        });
      e.undo();
      assert.equal(lit(e).length, 0);
      assert.equal(e.getSnapshot().dirty, false);
      e.redo();
      assert.deepEqual(lit(e), pixels);
      index++;
    }
index = 0;
for (const mode of [0, 1, 2, 3])
  for (const p of [
    [-1, -1],
    [0, 0],
    [7, 5],
    [9, 7],
  ]) {
    const e = new RasterEditor(blank(8, 6));
    e.setSettings({
      tool: "pencil",
      foreground: [255, 0, 0, 255],
      brush: { shape: "square", size: 4, angle: 0 },
    });
    e.setView({ tiledMode: mode });
    e.pointerDown({ x: p[0], y: p[1] });
    e.pointerUp();
    const pixels = lit(e),
      want = expected("tile-grid-" + index + ".txt");
    if (JSON.stringify(pixels) !== JSON.stringify(want))
      failures.push({ kind: "tiled", index, mode, p, actual: pixels, expected: want });
    if (e.getSnapshot().canUndo) {
      e.undo();
      assert.equal(lit(e).length, 0);
    }
    index++;
  }
for (const grid of [
  { x: 0, y: 0, width: 4, height: 3 },
  { x: 2, y: -2, width: 5, height: 4 },
])
  for (const p of [
    [1, 1],
    [3, 2],
    [5, 5],
    [-1, 2],
  ])
    for (const brush of [1, 4]) {
      const e = new RasterEditor(blank(8, 6));
      e.setSettings({
        tool: "pencil",
        foreground: [255, 0, 0, 255],
        brush: { shape: "square", size: brush, angle: 0 },
      });
      e.setGridBounds(grid);
      assert.equal(e.getSnapshot().view.grid, true);
      e.setView({ snapToGrid: true });
      e.pointerDown({ x: p[0], y: p[1] });
      e.pointerUp();
      const pixels = lit(e),
        want = expected("tile-grid-" + index + ".txt");
      if (JSON.stringify(pixels) !== JSON.stringify(want))
        failures.push({ kind: "grid", index, grid, p, brush, actual: pixels, expected: want });
      index++;
    }
const e = new RasterEditor(blank(8, 6));
e.setGridBounds({ x: 2, y: -3, width: 5, height: 7 });
let view = e.getSnapshot().view;
assert.deepEqual([view.gridX, view.gridY, view.gridWidth, view.gridHeight], [2, -3, 5, 7]);
e.undo();
view = e.getSnapshot().view;
if (
  JSON.stringify([view.gridX, view.gridY, view.gridWidth, view.gridHeight]) !==
  JSON.stringify([0, 0, 16, 16])
)
  failures.push({
    kind: "grid-history",
    actual: [view.gridX, view.gridY, view.gridWidth, view.gridHeight],
    expected: [0, 0, 16, 16],
  });
e.redo();
view = e.getSnapshot().view;
assert.deepEqual([view.gridX, view.gridY, view.gridWidth, view.gridHeight], [2, -3, 5, 7]);
fs.writeFileSync(
  ".tmp/assistance-oracle/editor-report.json",
  JSON.stringify({ cases: 104, failures }, null, 2),
);
if (failures.length) {
  console.log(
    "Failure counts",
    Object.fromEntries(
      ["symmetry", "tiled", "grid"].map((k) => [k, failures.filter((f) => f.kind === k).length]),
    ),
  );
  console.log(failures.slice(0, 3));
}
assert.equal(
  failures.length,
  0,
  "Actual RasterEditor mismatch; see .tmp/assistance-oracle/editor-report.json",
);
console.log(
  "104 Aseprite RasterEditor symmetry/tile/grid fixtures match, including undo/redo and grid metadata history.",
);
