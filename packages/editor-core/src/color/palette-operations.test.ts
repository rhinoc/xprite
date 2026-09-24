import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { transform } from "esbuild";
import { describe, it } from "vitest";

import { UINT8_MAX } from "$/base/numeric-constants";
import { MAX_PALETTE_COLORS } from "$/color/palette-resize";

describe("palette-operations", () => {
  it("palette-operations behavior", async () => {
    const source = (await readFile(new URL("./palette-operations.ts", import.meta.url), "utf8"))
      .replace(
        /^import \{ UINT8_MAX \} from "\$\/base\/numeric-constants";\r?\n/m,
        `const UINT8_MAX = ${UINT8_MAX};\n`,
      )
      .replace(
        /^import \{ MAX_PALETTE_COLORS \} from "\$\/color\/palette-resize";\r?\n/m,
        `const MAX_PALETTE_COLORS = ${MAX_PALETTE_COLORS};\n`,
      );
    const { code } = await transform(source, { loader: "ts", format: "esm" });
    const { operatePalette: op, dropPaletteColors: drop } = await import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    );
    const red = [255, 0, 0, 255],
      green = [0, 255, 0, 255],
      blue = [0, 0, 255, 255],
      black = [0, 0, 0, 255],
      white = [255, 255, 255, 255];
    let checks = 0;
    function check(actual, expected) {
      assert.deepEqual(actual, expected);
      checks++;
    }
    const palette = [red, green, blue, black];
    check(op(palette, "reverse", true, [1]), [...palette].reverse());
    check(op(palette, "reverse", true, [0, 2]), [blue, green, red, black]);
    check(op(palette, "reverse", false, [2, 0, 0, -1, 999]), [blue, green, red, black]);
    check(op(palette, "hue", true, [0, 2, 3]), [black, green, red, blue]);
    check(op([blue, red, white, green, black], "hue"), [black, white, red, green, blue]);
    check(op([blue, red, white, green, black], "hue", false), [blue, green, red, white, black]);
    const transparent = [255, 255, 0, 0],
      transparent2 = [100, 100, 100, 0];
    check(op([red, transparent, green, transparent2], "red", false), [
      transparent,
      transparent2,
      red,
      green,
    ]);
    check(op([red, green, blue], "alpha", false), [red, green, blue]);
    const darkRed = [128, 0, 0, 255];
    check(op([red, darkRed, white, black], "saturation"), [black, white, darkRed, red]);
    check(op([red, white, darkRed, black], "brightness"), [black, darkRed, white, red]);
    check(op([red, green, blue], "luminance"), [blue, red, green]);
    check(op([red, green, blue], "green"), [red, blue, green]);
    check(op([red, green, blue], "blue", false), [blue, red, green]);
    check(op([[1, 2, 3, 100], [3, 2, 1, 200], transparent], "alpha", false), [
      transparent,
      [3, 2, 1, 200],
      [1, 2, 3, 100],
    ]);
    // Integer division truncates the difference before addition for linear gradients.
    check(op([white, red, black], "gradient", true, [0, 1, 2]), [
      white,
      [128, 128, 128, 255],
      black,
    ]);
    check(op([black, red, white], "gradient", true, [0, 1, 2]), [
      black,
      [127, 127, 127, 255],
      white,
    ]);
    check(op(palette, "gradient", true, [0, 2, 3]), palette);
    check(op(palette, "gradient"), palette);
    check(op([red, black, blue], "hue-gradient", true, [0, 1, 2]), [red, [255, 0, 255, 255], blue]);
    check(op([blue, black, red], "hue-gradient", true, [0, 1, 2]), [blue, [255, 0, 255, 255], red]);
    check(op([[255, 0, 0, 255], black, [0, 0, 255, 0]], "hue-gradient", true, [0, 1, 2]), [
      red,
      [255, 0, 255, 127],
      [0, 0, 255, 0],
    ]);
    const frozen = Object.freeze(palette.map((c) => Object.freeze([...c])));
    check(op(frozen, "reverse"), [...palette].reverse());
    check(op([], "hue"), []);
    console.log(
      `${checks} palette command cases passed: selection expansion, sparse selection, stable ties, transparency, HSV/luminance sorting, gradient rounding and hue wrap. UI/pixel fidelity remains unverified.`,
    );

    // Drop targets are positions in the source preview, before picked colors.
    check(drop(palette, [1], 3).colors, [red, blue, black, green]);
    check(drop(palette, [1], 3).selected, [3]);
    check(drop(palette, [1], 3).remap, [0, 3, 1, 2]);
    check(drop(palette, [2], 0).colors, [blue, red, green, black]);
    check(drop(palette, [1, 3], 0).colors, [green, black, red, blue]);
    check(drop(palette, [1], 2, true).colors, [red, green, green, blue, black]);
    check(drop(palette, [1], 2, true).selected, [2]);
    check(drop(palette, [1], 2, true).remap, [0, 2, 3, 4]);
    check(drop(palette, [], 2).colors, palette);
    check(drop(palette, [1], 5).colors, [red, blue, black, black, black, green]);
    check(palette, [red, green, blue, black]);
    const fullPalette = Array.from({ length: MAX_PALETTE_COLORS }, () => black);
    const blockedCopy = drop(fullPalette, [0], 0, true);
    check(blockedCopy.capacityExceeded, true);
    check(blockedCopy.colors.length, MAX_PALETTE_COLORS);
    check(blockedCopy.selected, [0]);
    check(blockedCopy.remap[MAX_PALETTE_COLORS - 1], MAX_PALETTE_COLORS - 1);
    const finalSlotCopy = drop(fullPalette.slice(1), [0], MAX_PALETTE_COLORS * 2, true);
    check(finalSlotCopy.capacityExceeded, false);
    check(finalSlotCopy.colors.length, MAX_PALETTE_COLORS);
    check(finalSlotCopy.selected, [MAX_PALETTE_COLORS - 1]);
    const fullPaletteMove = drop(fullPalette, [0], MAX_PALETTE_COLORS * 2);
    check(fullPaletteMove.colors.length, MAX_PALETTE_COLORS);
    check(fullPaletteMove.selected, [MAX_PALETTE_COLORS - 1]);
    console.log(
      `${checks} total palette fixtures passed including move/copy drops, destination selection, extension and immutability.`,
    );
  }, 60_000);
});
