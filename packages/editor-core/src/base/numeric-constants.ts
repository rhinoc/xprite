export {
  BITS_PER_BYTE,
  BYTE_ROUNDING_BIAS,
  INT16_MAX,
  INT16_MIN,
  UINT8_MAX,
  UINT8_MIDPOINT,
  UINT16_MAX,
  UINT16_VALUE_COUNT,
} from "@xprite/bedrock/common/numeric-constants";
import { UINT16_VALUE_COUNT } from "@xprite/bedrock/common/numeric-constants";

/** Scale and midpoint used by signed 16.16 fixed-point transforms. */
export const FIXED_POINT_16_16_SCALE = UINT16_VALUE_COUNT;
export const FIXED_POINT_16_16_HALF = 0x8000;
export const FIXED_POINT_16_16_MAX = FIXED_POINT_16_16_HALF - 1;
