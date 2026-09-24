import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { build } from "esbuild";
import { transform } from "esbuild";
import { describe, it } from "vitest";

describe("palette-placement", () => {
  it("palette-placement behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './apps/editor/src/managers/palette/policies/palette-selection.ts';export * from './apps/editor/src/managers/palette/policies/palette-layout.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      paletteSelectionGeometry: geometry,
      hitPaletteSelectionOutline: hit,
      asepritePaletteLayout: layout,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const old = geometry([0, 1, 5], 108),
      win = geometry([0, 1, 5], 108, 5, { origin: { x: 12, y: 100 } });
    assert.deepEqual(
      win,
      old.map((g) => ({
        ...g,
        box: { ...g.box, y: g.box.y - 10 },
        clip: { ...g.clip, y: g.clip.y - 10 },
      })),
    );
    const before = layout(174, 10),
      after = layout(174, 10, undefined, 670);
    assert.equal(before.showScrollbar, true);
    assert.equal(before.columns, 5);
    assert.equal(before.contentHeight, 794);
    assert.equal(before.maxScroll, 134);
    assert.equal(after.showScrollbar, false);
    assert.equal(after.columns, 6);
    assert.equal(after.contentHeight, 662);
    assert.equal(
      after.maxScroll,
      0,
      "Ten extra viewport pixels can remove scrollbar and restore its columns",
    );
    assert.equal(
      layout(174, 10, 5, 670).columns,
      5,
      "Explicit column count does not change on scrollbar branch",
    );
    assert.equal(layout(174, 10, 5, 670).maxScroll, 124);
    let seed = 1937;
    const random = (n) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    for (let trial = 0; trial < 500; trial++) {
      const count = 1 + random(200),
        columns = 1 + random(12),
        cellSize = 8 + 2 * random(29),
        scrollY = random(300),
        picks = Array.from({ length: 15 }, () => random(count)),
        dx = random(151) - 75,
        dy = random(151) - 75;
      const a = geometry(picks, count, columns, { cellSize, scrollY }),
        b = geometry(picks, count, columns, {
          cellSize,
          scrollY,
          origin: { x: 12 + dx, y: 110 + dy },
        });
      assert.deepEqual(
        b,
        a.map((g) => ({
          ...g,
          box: { ...g.box, x: g.box.x + dx, y: g.box.y + dy },
          clip: { ...g.clip, x: g.clip.x + dx, y: g.clip.y + dy },
        })),
      );
      for (const item of a) {
        const p = { x: item.box.x, y: item.box.y };
        assert.equal(
          hit({ x: p.x + dx, y: p.y + dy }, b),
          hit(p, a),
          "Translated outline hit targets follow painted geometry",
        );
      }
      const size = 4 + random(29);
      assert.deepEqual(
        layout(count, size),
        layout(count, size, undefined, 660),
        "Historical default layout unchanged",
      );
      const huge = layout(count, size, undefined, 1e6);
      assert.equal(huge.showScrollbar, false);
      assert.equal(huge.maxScroll, 0);
    }
    console.log(
      "Palette placement passes: canonical10px translation, meaningful660→670 overflow/column transition, explicit columns,500 randomized outline/hit translations and default-layout compatibility.",
    );
  }, 60_000);
});

describe("palette-selection", () => {
  it("palette-selection behavior", async () => {
    const { code } = await transform(
      await readFile(new URL("./palette-selection.ts", import.meta.url), "utf8"),
      { loader: "ts", format: "esm" },
    );
    const { paletteSelectionGeometry: geometry, hitPaletteSelectionOutline: hit } = await import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    );
    const single = geometry([0], 108);
    assert.deepEqual(single[0].box, { x: 6, y: 104, width: 34, height: 34 });
    assert.deepEqual(single[0].clip, single[0].box);
    assert.equal(hit({ x: 6, y: 115 }, single), 0);
    assert.equal(hit({ x: 15, y: 115 }, single), null);
    const adjacent = geometry([0, 1], 108);
    assert.equal(adjacent[0].edges.right, false);
    assert.equal(adjacent[1].edges.left, false);
    assert.equal(adjacent[0].clip.x + adjacent[0].clip.width, adjacent[1].clip.x);
    assert.equal(hit({ x: 35, y: 120 }, adjacent), null);
    const rowBreak = geometry([4, 5], 108);
    assert.equal(rowBreak[0].edges.right, true);
    assert.equal(rowBreak[1].edges.left, true);
    const vertical = geometry([0, 5], 108);
    assert.equal(vertical[0].clip.y + vertical[0].clip.height, vertical[1].clip.y);
    assert.equal(vertical[0].edges.bottom, false);
    assert.equal(vertical[1].edges.top, false);
    const block = geometry([0, 1, 5, 6], 108);
    assert.equal(hit({ x: 35, y: 133 }, block), null);
    assert.deepEqual(geometry([-1, 0, 0, 108, 1.5], 108), single);
    assert.deepEqual(geometry([], 108), []);
    console.log(
      "16 palette selection geometry and outline-hit checks passed. Rendered pixel comparison remains pending.",
    );

    const enlarged = geometry([0, 1], 108, 4, { cellSize: 28, scrollY: 30 });
    assert.deepEqual(enlarged[0].box, { x: 6, y: 74, width: 41, height: 40 });
    assert.equal(hit({ x: 7, y: 83 }, enlarged), 0);
    assert.equal(hit({ x: 41, y: 90 }, enlarged), null);
    const layoutSource = await transform(
      await readFile(new URL("./palette-layout.ts", import.meta.url), "utf8"),
      { loader: "ts", format: "esm" },
    );
    const { asepritePaletteLayout: layout } = await import(
      `data:text/javascript;base64,${Buffer.from(layoutSource.code).toString("base64")}`
    );
    assert.deepEqual(layout(108, 11), {
      cellSize: 22,
      pitch: 24,
      columns: 5,
      contentHeight: 554,
      showScrollbar: false,
      maxScroll: 0,
    });
    assert.equal(layout(108, 13).columns, 4);
    assert.equal(layout(108, 13).maxScroll, 126);
    assert.equal(layout(108, 32).columns, 1);
    assert.equal(layout(108, 32).maxScroll, 6536);
    assert.equal(layout(108, 4).showScrollbar, false);
    assert.equal(layout(108, 0).cellSize, 8);
    assert.equal(layout(108, 100).cellSize, 64);
    console.log("11 additional swatch-size, scrolling and overflow layout checks passed.");
  }, 60_000);
});
