import {
  initializeCanvas,
  readPsd,
  type AdjustmentLayer,
  type Color,
  type EffectSolidGradient,
  type Fraction,
  type Layer,
  type LayerEffectsInfo,
  type LayerMaskData,
  type PixelData,
  type Psd,
  type UnitsValue,
} from "ag-psd";

import { UINT8_MAX, type PixelBuffer, type Rgba } from "@xprite/editor-core/base";
import type { EditorProject } from "@xprite/editor-core/document";
import {
  EDITOR_PSD_LIMITS,
  isPsdData,
  projectFromPsd,
  PsdCodecError,
  PsdColorMode,
  PsdIssueCode,
  type PsdAdjustment,
  type PsdAnimations,
  type PsdDocument,
  type PsdEffects,
  type PsdGradientFill,
  type PsdGradientStyle,
  type PsdLayer,
  type PsdLayerFrameState,
  type PsdLayerTimeline,
  type PsdMask,
  type PsdPathOperation,
  type PsdPattern,
  type PsdPatternFill,
  type PsdResourceLimits,
  type PsdSlice,
  type PsdTimelineKey,
  type PsdVectorMask,
  type PsdVideoTimeline,
} from "@xprite/editor-core/import-export";

const PSD_HEADER_BYTES = 26;
const PSD_HEIGHT_OFFSET = 14;
const PSD_WIDTH_OFFSET = 18;
const RGBA_CHANNELS = 4;
const UINT16_TO_UINT8_DIVISOR = 257;
const CMYK_SCALE = 255;
const DEFAULT_GLOBAL_ANGLE = 120;

let canvasInitialized = false;

function ensureRawImageDataCanvas(): void {
  if (canvasInitialized) return;
  canvasInitialized = true;
  initializeCanvas(
    () => {
      throw new PsdCodecError(
        "Canvas rendering is unavailable while decoding PSD pixel data.",
        PsdIssueCode.DecodeFailed,
      );
    },
    (width, height) =>
      ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * RGBA_CHANNELS),
      }) as unknown as ImageData,
  );
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= UINT8_MAX) return UINT8_MAX;
  return Math.round(value);
}

function linearFloatToSrgbByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return UINT8_MAX;
  const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return clampByte(srgb * UINT8_MAX);
}

function toRgbaPixelBuffer(pixelData: PixelData | undefined): PixelBuffer | undefined {
  if (!pixelData || pixelData.width <= 0 || pixelData.height <= 0) return undefined;
  const { width, height, data } = pixelData;
  if (data instanceof Uint8ClampedArray) {
    return { width, height, data };
  }
  const out = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  if (data instanceof Uint16Array) {
    for (let i = 0; i < out.length; i++) out[i] = Math.round(data[i] / UINT16_TO_UINT8_DIVISOR);
    return { width, height, data: out };
  }
  if (data instanceof Float32Array) {
    // 32-bit Photoshop documents store linear RGB channels; convert RGB to sRGB while keeping alpha linear.
    for (let i = 0; i < out.length; i += RGBA_CHANNELS) {
      out[i] = linearFloatToSrgbByte(data[i]);
      out[i + 1] = linearFloatToSrgbByte(data[i + 1]);
      out[i + 2] = linearFloatToSrgbByte(data[i + 2]);
      out[i + 3] = clampByte(data[i + 3] * UINT8_MAX);
    }
    return { width, height, data: out };
  }
  return undefined;
}

function labToRgba(l: number, a: number, b: number): Rgba {
  // ag-psd Lab colors are normalized: l in [0, 1], a/b in [-1, 1] scaled by 128.
  const L = l * 100;
  const A = a * 128;
  const B = b * 128;
  const fy = (L + 16) / 116;
  const fx = A / 500 + fy;
  const fz = fy - B / 200;
  const cube = (t: number) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = 0.95047 * cube(fx);
  const Y = 1.0 * cube(fy);
  const Z = 1.08883 * cube(fz);
  const rLin = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const gLin = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const bLin = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return [
    linearFloatToSrgbByte(rLin),
    linearFloatToSrgbByte(gLin),
    linearFloatToSrgbByte(bLin),
    UINT8_MAX,
  ];
}

