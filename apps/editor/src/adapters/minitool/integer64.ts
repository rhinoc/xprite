const INTEGER_BYTES = 8;
const BYTE_RADIX = 256;
const DECIMAL_RADIX = 10;
const SIGN_BIT = 128;

function negate(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(INTEGER_BYTES);
  let carry = 1;
  for (let index = 0; index < INTEGER_BYTES; index++) {
    const value = (bytes[index] ^ (BYTE_RADIX - 1)) + carry;
    result[index] = value % BYTE_RADIX;
    carry = Math.floor(value / BYTE_RADIX);
  }
  return result;
}

/** Exact decimal conversion without Number precision loss or host BigInt support. */
export function encodeInteger64(value: unknown, unsigned: boolean): Uint8Array {
  if (typeof value !== "string" || !/^-?\d+$/.test(value))
    throw new Error("Expected a decimal 64-bit integer");
  const negative = value.startsWith("-") && /[1-9]/.test(value);
  if (unsigned && negative) throw new Error("64-bit integer is out of range");
  let decimal = value.replace(/^-/, "").replace(/^0+/, "") || "0";
  const bytes = new Uint8Array(INTEGER_BYTES);
  for (let index = 0; index < INTEGER_BYTES; index++) {
    let remainder = 0;
    let quotient = "";
    for (const digit of decimal) {
      const part = remainder * DECIMAL_RADIX + Number(digit);
      quotient += Math.floor(part / BYTE_RADIX);
      remainder = part % BYTE_RADIX;
    }
    bytes[index] = remainder;
    decimal = quotient.replace(/^0+/, "") || "0";
  }
  const signedMinimum =
    bytes[INTEGER_BYTES - 1] === SIGN_BIT &&
    bytes.subarray(0, INTEGER_BYTES - 1).every((byte) => byte === 0);
  if (
    decimal !== "0" ||
    (!unsigned && bytes[INTEGER_BYTES - 1] >= SIGN_BIT && !(negative && signedMinimum))
  )
    throw new Error("64-bit integer is out of range");
  return negative ? negate(bytes) : bytes;
}

export function decodeInteger64(bytes: Uint8Array, unsigned: boolean): string {
  if (bytes.length !== INTEGER_BYTES) throw new Error("64-bit integer requires eight bytes");
  const negative = !unsigned && bytes[INTEGER_BYTES - 1] >= SIGN_BIT;
  const magnitude = negative ? negate(bytes) : bytes;
  let decimal = "0";
  for (let index = INTEGER_BYTES - 1; index >= 0; index--) {
    let carry = magnitude[index];
    let next = "";
    for (let digit = decimal.length - 1; digit >= 0; digit--) {
      const part = Number(decimal[digit]) * BYTE_RADIX + carry;
      next = String(part % DECIMAL_RADIX) + next;
      carry = Math.floor(part / DECIMAL_RADIX);
    }
    decimal = (carry ? String(carry) : "") + next;
  }
  decimal = decimal.replace(/^0+/, "") || "0";
  return negative ? "-" + decimal : decimal;
}
