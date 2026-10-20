import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { keyboardEventKey } from "$/base/utils/keyboard-event-key";
import { menuMnemonicMatch } from "$/components/menu/policy";

describe("keyboardEventKey", () => {
  it("returns the browser key name", () => {
    assert.equal(keyboardEventKey({ key: "a" }), "a");
    assert.equal(keyboardEventKey({ key: "ArrowDown" }), "ArrowDown");
  });

  it("returns an empty key for Safari autofill/IME events without a key", () => {
    assert.equal(keyboardEventKey({}), "");
    assert.equal(keyboardEventKey({ key: undefined }), "");
    assert.equal(keyboardEventKey({ key: null }), "");
    assert.equal(keyboardEventKey({ key: undefined }).toLowerCase(), "");
    assert.equal(keyboardEventKey({ key: undefined }).length, 0);
  });
});

describe("menuMnemonicMatch", () => {
  const items = [
    { label: "File", mnemonic: "F" },
    { label: "Edit", mnemonic: "E" },
  ];

  it("matches mnemonics case-insensitively", () => {
    assert.equal(menuMnemonicMatch(items, "e"), 1);
  });

  it("finds no mnemonic for a missing key", () => {
    assert.equal(menuMnemonicMatch(items, undefined), -1);
    assert.equal(menuMnemonicMatch(items, ""), -1);
  });
});
