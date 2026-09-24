import { UINT16_MAX, UINT16_VALUE_COUNT, UINT8_MAX } from "$/base/numeric-constants";
import { IccData, unsupportedIcc } from "$/color/icc/reader";

export type IccCurve = (value: number) => number;
const ALIGNMENT = 4;
const CURVE_HEADER_BYTES = 12;
const PARAMETRIC_HEADER_BYTES = 12;
const GAMMA_SCALE = 256;
const PARAMETER_COUNTS = [1, 3, 4, 5, 7];
const CURVE_VALIDATION_STEPS = 256;

export const unit = (value: number): number => Math.max(0, Math.min(1, value));

export function tableCurve(
  data: IccData,
  offset: number,
  count: number,
  precision: 1 | 2,
): IccCurve {
  if (count < 2 || count > UINT16_VALUE_COUNT) unsupportedIcc("invalid curve table");
  data.need(offset, count * precision);
  const sample = (index: number) =>
    precision === 1
      ? data.u8(offset + index) / UINT8_MAX
      : data.u16(offset + index * precision) / UINT16_MAX;
  return (value) => {
    const at = unit(value) * (count - 1),
      low = Math.min(count - 2, Math.floor(at));
    return sample(low) + (sample(low + 1) - sample(low)) * (at - low);
  };
}

export function parseIccCurve(
  data: IccData,
  offset = 0,
  requireMonotonic = false,
): { curve: IccCurve; bytes: number } {
  data.need(offset, CURVE_HEADER_BYTES);
  const type = data.signature(offset);
  let curve: IccCurve, bytes: number;
  if (type === "curv") {
    const count = data.u32(offset + 8);
    bytes = CURVE_HEADER_BYTES + count * 2;
    data.need(offset, bytes);
    if (count === 0) curve = (value) => value;
    else if (count === 1) {
      const gamma = data.u16(offset + CURVE_HEADER_BYTES) / GAMMA_SCALE;
      if (gamma <= 0) unsupportedIcc("invalid gamma");
      curve = (value) => Math.pow(value, gamma);
    } else {
      curve = tableCurve(data, offset + CURVE_HEADER_BYTES, count, 2);
      if (requireMonotonic)
        for (let index = 1; index < count; index++)
          if (
            data.u16(offset + CURVE_HEADER_BYTES + index * 2) <
            data.u16(offset + CURVE_HEADER_BYTES + (index - 1) * 2)
          )
            unsupportedIcc("non-monotonic tone curve");
    }
  } else if (type === "para") {
    const kind = data.u16(offset + 8),
      count = PARAMETER_COUNTS[kind];
    if (!count) unsupportedIcc("unsupported parametric curve");
    bytes = PARAMETRIC_HEADER_BYTES + count * ALIGNMENT;
    data.need(offset, bytes);
    const [g, a, b, c, d, e, f] = Array.from({ length: count }, (_, index) =>
      data.fixed(offset + PARAMETRIC_HEADER_BYTES + index * ALIGNMENT),
    );
    if (g <= 0 || (kind > 0 && a <= 0)) unsupportedIcc("invalid parametric curve");
    curve = (value) => {
      switch (kind) {
        case 0:
          return Math.pow(value, g);
        case 1:
          return value >= -b / a ? Math.pow(a * value + b, g) : 0;
        case 2:
          return (value >= -b / a ? Math.pow(a * value + b, g) : 0) + c;
        case 3:
          return value >= d ? Math.pow(a * value + b, g) : c * value;
        default:
          return value >= d ? Math.pow(a * value + b, g) + e : c * value + f;
      }
    };
  } else unsupportedIcc(`tone curve ${type.trim()} is not supported`);
  for (let i = 0; i <= CURVE_VALIDATION_STEPS; i++)
    if (!Number.isFinite(curve(i / CURVE_VALIDATION_STEPS)))
      unsupportedIcc("non-finite tone curve");
  return { curve, bytes: Math.ceil(bytes / ALIGNMENT) * ALIGNMENT };
}

export function assertMonotonicCurve(curve: IccCurve): void {
  let previous = -Infinity;
  for (let i = 0; i <= CURVE_VALIDATION_STEPS; i++) {
    const value = curve(i / CURVE_VALIDATION_STEPS);
    if (!Number.isFinite(value) || value < previous - 1e-8)
      unsupportedIcc("non-monotonic or invalid tone curve");
    previous = value;
  }
}
