/**
 * 8-bit sRGB <-> CIE Lab exactly as OpenCV's bit-exact `COLOR_RGB2LAB` / `COLOR_LAB2RGB`
 * (modules/imgproc/src/color_lab.cpp, `RGB2Lab_b` and `Lab2RGBinteger`): the same lookup tables
 * (built in single precision like OpenCV's softfloat) and the same fixed-point arithmetic, so the
 * legacy PixelOE port reproduces the reference pixel for pixel. L is 0..255 (L*255/100), a and b
 * are offset by 128.
 */
const f32 = Math.fround;
const GAMMA_SHIFT = 3;
const LAB_SHIFT = 12;
const LAB_SHIFT2 = LAB_SHIFT + GAMMA_SHIFT;
const CBRT_TABLE_SIZE = (256 * 3 * (1 << GAMMA_SHIFT)) / 2;
const INV_GAMMA_SHIFT = 12;
const INV_GAMMA_SIZE = 1 << INV_GAMMA_SHIFT;
const LUT_BASE = 1 << 14;
const MIN_AB = -8145;
const AB_TABLE_SIZE = (LUT_BASE * 9) / 4;
const RGB_SHIFT = LAB_SHIFT + 14 - INV_GAMMA_SHIFT;
/** D65 white point and the sRGB matrices, as the doubles OpenCV stores. */
const D65 = [0.950456, 1, 1.088754];
const RGB_TO_XYZ = [
  0.412453, 0.35758, 0.180423, 0.212671, 0.71516, 0.072169, 0.019334, 0.119193, 0.950227,
];
const XYZ_TO_RGB = [
  3.240479, -1.53715, -0.498535, -0.969256, 1.875991, 0.041556, 0.055648, -0.204043, 1.057311,
];
/** The one cube-root table entry where softfloat and a correctly rounded cbrt disagree. */
const CBRT_SOFTFLOAT_ENTRY = 324;
const L_THRESH = f32(216 / 24389);
const L_SCALE = f32(841 / 108);
const L_BIAS = f32(16 / 116);

