import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createClipboardActions, ImageClipboard } from "$/managers/clipboard/index";

const pixel = (color: number[]) => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(color),
});

describe("canPasteNewSprite enablement", () => {
  it("stays enabled when only clipboard.read exists and permission is unknown (no peek yet)", () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      isClipboardReadGranted: async () => false,
      peekImage: async () => false,
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    // First Open from Clipboard / Paste as New Sprite click must stay available so the
    // browser can show the clipboard permission prompt under the user gesture.
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
    assert.equal(clipboard.hasSystemClipboardAccess, false);
  });

  it("skips peek when clipboard-read is not yet granted", async () => {
    let peeked = false;
    const clipboard = new ImageClipboard({
      canRead: () => true,
      isClipboardReadGranted: async () => false,
      peekImage: async () => {
        peeked = true;
        return false;
      },
      read: async () => null,
      write: async () => {},
    });
    await clipboard.probeSystemImage();
    assert.equal(peeked, false);
    assert.equal(clipboard.hasSystemClipboardAccess, false);
    assert.equal(clipboard.hasSystemImage, false);
  });

  it("after granted permission, peek disables when the OS clipboard has no image", async () => {
    let present = false;
    const clipboard = new ImageClipboard({
      canRead: () => true,
      isClipboardReadGranted: async () => true,
      peekImage: async () => present,
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
    present = false;
    await clipboard.probeSystemImage();
    assert.equal(clipboard.hasSystemClipboardAccess, true);
    assert.equal(clipboard.hasSystemImage, false);
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
    present = true;
    await clipboard.probeSystemImage();
    assert.equal(clipboard.hasSystemImage, true);
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
  });

  it("enables from a workspace image copy even when the OS write fails", async () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      isClipboardReadGranted: async () => false,
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

  it("click-path empty OS read confirms access and disables without a prior menu peek", async () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      isClipboardReadGranted: async () => false,
      peekImage: async () => {
        throw new Error("menu peek should not be required");
      },
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
    assert.equal(await clipboard.read(), null);
    assert.equal(clipboard.hasSystemClipboardAccess, true);
    assert.equal(clipboard.hasSystemImage, false);
    assert.equal(actions.getCapabilities().canPasteNewSprite, false);
  });

  it("leaves enablement unchanged when peek cannot tell (permission denied)", async () => {
    const clipboard = new ImageClipboard({
      canRead: () => true,
      isClipboardReadGranted: async () => true,
      peekImage: async () => null,
      read: async () => null,
      write: async () => {},
    });
    const actions = createClipboardActions({
      getCore: () => null,
      createDocument: () => {},
      clipboard,
    });
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
    await clipboard.probeSystemImage();
    assert.equal(clipboard.hasSystemClipboardAccess, false);
    assert.equal(clipboard.hasSystemImage, false);
    assert.equal(actions.getCapabilities().canPasteNewSprite, true);
  });
});
