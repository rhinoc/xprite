import assert from "node:assert/strict";

import { build } from "esbuild";
import { beforeAll, describe, it } from "vitest";

describe("multi-cel selection transforms", () => {
  let api: typeof import("$/index");
  beforeAll(async () => {
    const output = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    api = await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`
    );
  });

  const pixels = (first: readonly number[], second: readonly number[]) => {
    const image = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    image.data.set(first, (3 * 8 + 2) * 4);
    image.data.set(second, (3 * 8 + 3) * 4);
    return image;
  };
  const fixture = (kind: "frames" | "cels" = "frames", linked = true) => {
    const red = pixels([255, 0, 0, 255], [255, 255, 0, 255]);
    const blue = pixels([0, 0, 255, 255], [0, 255, 255, 255]);
    const locked = pixels([0, 255, 0, 255], [0, 255, 0, 255]);
    const cel = (image: typeof red, x = 0) => ({ pixels: image, x, y: 0, opacity: 255, zIndex: 0 });
    const editor = new api.RasterEditor();
    editor.document.loadTimeline(
      {
        layers: [
          {
            id: "artwork",
            name: "Artwork",
            kind: "image",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 255,
          },
          {
            id: "locked",
            name: "Locked",
            kind: "image",
            visible: true,
            locked: true,
            flags: 1,
            opacity: 255,
          },
        ],
        frames: [
          { duration: 100, cels: [cel(red), cel(locked)] },
          { duration: 100, cels: [cel(blue), null] },
          {
            duration: 100,
            cels: [cel(linked ? red : pixels([255, 0, 0, 255], [255, 255, 0, 255]), 1), null],
          },
        ],
        activeFrame: 0,
        activeLayer: 0,
        colorDepth: 32,
      },
      16,
      16,
      "Multi-cel",
    );
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 2, y: 2 });
    editor.pointerUp({ x: 4, y: 4 });
    editor.timeline.setTimelineRange({ kind, frames: [0, 1, 2], layers: [0, 1] });
    return editor;
  };
  const pixel = (
    editor: InstanceType<typeof api.RasterEditor>,
    frame: number,
    layer: number,
    x: number,
    y: number,
  ) => {
    const cel = editor.getSnapshot().document!.timeline!.frames[frame].cels[layer];
    if (
      !cel ||
      x < cel.x ||
      y < cel.y ||
      x >= cel.x + cel.pixels.width ||
      y >= cel.y + cel.pixels.height
    )
      return [0, 0, 0, 0];
    const index = ((y - cel.y) * cel.pixels.width + x - cel.x) * 4;
    return Array.from(cel.pixels.data.slice(index, index + 4));
  };
  const move = (editor: InstanceType<typeof api.RasterEditor>, copy = false) => {
    assert(editor.selection.beginTransform("move", { x: 3, y: 3 }, copy));
    editor.pointerUp({ x: 7, y: 3 });
  };

  it("previews immutably and commits all selected cels in one undo step", () => {
    const editor = fixture();
    const count = editor.history.getSnapshot().states.length;
    move(editor);
    assert.deepEqual(pixel(editor, 0, 0, 2, 3), [255, 0, 0, 255]);
    const preview = editor.canvas.previewComposite();
    assert.deepEqual(
      Array.from(preview.data.slice((3 * 16 + 6) * 4, (3 * 16 + 6) * 4 + 4)),
      [255, 0, 0, 255],
    );
    assert(editor.clipboard.commitFloatingPaste());
    assert.deepEqual(pixel(editor, 0, 0, 6, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 2, 0, 7, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 0, 1, 2, 3), [0, 255, 0, 255]);
    assert.equal(editor.history.getSnapshot().states.length, count + 1);
    const timeline = editor.getSnapshot().document!.timeline!;
    assert.equal(timeline.frames[0].cels[0]!.pixels, timeline.frames[2].cels[0]!.pixels);
    editor.history.undo();
    assert.deepEqual(pixel(editor, 0, 0, 2, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    editor.history.redo();
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 0, 255, 255]);
  });

  it("cancels every target without changing history or raster content", () => {
    const editor = fixture();
    const count = editor.history.getSnapshot().states.length;
    move(editor);
    editor.clipboard.cancelFloatingPaste();
    assert.deepEqual(pixel(editor, 0, 0, 2, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    assert.equal(editor.history.getSnapshot().states.length, count);
    assert.equal(editor.getSnapshot().floatingPaste, null);
  });

  it("copies selections while retaining the originals in every target", () => {
    const editor = fixture();
    move(editor, true);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 0, 0, 2, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 0, 255, 255]);
  });

  it("updates linked cels outside the selected range without changing unrelated frames", () => {
    const editor = fixture("cels");
    editor.timeline.setTimelineRange({ kind: "cels", frames: [0], layers: [0] });
    move(editor);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 2, 0, 7, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 0, 0, 0]);
  });

  it("expands selected groups to editable descendants across every frame", () => {
    const source = fixture().getSnapshot().document!;
    const timeline = source.timeline!;
    const editor = new api.RasterEditor();
    editor.document.loadTimeline(
      {
        ...timeline,
        activeLayer: 0,
        layers: [
          {
            id: "group",
            name: "Group",
            kind: "group",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 255,
          },
          ...timeline.layers.map((layer) => ({ ...layer, parentId: "group" })),
        ],
        frames: timeline.frames.map((frame) => ({ ...frame, cels: [null, ...frame.cels] })),
        range: undefined,
      },
      source.width,
      source.height,
      "Group",
    );
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 2, y: 2 });
    editor.pointerUp({ x: 4, y: 4 });
    editor.timeline.setTimelineRange({ kind: "layers", frames: [0], layers: [0] });
    move(editor);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 0, 1, 6, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 1, 6, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 0, 2, 2, 3), [0, 255, 0, 255]);
  });

  it("keeps explicit cel ranges active when the layer/frame preference is disabled", () => {
    const editor = fixture("cels");
    editor.drawing.settings.setSettings({ selectionMulticelWhenLayersOrFrames: false });
    move(editor);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 0, 255, 255]);
  });

  it("restricts frame ranges to the current cel when the preference is disabled", () => {
    const editor = fixture("frames", false);
    editor.drawing.settings.setSettings({ selectionMulticelWhenLayersOrFrames: false });
    move(editor);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 0, 0, 0]);
  });

  it("applies the same rotation to independently colored cel sources", () => {
    const editor = fixture();
    assert(editor.selection.beginTransform("move", { x: 3, y: 3 }));
    const transform = { ...editor.getSnapshot().selectionTransform!, angle: Math.PI / 2 };
    editor.clipboard.setSelectionTransform(transform);
    editor.clipboard.setTransformedMask(api.rasterizeSelectionTransform(transform).mask);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 0, 0, 3, 2), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 3, 2), [0, 0, 255, 255]);
  });

  it("scales each cel's own artwork rather than copying the active frame", () => {
    const editor = fixture();
    assert(editor.selection.beginTransform("e", { x: 5, y: 3 }));
    editor.pointerUp({ x: 8, y: 3 });
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(editor, 0, 0, 2, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 0, 0, 3, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 3, 3), [0, 0, 255, 255]);
  });

  it("flips every source through the opposite anchor and restores linked cels on undo", () => {
    const editor = fixture();
    const count = editor.history.getSnapshot().states.length;
    assert(editor.selection.beginTransform("e", { x: 5, y: 3 }));
    editor.pointerUp({ x: -1, y: 3 });
    assert.equal(editor.getSnapshot().selectionTransform!.bounds.width, -3);
    assert(editor.clipboard.commitFloatingPaste());
    assert.deepEqual(pixel(editor, 0, 0, 0, 3), [255, 255, 0, 255]);
    assert.deepEqual(pixel(editor, 0, 0, 1, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 0, 3), [0, 255, 255, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 1, 3), [0, 0, 255, 255]);
    assert.deepEqual(pixel(editor, 2, 0, 2, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 0, 1, 2, 3), [0, 255, 0, 255]);
    const timeline = editor.getSnapshot().document!.timeline!;
    assert.equal(timeline.frames[0].cels[0]!.pixels, timeline.frames[2].cels[0]!.pixels);
    assert.equal(editor.history.getSnapshot().states.length, count + 1);
    editor.history.undo();
    assert.deepEqual(pixel(editor, 0, 0, 2, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 0, 255, 255]);
    editor.history.redo();
    assert.deepEqual(pixel(editor, 1, 0, 0, 3), [0, 255, 255, 255]);
  });

  it("retains duplicate palette indices and linked images across frame palettes", () => {
    const colors = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ] as const;
    const other = [
      [0, 0, 0, 0],
      [0, 255, 0, 255],
      [0, 255, 0, 255],
      [255, 255, 0, 255],
    ] as const;
    const data = new Uint8Array(64);
    data[3 * 8 + 2] = 2;
    const raw = { depth: 8 as const, width: 8, height: 8, data };
    const cel = (palette: typeof colors | typeof other) => ({
      pixels: {
        width: 8,
        height: 8,
        data: api.expandAsepriteSamples(raw, api.paletteForColors(palette), 0),
      },
      asepriteSamples: raw,
      x: 0,
      y: 0,
      opacity: 255,
      zIndex: 0,
    });
    const editor = new api.RasterEditor();
    editor.document.loadTimeline(
      {
        colorDepth: 8,
        transparentIndex: 0,
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          {
            id: "indexed",
            name: "Indexed",
            kind: "image",
            visible: true,
            locked: false,
            flags: 3,
            opacity: 255,
          },
        ],
        frames: [
          { duration: 100, palette: colors, cels: [cel(colors)] },
          { duration: 100, palette: other, cels: [cel(other)] },
        ],
      },
      16,
      16,
      "Indexed links",
      colors,
    );
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 2, y: 2 });
    editor.pointerUp({ x: 4, y: 4 });
    editor.timeline.setTimelineRange({ kind: "frames", frames: [0, 1], layers: [0] });
    move(editor);
    editor.clipboard.commitFloatingPaste();
    const first = editor.getSnapshot().document!.timeline!.frames[0].cels[0]!;
    const second = editor.getSnapshot().document!.timeline!.frames[1].cels[0]!;
    assert.equal(first.asepriteSamples, second.asepriteSamples);
    assert.equal(first.asepriteSamples!.data[0], 2);
    assert.deepEqual(pixel(editor, 0, 0, 6, 3), [255, 0, 0, 255]);
    assert.deepEqual(pixel(editor, 1, 0, 6, 3), [0, 255, 0, 255]);
    editor.history.undo();
    assert.deepEqual(pixel(editor, 1, 0, 2, 3), [0, 255, 0, 255]);
  });
});
