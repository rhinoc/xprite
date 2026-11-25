import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

import { rasterizeSelectionTransform } from "$/selection/transform";
import { SelectionRotationAlgorithm, type SelectionTransform } from "$/selection/types";

describe("selection-transform", () => {
  it("selection-transform behavior", async () => {
    const compiled = await build({
      entryPoints: [
        "packages/editor-core/src/index.ts",
        "packages/editor-core/src/selection/transform.ts",
      ],
      bundle: true,
      platform: "node",
      format: "esm",
      outdir: "unused",
      write: false,
    });
    const modules = await Promise.all(
      compiled.outputFiles.map(
        (f) => import(`data:text/javascript;base64,${Buffer.from(f.contents).toString("base64")}`),
      ),
    );
    const { RasterEditor } = modules.find((m) => m.RasterEditor),
      { rasterizeSelectionTransform, dragSelectionTransform } = modules.find(
        (m) => m.rasterizeSelectionTransform,
      );
    const {
      selectionBoundarySegments,
      projectSelectionBoundarySegments,
      selectionBoundaryWhite,
      selectionShaderOffset,
      selectionHandleRect,
    } = modules.find((m) => m.selectionBoundarySegments);
    const {
      createSelectionAntsState,
      syncSelectionAnts,
      requestSelectionAntsTick,
      paintSelectionAnts,
    } = modules.find((m) => m.createSelectionAntsState);
    const fullMask = {
      x: 10,
      y: 20,
      width: 2,
      height: 2,
      data: new Uint8Array([255, 255, 255, 255]),
    };
    const antsSegments = selectionBoundarySegments(fullMask);
    assert.deepEqual(
      antsSegments.map(({ axis, x, y, length }) => [axis, x, y, length]),
      [
        ["horizontal", 10, 20, 2],
        ["horizontal", 10, 22, 2],
        ["vertical", 10, 20, 2],
        ["vertical", 12, 20, 2],
      ],
    );
    assert.deepEqual(
      projectSelectionBoundarySegments(antsSegments, { x: 3, y: 4 }, 2).map(
        ({ axis, x, y, length }) => [axis, x, y, length],
      ),
      [
        ["horizontal", 23, 44, 4],
        ["horizontal", 23, 48, 4],
        ["vertical", 23, 44, 4],
        ["vertical", 27, 44, 4],
      ],
    );
    assert.deepEqual(
      Array.from({ length: 8 }, (_, x) => selectionBoundaryWhite(x, 0, 0)),
      [false, true, true, true, true, false, false, false],
    );
    assert.deepEqual(
      Array.from({ length: 8 }, (_, x) => selectionBoundaryWhite(x, 0, 7)),
      [true, true, true, true, false, false, false, false],
    );
    for (let phase = 0; phase < 8; phase++)
      for (let x = 0; x < 8; x++)
        assert.equal(selectionBoundaryWhite(x, 0, phase), ((x + 7 - phase) & 7) < 4);
    assert.deepEqual(selectionHandleRect(10, 10, 5, 0), {
      x: 10,
      y: 8,
      width: 5,
      height: 5,
    });
    let ants = syncSelectionAnts(createSelectionAntsState(), true);
    assert.equal(ants.offset, 0);
    ants = requestSelectionAntsTick(ants);
    let paintedAnts = paintSelectionAnts(ants);
    assert.deepEqual([paintedAnts.phase, paintedAnts.state.offset], [0, 1]);
    ants = syncSelectionAnts(paintedAnts.state, false);
    ants = syncSelectionAnts(ants, true);
    assert.equal(ants.offset, 1, "Paused mask keeps its offset without wall-clock catch-up");
    paintedAnts = paintSelectionAnts(requestSelectionAntsTick(ants));
    assert.deepEqual([paintedAnts.phase, paintedAnts.state.offset], [1, 2]);
    const image = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
    image.data.set([255, 0, 0, 255], (3 * 10 + 3) * 4);
    image.data.set([0, 255, 0, 255], (3 * 10 + 4) * 4);
    const editor = new RasterEditor(image);
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 3, y: 3 });
    editor.pointerUp({ x: 4, y: 4 });
    assert.equal(editor.getSnapshot().dirty, false);
    editor.pointerDown({ x: 3, y: 3 });
    editor.pointerUp({ x: 5, y: 5 });
    assert(editor.getSnapshot().selectionTransform);
    assert.equal(editor.getSnapshot().floatingPaste.x, 5);
    assert.equal(editor.canvas.composite().data[(3 * 10 + 3) * 4 + 3], 0);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(
      Array.from(editor.canvas.composite().data.slice((5 * 10 + 5) * 4, (5 * 10 + 5) * 4 + 4)),
      [255, 0, 0, 255],
    );
    assert.equal(editor.getSnapshot().document.selection.x, 5);
    editor.history.undo();
    assert.deepEqual(editor.canvas.composite().data, image.data);
    editor.history.redo();
    assert.equal(editor.canvas.composite().data[(5 * 10 + 5) * 4], 255);
    editor.history.undo();
    editor.pointerDown({ x: 3, y: 3 });
    editor.pointerUp({ x: 8, y: 8 });
    editor.clipboard.cancelFloatingPaste();
    assert.deepEqual(editor.canvas.composite().data, image.data);
    editor.pointerDown({ x: 3, y: 3, ctrl: true });
    editor.pointerUp({ x: 6, y: 6 });
    editor.clipboard.commitFloatingPaste();
    assert.equal(editor.canvas.composite().data[(3 * 10 + 3) * 4], 255);
    assert.equal(editor.canvas.composite().data[(6 * 10 + 6) * 4], 255);
    editor.history.undo();
    editor.pointerDown({ x: 3, y: 3, button: 2 });
    editor.pointerUp({ x: 5, y: 5, button: 2 });
    assert.equal(editor.getSnapshot().selectionTransform, null);
    assert.deepEqual(editor.canvas.composite().data, image.data);
    const source = {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
      },
      mask = { x: 0, y: 0, width: 2, height: 1, data: new Uint8Array([255, 255]) };
    const transform = {
      source,
      mask,
      bounds: { x: 0, y: 0, width: 2, height: 1 },
      angle: 0,
      copy: false,
    };
    const scaled = rasterizeSelectionTransform({
      ...transform,
      bounds: { x: 1, y: 2, width: 4, height: 2 },
    });
    assert.deepEqual(
      [scaled.mask.x, scaled.mask.y, scaled.pixels.width, scaled.pixels.height],
      [1, 2, 4, 2],
    );
    assert.deepEqual(
      Array.from(scaled.pixels.data.slice(0, 16)),
      [255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255],
    );
    const rotated = rasterizeSelectionTransform({
      ...transform,
      bounds: { x: 0, y: 0, width: 2, height: 2 },
      source: {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        ]),
      },
      mask: { x: 0, y: 0, width: 2, height: 2, data: new Uint8Array(4).fill(255) },
      angle: Math.PI / 2,
    });
    assert.deepEqual(Array.from(rotated.pixels.data.slice(0, 8)), [0, 0, 255, 255, 255, 0, 0, 255]);
    assert.equal(
      dragSelectionTransform(transform, "e", { x: 2, y: 0 }, { x: 4, y: 0 }).bounds.width,
      4,
    );
    const font = {
      height: 1,
      lineHeight: 1,
      glyphs: {
        A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
      },
    };
    editor.drawing.settings.setSettings({ tool: "text", font, foreground: [50, 60, 70, 255] });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerUp({ x: 2, y: 2 });
    assert(editor.getSnapshot().inlineText);
    editor.drawing.text.updateInlineText({ text: "A", selectionStart: 1, selectionEnd: 1 });
    const selected = editor.getSnapshot().document.selection;
    assert(editor.drawing.text.commitInlineText());
    assert.deepEqual(Array.from(editor.canvas.composite().data.slice(44, 48)), [50, 60, 70, 255]);
    assert.equal(editor.getSnapshot().document.selection, selected);
    editor.history.undo();
    assert.equal(editor.canvas.composite().data[47], 0);
    editor.history.redo();
    assert.equal(editor.canvas.composite().data[47], 255);
    assert.equal(editor.getSnapshot().document.selection, selected);
    const beforeBounds = editor.canvas.composite().data.slice(),
      dirty = editor.getSnapshot().dirty;
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.selection.beginTransform("bounds", { x: 3, y: 3 });
    editor.pointerUp({ x: 5, y: 6 });
    assert.deepEqual(editor.canvas.composite().data, beforeBounds);
    assert.equal(editor.getSnapshot().dirty, dirty);
    editor.color.setPalette([
      [1, 2, 3, 255],
      [4, 5, 6, 255],
    ]);
    editor.document.close();
    assert.deepEqual(editor.getSnapshot().palette, [
      [1, 2, 3, 255],
      [4, 5, 6, 255],
    ]);
    assert.equal(editor.getSnapshot().document, null);
    assert.equal(editor.getSnapshot().canUndo, false);
    assert.equal(editor.getSnapshot().inlineText, null);
    console.log(
      "Selection cut/copy/translation/cancel/undo/redo/right drag; nearest scale/rotation; marching-ants all-8-phase pattern/segments/timer lifecycle; Aseprite handle midpoint; inline text commit/history/selection; close lifecycle pass.",
    );

    // Independent source inventory: viewport (83,49), AppEditor (-171,-149)
    // for 509x396 at 100%, confirming scroll-relative shader origin (254,198).
    assert.deepEqual(
      selectionShaderOffset({ width: 850, height: 336 }, { width: 509, height: 396 }, 1, {
        x: 171,
        y: -30,
      }),
      { x: 254, y: 198 },
    );
    assert.deepEqual(
      selectionShaderOffset({ width: 850, height: 336 }, { width: 509, height: 396 }, 1, {
        x: 181,
        y: -25,
      }),
      { x: 244, y: 193 },
    );
    assert.deepEqual(
      selectionShaderOffset({ width: 850, height: 336 }, { width: 105, height: 86 }, 1, {
        x: 372,
        y: 125,
      }),
      { x: 373, y: 125 },
    );
  }, 60_000);
});

