import { unit } from "$/color/icc/curves";
import { IccPcs } from "$/color/icc/reader";

export type IccVector = readonly [number, number, number];
export type IccTransform = (value: IccVector) => IccVector;
const D50_X = 0.9642;
const D50_Z = 0.8249;
const LAB_DELTA = 6 / 29;
const LAB_SLOPE = 1 / (3 * LAB_DELTA * LAB_DELTA);
const LAB_OFFSET = 4 / 29;

// Converts a LUT's PCS values the way skcms does. PCSXYZ passes through as it
// stands; the 16-bit XYZ encoding scale applies only to an mAB/mBA matrix (see
// lut.ts). Lab reads every LUT type with the v4 encoding, legacy lut16 included.

const labRoot = (value: number) =>
  value > LAB_DELTA ** 3 ? Math.cbrt(value) : value * LAB_SLOPE + LAB_OFFSET;
const labCube = (value: number) =>
  value > LAB_DELTA ? value ** 3 : (value - LAB_OFFSET) / LAB_SLOPE;

export function decodePcs(value: IccVector, pcs: IccPcs): IccVector {
  if (pcs === IccPcs.Xyz) return value;
  const y = (unit(value[0]) * 100 + 16) / 116;
  const x = y + (unit(value[1]) * 255 - 128) / 500;
  const z = y - (unit(value[2]) * 255 - 128) / 200;
  return [labCube(x) * D50_X, labCube(y), labCube(z) * D50_Z];
}

export function encodePcs(value: IccVector, pcs: IccPcs): IccVector {
  if (pcs === IccPcs.Xyz) return value;
  const x = labRoot(value[0] / D50_X),
    y = labRoot(value[1]),
    z = labRoot(value[2] / D50_Z);
  return [(116 * y - 16) / 100, (500 * (x - y) + 128) / 255, (200 * (y - z) + 128) / 255];
}
