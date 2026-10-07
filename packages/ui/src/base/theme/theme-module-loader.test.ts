import { describe, expect, it, vi } from "vitest";

import type { UiTheme } from "$/base/theme/theme-definition";
import { loadThemeModule } from "$/base/theme/theme-module-loader";
import type { UiAppearance } from "$/base/theme/theme-types";
import { macintoshArtwork } from "$/base/theme/themes/macintosh/artwork";

function skin(id: string): UiTheme {
  return {
    id,
    label: id,
    load: vi.fn(async (appearance: UiAppearance) => macintoshArtwork(appearance)),
  };
}

describe("independent UI skins", () => {
  it("shares in-flight work only for the same skin and appearance", async () => {
    const first = skin("custom");
    const second = skin("custom");
    const pending = loadThemeModule("light", first);
    expect(loadThemeModule("light", first)).toBe(pending);
    const [light, dark, other] = await Promise.all([
      pending,
      loadThemeModule("dark", first),
      loadThemeModule("light", second),
    ]);
    expect(light.uiTheme).toBe(first);
    expect(dark.uiTheme).toBe(first);
    expect(other.uiTheme).toBe(second);
    expect(other).not.toBe(light);
    expect(dark.sheetUrl).not.toBe(light.sheetUrl);
    expect(first.load).toHaveBeenCalledTimes(2);
    expect(second.load).toHaveBeenCalledTimes(1);
  });

  it("allows a failed theme load to be retried without resetting other themes", async () => {
    const theme = skin("retry");
    vi.mocked(theme.load).mockRejectedValueOnce(new Error("unavailable artwork"));
    await expect(loadThemeModule("light", theme)).rejects.toThrow("unavailable artwork");
    const other = skin("other");
    const cached = await loadThemeModule("light", other);
    await expect(loadThemeModule("light", theme)).resolves.toMatchObject({ uiTheme: theme });
    expect(await loadThemeModule("light", other)).toBe(cached);
    expect(theme.load).toHaveBeenCalledTimes(2);
    expect(other.load).toHaveBeenCalledTimes(1);
  });
});
