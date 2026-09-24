import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-anchored-zoom", () => {
  it("editor-anchored-zoom behavior", async () => {
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
    const make = () =>
        new RasterEditor({
          width: 613,
          height: 355,
          data: new Uint8ClampedArray(613 * 355 * 4),
        }),
      viewport = { width: 851, height: 331 };
    const cases = [
      {
        name: "odd document, centered",
        document: [613, 355],
        initial: 1,
        next: 2,
        pan: [0, 0],
        expected: [0, 0],
      },
      {
        name: "even document, centered",
        document: [612, 354],
        initial: 1,
        next: 2,
        pan: [0, 0],
        expected: [-1, -1],
      },
      {
        name: "mouse anchor inside",
        document: [613, 355],
        initial: 1,
        next: 2,
        pan: [0, 0],
        anchor: [426, 166],
        expected: [-1, -1],
      },
      {
        name: "panned high zoom",
        document: [613, 355],
        initial: 4,
        next: 8,
        pan: [17, -31],
        anchor: [426, 166],
        expected: [33, -63],
      },
      {
        name: "panned zoom out",
        document: [613, 355],
        initial: 3,
        next: 1 / 3,
        pan: [-45, 32],
        anchor: [321, 211],
        expected: [-97, 44],
      },
      {
        name: "anchor outside small document",
        document: [20, 20],
        initial: 1,
        next: 2,
        pan: [0, 0],
        anchor: [2, 2],
        expected: [9, 9],
      },
    ];
    for (const test of cases) {
      const [width, height] = test.document;
      const editor = new RasterEditor({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      });
      editor.canvas.setView({ zoom: test.initial, pan: { x: test.pan[0], y: test.pan[1] } });
      editor.canvas.zoomTo(
        test.next,
        viewport,
        test.anchor ? { x: test.anchor[0], y: test.anchor[1] } : undefined,
      );
      assert.deepEqual(
        editor.getSnapshot().view.pan,
        { x: test.expected[0], y: test.expected[1] },
        test.name,
      );
    }
    const e = make(),
      image = e.canvas.composite(),
      revision = e.getSnapshot().pixelRevision;
    e.canvas.setView({ grid: true });
    e.canvas.zoomTo(2, viewport);
    assert.deepEqual(
      e.getSnapshot().view.pan,
      { x: 0, y: 0 },
      "Aseprite center1→2 selects pixel center for odd extent",
    );
    assert.equal(e.canvas.composite(), image);
    assert.equal(e.getSnapshot().pixelRevision, revision);
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, false);
    assert.equal(e.getSnapshot().view.grid, true);
    const integer = make(),
      fractional = make();
    integer.canvas.zoomTo(2, viewport, { x: 426, y: 166 });
    fractional.canvas.zoomTo(2, viewport, { x: 426.99, y: 166.75 });
    assert.deepEqual(
      fractional.getSnapshot().view,
      integer.getSnapshot().view,
      "Mouse anchors floor onto logical GUI grid before projection",
    );
    e.canvas.zoomTo(Infinity, viewport);
    assert.equal(e.getSnapshot().view.zoom, 64);
    assert.ok(Number.isInteger(e.getSnapshot().view.pan.x));
    assert.ok(Number.isInteger(e.getSnapshot().view.pan.y));
    e.canvas.zoomTo(-Infinity, viewport);
    assert.equal(e.getSnapshot().view.zoom, 1 / 64);
    assert.ok(Number.isInteger(e.getSnapshot().view.pan.x));
    const before = e.getSnapshot();
    e.canvas.zoomTo(NaN, viewport);
    assert.equal(e.getSnapshot(), before);
    const empty = new RasterEditor();
    empty.canvas.zoomTo(4, viewport);
    assert.equal(empty.getSnapshot().view.zoom, 4);
    assert.deepEqual(empty.getSnapshot().view.pan, { x: 0, y: 0 });
    console.log(
      `${cases.length} zoom anchor cases; integer mouse anchors, odd-center behavior, view-only revision/cache stability, clamping and empty-document cases pass.`,
    );
  }, 60_000);
});
