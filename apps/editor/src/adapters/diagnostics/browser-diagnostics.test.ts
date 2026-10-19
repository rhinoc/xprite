import { describe, expect, it } from "vitest";

import { isOpaqueScriptError } from "$/adapters/diagnostics/browser-diagnostics";

describe("isOpaqueScriptError", () => {
  it("ignores the masked cross-origin error", () => {
    expect(isOpaqueScriptError({ message: "Script error.", filename: "", lineno: 0 })).toBe(true);
    expect(isOpaqueScriptError({ message: "Script error", error: null })).toBe(true);
  });

  it("keeps errors that carry any location or error object", () => {
    expect(isOpaqueScriptError({ message: "Script error.", error: new Error("x") })).toBe(false);
    expect(
      isOpaqueScriptError({
        message: "Script error.",
        filename: "https://xprite.cc/a.js",
        lineno: 3,
      }),
    ).toBe(false);
    expect(isOpaqueScriptError({ message: "Uncaught TypeError: x is undefined" })).toBe(false);
  });
});
