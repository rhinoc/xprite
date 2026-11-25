import { describe, expect, it } from "vitest";

import type { PixelBuffer, Rgba } from "$/base/primitives";
import { BatchEditKind } from "$/editor/batch-edit-types";
import { RasterEditor } from "$/editor/RasterEditor";
import { cleanupEffectAvailability, EffectKind, EffectTarget } from "$/image-editing/effects";
import { cleanPixels, hasSemiTransparentPixels } from "$/image-editing/pixel-cleanup";

const colors = {
  ".": [0, 0, 0, 0],
  R: [255, 0, 0, 255],
  G: [0, 255, 0, 255],
  B: [0, 0, 255, 255],
  r: [248, 12, 8, 255],
  s: [30, 20, 10, 127],
  S: [0, 255, 0, 128],
  T: [5, 10, 15, 0],
} as const satisfies Record<string, Rgba>;

function image(...rows: string[]): PixelBuffer {
  return {
    width: rows[0].length,
    height: rows.length,
    data: Uint8ClampedArray.from(
      rows.flatMap((row) => Array.from(row).flatMap((key) => colors[key as keyof typeof colors])),
    ),
  };
}

const removeOrphans = { removeOrphans: true };
const cleanDoubles = { cleanDoubles: true };
const crispAlpha = { crispAlpha: true };
const snapToPalette = { snapToPalette: true };
const palette = [colors.R, colors.G, colors.B];

describe("pixel cleanup passes", () => {
  it("clears isolated opaque pixels, including diagonal-only contacts, without repainting their neighbors", () => {
    const source = image("R..GG", ".B...", "...Rs");
    const original = source.data.slice();
    expect(cleanPixels(source, removeOrphans)).toEqual(image("...GG", ".....", "...Rs"));
    expect(source.data).toEqual(original);
  });

  it("replaces only isolated interior colors with an existing, strictly dominant color", () => {
    const source = image("RRR.RRG.RRB", "RBR.RBG.RBR", "RGR.RGG.RRR");
    const cleaned = cleanPixels(source, removeOrphans);
    expect(cleaned).toEqual(image("RRR.RRG.RRB", "RRR.RBG.RBR", "RGR.RGG.RRR"));
    const originalColors = new Set([colors.R.join(), colors.G.join(), colors.B.join()]);
    for (let at = 0; at < cleaned.data.length; at += 4)
      if (cleaned.data[at + 3])
        expect(originalColors.has(cleaned.data.slice(at, at + 4).join())).toBe(true);
  });

  it("keeps a unique highlight on an exposed edge and leaves background opacity intact", () => {
    const exposed = image("RBR", "RRR", "...");
    expect(cleanPixels(exposed, removeOrphans)).toBe(exposed);
    const dot = image("R");
    expect(cleanPixels(dot, removeOrphans, { background: true })).toBe(dot);
  });

  it("thins the four elbows of a one-pixel outline", () => {
    const source = image(".RRRRR.", ".R...R.", ".R...R.", ".RRRRR.");
    expect(cleanPixels(source, cleanDoubles)).toEqual(
      image("..RRR..", ".R...R.", ".R...R.", "..RRR.."),
    );
  });

  it("keeps the diagonal path connected when consecutive staircase pixels are both candidates", () => {
    const source = image("RR...", ".RR..", "..RR.", "...RR");
    expect(cleanPixels(source, cleanDoubles)).toEqual(image("R....", ".R...", "..R..", "...RR"));
  });

  it("preserves solid blocks, thick outlines, mixed-color elbows, and diagonal branches", () => {
    const unchanged = [
      image("RRR", "RRR", "RRR"),
      image("RRRRRR", "RRRRRR", "RR..RR", "RR..RR", "RRRRRR", "RRRRRR"),
      image("RG", "R."),
      image("..R", "RR.", ".R."),
    ];
    for (const source of unchanged) expect(cleanPixels(source, cleanDoubles)).toBe(source);
  });

  it("reads neighbors outside a sparse selection but changes only selected pixels within the rectangle", () => {
    const source = image("RRR...sS", "R.R.....", "RRR.....");
    const selection = {
      x: 0,
      y: 0,
      width: 8,
      height: 1,
      data: Uint8Array.of(1, 0, 0, 0, 0, 0, 0, 1),
    };
    const bounds = { x: 0, y: 0, width: 7, height: 3 };
    expect(cleanPixels(source, { ...cleanDoubles, ...crispAlpha }, { selection, bounds })).toEqual(
      image(".RR...sS", "R.R.....", "RRR....."),
    );
    const selectedLine = { x: 1, y: 0, width: 1, height: 1, data: Uint8Array.of(1) };
    expect(cleanPixels(source, removeOrphans, { selection: selectedLine })).toBe(source);
  });

  it("snaps to the nearest opaque swatch while preserving transparency and partial alpha", () => {
    const source = image("rsST");
    expect(cleanPixels(source, snapToPalette, { palette: [...palette, colors.s] })).toEqual(
      image("RsST"),
    );
    const nearRed = {
      width: 1,
      height: 1,
      data: Uint8ClampedArray.of(248, 12, 8, 190),
    };
    expect(cleanPixels(nearRed, snapToPalette, { palette }).data).toEqual(
      Uint8ClampedArray.of(255, 0, 0, 190),
    );
    expect(cleanPixels(source, snapToPalette, { palette: [colors.s] })).toBe(source);
  });

  it("thresholds at 128, clears the dropped RGB, and detects partial alpha within scope", () => {
    const source = image("TsSR");
    expect(cleanPixels(source, crispAlpha)).toEqual(image("T.GR"));
    expect(hasSemiTransparentPixels(source)).toBe(true);
    expect(hasSemiTransparentPixels(image("T.GR"))).toBe(false);
    expect(hasSemiTransparentPixels(source, { bounds: { x: 3, y: 0, width: 1, height: 1 } })).toBe(
      false,
    );
    expect(
      hasSemiTransparentPixels(source, {
        selection: { x: 0, y: 0, width: 4, height: 1, data: Uint8Array.of(1, 0, 0, 1) },
      }),
    ).toBe(false);
  });

  it("composes alpha, orphan removal, outline cleanup, and palette snapping in order", () => {
    const source = image("G..........", "..RRR......", "..R.R...rrS", "..RRR......", "s..........");
    expect(
      cleanPixels(
        source,
        { ...removeOrphans, ...cleanDoubles, ...snapToPalette, ...crispAlpha },
        { palette },
      ),
    ).toEqual(image("...........", "...R.......", "..R.R...RRG", "...R.......", "..........."));
  });
});

