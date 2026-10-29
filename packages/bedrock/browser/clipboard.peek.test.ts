import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { browserClipboard } from "./clipboard";

describe("browserClipboard.peekImage", () => {
  it("returns null when clipboard.read is unavailable", async () => {
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: {} },
    });
    try {
      assert.equal(await browserClipboard.peekImage(), null);
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: previous });
    }
  });

  it("returns false when readable items have no image type", async () => {
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          read: async () => [{ types: ["text/plain"], getType: async () => new Blob(["x"]) }],
        },
      },
    });
    try {
      assert.equal(await browserClipboard.peekImage(), false);
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: previous });
    }
  });

  it("returns true when an image MIME is present without decoding", async () => {
    let gotType = false;
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          read: async () => [
            {
              types: ["image/png"],
              getType: async () => {
                gotType = true;
                return new Blob();
              },
            },
          ],
        },
      },
    });
    try {
      assert.equal(await browserClipboard.peekImage(), true);
      assert.equal(gotType, false);
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: previous });
    }
  });
});
