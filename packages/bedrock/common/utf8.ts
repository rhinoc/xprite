const UTF8_ASCII_LIMIT = 0x80;
const UTF8_TWO_BYTE_LEAD_MIN = 0xc0;
const UTF8_THREE_BYTE_LEAD_MIN = 0xe0;
const UTF8_FOUR_BYTE_LEAD_MIN = 0xf0;
const UTF8_FOUR_BYTE_LEAD_LIMIT = 0xf8;
const UTF8_CONTINUATION_VALUE_MASK = 0x3f;
const UTF8_TWO_BYTE_VALUE_MASK = 0x1f;
const UTF8_THREE_BYTE_VALUE_MASK = 0x0f;
const UTF8_FOUR_BYTE_VALUE_MASK = 0x07;
const UTF8_CONTINUATION_BITS = 6;
const UTF8_SECOND_CONTINUATION_SHIFT = UTF8_CONTINUATION_BITS;
const UTF8_FIRST_CONTINUATION_SHIFT = UTF8_CONTINUATION_BITS * 2;
const UTF8_FOUR_BYTE_LEAD_SHIFT = UTF8_CONTINUATION_BITS * 3;
const UTF16_SURROGATE_BASE = 0xd800;
const UTF16_HIGH_SURROGATE_SHIFT = 10;
const UTF16_LOW_SURROGATE_BASE = 0xdc00;
const UTF16_SURROGATE_MASK = 0x3ff;
const UNICODE_SURROGATE_OFFSET = 0x1_0000;

/** Decodes UTF-8 bytes with replacement characters for malformed sequences. */
export function decodeUtf8(data: Uint8Array): string {
  let text = "";
  for (let index = 0; index < data.length; index += 1) {
    const first = data[index];
    if (first < UTF8_ASCII_LIMIT) {
      text += String.fromCharCode(first);
    } else if (
      first >= UTF8_TWO_BYTE_LEAD_MIN &&
      first < UTF8_THREE_BYTE_LEAD_MIN &&
      index + 1 < data.length
    ) {
      const code =
        ((first & UTF8_TWO_BYTE_VALUE_MASK) << UTF8_CONTINUATION_BITS) |
        (data[++index] & UTF8_CONTINUATION_VALUE_MASK);
      text += String.fromCharCode(code);
    } else if (
      first >= UTF8_THREE_BYTE_LEAD_MIN &&
      first < UTF8_FOUR_BYTE_LEAD_MIN &&
      index + 2 < data.length
    ) {
      const code =
        ((first & UTF8_THREE_BYTE_VALUE_MASK) << UTF8_FIRST_CONTINUATION_SHIFT) |
        ((data[++index] & UTF8_CONTINUATION_VALUE_MASK) << UTF8_SECOND_CONTINUATION_SHIFT) |
        (data[++index] & UTF8_CONTINUATION_VALUE_MASK);
      text += String.fromCharCode(code);
    } else if (
      first >= UTF8_FOUR_BYTE_LEAD_MIN &&
      first < UTF8_FOUR_BYTE_LEAD_LIMIT &&
      index + 3 < data.length
    ) {
      const code =
        ((first & UTF8_FOUR_BYTE_VALUE_MASK) << UTF8_FOUR_BYTE_LEAD_SHIFT) |
        ((data[++index] & UTF8_CONTINUATION_VALUE_MASK) << UTF8_FIRST_CONTINUATION_SHIFT) |
        ((data[++index] & UTF8_CONTINUATION_VALUE_MASK) << UTF8_SECOND_CONTINUATION_SHIFT) |
        (data[++index] & UTF8_CONTINUATION_VALUE_MASK);
      const adjusted = code - UNICODE_SURROGATE_OFFSET;
      text += String.fromCharCode(
        UTF16_SURROGATE_BASE + (adjusted >> UTF16_HIGH_SURROGATE_SHIFT),
        UTF16_LOW_SURROGATE_BASE + (adjusted & UTF16_SURROGATE_MASK),
      );
    } else {
      text += "\ufffd";
    }
  }
  return text;
}