function colorToRgba(color: Color | undefined): Rgba | undefined {
  if (!color || typeof color !== "object") return undefined;
  if ("r" in color && "g" in color && "b" in color) {
    return [clampByte(color.r), clampByte(color.g), clampByte(color.b), UINT8_MAX];
  }
  if ("fr" in color && "fg" in color && "fb" in color) {
    return [
      clampByte(color.fr * UINT8_MAX),
      clampByte(color.fg * UINT8_MAX),
      clampByte(color.fb * UINT8_MAX),
      UINT8_MAX,
    ];
  }
  if ("c" in color && "m" in color && "y" in color && "k" in color) {
    const c = color.c / CMYK_SCALE;
    const m = color.m / CMYK_SCALE;
    const y = color.y / CMYK_SCALE;
    const k = color.k / CMYK_SCALE;
    return [
      clampByte((1 - c) * (1 - k) * UINT8_MAX),
      clampByte((1 - m) * (1 - k) * UINT8_MAX),
      clampByte((1 - y) * (1 - k) * UINT8_MAX),
      UINT8_MAX,
    ];
  }
  if ("l" in color && "a" in color && "b" in color) {
    return labToRgba(color.l, color.a, color.b);
  }
  if ("k" in color) {
    const gray = clampByte(UINT8_MAX - color.k);
    return [gray, gray, gray, UINT8_MAX];
  }
  return undefined;
}

function unitsPx(value: UnitsValue | number | undefined, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (!value || typeof value !== "object") return fallback;
  return Number.isFinite(value.value) ? value.value : fallback;
}

function fractionSeconds(fraction: Fraction | undefined): number {
  if (!fraction || !fraction.denominator) return 0;
  return fraction.numerator / fraction.denominator;
}

function normalizeGradientStyle(style: string | undefined): PsdGradientStyle {
  if (
    style === "linear" ||
    style === "radial" ||
    style === "angle" ||
    style === "reflected" ||
    style === "diamond"
  ) {
    return style;
  }
  return "linear";
}

function normalizeSolidGradient(
  gradient: EffectSolidGradient | undefined,
  opts: {
    style?: string;
    angle?: number;
    scale?: number;
    reverse?: boolean;
    offset?: { x: number; y: number };
  },
): PsdGradientFill | undefined {
  if (!gradient || gradient.type !== "solid" || !gradient.colorStops?.length) return undefined;
  return {
    style: normalizeGradientStyle(opts.style),
    angle: opts.angle ?? 90,
    scale: opts.scale ?? 1,
    reverse: Boolean(opts.reverse),
    offsetX: opts.offset?.x ?? 0,
    offsetY: opts.offset?.y ?? 0,
    colorStops: gradient.colorStops.map((stop) => ({
      color: colorToRgba(stop.color) ?? [0, 0, 0, UINT8_MAX],
      location: stop.location ?? 0,
      midpoint: stop.midpoint ?? 0.5,
    })),
    opacityStops: (gradient.opacityStops ?? []).map((stop) => ({
      opacity: stop.opacity ?? 1,
      location: stop.location ?? 0,
      midpoint: stop.midpoint ?? 0.5,
    })),
  };
}

function normalizePatternFill(
  raw:
    | { id?: string; scale?: number; phase?: { x: number; y: number }; align?: boolean }
    | undefined,
): PsdPatternFill | undefined {
  if (!raw?.id) return undefined;
  return {
    patternId: raw.id,
    scale: raw.scale !== undefined ? (raw.scale > 10 ? raw.scale / 100 : raw.scale) : 1,
    phaseX: raw.phase?.x ?? 0,
    phaseY: raw.phase?.y ?? 0,
    ...(raw.align !== undefined ? { align: raw.align } : {}),
  };
}

function normalizeMaskData(mask: LayerMaskData | undefined): PsdMask | undefined {
  if (!mask) return undefined;
  return {
    left: mask.left ?? 0,
    top: mask.top ?? 0,
    right: mask.right ?? 0,
    bottom: mask.bottom ?? 0,
    defaultColor: mask.defaultColor ?? 0,
    disabled: Boolean(mask.disabled),
    density: mask.userMaskDensity,
    pixels: toRgbaPixelBuffer(mask.imageData),
  };
}

