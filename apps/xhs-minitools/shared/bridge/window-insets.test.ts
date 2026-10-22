import { describe, expect, it } from "vitest";

import { windowTopInset } from "$/shared/bridge/window-insets";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("windowTopInset", () => {
  it("clears the lowest visible native button with a small gap", () => {
    expect(
      windowTopInset({
        statusBarHeight: 47,
        safeArea: rect(0, 47, 390, 763),
        menuButtons: { back: rect(8, 51, 32, 32), me: null, share: rect(302, 51, 80, 32.5) },
      }),
    ).toBe(88);
  });

  it("uses the safe area when every button is hidden", () => {
    expect(
      windowTopInset({
        safeArea: rect(0, 24, 390, 820),
        menuButtons: { back: null, me: null, share: null },
      }),
    ).toBe(24);
  });

  it("falls back to the status bar and reports nothing without geometry", () => {
    expect(windowTopInset({ statusBarHeight: 30 })).toBe(30);
    expect(windowTopInset({})).toBeNull();
  });
});
