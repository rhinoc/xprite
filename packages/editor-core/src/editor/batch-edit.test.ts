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
});