function normalizeVectorMask(layer: Layer): PsdVectorMask | undefined {
  const vm = layer.vectorMask;
  if (!vm || !vm.paths?.length) return undefined;
  return {
    invert: Boolean(vm.invert),
    disabled: Boolean(vm.disable),
    paths: vm.paths.map((subpath) => {
      const op = subpath.operation;
      const operation: PsdPathOperation =
        op === "subtract" || op === "intersect" || op === "exclude" ? op : "combine";
      return {
        open: Boolean(subpath.open),
        operation,
        knots: subpath.knots.map((knot) => ({
          points: [
            knot.points[0] ?? 0,
            knot.points[1] ?? 0,
            knot.points[2] ?? 0,
            knot.points[3] ?? 0,
            knot.points[4] ?? 0,
            knot.points[5] ?? 0,
          ],
        })),
      };
    }),
  };
}

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value as T];
}

function normalizeEffects(
  effects: LayerEffectsInfo | undefined,
  globalAngle: number,
): PsdEffects | undefined {
  if (!effects) return undefined;
  const dropShadows = asArray(effects.dropShadow)
    .filter((item) => item.enabled !== false)
    .map((item) => ({
      enabled: true,
      blendMode: item.blendMode ?? "multiply",
      color: colorToRgba(item.color) ?? [0, 0, 0, UINT8_MAX],
      opacity: clampByte((item.opacity ?? 0.75) * UINT8_MAX),
      angle: item.useGlobalLight ? globalAngle : (item.angle ?? globalAngle),
      distance: unitsPx(item.distance, 0),
      size: unitsPx(item.size, 0),
      choke: unitsPx(item.choke, 0),
      layerConceals: item.layerConceals !== false,
    }));
  const innerShadows = asArray(effects.innerShadow)
    .filter((item) => item.enabled !== false)
    .map((item) => ({
      enabled: true,
      blendMode: item.blendMode ?? "multiply",
      color: colorToRgba(item.color) ?? [0, 0, 0, UINT8_MAX],
      opacity: clampByte((item.opacity ?? 0.75) * UINT8_MAX),
      angle: item.useGlobalLight ? globalAngle : (item.angle ?? globalAngle),
      distance: unitsPx(item.distance, 0),
      size: unitsPx(item.size, 0),
      choke: unitsPx(item.choke, 0),
      layerConceals: true,
    }));
  const outerGlow =
    effects.outerGlow && effects.outerGlow.enabled !== false
      ? {
          enabled: true,
          blendMode: effects.outerGlow.blendMode ?? "screen",
          color: colorToRgba(effects.outerGlow.color) ?? [255, 255, 190, UINT8_MAX],
          opacity: clampByte((effects.outerGlow.opacity ?? 0.75) * UINT8_MAX),
          size: unitsPx(effects.outerGlow.size, 0),
          choke: unitsPx(effects.outerGlow.choke, 0),
        }
      : undefined;
  const innerGlow =
    effects.innerGlow && effects.innerGlow.enabled !== false
      ? {
          enabled: true,
          blendMode: effects.innerGlow.blendMode ?? "screen",
          color: colorToRgba(effects.innerGlow.color) ?? [255, 255, 190, UINT8_MAX],
          opacity: clampByte((effects.innerGlow.opacity ?? 0.75) * UINT8_MAX),
          size: unitsPx(effects.innerGlow.size, 0),
          choke: unitsPx(effects.innerGlow.choke, 0),
          innerSource:
            effects.innerGlow.source === "center" ? ("center" as const) : ("edge" as const),
        }
      : undefined;
  const solidFills = asArray(effects.solidFill)
    .filter((item) => item.enabled !== false)
    .map((item) => ({
      enabled: true,
      blendMode: item.blendMode ?? "normal",
      color: colorToRgba(item.color) ?? [0, 0, 0, UINT8_MAX],
      opacity: clampByte((item.opacity ?? 1) * UINT8_MAX),
    }));
  const gradientOverlays = asArray(effects.gradientOverlay)
    .filter((item) => item.enabled !== false)
    .flatMap((item) => {
      const gradient =
        item.gradient?.type === "solid"
          ? normalizeSolidGradient(item.gradient, {
              style: item.type,
              angle: item.angle,
              scale: item.scale,
              reverse: item.reverse,
              offset: item.offset,
            })
          : undefined;
      return gradient
        ? [
            {
              enabled: true,
              blendMode: item.blendMode ?? "normal",
              opacity: clampByte((item.opacity ?? 1) * UINT8_MAX),
              gradient,
            },
          ]
        : [];
    });
  const patternOverlays = asArray(effects.patternOverlay)
    .filter((item) => item.enabled !== false)
    .flatMap((item) => {
      const pattern = normalizePatternFill(
        item.pattern
          ? { id: item.pattern.id, scale: item.scale, phase: item.phase, align: item.align }
          : undefined,
      );
      return pattern
        ? [
            {
              enabled: true,
              blendMode: item.blendMode ?? "normal",
              opacity: clampByte((item.opacity ?? 1) * UINT8_MAX),
              pattern,
            },
          ]
        : [];
    });
  const bevel =
    effects.bevel && effects.bevel.enabled !== false
      ? {
          enabled: true,
          style:
            effects.bevel.style === "outer bevel" ||
            effects.bevel.style === "emboss" ||
            effects.bevel.style === "pillow emboss" ||
            effects.bevel.style === "stroke emboss"
              ? effects.bevel.style
              : ("inner bevel" as const),
          direction: effects.bevel.direction === "down" ? ("down" as const) : ("up" as const),
          size: unitsPx(effects.bevel.size, 0),
          soften: unitsPx(effects.bevel.soften, 0),
          strength: effects.bevel.strength ?? 1,
          angle: effects.bevel.useGlobalLight ? globalAngle : (effects.bevel.angle ?? globalAngle),
          altitude: effects.bevel.altitude ?? 30,
          highlightBlendMode: effects.bevel.highlightBlendMode ?? "screen",
          highlightColor: colorToRgba(effects.bevel.highlightColor) ?? [255, 255, 255, UINT8_MAX],
          highlightOpacity: clampByte((effects.bevel.highlightOpacity ?? 0.75) * UINT8_MAX),
          shadowBlendMode: effects.bevel.shadowBlendMode ?? "multiply",
          shadowColor: colorToRgba(effects.bevel.shadowColor) ?? [0, 0, 0, UINT8_MAX],
          shadowOpacity: clampByte((effects.bevel.shadowOpacity ?? 0.75) * UINT8_MAX),
        }
      : undefined;
  const satin =
    effects.satin && effects.satin.enabled !== false
      ? {
          enabled: true,
          blendMode: effects.satin.blendMode ?? "multiply",
          color: colorToRgba(effects.satin.color) ?? [0, 0, 0, UINT8_MAX],
          opacity: clampByte((effects.satin.opacity ?? 0.5) * UINT8_MAX),
          angle: effects.satin.angle ?? 19,
          distance: unitsPx(effects.satin.distance, 11),
          size: unitsPx(effects.satin.size, 14),
          invert: effects.satin.invert !== false,
        }
      : undefined;
  const strokes = asArray(effects.stroke)
    .filter((item) => item.enabled !== false)
    .map((item) => {
      const position: "inside" | "center" | "outside" =
        item.position === "inside" || item.position === "center" ? item.position : "outside";
      const gradient =
        item.fillType === "gradient" && item.gradient?.type === "solid"
          ? normalizeSolidGradient(item.gradient, {
              style: item.gradient.style,
              angle: item.gradient.angle,
              scale: item.gradient.scale,
              reverse: item.gradient.reverse,
              offset: item.gradient.offset,
            })
          : undefined;
      const pattern =
        item.fillType === "pattern"
          ? normalizePatternFill(
              item.pattern
                ? {
                    id: item.pattern.id,
                    scale: item.pattern.scale,
                    phase: item.pattern.phase,
                    align: item.pattern.align,
                  }
                : undefined,
            )
          : undefined;
      return {
        enabled: true,
        position,
        size: unitsPx(item.size, 0),
        blendMode: item.blendMode ?? "normal",
        opacity: clampByte((item.opacity ?? 1) * UINT8_MAX),
        color: colorToRgba(item.color),
        gradient,
        pattern,
      };
    });

  return {
    disabled: effects.disabled,
    ...(dropShadows?.length ? { dropShadows } : {}),
    ...(innerShadows?.length ? { innerShadows } : {}),
    ...(outerGlow ? { outerGlow } : {}),
    ...(innerGlow ? { innerGlow } : {}),
    ...(bevel ? { bevel } : {}),
    ...(satin ? { satin } : {}),
    ...(solidFills?.length ? { solidFills } : {}),
    ...(gradientOverlays?.length ? { gradientOverlays } : {}),
    ...(patternOverlays?.length ? { patternOverlays } : {}),
    ...(strokes?.length ? { strokes } : {}),
  };
}

