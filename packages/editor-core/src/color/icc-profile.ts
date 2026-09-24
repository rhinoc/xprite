import { FIXED_POINT_16_16_SCALE, UINT16_VALUE_COUNT, UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertMonotonicCurve, parseIccCurve } from "$/color/icc/curves";
import { inverseIccLut } from "$/color/icc/inverse";
import { lutFromPcs, lutToPcs, parseIccLut } from "$/color/icc/lut";
import type { IccTransform, IccVector } from "$/color/icc/pcs";
import {
  IccPcs,
  readIccHeader,
  unsupportedIcc,
  type IccHeader,
  type IccCicp,
} from "$/color/icc/reader";
import type { AsepriteColorProfile } from "$/import-export/aseprite/model";
import { clamp as clampNumber } from "@xprite/bedrock/common/clamp";

/** RGB matrix/TRC, gray/TRC and RGB LUT profiles. Working samples and the
 * original ICC bytes remain separate from display/clipboard conversions. */
export enum IccProfileKind {
  Matrix = "matrix",
  Lut = "lut",
}

export interface MatrixIccProfile {
  kind: IccProfileKind.Matrix;
  cicp?: IccCicp;
  space: "RGB" | "GRAY";
  matrix: readonly number[];
  curves: readonly ((x: number) => number)[];
  description: string;
}
const cache = new WeakMap<Uint8Array, MatrixIccProfile>();
const SRGB_D50 = [0x6fa2, 0x6299, 0x24a0, 0x38f5, 0xb785, 0x0f84, 0x0390, 0x18da, 0xb6cf].map(
  (n) => n / FIXED_POINT_16_16_SCALE,
);
function inverse(m: readonly number[]) {
  const [a, b, c, d, e, f, g, h, i] = m,
    A = e * i - f * h,
    B = f * g - d * i,
    C = d * h - e * g,
    det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("Invalid singular ICC color matrix");
  return [
    A,
    c * h - b * i,
    b * f - c * e,
    B,
    a * i - c * g,
    c * d - a * f,
    C,
    b * g - a * h,
    a * e - b * d,
  ].map((v) => v / det);
}
const FROM_D50 = inverse(SRGB_D50),
  clamp = (n: number) => clampNumber(n, 0, 1);
const encodeSrgb = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
function matrixIcc(data: Uint8Array, header: IccHeader): MatrixIccProfile {
  const hit = cache.get(data);
  if (hit) return hit;
  if (header.pcs !== IccPcs.Xyz) unsupportedIcc("matrix/TRC profiles require XYZ PCS");
  const tag = (name: string) => header.tags.get(name) ?? unsupportedIcc(`missing ${name} tag`);
  const xyz = (name: string) => {
    const data = tag(name);
    data.need(0, 20);
    if (data.signature(0) !== "XYZ ") unsupportedIcc(`invalid ${name} tristimulus tag`);
    return [data.fixed(8), data.fixed(12), data.fixed(16)];
  };
  const curve = (name: string) => {
    const fn = parseIccCurve(tag(name), 0, true).curve;
    assertMonotonicCurve(fn);
    return fn;
  };
  let matrix: number[], curves: ((value: number) => number)[];
  if (header.space === "RGB") {
    const r = xyz("rXYZ"),
      g = xyz("gXYZ"),
      b = xyz("bXYZ");
    matrix = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]];
    inverse(matrix);
    curves = [curve("rTRC"), curve("gTRC"), curve("bTRC")];
  } else {
    xyz("wtpt");
    matrix = [
      0xf6d6 / FIXED_POINT_16_16_SCALE,
      0,
      0,
      1,
      0,
      0,
      0xd32d / FIXED_POINT_16_16_SCALE,
      0,
      0,
    ];
    curves = [curve("kTRC")];
  }
  const parsed: MatrixIccProfile = {
    kind: IccProfileKind.Matrix,
    space: header.space,
    matrix,
    curves,
    description: `ICC ${header.space} matrix/TRC`,
    ...(header.cicp ? { cicp: header.cicp } : {}),
  };
  cache.set(data, parsed);
  return parsed;
}

/** Matrix-only inspection remains available to callers that require primaries
 * and independent tone curves; LUT transforms must never use a matrix fallback. */
export function parseMatrixIcc(data: Uint8Array): MatrixIccProfile {
  const header = readIccHeader(data);
  if ([...header.tags.keys()].some((name) => /^(A2B|B2A)[0-2]$/.test(name)))
    unsupportedIcc("a LUT profile cannot be interpreted as matrix/TRC");
  return matrixIcc(data, header);
}

export interface LutIccProfile {
  kind: IccProfileKind.Lut;
  space: "RGB";
  cicp?: IccCicp;
  description: string;
  toPcs: IccTransform;
  fromPcs: IccTransform;
}

