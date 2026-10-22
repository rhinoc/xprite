import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  gridForLongSide,
  longSide,
  outputGrid,
  PIXEL_PRESETS,
  PixelPreset,
  presetBadge,
  presetPlan,
} from "$/managers/minitool/pixel-presets";

const photo = { width: 1080, height: 1280 };

describe("pixel presets", () => {
  it("offers four presets and no line-art preset", () => {
    assert.deepEqual(PIXEL_PRESETS, [
      PixelPreset.Default,
      PixelPreset.Clear,
      PixelPreset.Retro,
      PixelPreset.FewColors,
    ]);
  });

  it("scales the default grid and limits colours", () => {
    const base = outputGrid(presetPlan(PixelPreset.Default, photo, null).settings, null);
    const clear = presetPlan(PixelPreset.Clear, photo, null);
    const retro = presetPlan(PixelPreset.Retro, photo, null);
    const few = presetPlan(PixelPreset.FewColors, photo, null);
    assert.equal(longSide(outputGrid(clear.settings, null)), Math.round(longSide(base) * 1.5));
    assert.equal(longSide(outputGrid(retro.settings, null)), Math.round(longSide(base) * 0.6));
    assert.equal(retro.settings.reduceColors, true);
    assert.equal(retro.settings.maxColors, 16);
    assert.equal(few.settings.reduceColors, true);
    assert.equal(few.settings.maxColors, 8);
    assert.deepEqual(outputGrid(few.settings, null), base);
    assert.equal(clear.customGrid, null);
  });

  it("keeps proportions when sizing by the longer side", () => {
    assert.deepEqual(gridForLongSide({ width: 54, height: 64 }, 96), { width: 81, height: 96 });
    assert.deepEqual(gridForLongSide({ width: 64, height: 32 }, 32), { width: 32, height: 16 });
  });

  it("badges presets with their columns or colours", () => {
    const grid = { width: 54, height: 64 };
    assert.deepEqual(presetBadge(PixelPreset.Default, grid), { columns: 54 });
    assert.deepEqual(presetBadge(PixelPreset.Clear, grid), { columns: 81 });
    assert.deepEqual(presetBadge(PixelPreset.Retro, grid), { columns: 32 });
    assert.deepEqual(presetBadge(PixelPreset.FewColors, grid), { colors: 8 });
  });
});