function normalizeAdjustment(adj: AdjustmentLayer | undefined): PsdAdjustment | undefined {
  if (!adj) return undefined;
  switch (adj.type) {
    case "brightness/contrast":
      return {
        type: "brightness/contrast",
        brightness: adj.brightness ?? 0,
        contrast: adj.contrast ?? 0,
        useLegacy: Boolean(adj.useLegacy),
      };
    case "hue/saturation":
      return {
        type: "hue/saturation",
        colorize: Boolean(adj.colorize),
        master: {
          hue: adj.master?.hue ?? 0,
          saturation: adj.master?.saturation ?? 0,
          lightness: adj.master?.lightness ?? 0,
        },
        ...(adj.colorization
          ? {
              colorization: {
                hue: adj.colorization.hue ?? 0,
                saturation: adj.colorization.saturation ?? 0,
                lightness: adj.colorization.lightness ?? 0,
              },
            }
          : {}),
        ranges: [adj.reds, adj.yellows, adj.greens, adj.cyans, adj.blues, adj.magentas].filter(
          (r): r is NonNullable<typeof r> => Boolean(r),
        ),
      };
    case "exposure":
      return {
        type: "exposure",
        exposure: adj.exposure ?? 0,
        offset: adj.offset ?? 0,
        gamma: adj.gamma ?? 1,
      };
    case "levels": {
      const mapLevel = (ch: NonNullable<typeof adj.channels>[number] | undefined) =>
        ch
          ? {
              inputFloor: ch.shadowInput,
              inputCeiling: ch.highlightInput,
              outputFloor: ch.shadowOutput,
              outputCeiling: ch.highlightOutput,
              gamma: ch.midtoneInput,
            }
          : undefined;
      return {
        type: "levels",
        rgb: mapLevel(adj.channels?.[0]),
        red: mapLevel(adj.channels?.[1]),
        green: mapLevel(adj.channels?.[2]),
        blue: mapLevel(adj.channels?.[3]),
      };
    }
    case "curves":
      return {
        type: "curves",
        rgb: adj.channels?.[0],
        red: adj.channels?.[1],
        green: adj.channels?.[2],
        blue: adj.channels?.[3],
      };
    case "vibrance":
      return {
        type: "vibrance",
        vibrance: adj.vibrance ?? 0,
        saturation: adj.saturation ?? 0,
      };
    case "black & white":
      return {
        type: "black & white",
        reds: adj.reds ?? 40,
        yellows: adj.yellows ?? 60,
        greens: adj.greens ?? 40,
        cyans: adj.cyans ?? 60,
        blues: adj.blues ?? 20,
        magentas: adj.magentas ?? 80,
        useTint: Boolean(adj.useTint),
        tintColor: colorToRgba(adj.tintColor),
      };
    case "invert":
      return { type: "invert" };
    case "posterize":
      return { type: "posterize", levels: adj.levels ?? 4 };
    case "threshold":
      return { type: "threshold", level: adj.level ?? 128 };
    case "color balance":
      return {
        type: "color balance",
        shadows: adj.shadows ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
        midtones: adj.midtones ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
        highlights: adj.highlights ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
        preserveLuminosity: adj.preserveLuminosity !== false,
      };
    case "channel mixer":
      return {
        type: "channel mixer",
        monochrome: Boolean(adj.monochrome),
        red: adj.red ?? { red: 100, green: 0, blue: 0, constant: 0 },
        green: adj.green ?? { red: 0, green: 100, blue: 0, constant: 0 },
        blue: adj.blue ?? { red: 0, green: 0, blue: 100, constant: 0 },
        gray: adj.gray ?? { red: 0, green: 0, blue: 0, constant: 0 },
      };
    case "photo filter":
      return {
        type: "photo filter",
        color: colorToRgba(adj.color) ?? [236, 138, 0, UINT8_MAX],
        density: adj.density ?? 0.25,
        preserveLuminosity: adj.preserveLuminosity !== false,
      };
    case "gradient map":
      if (adj.gradientType === "solid" && adj.colorStops?.length) {
        return {
          type: "gradient map",
          reverse: Boolean(adj.reverse),
          colorStops: adj.colorStops.map((stop) => ({
            color: colorToRgba(stop.color) ?? [0, 0, 0, UINT8_MAX],
            location: stop.location ?? 0,
            midpoint: stop.midpoint ?? 0.5,
          })),
        };
      }
      return { type: "unsupported", rawType: adj.type };
    case "selective color": {
      const mapCh = (ch?: { c?: number; m?: number; y?: number; k?: number }) =>
        ch
          ? {
              cyan: ch.c ?? 0,
              magenta: ch.m ?? 0,
              yellow: ch.y ?? 0,
              black: ch.k ?? 0,
            }
          : undefined;
      return {
        type: "selective color",
        mode: adj.mode === "absolute" ? "absolute" : "relative",
        reds: mapCh(adj.reds),
        yellows: mapCh(adj.yellows),
        greens: mapCh(adj.greens),
        cyans: mapCh(adj.cyans),
        blues: mapCh(adj.blues),
        magentas: mapCh(adj.magentas),
        whites: mapCh(adj.whites),
        neutrals: mapCh(adj.neutrals),
        blacks: mapCh(adj.blacks),
      };
    }
    default:
      return { type: "unsupported", rawType: (adj as { type?: string }).type ?? "unknown" };
  }
}

