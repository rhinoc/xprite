import { describe, expect, it } from "vitest";

import {
  CellColorPicker,
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
    });
    expect(importPreferenceOf({ ...base, importAsk: false }).choice).toBe("always-pixelate");
    expect(
      importPreferenceOf({ ...base, importAsk: false, importLastAction: "import-as-is" }).choice,
    ).toBe("always-import-as-is");
  });
});
