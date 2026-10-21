import { describe, expect, test } from "vitest";

import { blockPartition } from "$/import-export/image/import/grid";
import {
  sprite,
  upscaleNearest,
  vectorShapes,
} from "$/import-export/image/import/grid-test-images";
import { runPixeloe } from "$/import-export/image/import/line-guided/pixeloe-entry";
import { readOutlinePrepass, runsStockPixeloe } from "$/import-export/image/import/outline-prepass";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  detectWithAlgorithm,
  recoverWithGrid,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import { pixeloePrepass } from "$/import-export/image/import/pixeloe-prepass";
import {
  defaultPixelationSettings,
  pixelationSettingsOptions,
  updatePixelationSettings,
} from "$/import-export/image/import/settings";
import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PixelationAlgorithm,
  PixelationMode,
} from "$/import-export/image/import/types";

const image = vectorShapes(150, 120);
const convert = {
  mode: PixelationMode.Convert,
  blockPicker: true,
  targetWidth: 30,
  targetHeight: 24,
};
const size = { width: 30, height: 24 };

describe("outline pre-pass combinations", () => {
  test("PixelOE + Contrast without a recovered grid is stock PixelOE", () => {
    for (const blockPicker of [true, false]) {
      const run = (prepass: OutlinePrepass, lineGuide?: LineGuideMode) =>
        pixelateImage(image, {
          ...convert,
          blockPicker,
          colorPicker: CellColorPicker.Contrast,
          prepass,
          lineGuide,
        });
      expect(run(OutlinePrepass.Pixeloe)).toEqual(runPixeloe(image, size));
      expect(run(OutlinePrepass.PixeloeLines)).toEqual(
        runPixeloe(image, size, LineGuideMode.Union),
      );
      expect(run(OutlinePrepass.PixeloeLines, LineGuideMode.Replace)).toEqual(
        runPixeloe(image, size, LineGuideMode.Replace),
      );
    }
  });
  test("Custom size's blocks with Contrast are stock PixelOE too", () => {
    const grid = detectWithAlgorithm(image, PixelationAlgorithm.CustomSize, size);
    const out = pixelateImage(image, {
      mode: PixelationMode.RecoverGrid,
      grid,
      colorPicker: CellColorPicker.Contrast,
      prepass: OutlinePrepass.PixeloeLines,
    });
    expect(out).toEqual(runPixeloe(image, size, LineGuideMode.Union));
  });
  test("other pickers sample the original pre-pass block by block, as the old checkbox did", () => {
    const blocks = { ...blockPartition(image, 30, 24), confidence: 1, reliable: true };
    const out = pixelateImage(image, {
      ...convert,
      colorPicker: CellColorPicker.Median,
      prepass: OutlinePrepass.Pixeloe,
    });
    expect(out).toEqual(recoverWithGrid(pixeloePrepass(image, 5), blocks, CellColorPicker.Median));
  });
  test("a grid recovered from the source keeps the pre-pass + picker, even with Contrast", () => {
    const art = upscaleNearest(sprite(32), 4);
    const grid = detectWithAlgorithm(art);
    expect(grid.reliable).toBe(true);
    const options = {
      mode: PixelationMode.RecoverGrid,
      grid,
      colorPicker: CellColorPicker.Contrast,
    };
    expect(runsStockPixeloe({ ...options, prepass: OutlinePrepass.Pixeloe }, grid)).toBe(false);
    expect(pixelateImage(art, { ...options, prepass: OutlinePrepass.Pixeloe })).toEqual(
      recoverWithGrid(pixeloePrepass(art, 4), grid, CellColorPicker.Contrast),
    );
  });
  test("the lines pre-pass follows the line guide; None leaves the image alone", () => {
    const run = (prepass: OutlinePrepass, lineGuide?: LineGuideMode) =>
      pixelateImage(image, { ...convert, colorPicker: CellColorPicker.Median, prepass, lineGuide });
    const plain = run(OutlinePrepass.Pixeloe);
    const union = run(OutlinePrepass.PixeloeLines);
    expect(union).toEqual(run(OutlinePrepass.PixeloeLines, LineGuideMode.Union));
    expect(union.data).not.toEqual(plain.data);
    expect(run(OutlinePrepass.PixeloeLines, LineGuideMode.Replace).data).not.toEqual(union.data);
    expect(run(OutlinePrepass.None)).toEqual(
      pixelateImage(image, { ...convert, colorPicker: CellColorPicker.Median }),
    );
  });
});

