import { UINT16_MAX, UINT8_MAX } from "$/base/numeric-constants";
import { parseIccCurve, tableCurve, unit, type IccCurve } from "$/color/icc/curves";
import { decodePcs, encodePcs, type IccTransform, type IccVector } from "$/color/icc/pcs";
import { IccData, IccPcs, unsupportedIcc } from "$/color/icc/reader";

const CHANNELS = 3;
const LUT8_ENTRIES = 256;
const MAX_LUT_ENTRIES = 4096;
const LEGACY_HEADER_BYTES = 48;
const MULTISTAGE_HEADER_BYTES = 32;
const CLUT_HEADER_BYTES = 20;
const MATRIX_BYTES = 48;
const ALIGNMENT = 4;

enum LutType {
  Byte = "mft1",
  Word = "mft2",
  ToPcs = "mAB ",
  FromPcs = "mBA ",
}

enum StageOffset {
  B = 12,
  Matrix = 16,
  M = 20,
  Clut = 24,
  A = 28,
}

export interface IccLut {
  apply: IccTransform;
  legacyLab: boolean;
}

const applyCurves = (curves: readonly IccCurve[], value: IccVector): IccVector =>
  value.map((channel, index) => curves[index](unit(channel))) as unknown as IccVector;

function matrixStage(data: IccData, offset: number, affine: boolean): IccTransform {
  data.need(offset, affine ? MATRIX_BYTES : CHANNELS * CHANNELS * ALIGNMENT);
  const values = Array.from({ length: affine ? 12 : 9 }, (_, index) =>
    data.fixed(offset + index * ALIGNMENT),
  );
  return (input) => [
    values[0] * input[0] + values[1] * input[1] + values[2] * input[2] + (values[9] ?? 0),
    values[3] * input[0] + values[4] * input[1] + values[5] * input[2] + (values[10] ?? 0),
    values[6] * input[0] + values[7] * input[1] + values[8] * input[2] + (values[11] ?? 0),
  ];
}

function clutStage(
  data: IccData,
  offset: number,
  grid: readonly number[],
  precision: 1 | 2,
): IccTransform {
  if (grid.length !== CHANNELS || grid.some((points) => points < 2))
    unsupportedIcc("invalid RGB CLUT grid");
  const count = grid.reduce((product, points) => product * points, CHANNELS);
  data.need(offset, count * precision);
  const sample = (index: number) =>
    precision === 1
      ? data.u8(offset + index) / UINT8_MAX
      : data.u16(offset + index * precision) / UINT16_MAX;
  // Same tensor-product interpolation and channel ordering as skcms: the last
  // input dimension varies fastest, and each grid point stores RGB together.
  return (value) => {
    const positions = value.map((channel, index) => unit(channel) * (grid[index] - 1));
    const low = positions.map((position, index) => Math.min(grid[index] - 2, Math.floor(position)));
    const fractions = positions.map((position, index) => position - low[index]);
    const out = [0, 0, 0];
    for (let corner = 0; corner < 1 << CHANNELS; corner++) {
      let index = 0,
        weight = 1;
      for (let axis = 0; axis < CHANNELS; axis++) {
        const high = (corner >> axis) & 1;
        index = index * grid[axis] + low[axis] + high;
        weight *= high ? fractions[axis] : 1 - fractions[axis];
      }
      for (let channel = 0; channel < CHANNELS; channel++)
        out[channel] += weight * sample(index * CHANNELS + channel);
    }
    return out as unknown as IccVector;
  };
}

