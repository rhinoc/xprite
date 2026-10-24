import { describe, expect, it } from "vitest";

import {
  CellColorPicker,
  OutlinePrepass,
  importPreferenceOf,
  normalizeFilePreferences,
} from "$/managers/preferences/file-preferences";

describe("remembered import picks", () => {
  it("keeps a known colour picker and falls back for anything else", () => {
    expect(normalizeFilePreferences({ importColorPicker: "median" }).importColorPicker).toBe(
      CellColorPicker.Median,
    );
    expect(normalizeFilePreferences({ importColorPicker: "bogus" }).importColorPicker).toBe(
      CellColorPicker.MostCommon,
    );
    expect(normalizeFilePreferences(undefined).importColorPicker).toBe(CellColorPicker.MostCommon);
  });
  it("asks by default and reads older combined choices as ask + last action", () => {
    expect(normalizeFilePreferences(undefined).importAsk).toBe(true);
    const legacy = normalizeFilePreferences({ importDialogChoice: "always-import-as-is" });
    expect([legacy.importAsk, legacy.importLastAction]).toEqual([false, "import-as-is"]);
    const pixelate = normalizeFilePreferences({ importDialogChoice: "always-pixelate" });
    expect([pixelate.importAsk, pixelate.importLastAction]).toEqual([false, "pixelate"]);
    expect(normalizeFilePreferences({ importDialogChoice: "always-ask" }).importAsk).toBe(true);
  });
  it("gives the session ask, or the last pick when asking is off", () => {
    const base = normalizeFilePreferences({
      importPixelationAlgorithm: "edge-grid",
      importColorPicker: "average",
      importLastAction: "pixelate",
    });
    expect(importPreferenceOf(base)).toEqual({
      choice: "always-ask",
      algorithm: "edge-grid",
      colorPicker: "average",
      pixelation: null,
    });
    expect(importPreferenceOf({ ...base, importAsk: false }).choice).toBe("always-pixelate");
    expect(
      importPreferenceOf({ ...base, importAsk: false, importLastAction: "import-as-is" }).choice,
    ).toBe("always-import-as-is");
  });
  it("keeps the last Pixelate import for the silent path and drops unreadable ones", () => {
    expect(normalizeFilePreferences(undefined).importPixelation).toBeNull();
    expect(
      normalizeFilePreferences({ importPixelation: { prepass: "bogus" } }).importPixelation,
    ).toBeNull();
    const saved = normalizeFilePreferences({
      importPixelation: {
        prepass: "none",
        lineGuide: "bogus",
        colorPicker: "median",
        reduceColors: false,
        maxColors: 999,
        dither: "ordered",
      },
    });
    expect(saved.importPixelation).toEqual({
      prepass: OutlinePrepass.None,
      // An unreadable line guide falls back to the default, Lines only.
      lineGuide: "replace",
      colorPicker: CellColorPicker.Median,
      reduceColors: false,
      maxColors: 256,
      dither: "ordered",
    });
    expect(
      normalizeFilePreferences({
        importPixelation: { prepass: "none", dither: "bogus" },
      }).importPixelation,
    ).toEqual({ prepass: OutlinePrepass.None, lineGuide: "replace" });
    expect(importPreferenceOf(saved).pixelation).toEqual(saved.importPixelation);
    // A saved choice is kept, including Add to outlines from before Lines only became the default.
    for (const lineGuide of ["union", "replace"])
      expect(
        normalizeFilePreferences({ importPixelation: { prepass: "pixeloe-lines", lineGuide } })
          .importPixelation?.lineGuide,
      ).toBe(lineGuide);
  });
});
