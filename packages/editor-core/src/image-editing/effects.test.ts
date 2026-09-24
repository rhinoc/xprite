import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

import { activateTimelineCel } from "$/document/document";

describe("effects-document [feature-7-12]", () => {
  it("effects-document behavior", async () => {
    Error.stackTraceLimit = 0;
    const { outputFiles } = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/image-editing/effects.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const pixel = (c) => ({ width: 1, height: 1, data: new Uint8ClampedArray(c) });
    const red = pixel([255, 0, 0, 255]),
      blue = pixel([0, 0, 255, 255]);
    const layer = (id, extra = {}) => ({
      id,
      name: id,
      flags: 3,
      visible: true,
      locked: false,
      opacity: 255,
      ...extra,
    });
    const cel = (pixels, x = 0, y = 0) => ({ pixels, x, y, opacity: 255, zIndex: 0 });
    function doc(timeline) {
      const d = {
        name: "effects",
        width: 4,
        height: 4,
        selection: null,
        timeline,
        layer: { name: "a", pixels: red, x: 0, y: 0, visible: true, locked: false },
      };
      activateTimelineCel(d, timeline.activeFrame, timeline.activeLayer);
      return d;
    }
    let d = doc({
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("a"), layer("b")],
      frames: [
        { duration: 100, cels: [cel(red, 1, 1), cel(blue, 0, 0)] },
        { duration: 100, cels: [cel(red, 2, 2), cel(blue, 3, 3)] },
      ],
    });
    let out = m.applyDocumentEffect(d, { kind: "invert" });
    assert.notEqual(out, d);
    assert.deepEqual([...out.timeline.frames[0].cels[0].pixels.data], [0, 255, 255, 255]);
    assert.equal(
      out.timeline.frames[0].cels[0].pixels,
      out.timeline.frames[1].cels[0].pixels,
      "Linked images processed once and retained as links",
    );
    assert.equal(out.timeline.frames[1].cels[0].x, 2);
    assert.equal(out.timeline.frames[0].cels[1], d.timeline.frames[0].cels[1]);
    assert.equal(d.timeline.frames[0].cels[0].pixels, red);
    out = m.applyDocumentEffect(d, { kind: "brightness-contrast", brightness: 0, contrast: 0 });
    assert.equal(out, d, "Aseprite no-op filter yields no document/history change");
    const all = m.applyDocumentEffect(d, { kind: "invert" }, "all");
    assert.deepEqual([...all.timeline.frames[0].cels[1].pixels.data], [255, 255, 0, 255]);
    d.timeline = { ...d.timeline, layers: [layer("a"), layer("b", { locked: true })] };
    out = m.applyDocumentEffect(d, { kind: "invert" }, "all");
    assert.equal(
      out.timeline.frames[0].cels[1],
      d.timeline.frames[0].cels[1],
      "Locked layer remains unchanged",
    );
    d.timeline = {
      ...d.timeline,
      layers: [layer("a", { visible: false }), layer("b", { flags: 67 })],
    };
    assert.equal(
      m.applyDocumentEffect(d, { kind: "invert" }, "all"),
      d,
      "Invisible and reference layers are not writable filter targets",
    );
    d = doc({
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("background", { flags: 11 })],
      frames: [{ duration: 100, cels: [cel(red)] }],
    });
    out = m.applyDocumentEffect(d, {
      kind: "replace-color",
      from: [255, 0, 0, 255],
      to: [4, 5, 6, 0],
      tolerance: 0,
    });
    assert.deepEqual(
      [...out.timeline.frames[0].cels[0].pixels.data],
      [4, 5, 6, 255],
      "Background ignores alpha channel edits",
    );
    d = doc({
      activeFrame: 0,
      activeLayer: 0,
      layers: [layer("a")],
      frames: [
        {
          duration: 100,
          cels: [
            cel(
              {
                width: 3,
                height: 1,
                data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
              },
              -1,
              0,
            ),
          ],
        },
      ],
    });
    out = m.applyDocumentEffect(d, { kind: "invert" });
    assert.equal(out.timeline.frames[0].cels[0].x, -1);
    assert.deepEqual(
      [...out.timeline.frames[0].cels[0].pixels.data],
      [255, 0, 0, 255, 0, 255, 255, 255, 0, 255, 255, 255],
      "Aseprite patch preserves cel pixels outside sprite",
    );
    const selected = {
      ...d,
      selection: { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([1]) },
    };
    const p = m.previewDocumentEffect(selected, { kind: "invert" });
    assert.equal(selected.timeline, d.timeline);
    assert.deepEqual(
      [...selected.timeline.frames[0].cels[0].pixels.data],
      [255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255],
    );
    assert.equal(p.selection, selected.selection);
    console.log(
      "Document effects: immutable/no-op, selected/all targets, linked identity, locked/reference visibility, background alpha, offcanvas preservation and preview isolation passed",
    );
  }, 60_000);
});