function normalizeAnimationFrames(layer: Layer): readonly PsdLayerFrameState[] | undefined {
  if (!layer.animationFrames?.length) return undefined;
  return layer.animationFrames.map((frame) => ({
    frameIds: frame.frames,
    ...(frame.enable !== undefined ? { enabled: frame.enable } : {}),
    ...(frame.offset ? { offsetX: frame.offset.x, offsetY: frame.offset.y } : {}),
    ...(frame.opacity !== undefined ? { opacity: Math.round(frame.opacity * UINT8_MAX) } : {}),
    ...(frame.fillOpacity !== undefined
      ? { fillOpacity: Math.round(frame.fillOpacity * UINT8_MAX) }
      : {}),
  }));
}

function normalizeLayerTimeline(layer: Layer): PsdLayerTimeline | undefined {
  const tl = layer.timeline;
  if (!tl) return undefined;
  const opacityKeys: PsdTimelineKey[] = [];
  const positionKeys: PsdTimelineKey[] = [];
  for (const track of tl.tracks ?? []) {
    if (track.enabled === false) continue;
    for (const key of track.keys ?? []) {
      const timeSeconds = fractionSeconds(key.time);
      if (key.type === "opacity") {
        opacityKeys.push({
          timeSeconds,
          interpolation: key.interpolation,
          opacity: clampByte((key.value ?? 1) * UINT8_MAX),
        });
      } else if (key.type === "position") {
        positionKeys.push({
          timeSeconds,
          interpolation: key.interpolation,
          x: key.x,
          y: key.y,
        });
      } else if (key.type === "transform" && key.translation) {
        positionKeys.push({
          timeSeconds,
          interpolation: key.interpolation,
          x: key.translation.x,
          y: key.translation.y,
        });
      }
    }
  }
  return {
    inSeconds: fractionSeconds(tl.inTime),
    outSeconds: fractionSeconds(tl.outTime),
    ...(opacityKeys.length ? { opacityKeys } : {}),
    ...(positionKeys.length ? { positionKeys } : {}),
  };
}

