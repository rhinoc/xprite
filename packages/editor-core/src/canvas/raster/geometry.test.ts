import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-rectangle", () => {
  it("editor-rectangle behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, paintRectangle, rectanglePath, resolveShortcut } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );

    const image = (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    });
    const red = [255, 0, 0, 255];
    const options = { color: red, brush: { shape: "circle", size: 1, angle: 0 } };
    const pixel = (buffer, x, y) =>
      buffer.data.slice((y * buffer.width + x) * 4, (y * buffer.width + x) * 4 + 4);
    const expectedPerimeter = (x1, y1, x2, y2) => {
      const result = new Set();
      for (let x = x1; x <= x2; x++) {
        result.add(`${x},${y1}`);
        result.add(`${x},${y2}`);
      }
      for (let y = y1; y <= y2; y++) {
        result.add(`${x1},${y}`);
        result.add(`${x2},${y}`);
      }
      return result;
    };

    assert.deepEqual(rectanglePath({ x: 4, y: 3 }, { x: 1, y: 1 }), [
      { x: 4, y: 3 },
      { x: 1, y: 3 },
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
    ]);

    const forward = image(8, 7);
    paintRectangle(forward, { x: 1, y: 1 }, { x: 4, y: 3 }, options);
    const reverse = image(8, 7);
    paintRectangle(reverse, { x: 4, y: 3 }, { x: 1, y: 1 }, options);
    assert.deepEqual(reverse.data, forward.data, "reverse drags cover the same pixels");
    assert.deepEqual(
      [...expectedPerimeter(1, 1, 4, 3)].filter((key) => {
        const [x, y] = key.split(",").map(Number);
        return pixel(forward, x, y)[3] === 255;
      }),
      [...expectedPerimeter(1, 1, 4, 3)],
    );
    assert.equal(pixel(forward, 2, 2)[3], 0, "outline leaves the interior transparent");

    const clipped = image(8, 7);
    paintRectangle(
      clipped,
      { x: 1, y: 1 },
      { x: 5, y: 4 },
      {
        ...options,
        selection: {
          x: 2,
          y: 1,
          width: 3,
          height: 1,
          data: new Uint8Array(3).fill(255),
        },
      },
    );
    assert.equal(
      pixel(clipped, 1, 1)[3],
      0,
      "selection clips the horizontal edge outside its origin",
    );
    assert.equal(pixel(clipped, 2, 1)[3], 255, "selection keeps the intersecting edge");
    assert.equal(
      pixel(clipped, 3, 2)[3],
      0,
      "selection clips all pixels not on the rectangle boundary",
    );

    const translucent = image(8, 7);
    paintRectangle(
      translucent,
      { x: 1, y: 1 },
      { x: 4, y: 3 },
      {
        ...options,
        opacity: 128,
      },
    );
    for (const key of expectedPerimeter(1, 1, 4, 3)) {
      const [x, y] = key.split(",").map(Number);
      assert.equal(pixel(translucent, x, y)[3], 128, `corner/edge ${key} receives opacity once`);
    }

    const e = new RasterEditor(image(8, 7));
    e.drawing.settings.setSettings({ tool: "rectangle", foreground: red });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerMove({ x: 4, y: 3 });
    assert.equal(
      pixel(e.canvas.composite(), 2, 1)[3],
      0,
      "rectangle remains a preview until release",
    );
    e.pointerUp();
    assert.equal(pixel(e.canvas.composite(), 2, 1)[3], 255);
    assert.equal(pixel(e.canvas.composite(), 2, 2)[3], 0);
    assert.equal(e.getSnapshot().canUndo, true);
    e.history.undo();
    assert.equal(pixel(e.canvas.composite(), 2, 1)[3], 0, "rectangle is one undo transaction");
    e.history.redo();
    assert.equal(pixel(e.canvas.composite(), 2, 1)[3], 255);

    e.document.loadImage(image(8, 7));
    e.drawing.settings.setSettings({ tool: "rectangle", foreground: red });
    e.pointerDown({ x: 3, y: 2 });
    e.pointerUp();
    assert.equal(pixel(e.canvas.composite(), 3, 2)[3], 255, "single pixel rectangle is valid");
    e.history.undo();
    assert.equal(pixel(e.canvas.composite(), 3, 2)[3], 0);

    e.document.loadImage(image(8, 7));
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 2, y: 1 });
    e.pointerMove({ x: 4, y: 1 });
    e.pointerUp();
    e.drawing.settings.setSettings({ tool: "rectangle", foreground: red });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerMove({ x: 5, y: 4 });
    e.pointerUp();
    assert.equal(
      pixel(e.canvas.composite(), 2, 1)[3],
      255,
      "selection keeps the intersecting boundary",
    );
    assert.equal(pixel(e.canvas.composite(), 1, 1)[3], 0, "selection clips outside boundary");
    assert.equal(pixel(e.canvas.composite(), 2, 2)[3], 0);

    assert.deepEqual(resolveShortcut({ key: "u" }), {
      type: "tool",
      tool: "rectangle",
      tools: ["rectangle", "filled_rectangle"],
    });
    console.log(
      "Rectangle fixtures pass: inclusive/reverse geometry, selection clipping, one-pass opacity corners, preview/release, degenerate drag, and transactional undo/redo.",
    );
  }, 60_000);
});
