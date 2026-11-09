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
});