/** cvRound: round half to even. */
function round(v: number): number {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
const descale = (v: number, n: number) => (v + (1 << (n - 1))) >> n;
const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function applyGamma(x: number): number {
  return f32(x <= 809 / 20000 ? x / (323 / 25) : ((x + 11 / 200) / (1 + 11 / 200)) ** (12 / 5));
}
function applyInvGamma(x: number): number {
  return f32(
    x <= 7827 / 2500000 ? x * (323 / 25) : x ** (1 / (12 / 5)) * (1 + 11 / 200) - 11 / 200,
  );
}

interface LabTables {
  gamma: Int32Array;
  cbrt: Int32Array;
  forward: Int32Array;
  yf: Int32Array;
  abToXz: Int32Array;
  invGamma: Uint8Array;
  inverse: Int32Array;
}
let tables: LabTables | null = null;
function labTables(): LabTables {
  if (tables) return tables;
  const gamma = new Int32Array(256);
  for (let i = 0; i < 256; i++) gamma[i] = round(f32(f32(255 * 8) * applyGamma(f32(i / 255))));
  const cbrt = new Int32Array(CBRT_TABLE_SIZE);
  const cbScale = f32(1 / f32(255 * (1 << GAMMA_SHIFT)));
  for (let i = 0; i < CBRT_TABLE_SIZE; i++) {
    const x = f32(cbScale * i);
    const v = x < L_THRESH ? f32(x * L_SCALE + L_BIAS) : f32(Math.cbrt(x));
    cbrt[i] = round(f32((1 << LAB_SHIFT2) * v));
  }
  // OpenCV's softfloat cbrt is not correctly rounded here: it lands one float lower, so the
  // scaled value is just under the .5 tie the correctly rounded cube root hits.
  cbrt[CBRT_SOFTFLOAT_ENTRY] -= 1;
  const forward = new Int32Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      forward[i * 3 + j] = round(((1 << LAB_SHIFT) * RGB_TO_XYZ[i * 3 + j]) / D65[i]);
  const yf = new Int32Array(512);
  for (let i = 0; i < 256; i++) {
    let y: number, ify: number;
    if (i <= 20) {
      y = round(f32(f32(i * LUT_BASE * 20 * 9) / f32(17 * 29 * 29 * 29)));
      ify = round(f32(LUT_BASE * f32(f32(16 / 116) + f32(f32(i * 5) / f32(3 * 17 * 29)))));
    } else {
      const fy = f32(
        f32(f32(i * 100 * LUT_BASE) / f32(255 * 116)) + f32(f32(16 * LUT_BASE) / f32(116)),
      );
      ify = round(fy);
      y = round(f32(f32(f32(fy * fy) * fy) / f32(LUT_BASE * LUT_BASE)));
    }
    yf[i * 2] = y;
    yf[i * 2 + 1] = ify;
  }
  const abToXz = new Int32Array(AB_TABLE_SIZE);
  for (let i = MIN_AB; i < AB_TABLE_SIZE + MIN_AB; i++)
    abToXz[i - MIN_AB] =
      i <= 3390
        ? Math.trunc((i * 108) / 841) - Math.trunc((Math.trunc((LUT_BASE * 16) / 116) * 108) / 841)
        : Math.trunc((Math.trunc((i * i) / LUT_BASE) * i) / LUT_BASE);
  const invGamma = new Uint8Array(INV_GAMMA_SIZE);
  for (let i = 0; i < INV_GAMMA_SIZE; i++)
    invGamma[i] = clampByte(round(f32(255 * applyInvGamma(f32(i / INV_GAMMA_SIZE)))));
  const inverse = new Int32Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      inverse[i * 3 + j] = round((1 << LAB_SHIFT) * XYZ_TO_RGB[i * 3 + j] * D65[j]);
  tables = { gamma, cbrt, forward, yf, abToXz, invGamma, inverse };
  return tables;
}

/** Interleaved RGB (3 bytes per pixel) to interleaved 8-bit Lab. */
export function rgbToLab8(rgb: Uint8Array): Uint8Array {
  const { gamma, cbrt, forward: c } = labTables();
  const out = new Uint8Array(rgb.length);
  const lScale = Math.trunc((116 * 255 + 50) / 100);
  const lShift = -Math.trunc((16 * 255 * (1 << LAB_SHIFT2) + 50) / 100);
  const abShift = 128 * (1 << LAB_SHIFT2);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = gamma[rgb[i]],
      g = gamma[rgb[i + 1]],
      b = gamma[rgb[i + 2]];
    const fx = cbrt[descale(r * c[0] + g * c[1] + b * c[2], LAB_SHIFT)];
    const fy = cbrt[descale(r * c[3] + g * c[4] + b * c[5], LAB_SHIFT)];
    const fz = cbrt[descale(r * c[6] + g * c[7] + b * c[8], LAB_SHIFT)];
    out[i] = clampByte(descale(lScale * fy + lShift, LAB_SHIFT2));
    out[i + 1] = clampByte(descale(500 * (fx - fy) + abShift, LAB_SHIFT2));
    out[i + 2] = clampByte(descale(200 * (fy - fz) + abShift, LAB_SHIFT2));
  }
  return out;
}

/** Interleaved 8-bit Lab to interleaved RGB. */
export function labToRgb8(lab: Uint8Array): Uint8Array {
  const { yf, abToXz, invGamma, inverse: c } = labTables();
  const out = new Uint8Array(lab.length);
  const top = INV_GAMMA_SIZE - 1;
  const aOffset = Math.trunc((128 * LUT_BASE) / 500);
  const bOffset = Math.trunc((128 * LUT_BASE) / 200) - 1;
  for (let i = 0; i < lab.length; i += 3) {
    const l = lab[i],
      a = lab[i + 1],
      b = lab[i + 2];
    const y = yf[l * 2],
      ify = yf[l * 2 + 1];
    const adiv = ((5 * a * 53687 + (1 << 7)) >> 13) - aOffset;
    const bdiv = ((b * 41943 + (1 << 4)) >> 9) - bOffset;
    const x = abToXz[ify + adiv - MIN_AB],
      z = abToXz[ify - bdiv - MIN_AB];
    for (let k = 0; k < 3; k++) {
      const v = descale(c[k * 3] * x + c[k * 3 + 1] * y + c[k * 3 + 2] * z, RGB_SHIFT);
      out[i + k] = invGamma[v < 0 ? 0 : v > top ? top : v];
    }
  }
  return out;
}
