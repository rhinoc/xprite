import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { ShortcutManager } from "$/managers/shortcuts/shortcut-manager";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";

const emptyStorage = createJsonStorage({ getItem: () => null, setItem: () => {} });

describe("menu shortcut labels", () => {
  it("shows only the first binding of a multi-shortcut command", () => {
    const manager = new ShortcutManager(emptyStorage);
    assert.equal(manager.formatShortcut("GotoNextTab"), "Ctrl+Tab");
    assert.equal(manager.formatShortcut("GotoPreviousTab"), "Ctrl+Shift+Tab");
  });

  it("trims a multi-shortcut fallback label to the first binding", () => {
    const manager = new ShortcutManager(emptyStorage);
    assert.equal(manager.formatShortcut("NoSuchCommand", undefined, "Ctrl+A, Ctrl+B"), "Ctrl+A");
  });
});
