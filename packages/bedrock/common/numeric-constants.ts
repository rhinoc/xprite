/** Generic numeric limits for values stored in binary formats. */
export const BITS_PER_BYTE = 8;
export const UINT8_VALUE_COUNT = 0x100;
export const UINT8_MAX = UINT8_VALUE_COUNT - 1;
export const UINT8_MIDPOINT = 0x80;
export const BYTE_ROUNDING_BIAS = 0.5;

export const UINT16_VALUE_COUNT = 0x1_0000;
export const UINT16_MAX = UINT16_VALUE_COUNT - 1;
export const INT16_MIN = -0x8000;
export const INT16_MAX = 0x7fff;
export const UINT32_MAX = 0xffff_ffff;
