import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ThemeAssetInterruptedError,
  getThemeAssets,
  loadThemeImageForTest,
  preloadThemeAssets,
  reportThemeAssetError,
  subscribeThemeAssets,
} from "$/base/theme/theme-assets-store";
import type { UiTheme } from "$/base/theme/theme-definition";
import { UiColorScheme } from "$/base/theme/theme-types";
import { asepriteTypography } from "$/base/theme/themes/aseprite/typography";
import { macintoshArtwork } from "$/base/theme/themes/macintosh/artwork";

type Outcome = "load" | "error";

function stubBrowser(outcomes: Outcome[], visibility: () => string) {
  let created = 0;
  class FakeImage {
    naturalWidth = 4;
    naturalHeight = 4;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      const outcome = outcomes[created++] ?? "error";
      queueMicrotask(() => (outcome === "load" ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibility();
    },
    createElement: () => ({
      getContext: () => ({ drawImage() {}, imageSmoothingEnabled: true }),
    }),
  });
  return () => created;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("theme asset image loading", () => {
  it("retries once after a transient failure", async () => {
    const attempts = stubBrowser(["error", "load"], () => "visible");
    const pending = loadThemeImageForTest("/a.png");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBeDefined();
    expect(attempts()).toBe(2);
  });

  it("fails after the single retry", async () => {
    const attempts = stubBrowser(["error", "error"], () => "visible");
    const pending = loadThemeImageForTest("/b.png");
    const assertion = expect(pending).rejects.toThrow("Cannot load theme asset: /b.png");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(attempts()).toBe(2);
  });

  it("does not report a failure that lands while the page is hiding", async () => {
    stubBrowser(["error", "error"], () => "hidden");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = loadThemeImageForTest("/c.png");
    const caught = pending.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(1_000);
    const reason = await caught;
    expect(reason).toBeInstanceOf(ThemeAssetInterruptedError);
    reportThemeAssetError(reason);
    expect(error).not.toHaveBeenCalled();
    reportThemeAssetError(new Error("real failure"));
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("stops after the first attempt when the page starts hiding mid-load", async () => {
    let visibility = "visible";
    const attempts = stubBrowser(["error", "load"], () => visibility);
    const pending = loadThemeImageForTest("/d.png");
    visibility = "hidden";
    const caught = pending.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await caught).toBeInstanceOf(ThemeAssetInterruptedError);
    expect(attempts()).toBe(1);
  });
});

describe("bitmap theme CJK fonts", () => {
  it("loads them in the background for English and notifies text when ready", async () => {
    stubBrowser(["load", "load", "load"], () => "visible");
    const loadFont = vi.fn(async (font: string) => [
      { family: font.split(" ").at(-1), status: "loaded" },
    ]);
    Object.assign(document, { fonts: { load: loadFont } });

    let releaseFonts!: () => void;
    const fontStylesheet = new Promise<void>((resolve) => (releaseFonts = resolve));
    const artwork = macintoshArtwork(UiColorScheme.Light);
    const theme: UiTheme = {
      id: "background-cjk",
      label: "background-cjk",
      cursors: {},
      typography: asepriteTypography,
      load: async () => ({
        ...artwork,
        definition: { ...artwork.definition, typography: asepriteTypography },
      }),
      loadCjkFonts: () => fontStylesheet,
    };

    const initial = await preloadThemeAssets(UiColorScheme.Light, "en", theme);
    expect(initial.cjkFontReady).toBe(false);
    const updated = new Promise<void>((resolve) =>
      subscribeThemeAssets(UiColorScheme.Light, theme, resolve),
    );
    releaseFonts();
    await updated;
    expect(getThemeAssets(UiColorScheme.Light, theme)?.cjkFontReady).toBe(true);
    expect(loadFont).toHaveBeenCalledWith("14px FusionPixel10Aseprite", "图");
    expect(loadFont).toHaveBeenCalledWith("12px FusionPixel12", "图");
  });
});
