import assert from "node:assert/strict";

import decodeQr from "qr/decode.js";
import { it } from "vitest";

import { qrCodePixels } from "$/import-export/qr-code";
import {
  ShareTextEncoding,
  encodeShareText,
  decodeShareText,
} from "$/import-export/sharing/link-encoding";

const QR_SCALE = 4;
const QR_SCAN_TIMEOUT_MS = 2_000;
const LINK_PREFIX = "https://xprite.cc/editor#share=";
const PAYLOAD_BYTES = 1_600;

it("scans dense QR URLs and recovers the complete binary payload in every alphabet", () => {
  let seed = 0x539b2e1d;
  const bytes = Uint8Array.from({ length: PAYLOAD_BYTES }, () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed & 255;
  });
  const widths = new Map<ShareTextEncoding, number>();
  for (const encoding of Object.values(ShareTextEncoding)) {
    const url = LINK_PREFIX + encoding + encodeShareText(bytes, encoding);
    const pixels = qrCodePixels(url, QR_SCALE);
    const scanned = decodeQr(pixels, { effort: Infinity, timeLimit: QR_SCAN_TIMEOUT_MS });
    assert.equal(scanned, url);
    const text = new URL(scanned).hash.slice("#share=".length + 1);
    assert.deepEqual(decodeShareText(text, encoding, bytes.length), bytes);
    widths.set(encoding, pixels.width);
  }
  assert.ok(widths.get(ShareTextEncoding.Base43)! <= widths.get(ShareTextEncoding.Base32)!);
  assert.ok(widths.get(ShareTextEncoding.Base32)! <= widths.get(ShareTextEncoding.Base64Url)!);
});
