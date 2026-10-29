import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createClipboardActions, ImageClipboard } from "$/managers/clipboard/index";

const pixel = (color: number[]) => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(color),
});

describe("canPasteNewSprite enablement", () => {
  it("stays disabled when only clipboard.read exists (empty / non-image OS clipboard)", () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      peekImage: async () => false,
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
  });

  it("enables after a successful system image peek (File/Edit menu probe)", async () => {
    let present = false;
    const clipboard = new ImageClipboard({
      canRead: () => true,
      peekImage: async () => present,
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
    present = true;
    await clipboard.probeSystemImage();
    assert.equal(clipboard.hasSystemImage, true);
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
    present = false;
    await clipboard.probeSystemImage();
    assert.equal(clipboard.hasSystemImage, false);
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
  });

  it("enables from a workspace image copy even when the OS write fails", async () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      peekImage: async () => false,
      read: async () => null,
      write: async () => {
        throw new Error("denied");
      },
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(await clipboard.copy({ pixels: pixel([1, 2, 3, 255]), mask: null }), true);
    assert.equal(clipboard.hasImage, true);
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
  });

  it("leaves enablement unchanged when peek cannot tell (permission denied)", async () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      peekImage: async () => null,
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
    await clipboard.probeSystemImage();
    assert.equal(clipboard.hasSystemImage, false);
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
  });
});