describe("outline pre-pass settings", () => {
  test("every source opens on PixelOE + lines with Contrast and no limit, grid or not", () => {
    const loose = defaultPixelationSettings(image, detectWithAlgorithm(image));
    const opened = {
      prepass: OutlinePrepass.PixeloeLines,
      lineGuide: LineGuideMode.Union,
      colorPicker: CellColorPicker.Contrast,
      reduceColors: false,
    };
    expect(loose).toMatchObject({ ...opened, mode: PixelationMode.Convert });
    const art = upscaleNearest(sprite(32), 4);
    const grid = detectWithAlgorithm(art);
    expect(grid.reliable).toBe(true);
    // The grid still decides the mode; it no longer decides the pre-pass.
    expect(defaultPixelationSettings(art, grid)).toMatchObject({
      ...opened,
      mode: PixelationMode.RecoverGrid,
    });
    expect(defaultPixelationSettings(art)).toMatchObject(opened);
  });
  test("losing the grid limits colours only without a pre-pass", () => {
    const art = upscaleNearest(sprite(32), 4);
    const recovered = defaultPixelationSettings(art, detectWithAlgorithm(art));
    const convert = { mode: PixelationMode.Convert };
    expect(updatePixelationSettings(recovered, convert, art).reduceColors).toBe(false);
    const plain = { ...recovered, prepass: OutlinePrepass.None };
    expect(updatePixelationSettings(plain, convert, art).reduceColors).toBe(true);
  });
  test("turning a pre-pass on picks Contrast; an explicit picker wins", () => {
    const off = { ...defaultPixelationSettings(image), prepass: OutlinePrepass.None };
    const picked = { ...off, colorPicker: CellColorPicker.Median };
    expect(
      updatePixelationSettings(picked, { prepass: OutlinePrepass.Pixeloe }, image).colorPicker,
    ).toBe(CellColorPicker.Contrast);
    expect(
      updatePixelationSettings(
        picked,
        { prepass: OutlinePrepass.Pixeloe, colorPicker: CellColorPicker.Average },
        image,
      ).colorPicker,
    ).toBe(CellColorPicker.Average);
  });
  test("the old pixeloePrepass checkbox maps to PixelOE / None", () => {
    expect(readOutlinePrepass({ pixeloePrepass: true })).toBe(OutlinePrepass.Pixeloe);
    expect(readOutlinePrepass({ pixeloePrepass: false })).toBe(OutlinePrepass.None);
    expect(readOutlinePrepass({ prepass: "nonsense" })).toBeUndefined();
    const { prepass: _, ...saved } = defaultPixelationSettings(image);
    const legacy = { ...saved, pixeloePrepass: true } as never;
    const migrated = updatePixelationSettings(legacy, {}, image);
    expect(migrated.prepass).toBe(OutlinePrepass.Pixeloe);
    expect("pixeloePrepass" in migrated).toBe(false);
    expect(
      updatePixelationSettings(legacy, { pixeloePrepass: false } as never, image).prepass,
    ).toBe(OutlinePrepass.None);
  });
  test("a pre-pass hands its result to the colour picker", () => {
    const settings = { ...defaultPixelationSettings(image), blockPicker: false };
    expect(pixelationSettingsOptions(settings).blockPicker).toBe(true);
    expect(
      pixelationSettingsOptions({ ...settings, prepass: OutlinePrepass.None }).blockPicker,
    ).toBe(false);
  });
});
