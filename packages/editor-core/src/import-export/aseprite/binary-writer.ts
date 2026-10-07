import { AsepriteCodecError } from "$/import-export/aseprite/decode";

const WRITER_BLOCK_BYTES = 4096;
const UINT16_MODULUS = 0x10000;
const UINT32_MODULUS = 0x100000000;

/** Append byte spans without expanding raster data into JavaScript numbers. */
export class Writer {
  private readonly spans: { offset: number; bytes: Uint8Array }[] = [];
  private block: Uint8Array | null = null;
  private used = 0;
  private size = 0;

  get length(): number {
    return this.size;
  }

  private flush(): void {
    if (this.block && this.used)
      this.spans.push({ offset: this.size - this.used, bytes: this.block.subarray(0, this.used) });
    this.block = null;
    this.used = 0;
  }

  u8(value: number): void {
    if (this.used === WRITER_BLOCK_BYTES) this.flush();
    this.block ??= new Uint8Array(WRITER_BLOCK_BYTES);
    this.block[this.used++] = value;
    this.size++;
  }
  u16(value: number): void {
    this.u8(value);
    this.u8(value >>> 8);
  }
  i16(value: number): void {
    this.u16(value < 0 ? value + UINT16_MODULUS : value);
  }
  u32(value: number): void {
    this.u16(value);
    this.u16(value >>> 16);
  }
  i32(value: number): void {
    this.u32(value < 0 ? value + UINT32_MODULUS : value);
  }
  bytes(bytes: Uint8Array): void {
    if (!bytes.byteLength) return;
    this.flush();
    this.spans.push({ offset: this.size, bytes });
    this.size += bytes.byteLength;
  }
  pad(count: number): void {
    this.bytes(new Uint8Array(count));
  }
  string(value: string, maxBytes: number): void {
    const encoded = encodeUtf8(value);
    if (encoded.byteLength > maxBytes || encoded.byteLength >= UINT16_MODULUS)
      throw new AsepriteCodecError(`String exceeds ${maxBytes} bytes`);
    this.u16(encoded.byteLength);
    this.bytes(encoded);
  }
  patchU32(offset: number, value: number): void {
    if (offset < 0 || offset + 4 > this.size)
      throw new AsepriteCodecError("Invalid writer patch offset");
    this.flush();
    for (let byte = 0; byte < 4; byte++) {
      const at = offset + byte;
      let low = 0;
      let high = this.spans.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (this.spans[mid].offset <= at) low = mid;
        else high = mid - 1;
      }
      const span = this.spans[low];
      span.bytes[at - span.offset] = value >>> (byte * 8);
    }
  }
  toBytes(): Uint8Array {
    this.flush();
    const result = new Uint8Array(this.size);
    for (const span of this.spans) result.set(span.bytes, span.offset);
    return result;
  }
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        index += 1;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return Uint8Array.from(bytes);
}