function normalizeLayer(layer: Layer, globalAngle: number): PsdLayer {
  const fill = layer.vectorFill;
  const solidColor = fill?.type === "color" ? colorToRgba(fill.color) : undefined;
  const gradientFill =
    fill?.type === "solid"
      ? normalizeSolidGradient(fill, {
          style: fill.style,
          angle: fill.angle,
          scale: fill.scale,
          reverse: fill.reverse,
          offset: fill.offset,
        })
      : undefined;
  const patternFill =
    fill?.type === "pattern"
      ? normalizePatternFill({ id: fill.id, scale: fill.scale, phase: fill.phase })
      : undefined;
  const adjustment = normalizeAdjustment(layer.adjustment);
  const vectorMask = normalizeVectorMask(layer);
  const effects = normalizeEffects(layer.effects, globalAngle);
  const videoTimeline = normalizeLayerTimeline(layer);

  const artboard =
    layer.artboard?.rect &&
    layer.artboard.rect.right > layer.artboard.rect.left &&
    layer.artboard.rect.bottom > layer.artboard.rect.top
      ? {
          left: layer.artboard.rect.left,
          top: layer.artboard.rect.top,
          right: layer.artboard.rect.right,
          bottom: layer.artboard.rect.bottom,
          backgroundColor:
            layer.artboard.backgroundType === 1
              ? ([255, 255, 255, UINT8_MAX] as Rgba)
              : layer.artboard.backgroundType === 2
                ? ([0, 0, 0, UINT8_MAX] as Rgba)
                : layer.artboard.backgroundType === 4
                  ? colorToRgba(layer.artboard.color)
                  : undefined,
        }
      : undefined;

  return {
    name: layer.name ?? "",
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    right: layer.right ?? 0,
    bottom: layer.bottom ?? 0,
    hidden: Boolean(layer.hidden),
    opacity: Math.round((layer.opacity ?? 1) * UINT8_MAX),
    fillOpacity: Math.round((layer.fillOpacity ?? 1) * UINT8_MAX),
    blendMode: layer.blendMode ?? "normal",
    clipping: Boolean(layer.clipping),
    locked: Boolean(layer.protected?.composite || layer.protected?.transparency),
    positionLocked: Boolean(layer.protected?.position),
    ...(layer.opened !== undefined ? { opened: layer.opened } : {}),
    ...(artboard ? { artboard } : {}),
    ...(layer.blendClippendElements !== undefined
      ? { blendClippedElements: layer.blendClippendElements }
      : {}),
    ...(layer.blendInteriorElements !== undefined
      ? { blendInteriorElements: layer.blendInteriorElements }
      : {}),
    ...(adjustment ? { adjustment } : {}),
    ...(vectorMask ? { vectorMask } : {}),
    ...(solidColor ? { solidColor } : {}),
    ...(gradientFill ? { gradientFill } : {}),
    ...(patternFill ? { patternFill } : {}),
    ...(effects ? { effects } : {}),
    pixels: toRgbaPixelBuffer(layer.imageData),
    mask: normalizeMaskData(layer.mask),
    realMask: normalizeMaskData(layer.realMask),
    animationFrames: normalizeAnimationFrames(layer),
    ...(videoTimeline ? { videoTimeline } : {}),
    ...(layer.children
      ? { children: layer.children.map((child) => normalizeLayer(child, globalAngle)) }
      : {}),
  };
}

