import { describe, expect, it } from "vitest";

import { BatchEditError, BatchEditKind, type BatchEditOperation } from "$/editor/batch-edit-types";
import { RasterEditor } from "$/editor/RasterEditor";
import { timelineTags } from "$/timeline/tags";

function fixture() {
  return new RasterEditor(
    { width: 4, height: 4, data: new Uint8ClampedArray(64) },
    "Agent fixture",
  );
}
function fill(editor: RasterEditor): BatchEditOperation & { type: BatchEditKind.FillRect } {
  return {
    type: BatchEditKind.FillRect,
    layerId: editor.getSnapshot().document!.timeline!.layers[0].id,
    frameIndex: 0,
    rect: { x: 1, y: 1, width: 2, height: 2 },
    color: "#FF004D",
  };
}
const revision = (editor: RasterEditor) => editor.getContentRevision();

describe("agent document batches", () => {
  it("shares conflict revisions across linked document views", () => {
    const editor = fixture(),
      linked = editor.createLinkedView();
    const before = revision(editor);
    editor.applyBatch([fill(editor)], before, "Shared edit");
    expect(revision(linked)).toBe(revision(editor));
    expect(revision(editor)).toBeGreaterThan(before);
    expect(() => linked.applyBatch([fill(linked)], before, "Stale linked edit")).toThrow(
      "Document changed",
    );
  });
  it("groups different raster operations into one reversible history entry", () => {
    const editor = fixture();
    const operation = fill(editor);
    editor.applyBatch(
      [
        operation,
        {
          type: BatchEditKind.Pixels,
          layerId: operation.layerId,
          frameIndex: 0,
          rect: { x: 1, y: 1, width: 1, height: 1 },
          rgba: [0, 0, 0, 0],
        },
      ],
      revision(editor),
      "Draw and erase",
    );
    const painted = editor.canvas.composite().data.slice();
    expect(painted[(1 * 4 + 1) * 4 + 3]).toBe(0);
    expect(painted[(2 * 4 + 2) * 4 + 3]).toBe(255);
    expect(editor.history.getSnapshot().states).toHaveLength(1);
    editor.history.undo();
    expect(editor.canvas.composite().data.every((byte) => byte === 0)).toBe(true);
    editor.history.redo();
    expect(editor.canvas.composite().data).toEqual(painted);
  });

  it("writes grid rows through one batch operation", () => {
    const editor = fixture(),
      operation = fill(editor);
    editor.applyBatch([operation], revision(editor), "Fill base");
    const result = editor.applyBatch(
      [
        {
          type: BatchEditKind.Grid,
          layerId: operation.layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 4, height: 2 },
          legend: {
            K: "#292431",
            S: "#777386",
            H: "#C8BCC4",
          },
          rows: ["..KK", "KSHS"],
          transparent: "erase",
        },
      ],
      revision(editor),
      "Grid patch",
    );
    const pixels = editor.canvas.composite().data;
    expect(result.changedRegions[0].rect).toEqual({ x: 0, y: 0, width: 4, height: 2 });
    expect(Array.from(pixels.slice(0, 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(pixels.slice(8, 16))).toEqual([41, 36, 49, 255, 41, 36, 49, 255]);
    expect(Array.from(pixels.slice(16, 20))).toEqual([41, 36, 49, 255]);
    expect(Array.from(pixels.slice(20, 24))).toEqual([119, 115, 134, 255]);
    expect(Array.from(pixels.slice(24, 28))).toEqual([200, 188, 196, 255]);
    expect(Array.from(pixels.slice(28, 32))).toEqual([119, 115, 134, 255]);
  });

  it("can skip transparent grid cells", () => {
    const editor = fixture(),
      operation = fill(editor);
    editor.applyBatch([operation], revision(editor), "Fill base");
    const before = editor.canvas.composite().data.slice();
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Grid,
          layerId: operation.layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          legend: { K: "#292431" },
          rows: [".K", "K."],
          transparent: "skip",
        },
      ],
      revision(editor),
      "Grid overlay",
    );
    const pixels = editor.canvas.composite().data;
    expect(Array.from(pixels.slice(0, 4))).toEqual(Array.from(before.slice(0, 4)));
    expect(Array.from(pixels.slice(4, 8))).toEqual([41, 36, 49, 255]);
    expect(Array.from(pixels.slice(16, 20))).toEqual([41, 36, 49, 255]);
    expect(Array.from(pixels.slice(20, 24))).toEqual(Array.from(before.slice(20, 24)));
  });

  it("rejects malformed grid rows without changing the document", () => {
    const editor = fixture(),
      before = revision(editor);
    expect(() =>
      editor.applyBatch(
        [
          {
            type: BatchEditKind.Grid,
            layerId: editor.getSnapshot().document!.timeline!.layers[0].id,
            frameIndex: 0,
            rect: { x: 0, y: 0, width: 4, height: 1 },
            legend: { K: "#292431" },
            rows: ["..K"],
          },
        ],
        before,
        "Invalid grid",
      ),
    ).toThrow("exactly 4 characters");
    expect(revision(editor)).toBe(before);
    expect(editor.getSnapshot().canUndo).toBe(false);
  });

  it("rolls back the whole batch when a later operation is invalid", () => {
    const editor = fixture(),
      before = revision(editor);
    const document = editor.getSnapshot().document!,
      original = document.layer.pixels;
    expect(() =>
      editor.applyBatch(
        [
          fill(editor),
          { type: BatchEditKind.AddLayer, layerId: "details", name: "Details" },
          {
            type: BatchEditKind.FillRect,
            layerId: "details",
            frameIndex: 0,
            rect: { x: 3, y: 3, width: 2, height: 2 },
            color: "#FFFFFF",
          },
        ],
        before,
        "Invalid drawing",
      ),
    ).toThrow(BatchEditError);
    expect(revision(editor)).toBe(before);
    expect(document.timeline!.layers).toHaveLength(1);
    expect(document.layer.pixels).toBe(original);
    expect(original.data.every((byte) => byte === 0)).toBe(true);
    expect(editor.getSnapshot().canUndo).toBe(false);
  });

  it("does not create history for unchanged pixels", () => {
    const editor = fixture(),
      before = revision(editor);
    editor.applyBatch(
      [{ ...fill(editor), color: "#00000000" } as BatchEditOperation],
      before,
      "No change",
    );
    expect(revision(editor)).toBe(before);
    expect(editor.getSnapshot().canUndo).toBe(false);
  });

  it("rejects stale revisions and active drawing gestures", () => {
    const editor = fixture(),
      before = revision(editor);
    editor.applyBatch([fill(editor)], before, "First edit");
    expect(() => editor.applyBatch([fill(editor)], before, "Stale edit")).toThrow(
      "Document changed",
    );
    editor.pointerDown({ x: 0, y: 0 });
    expect(() => editor.applyBatch([fill(editor)], revision(editor), "Interrupt")).toThrow(
      "Finish the current edit",
    );
    editor.cancelGesture();
  });

  it("clips paint to the current selection without changing the selection", () => {
    const editor = fixture();
    // Select the single pixel (1,1) with the marquee: snapshots are read-only views, so writing
    // to one does not change the editor's selection.
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerMove({ x: 2, y: 2 });
    editor.pointerMove({ x: 1, y: 1 });
    editor.pointerUp({ x: 1, y: 1 });
    const selection = editor.getSnapshot().document!.selection!;
    expect([selection.x, selection.y, selection.width, selection.height]).toEqual([1, 1, 1, 1]);
    const result = editor.applyBatch([fill(editor)], revision(editor), "Selection fill");
    expect(result.changedRegions[0].rect).toEqual({ x: 1, y: 1, width: 1, height: 1 });
    expect(
      editor.canvas
        .composite()
        .data.filter((_, index) => index % 4 === 3 && editor.canvas.composite().data[index] !== 0),
    ).toHaveLength(1);
    expect(editor.getSnapshot().document!.selection).toBe(selection);
  });

  it("preserves linked cel identity and independent offsets through undo", () => {
    const editor = new RasterEditor();
    const pixels = { width: 1, height: 1, data: Uint8ClampedArray.of(10, 20, 30, 255) };
    editor.document.loadTimeline(
      {
        activeFrame: 0,
        activeLayer: 0,
        colorDepth: 32,
        layers: [{ id: "ink", name: "Ink", visible: true, locked: false, opacity: 255, flags: 3 }],
        frames: [1, 2].map((x) => ({
          duration: 100,
          cels: [{ pixels, x, y: 1, opacity: 255, zIndex: 0 }],
        })),
      },
      4,
      4,
      "Linked",
    );
    const original = editor.getSnapshot().document!.timeline!.frames[0].cels[0]!.pixels;
    const result = editor.applyBatch(
      [
        {
          type: BatchEditKind.Line,
          layerId: "ink",
          frameIndex: 0,
          start: { x: 0, y: 1 },
          end: { x: 3, y: 1 },
          color: "#FF0000",
        },
      ],
      revision(editor),
      "Linked drawing",
    );
    const timeline = editor.getSnapshot().document!.timeline!;
    expect(timeline.frames[0].cels[0]!.pixels).toBe(timeline.frames[1].cels[0]!.pixels);
    expect(timeline.frames[1].cels[0]!.x - timeline.frames[0].cels[0]!.x).toBe(1);
    expect(result.changedRegions.map((region) => region.frameIndex)).toContain(1);
    expect(Array.from(original.data)).toEqual([10, 20, 30, 255]);
    editor.history.undo();
    expect(editor.getSnapshot().document!.timeline!.frames[0].cels[0]!.pixels).toBe(original);
  });

  it("adds, updates and removes animation tags in one batch", () => {
    const editor = fixture();
    // grow to 4 frames so a 0..3 tag range is valid
    for (let i = 0; i < 3; i++)
      editor.applyBatch(
        [{ type: BatchEditKind.AddFrame, afterFrameIndex: i, duplicate: false }],
        revision(editor),
        "Add frame",
      );
    editor.applyBatch(
      [{ type: BatchEditKind.AddTag, name: "spin", from: 0, to: 3 }],
      revision(editor),
      "Tag",
    );
    let tags = timelineTags(editor.getSnapshot().document!.timeline!);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({
      name: "spin",
      from: 0,
      to: 3,
      direction: "forward",
      repeat: 0,
    });
    editor.applyBatch(
      [
        {
          type: BatchEditKind.UpdateTag,
          tagIndex: 0,
          name: "spin-alt",
          direction: "ping-pong",
          color: [255, 0, 77],
        },
      ],
      revision(editor),
      "Update tag",
    );
    tags = timelineTags(editor.getSnapshot().document!.timeline!);
    expect(tags[0]).toMatchObject({ name: "spin-alt", direction: "ping-pong" });
    expect(tags[0].color).toEqual([255, 0, 77, 255]);
    editor.applyBatch(
      [{ type: BatchEditKind.RemoveTag, tagIndex: 0 }],
      revision(editor),
      "Remove tag",
    );
    expect(timelineTags(editor.getSnapshot().document!.timeline!)).toHaveLength(0);
  });

  it("rejects an out-of-range tag without touching the timeline", () => {
    const editor = fixture(),
      before = revision(editor);
    expect(() =>
      editor.applyBatch(
        [{ type: BatchEditKind.AddTag, name: "bad", from: 0, to: 9 }],
        before,
        "Bad tag",
      ),
    ).toThrow(BatchEditError);
    expect(timelineTags(editor.getSnapshot().document!.timeline!)).toHaveLength(0);
    expect(revision(editor)).toBe(before);
  });

  it("clears pixels in a rect and clears the whole cel", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 4, height: 4 },
          color: "#FF0000",
        },
      ],
      revision(editor),
      "Fill",
    );
    const alpha = () => {
      const data = editor.canvas.composite().data,
        out: number[] = [];
      for (let i = 3; i < data.length; i += 4) out.push(data[i]);
      return out;
    };
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Clear,
          layerId,
          frameIndex: 0,
          rect: { x: 1, y: 1, width: 2, height: 2 },
        },
      ],
      revision(editor),
      "Clear rect",
    );
    expect(alpha()[0]).toBe(255);
    expect(alpha()[5]).toBe(0);
    expect(alpha()[10]).toBe(0);
    editor.applyBatch(
      [{ type: BatchEditKind.ClearCel, layerId, frameIndex: 0 }],
      revision(editor),
      "Clear cel",
    );
    expect(alpha().every((a) => a === 0)).toBe(true);
  });

  it("copies a cel to another frame", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#00FF00",
        },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 0, duplicate: false },
        { type: BatchEditKind.CopyCel, layerId, frameIndex: 0, toFrameIndex: 1 },
      ],
      revision(editor),
      "Copy cel",
    );
    const cel = editor.getSnapshot().document!.timeline!.frames[1].cels[0];
    expect(cel).not.toBeNull();
    expect(cel!.pixels.data[3]).toBe(255);
  });

  it("blits a source rect onto another layer", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#0000FF",
        },
        { type: BatchEditKind.AddLayer, layerId: "dest", name: "Dest" },
        {
          type: BatchEditKind.Blit,
          layerId: "dest",
          frameIndex: 0,
          src: { layerId, frameIndex: 0, rect: { x: 0, y: 0, width: 2, height: 2 } },
          dest: { x: 2, y: 2 },
        },
      ],
      revision(editor),
      "Blit",
    );
    const timeline = editor.getSnapshot().document!.timeline!;
    const dest = timeline.frames[0].cels[timeline.layers.findIndex((l) => l.id === "dest")];
    expect(dest!.pixels.data[(2 * dest!.pixels.width + 2) * 4 + 3]).toBe(255);
    expect(() =>
      editor.applyBatch(
        [
          {
            type: BatchEditKind.Blit,
            layerId: "dest",
            frameIndex: 0,
            src: {
              documentId: "other",
              layerId,
              frameIndex: 0,
              rect: { x: 0, y: 0, width: 1, height: 1 },
            },
            dest: { x: 0, y: 0 },
          },
        ],
        revision(editor),
        "Cross doc",
      ),
    ).toThrow("same document");
  });

  it("deletes, reorders and copies frames", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    for (let i = 0; i < 2; i++)
      editor.applyBatch(
        [{ type: BatchEditKind.AddFrame, afterFrameIndex: i, duplicate: false }],
        revision(editor),
        "Add",
      );
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFFFFF",
        },
        { type: BatchEditKind.CopyFrame, frameIndex: 0, to: [2] },
      ],
      revision(editor),
      "Copy frame",
    );
    expect(editor.getSnapshot().document!.timeline!.frames[2].cels[0]!.pixels.data[3]).toBe(255);
    editor.applyBatch(
      [{ type: BatchEditKind.ReorderFrame, frameIndex: 2, toIndex: 0 }],
      revision(editor),
      "Reorder",
    );
    expect(editor.getSnapshot().document!.timeline!.frames[0].cels[0]!.pixels.data[3]).toBe(255);
    editor.applyBatch(
      [{ type: BatchEditKind.DeleteFrame, frameIndex: 0 }],
      revision(editor),
      "Delete",
    );
    expect(editor.getSnapshot().document!.timeline!.frames).toHaveLength(2);
  });

  it("edits layers: set, duplicate, merge, group, ungroup, delete", () => {
    const editor = fixture(),
      base = editor.getSnapshot().document!.timeline!.layers[0].id;
    const result = editor.applyBatch(
      [
        { type: BatchEditKind.SetLayer, layerId: base, opacity: 128, name: "Ink" },
        { type: BatchEditKind.DuplicateLayer, layerId: base, name: "Copy" },
      ],
      revision(editor),
      "Layer edits",
    );
    let timeline = editor.getSnapshot().document!.timeline!;
    expect(timeline.layers[0]).toMatchObject({ name: "Ink", opacity: 128 });
    const copy = result.createdLayerIds[0];
    expect(timeline.layers[1].name).toBe("Copy");
    expect(() =>
      editor.applyBatch(
        [{ type: BatchEditKind.SetLayer, layerId: base, blendMode: "bogus" }],
        revision(editor),
        "Bad blend",
      ),
    ).toThrow("blendMode");
    const grouped = editor.applyBatch(
      [{ type: BatchEditKind.GroupLayer, layerIds: [base, copy], name: "Stack" }],
      revision(editor),
      "Group",
    );
    editor.applyBatch(
      [{ type: BatchEditKind.UngroupLayer, layerId: grouped.createdLayerIds[0] }],
      revision(editor),
      "Ungroup",
    );
    timeline = editor.getSnapshot().document!.timeline!;
    expect(timeline.layers.some((l) => l.kind === "group")).toBe(false);
    editor.applyBatch(
      [{ type: BatchEditKind.MergeLayer, layerId: copy }],
      revision(editor),
      "Merge down",
    );
    timeline = editor.getSnapshot().document!.timeline!;
    expect(timeline.layers).toHaveLength(1);
    editor.applyBatch(
      [
        { type: BatchEditKind.AddLayer, layerId: "scratch", name: "Scratch" },
        { type: BatchEditKind.DeleteLayer, layerId: "scratch" },
      ],
      revision(editor),
      "Delete",
    );
    expect(editor.getSnapshot().document!.timeline!.layers).toHaveLength(1);
  });

  it("moves and re-alpha cels with setCel", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFFFFF",
        },
        {
          type: BatchEditKind.SetCel,
          layerId,
          frameIndex: 0,
          position: { x: 1, y: 1 },
          opacity: 64,
        },
      ],
      revision(editor),
      "Set cel",
    );
    const cel = editor.getSnapshot().document!.timeline!.frames[0].cels[0]!;
    expect([cel.x, cel.y, cel.opacity]).toEqual([1, 1, 64]);
  });

  it("resizes canvas and crops to content", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        { type: BatchEditKind.ResizeCanvas, width: 8, height: 8, anchor: "topLeft" },
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 2, y: 2, width: 3, height: 3 },
          color: "#FF00FF",
        },
      ],
      revision(editor),
      "Resize",
    );
    expect(editor.getSnapshot().document!.width).toBe(8);
    editor.applyBatch([{ type: BatchEditKind.CropToContent, layerId }], revision(editor), "Crop");
    const doc = editor.getSnapshot().document!;
    expect([doc.width, doc.height]).toEqual([3, 3]);
  });

  it("changes the selection with the select op", () => {
    const editor = fixture();
    editor.applyBatch(
      [{ type: BatchEditKind.Select, op: "rect", rect: { x: 1, y: 1, width: 2, height: 2 } }],
      revision(editor),
      "Select",
    );
    let selection = editor.getSnapshot().document!.selection!;
    expect([selection.x, selection.y, selection.width, selection.height]).toEqual([1, 1, 2, 2]);
    editor.applyBatch([{ type: BatchEditKind.Select, op: "none" }], revision(editor), "Deselect");
    expect(editor.getSnapshot().document!.selection).toBeNull();
  });

  it("replaces colors, adjusts hsl, outlines and flips pixels", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 1, y: 1, width: 2, height: 2 },
          color: "#FF0000",
        },
        {
          type: BatchEditKind.ReplaceColor,
          layerId,
          frameIndex: 0,
          from: "#FF0000",
          to: "#0000FF",
        },
      ],
      revision(editor),
      "Replace",
    );
    const at = (x: number, y: number) => {
      const data = editor.canvas.composite().data,
        i = (y * 4 + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    expect(at(1, 1)).toEqual([0, 0, 255, 255]);
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Outline,
          layerId,
          frameIndex: 0,
          color: "#000000",
          position: "outside",
        },
      ],
      revision(editor),
      "Outline",
    );
    expect(at(0, 1)).toEqual([0, 0, 0, 255]);
    // (3,1) is the black outline corner after flipping the 4×2 region horizontally.
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Flip,
          layerId,
          frameIndex: 0,
          direction: "horizontal",
          rect: { x: 0, y: 1, width: 4, height: 2 },
        },
      ],
      revision(editor),
      "Flip",
    );
    expect(at(3, 1)).toEqual([0, 0, 0, 255]);
    editor.applyBatch(
      [
        {
          type: BatchEditKind.AdjustHsl,
          layerId,
          frameIndex: 0,
          lightness: -50,
        },
      ],
      revision(editor),
      "HSL",
    );
    expect(at(3, 1)[2]).toBeLessThan(255);
  });

  it("paints gradients, dithers, rotates and translates", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Gradient,
          layerId,
          frameIndex: 0,
          from: "#000000",
          to: "#FFFFFF",
          direction: "horizontal",
        },
      ],
      revision(editor),
      "Gradient",
    );
    const at = (x: number, y: number) => {
      const data = editor.canvas.composite().data,
        i = (y * 4 + x) * 4;
      return data[i];
    };
    expect(at(0, 0)).toBe(0);
    expect(at(3, 0)).toBe(255);
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Dither,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          colorA: "#FF0000",
          colorB: "#0000FF",
          pattern: "checker",
        },
      ],
      revision(editor),
      "Dither",
    );
    expect(at(0, 0)).toBe(255);
    expect(at(1, 0)).toBe(0);
    editor.applyBatch(
      [
        {
          type: BatchEditKind.Rotate90,
          layerId,
          frameIndex: 0,
          angle: 90,
          rect: { x: 0, y: 0, width: 2, height: 2 },
        },
        {
          type: BatchEditKind.Translate,
          layerId,
          frameIndex: 0,
          dx: 1,
          dy: 0,
        },
      ],
      revision(editor),
      "Transform",
    );
    expect(editor.canvas.composite().data.length).toBe(64);
  });

  it("interpolates cel position and opacity with tweenCels", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    for (let i = 0; i < 4; i++)
      editor.applyBatch(
        [{ type: BatchEditKind.AddFrame, afterFrameIndex: i, duplicate: false }],
        revision(editor),
        "Add",
      );
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFFFFF",
        },
        {
          type: BatchEditKind.TweenCels,
          layerId,
          fromFrame: 0,
          toFrame: 4,
          property: "position",
          from: { x: 0, y: 0 },
          to: { x: 4, y: 0 },
        },
      ],
      revision(editor),
      "Tween",
    );
    const frames = editor.getSnapshot().document!.timeline!.frames;
    expect(frames[1].cels[0]!.x).toBe(1);
    expect(frames[2].cels[0]!.x).toBe(2);
    expect(frames[3].cels[0]!.x).toBe(3);
    expect(() =>
      editor.applyBatch(
        [
          {
            type: BatchEditKind.TweenCels,
            layerId,
            fromFrame: 0,
            toFrame: 4,
            property: "scale",
            from: 1,
            to: 2,
          },
        ],
        revision(editor),
        "Scale tween",
      ),
    ).toThrow("scale");
  });
  it("converts an image layer to a tilemap, paints pixels and stamps tiles", () => {
    const editor = fixture(),
      layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#00FF00",
        },
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 0,
          rect: { x: 2, y: 2, width: 2, height: 2 },
          color: "#FF0000",
        },
      ],
      revision(editor),
      "Tiles source",
    );
    editor.applyBatch(
      [{ type: BatchEditKind.ConvertToTilemap, layerId, tileWidth: 2, tileHeight: 2 }],
      revision(editor),
      "Convert to tilemap",
    );
    let layer = editor.getSnapshot().document!.timeline!.layers[0];
    expect(layer.kind).toBe("tilemap");
    const set = editor
      .getSnapshot()
      .document!.timeline!.tilesets!.find((s) => s.id === layer.tilesetId)!;
    // Empty + the two painted tiles; identical cells deduplicated.
    expect(set.tileCount).toBe(3);
    // Stamp tile 1 into every cell.
    editor.applyBatch(
      [
        {
          type: BatchEditKind.StampTiles,
          layerId,
          frameIndex: 0,
          cells: [
            { x: 0, y: 0, tile: 1 },
            { x: 1, y: 0, tile: 1 },
            { x: 0, y: 1, tile: 1 },
            { x: 1, y: 1, tile: 1 },
          ],
        },
      ],
      revision(editor),
      "Stamp",
    );
    const composite = editor.canvas.composite().data;
    expect(Array.from(composite.slice(0, 4))).toEqual([0, 255, 0, 255]);
    expect(() =>
      editor.applyBatch(
        [
          {
            type: BatchEditKind.StampTiles,
            layerId,
            frameIndex: 0,
            cells: [{ x: 0, y: 0, tile: 99 }],
          },
        ],
        revision(editor),
        "Bad tile",
      ),
    ).toThrow("outside the tileset");
    // Painting a brand-new tile grows the set.
    editor.applyBatch(
      [
        {
          type: BatchEditKind.PaintTiles,
          layerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          rgba: [0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255],
        },
      ],
      revision(editor),
      "Paint tiles",
    );
    const grown = editor
      .getSnapshot()
      .document!.timeline!.tilesets!.find((s) => s.id === layer.tilesetId)!;
    expect(grown.tileCount).toBe(4);
    expect(Array.from(editor.canvas.composite().data.slice(0, 4))).toEqual([0, 0, 255, 255]);
  });
});