export type ParsedIccProfile = MatrixIccProfile | LutIccProfile;
const profileCache = new WeakMap<Uint8Array, ParsedIccProfile>();
const LUT_INTENT_PRIORITY = [0, 1, 2];

/** An explicit assignment/removal takes precedence over the imported profile. */
export function workingColorProfile(
  timeline:
    | {
        colorProfile?: AsepriteColorProfile | null;
        asepriteSource?: { colorProfile?: AsepriteColorProfile };
      }
    | undefined,
): AsepriteColorProfile | undefined {
  return timeline && Object.prototype.hasOwnProperty.call(timeline, "colorProfile")
    ? (timeline.colorProfile ?? undefined)
    : timeline?.asepriteSource?.colorProfile;
}

/** Follow skcms's perceptual-then-colorimetric priority; also accept a sole
 * saturation table. XYZ PCS is the common connection between all profiles. */
export function parseIccProfile(data: Uint8Array): ParsedIccProfile {
  const hit = profileCache.get(data);
  if (hit) return hit;
  const header = readIccHeader(data);
  const table = (prefix: string) =>
    LUT_INTENT_PRIORITY.map((intent) => ({
      intent,
      data: header.tags.get(`${prefix}${intent}`),
    })).find((entry) => entry.data !== undefined);
  const forward = table("A2B"),
    reverse = table("B2A");
  if (!forward && !reverse) {
    const parsed = matrixIcc(data, header);
    profileCache.set(data, parsed);
    return parsed;
  }
  if (header.space !== "RGB") unsupportedIcc("only RGB LUT profiles are supported");
  let toPcs: IccTransform;
  if (forward?.data) toPcs = lutToPcs(parseIccLut(forward.data, header.pcs, false), header.pcs);
  else {
    const matrix = matrixIcc(data, header);
    toPcs = (value) => {
      const linear = value.map((channel, index) => matrix.curves[index](channel));
      return [0, 1, 2].map(
        (row) =>
          matrix.matrix[row * 3] * linear[0] +
          matrix.matrix[row * 3 + 1] * linear[1] +
          matrix.matrix[row * 3 + 2] * linear[2],
      ) as unknown as IccVector;
    };
  }
  const reverseData =
    (forward ? header.tags.get(`B2A${forward.intent}`) : undefined) ?? reverse?.data;
  const fromPcs = reverseData
    ? lutFromPcs(parseIccLut(reverseData, header.pcs, true), header.pcs)
    : inverseIccLut(toPcs);
  const parsed: LutIccProfile = {
    kind: IccProfileKind.Lut,
    space: "RGB",
    description: `ICC RGB LUT/${header.pcs.trim()} PCS`,
    toPcs,
    fromPcs,
    ...(header.cicp ? { cicp: header.cicp } : {}),
  };
  profileCache.set(data, parsed);
  return parsed;
}
export function assertSupportedColorProfile(
  profile: AsepriteColorProfile | undefined,
  depth = 32,
): void {
  if (
    profile?.type === "srgb" &&
    profile.gamma !== undefined &&
    (!(profile.gamma > 0) || !Number.isFinite(profile.gamma))
  )
    throw new Error("Invalid fixed-gamma color profile");
  if (profile?.type !== "icc") return;
  const parsed = parseIccProfile(profile.data);
  if (parsed.space === "GRAY" && depth !== 16)
    throw new Error(
      "A Gray ICC profile requires a grayscale sprite. The document has not been replaced.",
    );
}
export function colorProfileToSrgb(color: Rgba, profile: AsepriteColorProfile | undefined): Rgba {
  if (
    !profile ||
    profile.type === "none" ||
    (profile.type === "srgb" && profile.gamma === undefined)
  )
    return color;
  const xyz = colorToPcs(color, profile);
  const rgb = [0, 1, 2].map((r) =>
    Math.round(
      clamp(
        encodeSrgb(
          FROM_D50[r * 3] * xyz[0] + FROM_D50[r * 3 + 1] * xyz[1] + FROM_D50[r * 3 + 2] * xyz[2],
        ),
      ) * UINT8_MAX,
    ),
  );
  return [rgb[0], rgb[1], rgb[2], color[3]];
}
/** Display/export conversion never mutates working-space image or original ICC. */
export function convertPixelsToSrgb(
  image: PixelBuffer,
  profile: AsepriteColorProfile | undefined,
): PixelBuffer {
  if (
    !profile ||
    profile.type === "none" ||
    (profile.type === "srgb" && profile.gamma === undefined)
  )
    return image;
  const data = image.data.slice(),
    colors = new Map<number, Rgba>();
  for (let at = 0; at < data.length; at += 4) {
    if (!data[at + 3]) continue;
    const key = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
    let out = colors.get(key);
    if (!out) {
      out = colorProfileToSrgb([data[at], data[at + 1], data[at + 2], UINT8_MAX], profile);
      if (colors.size < UINT16_VALUE_COUNT) colors.set(key, out);
    }
    data[at] = out[0];
    data[at + 1] = out[1];
    data[at + 2] = out[2];
  }
  return { ...image, data };
}
const decodeSrgb = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export function colorProfilesEquivalent(
  a: AsepriteColorProfile | undefined,
  b: AsepriteColorProfile | undefined,
): boolean {
  const simple = (p: AsepriteColorProfile | undefined) =>
    !p || p.type === "none" || (p.type === "srgb" && p.gamma === undefined);
  if (simple(a) && simple(b)) return true;
  if (a === b) return true;
  if (!a || !b || a.type !== b.type || a.gamma !== b.gamma) return false;
  if (a.type === "icc" && b.type === "icc") {
    if (a.data.length !== b.data.length) return false;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
  }
  return true;
}
function colorToPcs(color: Rgba, profile: AsepriteColorProfile | undefined): IccVector {
  let matrix: readonly number[] = SRGB_D50,
    linear: number[];
  if (profile?.type === "icc") {
    const p = parseIccProfile(profile.data);
    if (p.kind === IccProfileKind.Lut)
      return p.toPcs([color[0] / UINT8_MAX, color[1] / UINT8_MAX, color[2] / UINT8_MAX]);
    matrix = p.matrix;
    linear =
      p.space === "GRAY"
        ? [p.curves[0](color[0] / UINT8_MAX), 0, 0]
        : p.curves.map((fn, i) => fn(color[i] / UINT8_MAX));
  } else if (profile?.type === "srgb" && profile.gamma !== undefined) {
    if (!(profile.gamma > 0) || !Number.isFinite(profile.gamma))
      throw new Error("Invalid fixed-gamma color profile");
    linear = [color[0], color[1], color[2]].map((v) => Math.pow(v / UINT8_MAX, profile.gamma!));
  } else linear = [color[0], color[1], color[2]].map((v) => decodeSrgb(v / UINT8_MAX));
  return [0, 1, 2].map(
    (r) =>
      matrix[r * 3] * linear[0] + matrix[r * 3 + 1] * linear[1] + matrix[r * 3 + 2] * linear[2],
  ) as unknown as IccVector;
}
function invertCurve(curve: (x: number) => number, value: number): number {
  if (value <= curve(0)) return 0;
  if (value >= curve(1)) return 1;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(mid) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Colorimetric working-space conversion, avoiding an intermediate clipped sRGB image. */
export function convertPixelsBetweenProfiles(
  image: PixelBuffer,
  from: AsepriteColorProfile | undefined,
  to: AsepriteColorProfile | undefined,
): PixelBuffer {
  if (colorProfilesEquivalent(from, to)) return image;
  const target = to?.type === "icc" ? parseIccProfile(to.data) : undefined,
    matrix =
      target?.kind === IccProfileKind.Matrix && target.space === "RGB"
        ? inverse(target.matrix)
        : FROM_D50,
    data = image.data.slice(),
    memo = new Map<number, number[]>();
  for (let at = 0; at < data.length; at += 4) {
    if (!data[at + 3]) continue;
    const key = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
    let rgb = memo.get(key);
    if (!rgb) {
      const pcs = colorToPcs([data[at], data[at + 1], data[at + 2], UINT8_MAX], from);
      if (target?.kind === IccProfileKind.Lut) {
        rgb = target.fromPcs(pcs).map((channel) => Math.round(clamp(channel) * UINT8_MAX));
      } else if (target?.space === "GRAY") {
        const value = Math.round(invertCurve(target.curves[0], pcs[1]) * UINT8_MAX);
        rgb = [value, value, value];
      } else {
        const linear = [0, 1, 2].map(
          (r) => matrix[r * 3] * pcs[0] + matrix[r * 3 + 1] * pcs[1] + matrix[r * 3 + 2] * pcs[2],
        );
        rgb = linear.map((v, i) =>
          Math.round(
            clamp(
              target
                ? invertCurve(target.curves[i], v)
                : to?.type === "srgb" && to.gamma !== undefined
                  ? Math.pow(clamp(v), 1 / to.gamma)
                  : encodeSrgb(v),
            ) * UINT8_MAX,
          ),
        );
      }
      if (memo.size < UINT16_VALUE_COUNT) memo.set(key, rgb);
    }
    data[at] = rgb[0];
    data[at + 1] = rgb[1];
    data[at + 2] = rgb[2];
  }
  return { ...image, data };
}
