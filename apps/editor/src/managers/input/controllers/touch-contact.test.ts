import { describe, expect, it } from "vitest";

import {
  createTouchContact,
  isTouchTap,
  updateTouchContact,
} from "$/managers/input/controllers/touch-contact";

const SLOP = 12; // editor-canvas touchTapSlop, in CSS pixels

describe("touch contact", () => {
  it("tracks the maximum drift, including movement that returns before release", () => {
    for (const [distance, moved] of [
      [8, false],
      [12, false],
      [13, true],
    ] as const) {
      const contact = createTouchContact(100, 100, 0);
      updateTouchContact(contact, 100, 100 + distance, SLOP);
      updateTouchContact(contact, 100, 100, SLOP);
      expect(contact.moved, `${distance}px`).toBe(moved);
      expect(isTouchTap(contact.startedAt, 66, contact.moved, 300)).toBe(!moved);
    }
  });
});
