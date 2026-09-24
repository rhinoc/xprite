import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("inline-text", () => {
  it("inline-text behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/drawing/text/inline-text.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { inlineTextBox, createInlineText, updateInlineText, moveInlineText, inlineTextCaretAt } =
      await import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    const font = {
      height: 2,
      lineHeight: 3,
      glyphs: {
        A: { width: 2, height: 2, advance: 3, alpha: new Uint8Array([255, 0, 0, 255]) },
        " ": { width: 1, height: 2, advance: 2, alpha: new Uint8Array(2) },
      },
    };
    assert.deepEqual(inlineTextBox({ x: 8, y: 5 }, { x: 8, y: 5 }, 2, 1, 32), {
      x: 8,
      y: 5,
      width: 8,
      height: 2,
    });
    assert.deepEqual(inlineTextBox({ x: 8, y: 5 }, { x: 3, y: 1 }, 2, 1, 32), {
      x: 3,
      y: 1,
      width: 6,
      height: 5,
    });
    assert.deepEqual(inlineTextBox({ x: 0, y: 0 }, { x: 1, y: 30 }, 2, 2, 5), {
      x: 0,
      y: 0,
      width: 5,
      height: 4,
    });
    const initial = createInlineText(
      { x: 1, y: 2, width: 4, height: 2 },
      font,
      1,
      [20, 40, 60, 255],
    );
    assert.equal(initial.text, "");
    assert.ok(initial.pixels.data.every((v) => v === 0));
    const typed = updateInlineText(initial, font, {
      text: "AAA",
      selectionStart: 3,
      selectionEnd: 3,
    });
    assert.equal(initial.text, "");
    assert.equal(typed.bounds.width, 8);
    assert.equal(typed.bounds.height, 2);
    assert.deepEqual(typed.advances, [0, 3, 6, 9]);
    assert.equal(typed.pixels.data[3], 255);
    assert.equal(typed.pixels.data[7], 0);
    const short = updateInlineText(typed, font, {
      text: "A",
      selectionStart: 20,
      selectionEnd: 20,
    });
    assert.equal(short.bounds.width, 8);
    assert.equal(short.selectionStart, 1);
    const selected = updateInlineText(typed, font, { selectionStart: 0, selectionEnd: 2 });
    assert.equal(selected.pixels, typed.pixels);
    assert.equal(selected.advances, typed.advances);
    assert.equal(inlineTextCaretAt(typed, -3), 0);
    assert.equal(inlineTextCaretAt(typed, 1), 0);
    assert.equal(inlineTextCaretAt(typed, 2), 1);
    assert.equal(inlineTextCaretAt(typed, 100), 3);
    const moved = moveInlineText(typed, { x: -3.7, y: 9.8 });
    assert.equal(moved.bounds.x, -4);
    assert.equal(moved.bounds.y, 9);
    assert.equal(moved.pixels, typed.pixels);
    const scaled = updateInlineText(typed, font, { scale: 2 });
    assert.equal(scaled.pixels.height, 4);
    assert.equal(scaled.pixels.width, 16);
    assert.deepEqual(scaled.advances, [0, 6, 12, 18]);
    const line = updateInlineText(initial, font, { text: "A\nA\rA" });
    assert.equal(line.text, "AAA");
    assert.throws(() => updateInlineText(typed, font, { text: "?" }), /U\+003F/);
    assert.equal(typed.text, "AAA");
    assert.throws(
      () => updateInlineText(initial, font, { text: "A".repeat(4096), scale: 64 }),
      /./,
    );
    console.log(
      "Inline text pure draft: source box fallback, growth/no-wrap, bitmap preview, caret hit/selection caching, move, scale, single line and atomic validation pass.",
    );
    const changedFont = {
      ...font,
      glyphs: { ...font.glyphs, A: { ...font.glyphs.A, alpha: new Uint8Array([0, 255, 255, 0]) } },
    };
    const changedFontDraft = updateInlineText(typed, changedFont, {});
    assert.notEqual(changedFontDraft.pixels, typed.pixels);
    assert.notDeepEqual(changedFontDraft.pixels.data, typed.pixels.data);
    assert.equal(changedFontDraft.font, changedFont);
    console.log("Inline selection-only updates reuse raster; changed font identity rebuilds it.");
  }, 60_000);
});