function legacyLut(
  data: IccData,
  pcs: IccPcs,
  reverse: boolean,
  type: LutType.Byte | LutType.Word,
): IccLut {
  const precision = type === LutType.Byte ? 1 : 2;
  const header = LEGACY_HEADER_BYTES + (precision === 2 ? ALIGNMENT : 0);
  data.need(0, header);
  if (data.u8(8) !== CHANNELS || data.u8(9) !== CHANNELS)
    unsupportedIcc("only RGB-to-three-channel LUTs are supported");
  const entries = precision === 1 ? LUT8_ENTRIES : data.u16(48);
  const outputEntries = precision === 1 ? LUT8_ENTRIES : data.u16(50);
  if (
    entries < 2 ||
    outputEntries < 2 ||
    entries > MAX_LUT_ENTRIES ||
    outputEntries > MAX_LUT_ENTRIES
  )
    unsupportedIcc("invalid LUT input/output tables");
  const matrix = matrixStage(data, 12, false);
  // ICC.1:2022 requires identity here unless the table input is PCSXYZ.
  const useMatrix = reverse && pcs === IccPcs.Xyz;
  if (!useMatrix)
    for (let index = 0; index < CHANNELS * CHANNELS; index++)
      if (data.fixed(12 + index * ALIGNMENT) !== (index % (CHANNELS + 1) === 0 ? 1 : 0))
        unsupportedIcc("non-identity LUT matrix outside XYZ input");
  const input = Array.from({ length: CHANNELS }, (_, channel) =>
    tableCurve(data, header + channel * entries * precision, entries, precision),
  );
  const gridOffset = header + CHANNELS * entries * precision,
    points = data.u8(10);
  const clut = clutStage(data, gridOffset, [points, points, points], precision);
  const outputOffset = gridOffset + points ** CHANNELS * CHANNELS * precision;
  const output = Array.from({ length: CHANNELS }, (_, channel) =>
    tableCurve(data, outputOffset + channel * outputEntries * precision, outputEntries, precision),
  );
  return {
    legacyLab: precision === 2,
    apply: (value) =>
      applyCurves(output, clut(applyCurves(input, useMatrix ? matrix(value) : value))),
  };
}

function multistageLut(data: IccData, reverse: boolean): IccLut {
  data.need(0, MULTISTAGE_HEADER_BYTES);
  if (data.u8(8) !== CHANNELS || data.u8(9) !== CHANNELS)
    unsupportedIcc("only three-channel RGB LUTs are supported");
  const offset = (field: StageOffset) => {
    const at = data.u32(field);
    if (at && (at < MULTISTAGE_HEADER_BYTES || at % ALIGNMENT !== 0))
      unsupportedIcc("invalid LUT stage offset");
    return at;
  };
  const bOffset = offset(StageOffset.B),
    matrixOffset = offset(StageOffset.Matrix),
    mOffset = offset(StageOffset.M),
    gridOffset = offset(StageOffset.Clut),
    aOffset = offset(StageOffset.A);
  if (!bOffset || !!matrixOffset !== !!mOffset || !!gridOffset !== !!aOffset)
    unsupportedIcc("incomplete LUT stage combination");
  const curves = (start: number): IccCurve[] => {
    let at = start;
    return Array.from({ length: CHANNELS }, () => {
      const parsed = parseIccCurve(data, at);
      at += parsed.bytes;
      return parsed.curve;
    });
  };
  const b = curves(bOffset),
    m = mOffset ? curves(mOffset) : undefined,
    a = aOffset ? curves(aOffset) : undefined;
  const matrix = matrixOffset ? matrixStage(data, matrixOffset, true) : undefined;
  let clut: IccTransform | undefined;
  if (gridOffset) {
    data.need(gridOffset, CLUT_HEADER_BYTES);
    const precision = data.u8(gridOffset + 16);
    if (precision !== 1 && precision !== 2) unsupportedIcc("unsupported CLUT precision");
    clut = clutStage(
      data,
      gridOffset + CLUT_HEADER_BYTES,
      [data.u8(gridOffset), data.u8(gridOffset + 1), data.u8(gridOffset + 2)],
      precision,
    );
  }
  return {
    legacyLab: false,
    apply(value) {
      let out = value;
      if (reverse) {
        out = applyCurves(b, out);
        if (matrix && m) out = applyCurves(m, matrix(out));
        if (clut && a) out = applyCurves(a, clut(out));
      } else {
        if (clut && a) out = clut(applyCurves(a, out));
        if (matrix && m) out = matrix(applyCurves(m, out));
        out = applyCurves(b, out);
      }
      return out;
    },
  };
}

export function parseIccLut(data: IccData, pcs: IccPcs, reverse: boolean): IccLut {
  const type = data.signature(0);
  if (type === LutType.Byte || type === LutType.Word) return legacyLut(data, pcs, reverse, type);
  if (type === (reverse ? LutType.FromPcs : LutType.ToPcs)) return multistageLut(data, reverse);
  return unsupportedIcc(`LUT type ${type.trim()} is not supported`);
}

export function lutToPcs(lut: IccLut, pcs: IccPcs): IccTransform {
  return (value) => decodePcs(lut.apply(value), pcs, lut.legacyLab);
}

export function lutFromPcs(lut: IccLut, pcs: IccPcs): IccTransform {
  return (value) => lut.apply(encodePcs(value, pcs, lut.legacyLab));
}
