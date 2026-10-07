const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
// QR alphanumeric symbols that survive URL-fragment serialization unchanged.
// Base45's space and percent sign would require URL escaping.
const BASE43 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:";
const BASE43_END = "Z";
const BYTE_VALUES = 256;
const PAIR_LIMIT = BYTE_VALUES * BYTE_VALUES;
const BASE43_PAIR_CHARACTERS = 3;
const BASE43_SINGLE_CHARACTERS = 2;
const BYTE_BITS = 8;

export enum ShareTextEncoding {
  Base64Url = "U",
  Base32 = "R",
  Base43 = "Q",
}

function encodeBase43(bytes: Uint8Array): string {
  const output: string[] = [];
  for (let index = 0; index < bytes.length; index += 2) {
    const paired = index + 1 < bytes.length;
    let value = paired ? bytes[index] * BYTE_VALUES + bytes[index + 1] : bytes[index];
    for (
      let digit = 0;
      digit < (paired ? BASE43_PAIR_CHARACTERS : BASE43_SINGLE_CHARACTERS);
      digit++
    ) {
      output.push(BASE43[value % BASE43.length]);
      value = Math.floor(value / BASE43.length);
    }
  }
  // Finish with a letter so scanners cannot mistake trailing punctuation for prose.
  return output.join("") + BASE43_END;
}

function decodeBase43(text: string, maxBytes: number): Uint8Array {
  if (!text.endsWith(BASE43_END)) throw new Error("Invalid share data.");
  const data = text.slice(0, -BASE43_END.length);
  const remainder = data.length % BASE43_PAIR_CHARACTERS;
  const length = Math.floor(data.length / BASE43_PAIR_CHARACTERS) * 2 + (remainder ? 1 : 0);
  if (!length || remainder === 1 || length > maxBytes) throw new Error("Invalid share data.");
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (let index = 0; index < data.length; index += BASE43_PAIR_CHARACTERS) {
    const digits = Math.min(BASE43_PAIR_CHARACTERS, data.length - index);
    let value = 0;
    let factor = 1;
    for (let digit = 0; digit < digits; digit++) {
      const number = BASE43.indexOf(data[index + digit]);
      if (number < 0) throw new Error("Invalid share data.");
      value += number * factor;
      factor *= BASE43.length;
    }
    if (value >= (digits === BASE43_PAIR_CHARACTERS ? PAIR_LIMIT : BYTE_VALUES))
      throw new Error("Invalid share data.");
    if (digits === BASE43_PAIR_CHARACTERS) bytes[cursor++] = Math.floor(value / BYTE_VALUES);
    bytes[cursor++] = value % BYTE_VALUES;
  }
  return bytes;
}

/** RFC 4648 alphabets; no padding, percent escapes or URL punctuation. */
export function encodeShareText(bytes: Uint8Array, encoding: ShareTextEncoding): string {
  if (encoding === ShareTextEncoding.Base43) return encodeBase43(bytes);
  const alphabet = encoding === ShareTextEncoding.Base32 ? BASE32 : BASE64_URL;
  const bits = Math.log2(alphabet.length);
  let buffer = 0;
  let available = 0;
  const output: string[] = [];
  for (const byte of bytes) {
    buffer = (buffer << BYTE_BITS) | byte;
    available += BYTE_BITS;
    while (available >= bits) {
      available -= bits;
      output.push(alphabet[(buffer >>> available) & (alphabet.length - 1)]);
    }
  }
  if (available) output.push(alphabet[(buffer << (bits - available)) & (alphabet.length - 1)]);
  return output.join("");
}

export function decodeShareText(
  text: string,
  encoding: ShareTextEncoding,
  maxBytes: number,
): Uint8Array {
  if (encoding === ShareTextEncoding.Base43) return decodeBase43(text, maxBytes);
  const alphabet = encoding === ShareTextEncoding.Base32 ? BASE32 : BASE64_URL;
  const bits = Math.log2(alphabet.length);
  const length = Math.floor((text.length * bits) / BYTE_BITS);
  if (!text.length || length > maxBytes || Math.ceil((length * BYTE_BITS) / bits) !== text.length)
    throw new Error("Invalid share data.");
  const output = new Uint8Array(length);
  let buffer = 0;
  let available = 0;
  let cursor = 0;
  for (const character of text) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Invalid share data.");
    buffer = (buffer << bits) | value;
    available += bits;
    if (available >= BYTE_BITS) {
      available -= BYTE_BITS;
      output[cursor++] = (buffer >>> available) & 255;
    }
  }
  if (available && buffer & (2 ** available - 1)) throw new Error("Invalid share data.");
  return output;
}