describe("RotSprite selection transform optimization", () => {
  interface ReferenceSamples {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    mask: Uint8Array;
  }

  function referenceScaleEpx2x(source: ReferenceSamples): ReferenceSamples {
    const width = source.width * 2;
    const height = source.height * 2;
    const data = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8Array(width * height);
    const same = (first: number, second: number) => {
      if (source.mask[first] !== source.mask[second]) return false;
      const a = first * 4;
      const b = second * 4;
      return (
        source.data[a] === source.data[b] &&
        source.data[a + 1] === source.data[b + 1] &&
        source.data[a + 2] === source.data[b + 2] &&
        source.data[a + 3] === source.data[b + 3]
      );
    };
    const at = (x: number, y: number) => y * source.width + x;
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const p = at(x, y);
        const a = at(x, y ? y - 1 : y);
        const b = at(x < source.width - 1 ? x + 1 : x, y);
        const c = at(x ? x - 1 : x, y);
        const d = at(x, y < source.height - 1 ? y + 1 : y);
        const outputs = [
          same(c, a) && !same(c, d) && !same(a, b) ? a : p,
          same(a, b) && !same(a, c) && !same(b, d) ? b : p,
          same(d, c) && !same(d, b) && !same(c, a) ? c : p,
          same(b, d) && !same(b, a) && !same(d, c) ? d : p,
        ];
        const positions = [
          2 * y * width + 2 * x,
          2 * y * width + 2 * x + 1,
          (2 * y + 1) * width + 2 * x,
          (2 * y + 1) * width + 2 * x + 1,
        ];
        for (let i = 0; i < 4; i++) {
          data.set(source.data.subarray(outputs[i] * 4, outputs[i] * 4 + 4), positions[i] * 4);
          mask[positions[i]] = source.mask[outputs[i]] ? 1 : 0;
        }
      }
    }
    return { width, height, data, mask };
  }

  function referenceRotSprite(value: SelectionTransform) {
    const c = {
      x: value.bounds.x + value.bounds.width / 2,
      y: value.bounds.y + value.bounds.height / 2,
    };
    const co = Math.cos(value.angle);
    const si = Math.sin(value.angle);
    const corners = [
      [0, 0],
      [value.bounds.width, 0],
      [value.bounds.width, value.bounds.height],
      [0, value.bounds.height],
    ].map(([x, y]) => ({
      x: c.x + (x - value.bounds.width / 2) * co - (y - value.bounds.height / 2) * si,
      y: c.y + (x - value.bounds.width / 2) * si + (y - value.bounds.height / 2) * co,
    }));
    const bx = Math.floor(Math.min(...corners.map((p) => p.x)) + 1e-8);
    const by = Math.floor(Math.min(...corners.map((p) => p.y)) + 1e-8);
    const bw = Math.max(1, Math.ceil(Math.max(...corners.map((p) => p.x)) - 1e-8) - bx);
    const bh = Math.max(1, Math.ceil(Math.max(...corners.map((p) => p.y)) - 1e-8) - by);
    let working: ReferenceSamples = {
      width: value.source.width,
      height: value.source.height,
      data: value.source.data,
      mask: value.mask.data,
    };
    const passes = 3;
    for (let pass = 0; pass < passes; pass++) working = referenceScaleEpx2x(working);
    const samplesPerAxis = 1 << passes;
    const sampleCount = samplesPerAxis * samplesPerAxis;
    const data = new Uint8ClampedArray(bw * bh * 4);
    const mask = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const votes = new Map<number, { count: number; sample: number[] }>();
        let selectedSamples = 0;
        for (let sampleY = 0; sampleY < samplesPerAxis; sampleY++) {
          for (let sampleX = 0; sampleX < samplesPerAxis; sampleX++) {
            const dx = bx + x + (sampleX + 0.5) / samplesPerAxis - c.x;
            const dy = by + y + (sampleY + 0.5) / samplesPerAxis - c.y;
            const localX = ((dx * co + dy * si) / value.bounds.width + 0.5) * value.source.width;
            const localY = ((-dx * si + dy * co) / value.bounds.height + 0.5) * value.source.height;
            const sx = Math.floor(localX * samplesPerAxis);
            const sy = Math.floor(localY * samplesPerAxis);
            if (sx < 0 || sy < 0 || sx >= working.width || sy >= working.height) continue;
            const sourceIndex = sy * working.width + sx;
            if (!working.mask[sourceIndex]) continue;
            selectedSamples++;
            const at = sourceIndex * 4;
            const key =
              ((working.data[at] * 256 + working.data[at + 1]) * 256 + working.data[at + 2]) * 256 +
              working.data[at + 3];
            const vote = votes.get(key);
            if (vote) vote.count++;
            else
              votes.set(key, { count: 1, sample: Array.from(working.data.subarray(at, at + 4)) });
          }
        }
        if (selectedSamples * 2 < sampleCount) continue;
        let best: { count: number; sample: number[] } | null = null;
        for (const vote of votes.values()) if (!best || vote.count > best.count) best = vote;
        if (!best) continue;
        const out = y * bw + x;
        mask[out] = 255;
        data.set(best.sample, out * 4);
      }
    }
    return { data, mask };
  }

  it("matches reference EPX + voting bit-for-bit across angles, sparse masks, ties, and cache reuse", () => {
    const width = 16;
    const height = 14;
    const data = new Uint8ClampedArray(width * height * 4);
    const maskData = new Uint8Array(width * height);
    const palette = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
      [255, 0, 255, 128],
    ];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        // Diagonal + checkerboard + transparent holes to exercise EPX edges and vote ties.
        if ((x === 5 && y === 5) || (x > 11 && y < 3)) continue;
        maskData[index] = 255;
        const color = palette[(x + y * 2 + (x > y ? 1 : 0)) % palette.length];
        data.set(color, index * 4);
      }
    }
    const base: SelectionTransform = {
      source: { width, height, data },
      mask: { x: 2, y: 3, width, height, data: maskData },
      bounds: { x: 2, y: 3, width, height },
      angle: 0,
      copy: false,
      rotationAlgorithm: SelectionRotationAlgorithm.RotSprite,
    };

    for (const angle of [0.35, -0.7853981633974483, 1.15, 2.31]) {
      const candidate: SelectionTransform = { ...base, angle };
      const actual = rasterizeSelectionTransform(candidate);
      const expected = referenceRotSprite(candidate);
      assert.deepEqual(actual.pixels.data, expected.data);
      assert.deepEqual(actual.mask.data, expected.mask);

      // Fresh buffers (cache miss) must produce the exact same pixels as cached EPX reuse.
      const uncached = rasterizeSelectionTransform({
        ...candidate,
        source: { width, height, data: data.slice() },
        mask: { ...base.mask, data: maskData.slice() },
      });
      assert.deepEqual(actual.pixels.data, uncached.pixels.data);
      assert.deepEqual(actual.mask.data, uncached.mask.data);
    }

    // Exercise opaque + transparentColor color-key path across repeated rotation drags.
    const keyed: SelectionTransform = {
      ...base,
      angle: 0.42,
      opaque: false,
      transparentColor: [255, 0, 0, 255],
    };
    const firstKeyed = rasterizeSelectionTransform(keyed);
    const secondKeyed = rasterizeSelectionTransform({ ...keyed, angle: 0.42 });
    assert.deepEqual(firstKeyed.pixels.data, secondKeyed.pixels.data);
    assert.deepEqual(firstKeyed.mask.data, secondKeyed.mask.data);

    // Performance sanity: 20 sequential rotation steps on a 64x64 sprite reusing cached EPX.
    const bigSize = 64;
    const bigData = new Uint8ClampedArray(bigSize * bigSize * 4);
    const bigMask = new Uint8Array(bigSize * bigSize).fill(255);
    for (let i = 0; i < bigSize * bigSize; i++) {
      bigData[i * 4] = (i * 19) & 255;
      bigData[i * 4 + 1] = (i * 37) & 255;
      bigData[i * 4 + 2] = (i * 73) & 255;
      bigData[i * 4 + 3] = 255;
    }
    const bigTransform: SelectionTransform = {
      source: { width: bigSize, height: bigSize, data: bigData },
      mask: { x: 0, y: 0, width: bigSize, height: bigSize, data: bigMask },
      bounds: { x: 0, y: 0, width: bigSize, height: bigSize },
      angle: 0.1,
      copy: false,
      rotationAlgorithm: SelectionRotationAlgorithm.RotSprite,
    };
    for (let step = 1; step <= 20; step++) {
      const rendered = rasterizeSelectionTransform({ ...bigTransform, angle: step * 0.15 });
      assert.ok(rendered.pixels.width >= bigSize);
    }
  });
});
