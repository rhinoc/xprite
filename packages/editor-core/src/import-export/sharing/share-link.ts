import type { PixelBuffer } from "$/base";
import { qrCodePixels } from "$/import-export/qr-code";
import { restoreSharedAseprite } from "$/import-export/sharing/aseprite-packing";
import {
  ShareTextEncoding,
  decodeShareText,
  encodeShareText,
} from "$/import-export/sharing/link-encoding";
import {
  sharedProjectCandidates,
  type ShareProjectSource,
} from "$/import-export/sharing/share-project";

export const SHARE_FRAGMENT_PREFIX = "#share=";
const QR_SCALE = 4;
const BASE64_BYTES_PER_GROUP = 3;
const BASE64_CHARACTERS_PER_GROUP = 4;
const PACKED_SIZE_FACTOR = 2;

export interface ShareLinkLimits {
  maxUrlCharacters: number;
  maxProjectBytes: number;
}

/** Compression runtimes may use native or WASM implementations. The reversible
 * payload, winner selection, URL format and QR choice are platform independent. */
export interface ShareCompressionCodec {
  compress(input: Uint8Array): Promise<Uint8Array>;
  refine(input: Uint8Array, best: Uint8Array): Promise<Uint8Array>;
  decompress(input: Uint8Array, maxBytes: number): Promise<Uint8Array>;
}

export interface ShareLinkResult {
  url: string | null;
  urlCharacters: number;
  frameCount: number;
  layerCount: number;
  qr: PixelBuffer | null;
}

export async function encodeSharedProject(
  source: ShareProjectSource,
  baseUrl: string,
  limits: ShareLinkLimits,
  compression: ShareCompressionCodec,
): Promise<ShareLinkResult> {
  const { candidates, frameCount, layerCount } = sharedProjectCandidates(
    source,
    limits.maxProjectBytes,
  );
  let smallest: Uint8Array | undefined;
  let winning: Uint8Array | undefined;
  for (const candidate of candidates) {
    const compressed = await compression.compress(candidate);
    if (!smallest || compressed.length < smallest.length) {
      smallest = compressed;
      winning = candidate;
    }
  }
  if (!smallest || !winning) throw new Error("Unable to share this project.");
  const bytes = await compression.refine(winning, smallest);
  const prefix = baseUrl + SHARE_FRAGMENT_PREFIX;
  const urlCharacters =
    prefix.length +
    ShareTextEncoding.Base64Url.length +
    Math.ceil((bytes.length * BASE64_CHARACTERS_PER_GROUP) / BASE64_BYTES_PER_GROUP);
  const counts = { frameCount, layerCount };
  if (urlCharacters > limits.maxUrlCharacters)
    return { url: null, urlCharacters, ...counts, qr: null };
  const url =
    prefix + ShareTextEncoding.Base64Url + encodeShareText(bytes, ShareTextEncoding.Base64Url);
  let qr: PixelBuffer | null = null;
  for (const encoding of Object.values(ShareTextEncoding)) {
    const link =
      encoding === ShareTextEncoding.Base64Url
        ? url
        : prefix + encoding + encodeShareText(bytes, encoding);
    if (link.length > limits.maxUrlCharacters) continue;
    try {
      const candidate = qrCodePixels(link, QR_SCALE);
      if (!qr || candidate.width < qr.width) qr = candidate;
    } catch {
      // QR capacity is independent of whether this URL can still be copied.
    }
  }
  return { url, urlCharacters, ...counts, qr };
}

export async function decodeSharedProject(
  text: string,
  limits: ShareLinkLimits,
  compression: ShareCompressionCodec,
): Promise<{ bytes: Uint8Array; name: string }> {
  if (text.length > limits.maxUrlCharacters)
    throw new Error("This share link is too long. Ask for an exported file instead.");
  const encoding = text[0] as ShareTextEncoding;
  if (!Object.values(ShareTextEncoding).includes(encoding)) throw new Error("Invalid share data.");
  const compressed = decodeShareText(text.slice(1), encoding, limits.maxUrlCharacters);
  const packed = await compression.decompress(
    compressed,
    limits.maxProjectBytes * PACKED_SIZE_FACTOR,
  );
  return restoreSharedAseprite(packed, limits.maxProjectBytes);
}