function normalizeAnimations(psd: Psd): PsdAnimations | undefined {
  const raw = psd.imageResources?.animations;
  if (!raw || !raw.frames?.length || !raw.animations?.length) return undefined;
  return {
    activeAnimation: raw.activeAnimation,
    frames: raw.frames.map((frame) => ({
      id: frame.id,
      delaySeconds: frame.delay ?? 0,
    })),
    sequences: raw.animations.map((sequence) => ({
      id: sequence.id,
      frameIds: sequence.frames,
      ...(sequence.repeats !== undefined ? { repeats: sequence.repeats } : {}),
      ...(sequence.activeFrame !== undefined ? { activeFrame: sequence.activeFrame } : {}),
    })),
  };
}

function normalizeVideoTimeline(psd: Psd): PsdVideoTimeline | undefined {
  const raw = psd.imageResources?.timelineInformation;
  if (!raw || !raw.enabled) return undefined;
  return {
    enabled: true,
    frameRate: raw.frameRate || 30,
    durationSeconds: fractionSeconds(raw.duration),
    workInSeconds: fractionSeconds(raw.workInTime),
    workOutSeconds: fractionSeconds(raw.workOutTime),
    currentTimeSeconds: fractionSeconds(raw.time),
    ...(raw.repeats !== undefined ? { repeats: raw.repeats } : {}),
  };
}

function normalizePatterns(psd: Psd): readonly PsdPattern[] | undefined {
  const raw = (
    psd as Psd & {
      patterns?: readonly {
        id: string;
        name: string;
        bounds: { w: number; h: number };
        data: Uint8Array;
      }[];
    }
  ).patterns;
  if (!raw?.length) return undefined;
  const out: PsdPattern[] = [];
  for (const pat of raw) {
    const w = pat.bounds?.w ?? 0;
    const h = pat.bounds?.h ?? 0;
    if (w <= 0 || h <= 0 || !pat.data || pat.data.byteLength < w * h * RGBA_CHANNELS) continue;
    out.push({
      id: pat.id,
      name: pat.name ?? "",
      pixels: {
        width: w,
        height: h,
        data: new Uint8ClampedArray(pat.data.buffer, pat.data.byteOffset, w * h * RGBA_CHANNELS),
      },
    });
  }
  return out.length ? out : undefined;
}

