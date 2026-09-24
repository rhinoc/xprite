import { afterEach, expect, it, vi } from "vitest";

import { browserKeyboardLikelyAvailable } from "$/adapters/input/keyboard-capability";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["desktop", "Mozilla/5.0 Macintosh", "MacIntel", 0, false, true, true],
  ["touchscreen laptop", "Mozilla/5.0 Windows NT", "Win32", 10, false, true, true],
  ["iPad desktop mode with trackpad", "Mozilla/5.0 Macintosh", "MacIntel", 5, true, true, false],
  ["iPad mobile mode", "Mozilla/5.0 iPad", "iPad", 5, true, false, false],
  ["Android with mouse", "Mozilla/5.0 Android", "Linux", 5, true, true, false],
  ["touch device", "Mozilla/5.0", "Linux", 5, true, false, false],
])(
  "estimates keyboard availability for %s without screen dimensions",
  (_name, userAgent, platform, maxTouchPoints, coarsePointer, finePointer, expected) => {
    vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: query === "(pointer: coarse)" ? coarsePointer : finePointer,
      }),
    });
    expect(browserKeyboardLikelyAvailable()).toBe(expected);
  },
);
