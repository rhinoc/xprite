import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "esbuild";

import { resolveAsepriteExecutable } from "../../base/reference-paths.mjs";
const root = resolve(".tmp/selection-edge-oracle");
mkdirSync(root, { recursive: true });
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/editor/RasterEditor.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const { RasterEditor } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const luaSelect = (x = 0, y = 1, w = 1, h = 2) =>
  `app.useTool{tool='rectangular_marquee',points={Point(${x},${y}),Point(${x + w - 1},${y + h - 1})},selection=${w === 1 && h === 1 ? 1 : 0}}`;
const jsSelect = (e, x = 0, y = 1, w = 1, h = 2) => {
  e.setSettings({ tool: "marquee", selectionMode: w === 1 && h === 1 ? "add" : "replace" });
  e.pointerDown({ x, y });
  e.pointerUp({ x: x + w - 1, y: y + h - 1 });
};
const cases = [
  [
    "undo-selection",
    "app.undo();app.command.ReselectMask{}",
    (e) => {
      e.undo();
      e.reselect();
    },
  ],
  [
    "redo-deselect",
    "app.command.DeselectMask{};app.undo();app.redo();app.command.ReselectMask{}",
    (e) => {
      e.deselect();
      e.undo();
      e.redo();
      e.reselect();
    },
  ],
  [
    "undo-new-mask",
    `app.command.DeselectMask{};${luaSelect(2, 2, 1, 1)};app.undo();app.command.ReselectMask{}`,
    (e) => {
      e.deselect();
      jsSelect(e, 2, 2, 1, 1);
      e.undo();
      e.reselect();
    },
  ],
  [
    "clear-reselect",
    "app.command.Clear{};app.command.ReselectMask{}",
    (e) => {
      e.clearSelectionPixels();
      e.reselect();
    },
  ],
  [
    "canvas-hidden",
    "app.command.DeselectMask{};app.command.CanvasSize{ui=false,bounds=Rectangle(-1,-1,6,6),trimOutside=false};app.command.ReselectMask{}",
    (e) => {
      e.deselect();
      e.resizeCanvas({ x: -1, y: -1, width: 6, height: 6 }, false);
      e.reselect();
    },
  ],
  [
    "rotate-hidden",
    "app.command.DeselectMask{};app.command.Rotate{ui=false,target='sprite',angle=90};app.command.ReselectMask{}",
    (e) => {
      e.deselect();
      e.rotateCanvas(90);
      e.reselect();
    },
  ],
  [
    "resize-hidden",
    "app.command.DeselectMask{};app.command.SpriteSize{ui=false,width=8,height=8,method='nearest-neighbor'};app.command.ReselectMask{}",
    (e) => {
      e.deselect();
      e.resizeSprite(8, 8, "nearest");
      e.reselect();
    },
  ],
  [
    "flip-hidden",
    "app.command.DeselectMask{};app.command.Flip{target='sprite',orientation='horizontal'};app.command.ReselectMask{}",
    (e) => {
      e.deselect();
      e.flipCanvas("horizontal");
      e.reselect();
    },
  ],
];
const lua =
  `local f=io.open('${root}/aseprite-history.txt','w')\n` +
  cases
    .map(
      ([, cmd]) =>
        `do local s=Sprite(4,4,ColorMode.RGB);${luaSelect()};${cmd};local b=s.selection.bounds;f:write(table.concat({b.x,b.y,b.width,b.height},',')..'\\n');s:close() end`,
    )
    .join("\n") +
  "\nf:close()";
writeFileSync(root + "/aseprite-history.lua", lua);
execFileSync(resolveAsepriteExecutable(), ["--batch", "--script", root + "/aseprite-history.lua"]);
const lines = readFileSync(root + "/aseprite-history.txt", "utf8")
  .trim()
  .split("\n");
for (let i = 0; i < cases.length; i++) {
  const e = new RasterEditor({ width: 4, height: 4, data: new Uint8ClampedArray(64) });
  jsSelect(e);
  cases[i][2](e);
  const m = e.getSnapshot().document.selection;
  assert.deepEqual(
    m ? [m.x, m.y, m.width, m.height] : [0, 0, 0, 0],
    lines[i].split(",").map(Number),
    cases[i][0],
  );
  if (i < 3) assert.equal(e.getSnapshot().dirty, false, `${cases[i][0]} is selection-only history`);
}
const e = new RasterEditor({ width: 4, height: 4, data: new Uint8ClampedArray(64) });
jsSelect(e);
e.deselect();
assert.ok(e.getSnapshot().document.hiddenSelection);
assert.equal(
  e.getPersistenceSnapshot().document.hiddenSelection,
  undefined,
  "Hidden mask is not durable content",
);
console.log(
  `${cases.length} selection history/hidden-transform scenarios match actual Aseprite CLI; hidden mask excluded from persistence`,
);
