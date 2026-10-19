import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ThemeAssetInterruptedError,
  loadThemeImageForTest,
  reportThemeAssetError,
} from "$/base/theme/theme-assets-store";

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
