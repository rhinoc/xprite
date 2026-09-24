import assert from "node:assert/strict";

import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { RasterEditor, EditorAllocationError } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
for (const [x, y] of [
  [1000000, 0],
  [-1000000, 0],
  [8000, 8000],
]) {
  const e = new RasterEditor({
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([27, 18, 9, 255]),
  });
  e.setSettings({ tool: "move" });
  e.pointerDown({ x: 0, y: 0 });
  e.pointerUp({ x, y });
  const before = e.getSnapshot().document.layer.pixels;
  e.setSettings({ tool: "pencil" });
  assert.doesNotThrow(() => {
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
  });
  const snapshot = e.getSnapshot();
  assert.ok(snapshot.error instanceof EditorAllocationError);
  assert.equal(snapshot.error.code, "cel-allocation-limit");
  assert.equal(snapshot.preview, null);
  assert.equal(snapshot.document.layer.pixels, before);
  assert.equal(snapshot.document.layer.x, x);
  assert.deepEqual([...before.data], [27, 18, 9, 255]);
  e.undo();
  assert.equal(e.getSnapshot().document.layer.x, 0);
  assert.equal(e.getSnapshot().canUndo, false, "Rejected paint must not add a transaction");
  e.pointerDown({ x: 0, y: 0 });
  e.pointerUp();
  assert.equal(
    e.getSnapshot().error,
    null,
    "A later valid gesture clears the error and paints normally",
  );
}
const e = new RasterEditor({
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
});
const palette = e.getSnapshot().palette;
e.setSettings({ foreground: [0, 255, 0, 255] });
e.pointerDown({ x: 0, y: 0 });
e.pointerUp();
assert.equal(e.getSnapshot().palette, palette);
e.undo();
assert.equal(e.getSnapshot().palette, palette);
e.redo();
assert.equal(e.getSnapshot().palette, palette);
e.setLayerVisible(false);
assert.equal(e.getSnapshot().palette, palette);
e.setPalette([[4, 5, 6, 255]]);
assert.deepEqual(e.getSnapshot().palette, [[4, 5, 6, 255]]);
console.log(
  "Allocation/palette checks pass: distant positive/negative cel offsets and area cap reject before allocation; typed errors do not escape input, pixels/history survive, later gestures recover, palette stays fixed except explicit edits.",
);
