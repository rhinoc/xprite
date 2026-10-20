import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { normalizeKeyboardEvent } from "$/keyboard";

const event = (key: unknown, code: unknown) =>
  ({
    key,
    code,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
  }) as unknown as KeyboardEvent;

describe("keyboard key normalization", () => {
  it("keeps the browser key semantics", () => {
    assert.deepEqual(normalizeKeyboardEvent(event("a", "KeyA")), {
      key: "a",
      code: "KeyA",
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
      repeat: false,
    });
  });

  it("turns a missing key or code into an empty string", () => {
    const stroke = normalizeKeyboardEvent(event(undefined, undefined));
    assert.equal(stroke.key, "");
    assert.equal(stroke.code, "");
    assert.equal(stroke.ctrl, true);
  });
});
