import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  ShareTextEncoding,
  encodeShareText,
  decodeShareText,
} from "$/import-export/sharing/link-encoding";

describe("share URL alphabets", () => {
  it.each(Object.values(ShareTextEncoding))(
    "preserves all bytes and partial groups in %s",
    (encoding) => {
      for (const length of [1, 2, 3, 4, 5, 7, 8, 9, 256, 257]) {
        const bytes = Uint8Array.from({ length }, (_, index) => index & 255);
        const text = encodeShareText(bytes, encoding);
        assert.deepEqual(decodeShareText(text, encoding, length), bytes);
        assert.match(
          text,
          encoding === ShareTextEncoding.Base43
            ? /^[0-9A-Z$*+\-./:]+Z$/
            : encoding === ShareTextEncoding.Base32
              ? /^[A-Z2-7]+$/
              : /^[A-Za-z0-9_-]+$/,
        );
        assert.throws(() => decodeShareText(text, encoding, length - 1));
      }
    },
  );
  it("rejects escapes, padding, impossible lengths and noncanonical trailing bits", () => {
    for (const text of ["", "A", "AA=", "%00", "AB"])
      assert.throws(() => decodeShareText(text, ShareTextEncoding.Base64Url, 256));
    for (const text of ["", "A", "AAA", "AA=", "aa", "AB"])
      assert.throws(() => decodeShareText(text, ShareTextEncoding.Base32, 256));
    for (const text of ["", "Z", "0Z", "00", "%00Z", "::Z", ":::Z"])
      assert.throws(() => decodeShareText(text, ShareTextEncoding.Base43, 256));
  });
  it("keeps every encoding unchanged in a URL fragment", () => {
    const bytes = Uint8Array.from({ length: 4096 }, (_, index) => (index * 37) & 255);
    for (const encoding of Object.values(ShareTextEncoding)) {
      const text = encodeShareText(bytes, encoding);
      const url = new URL(`https://xprite.cc/editor#share=${encoding}${text}`);
      assert.equal(url.hash, `#share=${encoding}${text}`);
      assert.deepEqual(
        decodeShareText(url.hash.slice("#share=".length + 1), encoding, bytes.length),
        bytes,
      );
    }
  });
});
