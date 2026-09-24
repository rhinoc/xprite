import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateSync } from "node:zlib";

import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["packages/editor-core/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const api = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
  ),
  inflate = (bytes) => new Uint8Array(inflateSync(bytes));
const compare = (a, b) =>
  Buffer.compare(
    Buffer.from(a.buffer, a.byteOffset, a.byteLength),
    Buffer.from(b.buffer, b.byteOffset, b.byteLength),
  );
fs.mkdirSync(".tmp/aseprite-edit-roundtrip", { recursive: true });
for (const [id, path] of [["xprite", "apps/editor/assets/examples/xprite/xprite.ase"]]) {
  const source = await api.decodeAseprite(new Uint8Array(fs.readFileSync(path)), { inflate }),
    project = api.projectFromAseprite(source),
    e = new api.RasterEditor();
  e.loadTimeline(project.timeline, source.width, source.height, path, project.palette);
  const layer = 0;
  e.selectLayer(layer);
  e.setLayerVisible(true);
  e.setLayerLocked(false);
  const before = e.composite().data.slice();
  e.setSettings({ tool: "pencil", foreground: [255, 0, 91, 255] });
  e.pointerDown({ x: 5, y: 5 });
  e.pointerUp();
  const after = e.composite().data.slice();
  assert.notEqual(compare(before, after), 0);
  e.undo();
  assert.equal(compare(e.composite().data, before), 0);
  e.redo();
  assert.equal(compare(e.composite().data, after), 0);
  const current = api.asepriteFromProject(api.projectFromDocument(e.getSnapshot().document)),
    encoded = await api.encodeAseprite(current);
  fs.writeFileSync(`.tmp/aseprite-edit-roundtrip/${id}.aseprite`, encoded);
  const decoded = await api.decodeAseprite(encoded, { inflate });
  assert.equal(decoded.frames.length, source.frames.length);
  assert.equal(decoded.layers.length, source.layers.length);
  assert.deepEqual(decoded.tags, source.tags);
  const reopened = api.projectFromAseprite(decoded),
    other = new api.RasterEditor();
  other.loadTimeline(reopened.timeline, source.width, source.height, path, reopened.palette);
  for (let frame = 0; frame < source.frames.length; frame++) {
    e.selectFrame(frame);
    other.selectFrame(frame);
    assert.equal(compare(e.composite().data, other.composite().data), 0, `${id} frame${frame}`);
  }
  console.log(
    `${id}: edit/undo/redo, layered ASE encode/reopen and all${source.frames.length} frame composites pass`,
  );
}
