import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { PaletteController, type PaletteColorTarget } from "$/color/palette/controller";

describe("palette-controller", () => {
  it("keeps palette edits and tool-color navigation behind injected ports", () => {
    let palette: readonly Rgba[] = [
      [0, 0, 0, 255],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ];
    const colors: Record<PaletteColorTarget, Rgba> = {
      foreground: palette[0],
      background: palette[3],
    };
    let commits = 0;
    const controller = new PaletteController({
      getPalette: () => palette,
      getColor: (target) => colors[target],
      setColor: (target, color) => {
        colors[target] = color;
      },
      commitPalette: (next) => {
        palette = next;
        commits++;
      },
    });

    assert.equal(controller.stepPaletteColor("foreground", 1), 1);
    assert.equal(controller.stepPaletteColor("foreground", 1), 2);
    assert.equal(controller.stepPaletteColor("foreground", 1), 3);
    assert.equal(commits, 0);

    controller.applyPaletteOperation("reverse");
    assert.deepEqual(palette, [
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 0, 255],
    ]);
    assert.equal(commits, 1);

    const unchangedPalette = palette;
    controller.setPalette(palette.map((color) => [...color] as Rgba));
    assert.equal(palette, unchangedPalette);
    assert.equal(commits, 1);
  });

  it("adds a missing palette color once and reports palette-view index updates", () => {
    let palette: readonly Rgba[] = [[0, 0, 0, 255]];
    const colors: Record<PaletteColorTarget, Rgba> = {
      foreground: [0, 0, 0, 255],
      background: [12, 34, 56, 255],
    };
    const controller = new PaletteController({
      getPalette: () => palette,
      getColor: (target) => colors[target],
      setColor: (target, color) => {
        colors[target] = color;
      },
      commitPalette: (next) => {
        palette = next;
      },
    });

    assert.deepEqual(controller.addPaletteColor("background", true), {
      added: true,
      index: 1,
      foregroundIndex: 1,
      backgroundIndex: 1,
    });
    assert.deepEqual(palette, [
      [0, 0, 0, 255],
      [12, 34, 56, 255],
    ]);
    assert.equal(colors.foreground, colors.background);
  });
});
