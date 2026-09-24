import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("status-source", () => {
  it("status-source behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts'; export {editorStatusIndicators,statusReadableTime} from './packages/editor-core/src/editor/status.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      editorStatusIndicators: indicators,
      statusReadableTime: time,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    assert.deepEqual([899, 900, 58999, 59000, 3539999, 3540000].map(time), [
      "899ms",
      "0.90s",
      "59.00s",
      "0.98m",
      "59.00m",
      "0.98h",
    ]);
    const editor = new RasterEditor(
      { width: 8, height: 8, data: new Uint8ClampedArray(256) },
      "Status",
    );
    editor.timeline.addFrame();
    editor.timeline.setFrameDuration(900);
    editor.pointerMove({ x: 3.8, y: 4.2 });
    let row = indicators(editor.getSnapshot());
    assert.deepEqual(row.slice(0, 8), [
      { icon: "pos" },
      { text: "3 4" },
      { icon: "size" },
      { text: "8 8" },
      { icon: "frame" },
      { text: "2" },
      { icon: "clock" },
      { text: "0.90s/1.00s" },
    ]);
    assert.equal(
      indicators({ ...editor.getSnapshot(), pointer: null }).some((item) => item.icon === "clock"),
      false,
    );
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 6, y: 6 });
    editor.pointerMove({ x: 2, y: 3 });
    row = indicators(editor.getSnapshot());
    assert.deepEqual(row, [
      { icon: "start" },
      { text: "6 6" },
      { icon: "end" },
      { text: "2 3" },
      { icon: "size" },
      { text: "5 4" },
      { icon: "distance" },
      { text: "6.4" },
      { icon: "aspect_ratio" },
      { text: "5:4" },
    ]);
    editor.pointerUp();
    assert.equal(
      indicators(editor.getSnapshot()).some((item) => item.icon === "start"),
      false,
    );
    editor.drawing.settings.setSettings({ tool: "line" });
    editor.pointerDown({ x: 2, y: 2 });
    editor.pointerMove({ x: 5, y: 6 });
    assert.equal(
      indicators(editor.getSnapshot()).findIndex((item) => item.icon === "angle") >= 0,
      true,
    );
    assert.deepEqual(indicators(editor.getSnapshot(), "A timed notice"), [
      { text: "A timed notice" },
    ]);
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    pixels.set([12, 34, 56, 128], (3 * 8 + 2) * 4);
    const eyedropper = new RasterEditor({ width: 8, height: 8, data: pixels }, "Sample");
    eyedropper.drawing.settings.setSettings({ tool: "eyedropper", foreground: [1, 2, 3, 255] });
    eyedropper.pointerMove({ x: 2, y: 3 });
    const color = eyedropper.drawing.eyedropper.colorAt({ x: 2, y: 3 });
    assert.deepEqual(color, [12, 34, 56, 128]);
    assert.deepEqual(
      eyedropper.getSnapshot().settings.foreground,
      [1, 2, 3, 255],
      "Hover must not pick color",
    );
    assert.deepEqual(indicators(eyedropper.getSnapshot(), "", color), [
      { icon: "eyedropper" },
      { color: [12, 34, 56, 128], mask: false },
      { text: "RGB 12 34 56 #0c2238 A128" },
      { icon: "pos" },
      { text: "2 3" },
    ]);
    assert.deepEqual(indicators(eyedropper.getSnapshot(), "", color, [90, 80, 70, 255]), [
      { icon: "eyedropper" },
      { color: [90, 80, 70, 255], mask: false },
      { text: "RGB 90 80 70 #5a5046" },
    ]);
    assert.deepEqual(
      indicators(
        eyedropper.getSnapshot(),
        "",
        color,
        [255, 0, 0, 128],
        "HSV 0° 100% 100% (RGB 255 0 0)",
      ),
      [
        { icon: "eyedropper" },
        { color: [255, 0, 0, 128], mask: false },
        { text: "HSV 0° 100% 100% (RGB 255 0 0) #ff0000 A128" },
      ],
    );
    console.log(
      "Aseprite status: animation timing, pointer/default state, selection measurements, notices and color-button/eyedropper hover pass.",
    );
  }, 60_000);
});

describe("floating-status", () => {
  it("floating-status behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts';export {editorStatusIndicators,editorStatusDescription} from './packages/editor-core/src/editor/status.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, editorStatusIndicators, editorStatusDescription } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const e = new RasterEditor({ width: 8, height: 8, data: new Uint8ClampedArray(256) }, "Status");
    e.drawing.settings.setSettings({
      font: {
        height: 2,
        lineHeight: 2,
        glyphs: { X: { width: 6, height: 2, advance: 6, alpha: new Uint8Array(12).fill(255) } },
      },
    });
    e.drawing.text.beginTextPaste("X", 1, { x: -1, y: 2 });
    assert.deepEqual(editorStatusIndicators(e.getSnapshot()), [
      { icon: "pos" },
      { text: "-1 2" },
      { icon: "size" },
      { text: "6 2" },
      { icon: "selsize" },
      { text: "6 2 [100.00% 100.00%]" },
      { icon: "angle" },
      { text: "0.0" },
      { icon: "aspect_ratio" },
      { text: "3:1" },
    ]);
    e.pointerDown({ x: 0, y: 2 });
    e.pointerMove({ x: 2, y: 4 });
    assert.equal(editorStatusIndicators(e.getSnapshot())[1].text, "1 4");
    assert.equal(
      editorStatusDescription(editorStatusIndicators(e.getSnapshot())).includes(
        "Angle 0.0 Aspect ratio 3:1",
      ),
      true,
    );
    assert.deepEqual(editorStatusIndicators(e.getSnapshot(), "explicit notice"), [
      { text: "explicit notice" },
    ]);
    e.clipboard.cancelFloatingPaste();
    assert.ok(!editorStatusIndicators(e.getSnapshot()).some((item) => item.icon === "angle"));
    console.log(
      "Floating status matches Aseprite translation indicators: position, original size, selection size+100.00% scales,0.0 angle,reduced aspect ratio; drag/notice/cancel states pass.",
    );
  }, 60_000);
});
