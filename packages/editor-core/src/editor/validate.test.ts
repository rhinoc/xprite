import { describe, expect, it } from "vitest";

import { BatchEditKind } from "$/editor/batch-edit-types";
import { RasterEditor } from "$/editor/RasterEditor";
import { AnimationIntent, ValidationCategory, validateDocument } from "$/editor/validate";

describe("technical document validation", () => {
  it("reports isolated particles as visual-review warnings, not certain errors", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (const index of [0, 3, 12, 15]) pixels.set([255, 255, 255, 255], index * 4);
    const editor = new RasterEditor({ width: 4, height: 4, data: pixels }, "Particles");
    const result = validateDocument(editor.getSnapshot().document!, { checks: ["strays"] });
    expect(result.passed).toBe(true);
    expect(result.findings[0]).toMatchObject({
      category: ValidationCategory.VisualReview,
      severity: "warning",
      count: 4,
    });
  });
  it("only suggests expressive timing when explicitly reviewing a character", () => {
    const editor = new RasterEditor(
      { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      "Rain",
    );
    editor.applyBatch(
      [
        { type: BatchEditKind.AddFrame, afterFrameIndex: 0, duration: 100 },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 1, duration: 100 },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 2, duration: 100 },
        { type: BatchEditKind.SetFrameDuration, durations: [100, 100, 100, 100] },
        { type: BatchEditKind.AddTag, name: "Rain", from: 0, to: 3 },
      ],
      editor.getContentRevision(),
      "Rain loop",
    );
    const doc = editor.getSnapshot().document!;
    for (const animationIntent of [
      AnimationIntent.Unspecified,
      AnimationIntent.Ambient,
      AnimationIntent.Mechanical,
    ]) {
      const result = validateDocument(doc, { checks: ["animation"], animationIntent });
      expect(result.findings).toEqual([]);
      expect(result.visualReviewRequired).toBe(true);
      expect(result).not.toHaveProperty("score");
    }
    const character = validateDocument(doc, {
      checks: ["animation"],
      animationIntent: AnimationIntent.Character,
    });
    expect(character.counts).toEqual({ errors: 0, warnings: 0, notes: 1 });
    expect(character.summary).toContain("Visual review is still required");
  });

  it("reports warnings even when non-strict validation passes", () => {
    const editor = new RasterEditor(
      { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      "Empty",
    );
    const doc = editor.getSnapshot().document!;
    const result = validateDocument(doc, { checks: ["export_readiness"] });
    expect(result.passed).toBe(true);
    expect(result.counts.warnings).toBe(1);
    expect(result.summary).toContain("1 warning(s)");
    expect(validateDocument(doc, { checks: ["export_readiness"], strict: true }).passed).toBe(
      false,
    );
  });

  it("deduplicates findings from cels linked across multiple frames", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels.set([255, 255, 255, 255], 0);
    const editor = new RasterEditor({ width: 4, height: 4, data: pixels }, "Backdrop");
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        { type: BatchEditKind.AddFrame, afterFrameIndex: 0, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 1, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 2, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 3, duplicate: false },
        { type: BatchEditKind.LinkCels, layerId, frameIndices: [0, 1, 2, 3, 4] },
      ],
      editor.getContentRevision(),
      "Link static backdrop across 5 frames",
    );

    const result = validateDocument(editor.getSnapshot().document!, { checks: ["strays"] });
    expect(result.counts).toEqual({ errors: 0, warnings: 1, notes: 0 });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      check: "strays",
      layerId,
      frameIndex: 0,
      frameIndices: [0, 1, 2, 3, 4],
      count: 1,
    });
    expect(result.findings[0].message).toContain("frames 0–4 (5 linked)");
  });

  it("reports non-contiguous linked cel spans separately from unlinked dynamic frames", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels.set([255, 0, 0, 255], 0);
    const editor = new RasterEditor({ width: 4, height: 4, data: pixels }, "Mixed");
    const layerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        { type: BatchEditKind.AddFrame, afterFrameIndex: 0, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 1, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 2, duplicate: false },
        { type: BatchEditKind.AddFrame, afterFrameIndex: 3, duplicate: false },
        { type: BatchEditKind.LinkCels, layerId, frameIndices: [0, 1, 3, 4] },
        {
          type: BatchEditKind.FillRect,
          layerId,
          frameIndex: 2,
          rect: { x: 3, y: 3, width: 1, height: 1 },
          color: "#00FF00",
        },
      ],
      editor.getContentRevision(),
      "Link frames 0,1,3,4 and paint unique frame 2",
    );

    const result = validateDocument(editor.getSnapshot().document!, { checks: ["strays"] });
    expect(result.counts.warnings).toBe(2);
    expect(result.findings[0]).toMatchObject({
      frameIndex: 0,
      frameIndices: [0, 1, 3, 4],
    });
    expect(result.findings[0].message).toContain("frames 0–1, 3–4 (4 linked)");
    expect(result.findings[1]).toMatchObject({
      frameIndex: 2,
    });
    expect(result.findings[1].frameIndices).toBeUndefined();
    expect(result.findings[1].message).toContain("frame 2.");
  });
});
