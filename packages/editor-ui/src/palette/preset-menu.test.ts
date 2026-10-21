import { describe, expect, it } from "vitest";

import { PalettePresetKind, type PaletteBrowserChoice } from "$/palette/model";
import { AUTOMATIC_PALETTE_ID, presetMenuChecked, presetMenuChoices } from "$/palette/preset-menu";
import type { Rgba } from "@xprite/editor-core/base";

const pico: Rgba[] = [
  [0, 0, 0, 255],
  [255, 255, 255, 255],
];
const gameboy: Rgba[] = [
  [15, 56, 15, 255],
  [155, 188, 15, 255],
];
const choice = (id: string, name: string, colors: Rgba[]): PaletteBrowserChoice => ({
  id,
  name,
  group: "Built-in",
  author: null,
  colors,
  source: PalettePresetKind.Builtin,
});
const presets = [
  choice("builtin:PICO-8", "PICO-8", pico),
  choice("builtin:GB", "Game Boy", gameboy),
];

describe("palette preset menu", () => {
  it("lists only the presets unless the host opts in to Automatic", () => {
    expect(presetMenuChoices(presets, "").map((c) => c.id)).toEqual([
      "builtin:PICO-8",
      "builtin:GB",
    ]);
  });

  it("puts the opt-in Automatic item first, with no colours", () => {
    const rows = presetMenuChoices(presets, "", { label: "Automatic" });
    expect(rows.map((c) => c.name)).toEqual(["Automatic", "PICO-8", "Game Boy"]);
    expect(rows[0]).toMatchObject({ id: AUTOMATIC_PALETTE_ID, colors: [] });
  });

  it("gives Automatic the current automatic palette as its strip", () => {
    const [automatic] = presetMenuChoices(presets, "", { label: "Automatic", colors: gameboy });
    expect(automatic.colors).toEqual(gameboy);
    // Still identified by id, not colours: a preset with the same colours is not Automatic.
    expect(presetMenuChecked(automatic, gameboy, false)).toBe(false);
  });

  it("filters Automatic by the search like any other row", () => {
    expect(presetMenuChoices(presets, "game", { label: "Automatic" }).map((c) => c.name)).toEqual([
      "Game Boy",
    ]);
    expect(presetMenuChoices(presets, "auto", { label: "Automatic" }).map((c) => c.name)).toEqual([
      "Automatic",
    ]);
  });

  it("checks Automatic while no palette is loaded, even if a preset has the same colours", () => {
    const [automatic, picoRow, gbRow] = presetMenuChoices(presets, "", { label: "Automatic" });
    expect(presetMenuChecked(automatic, pico, true)).toBe(true);
    expect(presetMenuChecked(picoRow, pico, true)).toBe(false);
    expect(presetMenuChecked(gbRow, pico, true)).toBe(false);
  });

  it("checks the loaded preset, not Automatic, once a palette is loaded", () => {
    const [automatic, picoRow, gbRow] = presetMenuChoices(presets, "", { label: "Automatic" });
    expect(presetMenuChecked(automatic, gameboy, false)).toBe(false);
    expect(presetMenuChecked(picoRow, gameboy, false)).toBe(false);
    expect(presetMenuChecked(gbRow, gameboy, false)).toBe(true);
  });

  it("keeps the editor behaviour without Automatic: the matching preset is checked", () => {
    const [picoRow, gbRow] = presetMenuChoices(presets, "");
    expect(presetMenuChecked(picoRow, pico)).toBe(true);
    expect(presetMenuChecked(gbRow, pico)).toBe(false);
  });
});
