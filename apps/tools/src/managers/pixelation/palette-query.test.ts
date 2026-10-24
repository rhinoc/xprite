import { describe, expect, it } from "vitest";

import { paletteSlugFromSearch } from "$/managers/pixelation/palette-query";

describe("paletteSlugFromSearch", () => {
  it("reads palette and leaves other query params alone", () => {
    expect(paletteSlugFromSearch("?palette=wplace&utm_campaign=wplace-overlay")).toBe("wplace");
    expect(paletteSlugFromSearch("?utm_campaign=wplace-overlay&palette=wplace")).toBe("wplace");
  });
  it("normalizes case and an optional builtin prefix", () => {
    expect(paletteSlugFromSearch("?palette=Wplace")).toBe("wplace");
    expect(paletteSlugFromSearch("?palette=builtin:wplace")).toBe("wplace");
  });
  it("returns null when missing or empty", () => {
    expect(paletteSlugFromSearch("")).toBeNull();
    expect(paletteSlugFromSearch("?utm_campaign=wplace-overlay")).toBeNull();
    expect(paletteSlugFromSearch("?palette=")).toBeNull();
    expect(paletteSlugFromSearch("?palette=%20")).toBeNull();
  });
});
