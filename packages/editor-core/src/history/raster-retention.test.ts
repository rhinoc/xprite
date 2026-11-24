import { describe, expect, it, vi } from "vitest";

import { ensureTimeline, syncTimeline, trimActiveCel } from "$/document/document";
import { expandActiveLayer } from "$/document/layer-expansion";
import type { EditorDocument } from "$/document/types";
import { RasterEditor } from "$/editor/RasterEditor";
import { EditorHistory } from "$/history/history";

function fixture(maxBytes = 0) {
  const pixels = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255) };
  const doc: EditorDocument = {
    name: "Ink",
    width: 128,
    height: 128,
    selection: null,
    layer: { name: "Ink", x: 16, y: 16, pixels, visible: true, locked: false, emptyCel: false },
  };
  const timeline = ensureTimeline(doc);
  timeline.frames.push({
    ...timeline.frames[0],
    cels: [{ ...timeline.frames[0].cels[0]!, x: 20 }],
  });
  return { doc, pixels, history: new EditorHistory(maxBytes) };
}

function prepare(doc: EditorDocument, history: EditorHistory, value: number) {
  history.begin(doc, "Pencil");
  expandActiveLayer(doc);
  doc.layer.pixels.data[(20 * doc.layer.pixels.width + 20) * 4] = value;
  trimActiveCel(doc);
  syncTimeline(doc);
}

describe("raster replacement history retention", () => {
  it("reuses the tight cel across real drawing commits while keeping committed snapshots isolated", () => {
    const image = { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) };
    for (let y = 16; y < 80; y++)
      for (let x = 16; x < 80; x++) image.data.set([255, 255, 255, 255], (y * 128 + x) * 4);
    const editor = new RasterEditor(image, "Ink.aseprite");
    const stroke = (value: number) => {
      editor.drawing.settings.setSettings({
        tool: "pencil",
        foreground: [value, 0, 0, 255],
        pixelPerfect: false,
      });
      editor.pointerDown({ x: 20, y: 20 });
      editor.pointerUp();
    };
    stroke(1);
    const tight = editor.getSnapshot().document!.layer.pixels;
    const committed = editor.getCommittedPersistenceSnapshot()!;
    expect(tight.width).toBe(64);
    for (let i = 2; i <= 5; i++) {
      stroke(i);
      expect(editor.getSnapshot().document!.layer.pixels).toBe(tight);
    }
    expect(committed.document.layer.pixels.data[(4 * 64 + 4) * 4]).toBe(1);
    expect(
      editor.getCommittedPersistenceSnapshot()!.document.layer.pixels.data[(4 * 64 + 4) * 4],
    ).toBe(5);
    editor.history.undo();
    expect(
      editor.getCommittedPersistenceSnapshot()!.document.layer.pixels.data[(4 * 64 + 4) * 4],
    ).toBe(4);
    editor.history.redo();
    expect(
      editor.getCommittedPersistenceSnapshot()!.document.layer.pixels.data[(4 * 64 + 4) * 4],
    ).toBe(5);
  });

  it("retains tile deltas rather than one whole cel per expanded/trimmed stroke", () => {
    const { doc, pixels, history } = fixture(128 * 1024);
    for (let i = 1; i <= 20; i++) {
      prepare(doc, history, i);
      expect(history.commit(doc)).toBe(true);
      expect(doc.layer.pixels).toBe(pixels);
      expect(doc.timeline!.frames[1].cels[0]!.pixels).toBe(pixels);
      expect(doc.timeline!.frames[1].cels[0]!.x).toBe(20);
    }
    // 20 full 16KiB cels would exceed this budget and evict earlier edits.
    expect(history.getStates()).toHaveLength(20);
    for (let i = 19; i >= 0; i--) {
      expect(history.undo(doc)).toBe(true);
      expect(doc.layer.pixels.data[(4 * 64 + 4) * 4]).toBe(i || 255);
    }
    expect(history.dirty).toBe(false);
    for (let i = 1; i <= 20; i++) {
      expect(history.redo(doc)).toBe(true);
      expect(doc.layer.pixels.data[(4 * 64 + 4) * 4]).toBe(i);
    }
  });

  it("preserves no-op replacement transaction semantics without retaining another raster", () => {
    const { doc, pixels, history } = fixture();
    prepare(doc, history, 255);
    expect(history.commit(doc)).toBe(true);
    expect(doc.layer.pixels).toBe(pixels);
    expect(history.canUndo).toBe(true);
  });

  it.each(["geometry", "metadata", "samples", "unlinked"])(
    "keeps %s changes structural",
    (kind) => {
      const { doc, pixels, history } = fixture();
      prepare(doc, history, 10);
      if (kind === "geometry") doc.layer.x++;
      if (kind === "metadata") doc.layer.celOpacity = 120;
      if (kind === "samples")
        doc.timeline!.frames[0].cels[0]!.asepriteSamples = {
          depth: 8,
          width: 64,
          height: 64,
          data: new Uint8Array(64 * 64),
        };
      if (kind === "unlinked") doc.timeline!.frames[1].cels[0]!.pixels = pixels;
      history.commit(doc);
      expect(doc.layer.pixels).not.toBe(pixels);
      expect(pixels.data[(4 * 64 + 4) * 4]).toBe(255);
      expect(history.undo(doc)).toBe(true);
      expect(doc.layer.pixels).toBe(pixels);
      expect(history.redo(doc)).toBe(true);
      expect(doc.layer.pixels.data[(4 * 64 + 4) * 4]).toBe(10);
    },
  );

  it("leaves original pixels untouched when undo patch allocation fails midway", () => {
    const { doc, pixels, history } = fixture();
    prepare(doc, history, 10);
    doc.layer.pixels.data[(40 * 64 + 40) * 4] = 20;
    const Native = Uint8ClampedArray;
    let patches = 0;
    vi.stubGlobal(
      "Uint8ClampedArray",
      new Proxy(Native, {
        construct(target, args) {
          if (args[0] === 32 * 32 * 4 && ++patches === 2)
            throw new RangeError("Array buffer allocation failed");
          return Reflect.construct(target, args);
        },
      }),
    );
    try {
      expect(() => history.commit(doc)).toThrow("Array buffer allocation failed");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(pixels.data.every((value) => value === 255)).toBe(true);
    history.cancel(doc);
    expect(doc.layer.pixels).toBe(pixels);
    expect(history.canUndo).toBe(false);
  });
});
