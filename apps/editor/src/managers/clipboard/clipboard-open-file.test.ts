import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  CLIPBOARD_OPEN_FILE_NAME,
  fileFromClipboardImage,
} from "$/managers/clipboard/clipboard-open-file";

describe("fileFromClipboardImage", () => {
  it("wraps clipboard pixels as a PNG File for Import Options", async () => {
    const file = await fileFromClipboardImage(
      {
        pixels: { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) },
        mask: null,
      },
      async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    );
    assert.equal(file.name, CLIPBOARD_OPEN_FILE_NAME);
    assert.equal(file.type, "image/png");
    assert.equal(file.size, 3);
  });
});
