import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { SHORTCUT_DEFINITIONS, ShortcutManager } from "$/managers/shortcuts/shortcut-manager";

const createManager = () => new ShortcutManager({ getItem: () => null, setItem: () => {} });

describe("brush shortcuts", () => {
  it("uses the original size keys, including a shifted plus and keypad plus", () => {
    const manager = createManager();
    for (const input of [
      { key: "=" },
      { key: "+" },
      { key: "+", shift: true },
      { key: "=", shift: true },
    ])
      assert.equal(manager.resolve(input, null)?.type, "brush-grow");
    assert.equal(manager.resolve({ key: "-" }, null)?.type, "brush-shrink");
    assert.equal(manager.resolve({ key: "[" }, null)?.type, "palette-previous");
    assert.equal(manager.resolve({ key: "]" }, null)?.type, "palette-next");
  });

  it("respects customization for all default grow bindings", () => {
    const manager = createManager();
    const grow = SHORTCUT_DEFINITIONS.find((entry) => entry.command?.type === "brush-grow");
    assert.ok(grow);
    manager.apply(manager.update(manager.beginDraft(), grow.key, ["F8"]));
    assert.equal(manager.resolve({ key: "F8" }, null)?.type, "brush-grow");
    for (const input of [{ key: "=" }, { key: "+" }, { key: "+", shift: true }])
      assert.equal(manager.resolve(input, { type: "brush-grow" }), null);
  });

  it("tracks physical Control while typing and clears it on release or loss of focus", () => {
    const manager = createManager();
    assert.equal(manager.isControlPressed(), false);
    manager.setPressedKey("Control", true, true);
    assert.equal(manager.isControlPressed(), true);
    manager.setPressedKey("Control", false);
    assert.equal(manager.isControlPressed(), false);
    manager.setPressedKey("Control", true);
    manager.clearPressedKeys();
    assert.equal(manager.isControlPressed(), false);
  });
});
