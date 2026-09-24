import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-frame", () => {
  it("editor-frame behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/canvas/frame-geometry.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const {
      editorFrameGeometry: frame,
      editorScrollAxis: axis,
      editorScrollDragPan: drag,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    const bounds = { x: 160, y: 102, width: 1724, height: 686 },
      image = { x: 404, y: 84, width: 1224, height: 708 };
    const initial = frame(bounds, image, 1, { x: 0, y: 0 });
    assert.deepEqual(initial.horizontalThumb, { x: 522, y: 770, width: 988, height: 12 });
    assert.deepEqual(initial.verticalThumb, { x: 1866, y: 278, width: 12, height: 320 });
    assert.deepEqual(initial.horizontal, {
      visible: 850,
      content: 1462,
      padding: 425,
      scroll: 306,
      maximum: 612,
      length: 494,
      travel: 356,
      position: 178,
    });
    const cat = frame(bounds, { x: 508, y: 42, width: 1018, height: 792 }, 1, { x: 0, y: 0 });
    assert.equal(cat.horizontalThumb.width, 1062);
    assert.equal(cat.horizontalThumb.x, 484);
    assert.notDeepEqual(cat.horizontalThumb, initial.horizontalThumb);
    const zoom = frame(bounds, image, 2, { x: 0, y: 0 });
    assert.ok(zoom.horizontalThumb.width < initial.horizontalThumb.width);
    assert.ok(zoom.verticalThumb.height < initial.verticalThumb.height);
    const translated = frame(
      { ...bounds, x: bounds.x + 20, y: bounds.y - 18 },
      { ...image, x: image.x + 20, y: image.y - 18 },
      1,
      { x: 0, y: 0 },
    );
    assert.equal(translated.horizontalThumb.x, 542);
    assert.equal(translated.horizontalThumb.y, 752);
    assert.equal(translated.verticalThumb.y, 260);
    const tiny = axis(850, 16, 417);
    assert.equal(tiny.padding, 834);
    assert.equal(tiny.content, 1684);
    assert.equal(tiny.length, 429);
    const huge = axis(850, 100000, 0);
    assert.equal(huge.length, 24);
    assert.equal(drag(initial.horizontal, 0, 100000), -612);
    assert.equal(drag(initial.horizontal, 0, -100000), 612);
    const panned = frame(bounds, image, 1, { x: 200, y: -100 });
    assert.ok(panned.horizontalThumb.x < initial.horizontalThumb.x);
    assert.ok(panned.verticalThumb.y > initial.verticalThumb.y);
    assert.equal(axis(850, 0, 0).length, 850);
    console.log(
      "Source editor padding/scroll/thumb geometry checks pass: exact historical Frame4, cat509x396, zoom, frame relocation, tiny/large/empty docs, bounded drag andpan.",
    );
  }, 60_000);
});
