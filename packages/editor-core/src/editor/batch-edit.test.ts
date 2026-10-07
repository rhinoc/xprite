import { describe, expect, it } from "vitest";

import { BatchEditError, BatchEditKind, type BatchEditOperation } from "$/editor/batch-edit-types";
import { RasterEditor } from "$/editor/RasterEditor";

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
    const selection = { x: 1, y: 1, width: 1, height: 1, data: Uint8Array.of(1) };
    editor.getSnapshot().document!.selection = selection;
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
});