describe("Clean Pixels document transactions", () => {
  const spec = { kind: EffectKind.CleanPixels, options: crispAlpha } as const;
  const layer = { id: "ink", name: "Ink", visible: true, locked: false, opacity: 255, flags: 3 };
  const cel = (pixels: PixelBuffer, x = 0) => ({ pixels, x, y: 0, opacity: 255, zIndex: 0 });

  it("isolates live previews and cancellation, with one undo and redo for the accepted effect", () => {
    const editor = new RasterEditor(image("sSR"));
    const before = editor.canvas.composite().data.slice();
    const revision = editor.getContentRevision();
    const persistence = editor.getSnapshot().persistenceRevision;
    expect(editor.imageEditing.beginEffect()).toBe(true);
    editor.imageEditing.previewEffect(spec);
    expect(editor.canvas.previewComposite()).toEqual(image(".GR"));
    expect(editor.canvas.composite().data).toEqual(before);
    expect(editor.getContentRevision()).toBe(revision);
    expect(editor.getSnapshot().persistenceRevision).toBe(persistence);
    expect(editor.getSnapshot().canUndo).toBe(false);
    editor.imageEditing.previewEffect(null);
    expect(editor.canvas.previewComposite().data).toEqual(before);
    editor.imageEditing.applyEffect(spec);
    expect(editor.canvas.composite()).toEqual(image(".GR"));
    editor.history.undo();
    expect(editor.canvas.composite().data).toEqual(before);
    expect(editor.getSnapshot().canUndo).toBe(false);
    editor.history.redo();
    expect(editor.canvas.composite()).toEqual(image(".GR"));
  });

  it("checks the selected or all cels for partial alpha and previews the selected target scope", () => {
    const editor = new RasterEditor();
    const other = { ...layer, id: "paint" };
    const locked = { ...layer, id: "locked", locked: true };
    editor.document.loadTimeline(
      {
        activeLayer: 0,
        activeFrame: 0,
        layers: [layer, other, locked],
        frames: [
          { duration: 100, cels: [cel(image("R")), cel(image("S"), 1), cel(image("s"), 2)] },
          { duration: 100, cels: [cel(image("S")), null, null] },
        ],
      },
      3,
      1,
      "Cleanup scope",
    );
    const original = editor.getSnapshot().document!;
    expect(cleanupEffectAvailability(original, EffectTarget.Selected).crispAlpha).toBe(false);
    expect(cleanupEffectAvailability(original, EffectTarget.All).crispAlpha).toBe(true);
    editor.imageEditing.previewEffect(spec, EffectTarget.All);
    const preview = editor.imageEditing.getEffectPreview()!;
    expect(preview.timeline!.frames[0].cels[1]!.pixels).toEqual(image("G"));
    expect(preview.timeline!.frames[0].cels[2]!.pixels).toEqual(image("s"));
    expect(preview.timeline!.frames[1].cels[0]!.pixels).toEqual(image("S"));
    editor.imageEditing.previewEffect(null);
    expect(editor.getSnapshot().document!.timeline!.frames[0].cels[1]!.pixels).toEqual(image("S"));
    editor.imageEditing.applyEffect(spec, EffectTarget.All);
    expect(editor.getSnapshot().document!.timeline!.frames[0].cels[1]!.pixels).toEqual(image("G"));
    expect(editor.getSnapshot().document!.timeline!.frames[1].cels[0]!.pixels).toEqual(image("G"));
  });

  it("uses each frame palette for unlinked RGB cels", () => {
    const editor = new RasterEditor();
    editor.document.loadTimeline(
      {
        activeLayer: 0,
        activeFrame: 0,
        layers: [layer],
        frames: [[colors.R], [colors.B]].map((palette) => ({
          duration: 100,
          cels: [cel(image("r"))],
          palette,
        })),
      },
      1,
      1,
      "Frame palettes",
    );
    editor.imageEditing.applyEffect(
      { kind: EffectKind.CleanPixels, options: snapToPalette },
      EffectTarget.All,
    );
    expect(
      editor.getSnapshot().document!.timeline!.frames.map((frame) => frame.cels[0]!.pixels),
    ).toEqual([image("R"), image("B")]);
  });

  it("preserves hidden RGB outside the selected pixels when a cel is trimmed", () => {
    const editor = new RasterEditor(image("TsSR"));
    const rect = { x: 1, y: 0, width: 2, height: 1 };
    editor.applyBatch(
      [{ type: BatchEditKind.Select, op: "rect", rect }],
      editor.getContentRevision(),
      "Select fringe",
    );
    const selection = editor.getSnapshot().document!.selection;
    editor.imageEditing.applyEffect(spec);
    const doc = editor.getSnapshot().document!;
    expect(doc.timeline!.frames[0].cels[0]!.pixels).toEqual(image("T.GR"));
    expect(doc.selection).toBe(selection);
  });

  it("preserves untouched duplicate indexed samples while binarizing representable partial alpha", () => {
    const editor = new RasterEditor();
    const source = image("RsSG");
    const palette = [colors.R, colors.R, colors.s, colors.S, colors.G];
    editor.document.loadTimeline(
      {
        activeLayer: 0,
        activeFrame: 0,
        colorDepth: 8,
        transparentIndex: 0,
        layers: [layer],
        frames: [
          {
            duration: 100,
            palette,
            cels: [
              {
                ...cel(source),
                asepriteSamples: {
                  depth: 8,
                  width: source.width,
                  height: source.height,
                  data: Uint8Array.of(1, 2, 3, 4),
                },
              },
            ],
          },
        ],
      },
      4,
      1,
      "Indexed cleanup",
      palette,
    );
    editor.imageEditing.applyEffect(spec);
    const result = editor.getSnapshot().document!.timeline!.frames[0].cels[0]!;
    expect(result.pixels).toEqual(image("R.GG"));
    expect(result.asepriteSamples?.data).toEqual(Uint8Array.of(1, 0, 4, 4));
    editor.history.undo();
    expect(
      editor.getSnapshot().document!.timeline!.frames[0].cels[0]!.asepriteSamples?.data,
    ).toEqual(Uint8Array.of(1, 2, 3, 4));
  });

  it("runs agent cleanup in order with earlier edits and clips to the intersection of rect and selection", () => {
    const editor = new RasterEditor(image("RRRsS", "RBRsS", "RRRsS"));
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    const rect = { x: 1, y: 1, width: 4, height: 1 };
    const before = editor.canvas.composite().data.slice();
    const cleanup = {
      type: BatchEditKind.CleanPixels,
      frameIndex: 0,
      layerId,
      options: { ...removeOrphans, ...crispAlpha },
      rect: { x: 0, y: 0, width: 4, height: 3 },
    } as const;
    const revision = editor.getContentRevision();
    expect(() =>
      editor.applyBatch([{ ...cleanup, options: {} }], revision, "Invalid cleanup"),
    ).toThrow("operations[0]");
    expect(editor.getContentRevision()).toBe(revision);
    const result = editor.applyBatch(
      [{ type: BatchEditKind.Select, op: "rect", rect }, cleanup],
      revision,
      "Clean selected pixels",
    );
    expect(result.changedRegions).toEqual([
      { layerId, frameIndex: 0, rect: { ...rect, width: 3 } },
    ]);
    expect(editor.canvas.composite()).toEqual(image("RRRsS", "RRR.S", "RRRsS"));
    editor.history.undo();
    expect(editor.canvas.composite().data).toEqual(before);
    expect(editor.getSnapshot().canUndo).toBe(false);
  });
});
