// The dependency's portable internal entry has no bundled declarations.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./qrcode-core.d.ts" />
import QRCode from "qrcode/lib/core/qrcode.js";

import type { PixelBuffer } from "$/base";

const QUIET_ZONE = 4;
const CHANNELS = 4;
const OPAQUE = 255;

/** Shared raster renderer for URL and binary QR codes, with a four-module margin. */
export function qrCodePixels(input: string | Uint8Array, scale: number): PixelBuffer {
  const code = QRCode.create(typeof input === "string" ? input : [{ data: input, mode: "byte" }], {
    errorCorrectionLevel: "M",
  });
  const size = (code.modules.size + QUIET_ZONE * 2) * scale;
  const data = new Uint8ClampedArray(size * size * CHANNELS).fill(OPAQUE);
  for (let y = 0; y < code.modules.size; y++)
    for (let x = 0; x < code.modules.size; x++) {
      if (!code.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const offset =
            (((y + QUIET_ZONE) * scale + dy) * size + (x + QUIET_ZONE) * scale + dx) * CHANNELS;
          data[offset] = data[offset + 1] = data[offset + 2] = 0;
        }
    }
  return { width: size, height: size, data };
}
