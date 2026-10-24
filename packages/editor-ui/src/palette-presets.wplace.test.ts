import { describe, expect, it } from "vitest";

import { readBundledPalettePresets } from "$/palette-presets";

describe("Wplace map palette preset", () => {
  it("is catalogued as wplace with 63 colors", () => {
    const preset = readBundledPalettePresets().find((entry) => entry.id === "wplace");
    expect(preset).toMatchObject({ id: "wplace", name: "Wplace map" });
    expect(preset?.colors).toHaveLength(63);
  });
});
