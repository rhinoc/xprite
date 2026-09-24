import { UINT16_MAX } from "$/base/numeric-constants";
import { unit } from "$/color/icc/curves";
import { IccPcs } from "$/color/icc/reader";

export type IccVector = readonly [number, number, number];
export type IccTransform = (value: IccVector) => IccVector;
const D50_X = 0.9642;
const D50_Z = 0.8249;
const LAB_DELTA = 6 / 29;
const LAB_SLOPE = 1 / (3 * LAB_DELTA * LAB_DELTA);
const LAB_OFFSET = 4 / 29;
const XYZ_ENCODING_SCALE = UINT16_MAX / 32768;
const LEGACY_LAB_SCALE = UINT16_MAX / 65280;

// ICC.1:2022 defines normalized 16-bit PCSXYZ and the legacy lut16 Lab
// encoding separately. lut8/XYZ is implementation-specific; use the same
// normalized XYZ convention as the skcms reference pipeline.

const labRoot = (value: number) =>
  value > LAB_DELTA ** 3 ? Math.cbrt(value) : value * LAB_SLOPE + LAB_OFFSET;
const labCube = (value: number) =>
  value > LAB_DELTA ? value ** 3 : (value - LAB_OFFSET) / LAB_SLOPE;

export function decodePcs(value: IccVector, pcs: IccPcs, legacyLab: boolean): IccVector {
  if (pcs === IccPcs.Xyz)
    return value.map((channel) => channel * XYZ_ENCODING_SCALE) as unknown as IccVector;
  const scale = legacyLab ? LEGACY_LAB_SCALE : 1;
  const y = (unit(value[0] * scale) * 100 + 16) / 116;
  const x = y + (unit(value[1] * scale) * 255 - 128) / 500;
  const z = y - (unit(value[2] * scale) * 255 - 128) / 200;
  return [labCube(x) * D50_X, labCube(y), labCube(z) * D50_Z];
}

export function encodePcs(value: IccVector, pcs: IccPcs, legacyLab: boolean): IccVector {
  if (pcs === IccPcs.Xyz)
    return value.map((channel) => channel / XYZ_ENCODING_SCALE) as unknown as IccVector;
  const x = labRoot(value[0] / D50_X),
    y = labRoot(value[1]),
    z = labRoot(value[2] / D50_Z);
  const scale = legacyLab ? LEGACY_LAB_SCALE : 1;
  return [
    (116 * y - 16) / (100 * scale),
    (500 * (x - y) + 128) / (255 * scale),
    (200 * (y - z) + 128) / (255 * scale),
  ];
}
