/** Small browser-crypto compatibility helpers for application runtimes.
 *
 * Web Crypto's randomUUID() and subtle.digest() are unavailable to some
 * browsers when the app is opened over plain HTTP (for example, by a
 * Tailscale IP). Keep the native implementations when available, but retain
 * stable IDs and SHA-256 checksums for that deployment mode too.
 */

type RuntimeCrypto = Crypto & { randomUUID?: () => string };

function runtimeCrypto(): RuntimeCrypto | undefined {
  return typeof globalThis.crypto === "object" ? (globalThis.crypto as RuntimeCrypto) : undefined;
}

let fallbackCounter = 0;

function fillFallbackRandom(bytes: Uint8Array): void {
  let state = (Date.now() + ++fallbackCounter) >>> 0;
  for (let index = 0; index < bytes.length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = (state ^ Math.floor(Math.random() * 0x100000000)) & 0xff;
  }
}

/** Generate a UUID-shaped ID even when crypto.randomUUID is unavailable. */
export function randomId(): string {
  const crypto = runtimeCrypto();
  if (typeof crypto?.randomUUID === "function") {
    try {
      return crypto.randomUUID.call(crypto);
    } catch {
      // Fall through to getRandomValues or the local compatibility generator.
    }
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === "function") {
    try {
      crypto.getRandomValues(bytes);
    } catch {
      fillFallbackRandom(bytes);
    }
  } else {
    fillFallbackRandom(bytes);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Fallback(bytes: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const highLength = Math.floor(bytes.length / 0x20000000);
  const lowLength = (bytes.length << 3) >>> 0;
  const lengthOffset = paddedLength - 8;
  message[lengthOffset] = highLength >>> 24;
  message[lengthOffset + 1] = highLength >>> 16;
  message[lengthOffset + 2] = highLength >>> 8;
  message[lengthOffset + 3] = highLength;
  message[lengthOffset + 4] = lowLength >>> 24;
  message[lengthOffset + 5] = lowLength >>> 16;
  message[lengthOffset + 6] = lowLength >>> 8;
  message[lengthOffset + 7] = lowLength;

  const hash = new Uint32Array(SHA256_INITIAL);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const position = offset + index * 4;
      schedule[index] =
        (message[position] << 24) |
        (message[position + 1] << 16) |
        (message[position + 2] << 8) |
        message[position + 3];
    }
    for (let index = 16; index < 64; index++) {
      const previous = schedule[index - 15];
      const older = schedule[index - 2];
      const small0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
      const small1 = rotateRight(older, 17) ^ rotateRight(older, 19) ^ (older >>> 10);
      schedule[index] = (schedule[index - 16] + small0 + schedule[index - 7] + small1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const large1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + large1 + choice + SHA256_K[index] + schedule[index]) >>> 0;
      const large0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (large0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const result = new Uint8Array(32);
  hash.forEach((word, index) => {
    result[index * 4] = word >>> 24;
    result[index * 4 + 1] = word >>> 16;
    result[index * 4 + 2] = word >>> 8;
    result[index * 4 + 3] = word;
  });
  return result;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Return a stable SHA-256 checksum, including on plain HTTP origins. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = runtimeCrypto()?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
      return toHex(new Uint8Array(digest));
    } catch {
      // The compatibility implementation keeps storage usable if the native
      // implementation exists but is disabled by the current origin.
    }
  }
  return toHex(sha256Fallback(bytes));
}
