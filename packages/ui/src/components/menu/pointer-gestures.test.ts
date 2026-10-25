import { describe, expect, it } from "vitest";

import { isMenuPressPointer } from "$/components/menu/pointer-gestures";

describe("isMenuPressPointer", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "accepts primary-button %s for Press activation",
    (pointerType) => {
      expect(isMenuPressPointer({ pointerType, button: 0 })).toBe(true);
    },
  );

  it("rejects non-primary buttons including pen eraser", () => {
    expect(isMenuPressPointer({ pointerType: "pen", button: 5 })).toBe(false);
    expect(isMenuPressPointer({ pointerType: "mouse", button: 2 })).toBe(false);
    expect(isMenuPressPointer({ pointerType: "touch", button: 1 })).toBe(false);
  });

  it("rejects unknown pointer types", () => {
    expect(isMenuPressPointer({ pointerType: "", button: 0 })).toBe(false);
    expect(isMenuPressPointer({ pointerType: "other", button: 0 })).toBe(false);
  });
});