function normalizeSlices(psd: Psd): readonly PsdSlice[] | undefined {
  const raw = psd.imageResources?.slices;
  if (!raw) return undefined;
  const groups = Array.isArray(raw) ? raw : [raw];
  const list = groups.flatMap((group) => group.slices ?? []);
  if (!list.length) return undefined;
  return list.map((slice) => ({
    id: slice.id,
    groupId: slice.groupId ?? 0,
    name: slice.name ?? "",
    left: slice.bounds?.left ?? 0,
    top: slice.bounds?.top ?? 0,
    right: slice.bounds?.right ?? 0,
    bottom: slice.bounds?.bottom ?? 0,
    ...(slice.backgroundColorType === "color" && slice.backgroundColor
      ? {
          color: [
            clampByte(slice.backgroundColor.r),
            clampByte(slice.backgroundColor.g),
            clampByte(slice.backgroundColor.b),
            clampByte(slice.backgroundColor.a ?? UINT8_MAX),
          ] as Rgba,
        }
      : {}),
  }));
}

function normalizePalette(psd: Psd): readonly Rgba[] | undefined {
  if (!psd.palette?.length) return undefined;
  const transparentIndex = psd.imageResources?.transparencyIndex;
  return psd.palette.map((entry, index): Rgba => [
    clampByte(entry.r),
    clampByte(entry.g),
    clampByte(entry.b),
    transparentIndex === index ? 0 : UINT8_MAX,
  ]);
}

function preflightPsdHeader(bytes: Uint8Array, limits: PsdResourceLimits): void {
  if (bytes.byteLength > limits.maxFileBytes) {
    throw new PsdCodecError(
      `PSD file exceeds the ${limits.maxFileBytes} byte browser resource limit.`,
      PsdIssueCode.ResourceLimit,
    );
  }
  if (bytes.byteLength < PSD_HEADER_BYTES || !isPsdData(bytes)) {
    throw new PsdCodecError("Invalid Photoshop PSD/PSB file header.", PsdIssueCode.InvalidHeader);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = view.getUint32(PSD_HEIGHT_OFFSET, false);
  const width = view.getUint32(PSD_WIDTH_OFFSET, false);
  if (width < 1 || height < 1) {
    throw new PsdCodecError("PSD dimensions must be positive.", PsdIssueCode.InvalidHeader);
  }
  if (width > limits.maxWidth || height > limits.maxHeight || width * height > limits.maxPixels) {
    throw new PsdCodecError(
      `PSD canvas ${width}×${height} exceeds the browser resource limit.`,
      PsdIssueCode.ResourceLimit,
    );
  }
}

/** Synchronously decodes PSD/PSB bytes into an Xprite `EditorProject`. Runs in workers or Node. */
export function decodePsdProjectSync(
  bytes: Uint8Array,
  limitsOverride?: Partial<PsdResourceLimits>,
): EditorProject {
  const limits: PsdResourceLimits = { ...EDITOR_PSD_LIMITS, ...limitsOverride };
  preflightPsdHeader(bytes, limits);
  ensureRawImageDataCanvas();

  let psd: Psd;
  try {
    psd = readPsd(bytes, {
      useImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
      totalMemoryLimit: limits.maxDecodedBytes,
    });
  } catch (reason) {
    throw new PsdCodecError(
      reason instanceof Error ? reason.message : "Unable to decode PSD file.",
      PsdIssueCode.DecodeFailed,
    );
  }

  let composite: PixelBuffer | undefined;
  if (!psd.children?.length) {
    try {
      const flat = readPsd(bytes, {
        useImageData: true,
        skipLayerImageData: true,
        skipCompositeImageData: false,
        skipThumbnail: true,
        skipLinkedFilesData: true,
        totalMemoryLimit: limits.maxDecodedBytes,
      });
      composite = toRgbaPixelBuffer(flat.imageData);
    } catch {
      // Fall back to empty canvas if composite preview is absent or unreadable.
    }
  }

  const globalAngle = psd.imageResources?.globalAngle ?? DEFAULT_GLOBAL_ANGLE;
  const document: PsdDocument = {
    width: psd.width,
    height: psd.height,
    colorMode: (psd.colorMode ?? PsdColorMode.Rgb) as PsdColorMode,
    bitsPerChannel: psd.bitsPerChannel ?? 8,
    palette: normalizePalette(psd),
    patterns: normalizePatterns(psd),
    children: psd.children?.map((child) => normalizeLayer(child, globalAngle)),
    composite,
    animations: normalizeAnimations(psd),
    videoTimeline: normalizeVideoTimeline(psd),
    slices: normalizeSlices(psd),
  };

  return projectFromPsd(document, { limits });
}
