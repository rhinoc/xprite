import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  ClipboardPasteIntent,
  ClipboardPasteSource,
  resolveClipboardPasteSource,
} from "$/managers/clipboard/paste-source";

describe("clipboard paste-source", () => {
  it("menu paste (File Open from Clipboard / Edit Paste as New Sprite) reads the system clipboard", () => {
    assert.equal(
      resolveClipboardPasteSource(
        { intent: ClipboardPasteIntent.Menu, hasEventImage: false },
        false,
      ),
      ClipboardPasteSource.System,
    );
    assert.equal(
      resolveClipboardPasteSource({ intent: ClipboardPasteIntent.Menu, hasEventImage: true }, true),
      ClipboardPasteSource.System,
    );
  });

  it("keyboard paste prefers workspace when the event has no image", () => {
    assert.equal(
      resolveClipboardPasteSource(
        { intent: ClipboardPasteIntent.Keyboard, hasEventImage: false },
        true,
      ),
      ClipboardPasteSource.Workspace,
    );
  });

  it("keyboard paste with an event image uses system only when the app already copied an image", () => {
    assert.equal(
      resolveClipboardPasteSource(
        { intent: ClipboardPasteIntent.Keyboard, hasEventImage: true },
        true,
      ),
      ClipboardPasteSource.System,
    );
    assert.equal(
      resolveClipboardPasteSource(
        { intent: ClipboardPasteIntent.Keyboard, hasEventImage: true },
        false,
      ),
      ClipboardPasteSource.Event,
    );
  });
});
