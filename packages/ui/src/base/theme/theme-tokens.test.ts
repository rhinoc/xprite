import { describe, expect, it } from "vitest";

import { themeTokens } from "$/base/theme/theme-tokens";
import { macintoshArtwork } from "$/base/theme/themes/macintosh/artwork";

describe("nested theme tokens", () => {
  it("clears optional skin tokens when the next skin does not define them", () => {
    const artwork = macintoshArtwork("light");
    const parent = themeTokens({
      ...artwork,
      tokens: { "--custom-frame": "striped", "--xse-text": "red" },
    });
    const child = themeTokens({ ...artwork, tokens: {} }, parent);
    expect(child["--custom-frame"]).toBe("initial");
    expect(child["--xse-text"]).toBe(artwork.definition.colors.text);
    expect(child["--ui-window-title-background"]).toBe("transparent");
  });
});
