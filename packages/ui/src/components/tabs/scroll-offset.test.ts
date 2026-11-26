import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { scrollOffsetForTab } from "$/components/tabs/scroll-offset";

describe("scrollOffsetForTab", () => {
  it("keeps scroll unchanged when the active tab is already visible between pinned controls", () => {
    assert.equal(scrollOffsetForTab(160, 160, 0, 1280, 0, 96), 0);
    assert.equal(scrollOffsetForTab(320, 160, 100, 1280, 32, 96), 100);
  });

  it("scrolls right so an overflowing rightmost tab sits flush before trailing controls", () => {
    // 9 tabs * 160px = 1440px in a 1280px viewport with 96px sticky trailing controls (visibleEnd = 1184)
    assert.equal(scrollOffsetForTab(1280, 160, 0, 1280, 0, 96), 256);
  });

  it("scrolls left so an offscreen leading tab clears sticky leading controls", () => {
    assert.equal(scrollOffsetForTab(32, 160, 256, 1280, 32, 96), 0);
    assert.equal(scrollOffsetForTab(160, 160, 256, 1280, 32, 96), 128);
  });

  it("aligns the tab start when a single tab is wider than the available strip", () => {
    assert.equal(scrollOffsetForTab(200, 300, 0, 240, 32, 96), 168);
  });
});
