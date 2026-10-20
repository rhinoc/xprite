import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { inputToShortcut, shortcutMatches } from "$/managers/shortcuts/shortcut-input";
import {
  SHORTCUT_DEFINITIONS,
  ShortcutBindingKind,
  ShortcutManager,
} from "$/managers/shortcuts/shortcut-manager";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";
import { normalizeKeyboardEvent } from "@xprite/bedrock/browser/keyboard";
import type { ShortcutInput } from "@xprite/editor-core";

const createManager = () =>
  new ShortcutManager(createJsonStorage({ getItem: () => null, setItem: () => {} }));

// Safari autofill, IME and synthetic events can dispatch keydown/keyup with an
// undefined `key`, despite the DOM typing (PostHog 01a15438…).
const missingKey = (input: Omit<ShortcutInput, "key"> = {}) =>
  ({ ...input, key: undefined }) as unknown as ShortcutInput;

describe("shortcuts with a missing keyboard key", () => {
  it("does not match command shortcuts (palette popup keydown path)", () => {
    const manager = createManager();
    const params = { edit: "switch", popup: "foreground" };
    assert.equal(manager.matchesCommandShortcut(missingKey(), "PaletteEditor", params), false);
    assert.equal(manager.matchesCommandShortcut(missingKey(), "PaletteEditor"), false);
    assert.equal(manager.matchesCommandShortcut({ key: "F4" }, "PaletteEditor", params), true);
  });

  it("normalizes a DOM keyboard event without a key before matching", () => {
    const manager = createManager();
    const event = {
      key: undefined,
      code: undefined,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      repeat: false,
    } as unknown as KeyboardEvent;
    const stroke = normalizeKeyboardEvent(event);
    assert.equal(stroke.key, "");
    assert.equal(stroke.code, "");
    assert.equal(manager.matchesCommandShortcut(stroke, "PaletteEditor"), false);
  });

  it("returns no match from every shortcut resolver instead of throwing", () => {
    const manager = createManager();
    for (const modifiers of [{}, { ctrl: true }, { meta: true }, { alt: true }, { space: true }]) {
      const input = missingKey(modifiers);
      assert.equal(shortcutMatches("A", input), false);
      assert.doesNotThrow(() => manager.resolve(input, null));
      assert.doesNotThrow(() => manager.resolve(input, null, "Normal", ["Normal"]));
      assert.doesNotThrow(() => manager.resolveQuickTool(input));
      for (const definition of SHORTCUT_DEFINITIONS.filter(
        (entry) => entry.kind === ShortcutBindingKind.Action,
      ))
        assert.doesNotThrow(() => manager.resolveAction(definition.id, input));
    }
    assert.equal(manager.resolve(missingKey(), null), null);
  });

  it("records no key when capturing a shortcut from a key-less event", () => {
    assert.equal(inputToShortcut(missingKey()), "");
    assert.equal(inputToShortcut(missingKey({ ctrl: true }), true), "Ctrl");
  });
});
