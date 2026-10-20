import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { keyboardKey } from "./keyboard-key";

describe("keyboardKey", () => {
  it("keeps key names and replaces a missing key with an empty string", () => {
    assert.equal(keyboardKey("Escape"), "Escape");
    assert.equal(keyboardKey(undefined), "");
    assert.equal(keyboardKey(null), "");
  });
});
