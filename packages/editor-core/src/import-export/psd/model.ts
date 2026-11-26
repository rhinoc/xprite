import type { PixelBuffer, Rgba } from "$/base";

export enum PsdColorMode {
  Bitmap = 0,
  Grayscale = 1,
  Indexed = 2,
  Rgb = 3,
  Cmyk = 4,
  Multichannel = 7,
  Duotone = 8,
  Lab = 9,
}

export interface PsdMask {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  /** Value (0..255) applied outside the mask rectangle. */
  readonly defaultColor: number;
  readonly disabled: boolean;
  /** Density multiplier in [0, 1]; 1 applies full mask strength. */
  readonly density?: number;
  /** Mask raster pixels (grayscale/RGBA where R channel holds mask intensity). */
  readonly pixels?: PixelBuffer;
}

export interface PsdBezierKnot {
  /** `[prevX, prevY, anchorX, anchorY, nextX, nextY]` in document pixels. */
  readonly points: readonly [number, number, number, number, number, number];
}

export type PsdPathOperation = "combine" | "subtract" | "intersect" | "exclude";

export interface PsdVectorSubpath {
  readonly open: boolean;
  readonly operation: PsdPathOperation;
  readonly knots: readonly PsdBezierKnot[];
}

export interface PsdVectorMask {
  readonly invert: boolean;
  readonly disabled: boolean;
  readonly paths: readonly PsdVectorSubpath[];
}

export interface PsdGradientColorStop {
  readonly color: Rgba;
  /** Stop position in [0, 1]. */
  readonly location: number;
  /** Midpoint bias in (0, 1), default 0.5. */
  readonly midpoint: number;
}

export interface PsdGradientOpacityStop {
  /** Opacity in [0, 1]. */
  readonly opacity: number;
  /** Stop position in [0, 1]. */
  readonly location: number;
  readonly midpoint: number;
}

export type PsdGradientStyle = "linear" | "radial" | "angle" | "reflected" | "diamond";

export interface PsdGradientFill {
  readonly style: PsdGradientStyle;
  /** Angle in degrees (Photoshop convention: 0 = left-to-right, 90 = bottom-to-top). */
  readonly angle: number;
  /** Scale factor (1 = 100%). */
  readonly scale: number;
  readonly reverse: boolean;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly colorStops: readonly PsdGradientColorStop[];
  readonly opacityStops: readonly PsdGradientOpacityStop[];
}

export interface PsdPattern {
  readonly id: string;
  readonly name: string;
  readonly pixels: PixelBuffer;
}

export interface PsdPatternFill {
  readonly patternId: string;
  readonly scale: number;
  readonly phaseX: number;
  readonly phaseY: number;
  readonly align?: boolean;
}

export interface PsdArtboard {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly backgroundColor?: Rgba;
}

export type PsdBevelStyle =
  | "outer bevel"
  | "inner bevel"
  | "emboss"
  | "pillow emboss"
  | "stroke emboss";

export interface PsdBevelEffect {
  readonly enabled: boolean;
  readonly style: PsdBevelStyle;
  readonly direction: "up" | "down";
  readonly size: number;
  readonly soften: number;
  readonly strength: number;
  readonly angle: number;
  readonly altitude: number;
  readonly highlightBlendMode: string;
  readonly highlightColor: Rgba;
  readonly highlightOpacity: number;
  readonly shadowBlendMode: string;
  readonly shadowColor: Rgba;
  readonly shadowOpacity: number;
}

export interface PsdSatinEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: Rgba;
  readonly opacity: number;
  readonly angle: number;
  readonly distance: number;
  readonly size: number;
  readonly invert: boolean;
}

interface PsdShadowEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: Rgba;
  readonly opacity: number;
  readonly angle: number;
  readonly distance: number;
  readonly size: number;
  readonly choke: number;
  readonly layerConceals: boolean;
}

interface PsdGlowEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: Rgba;
  readonly opacity: number;
  readonly size: number;
  readonly choke: number;
  readonly innerSource?: "center" | "edge";
}

interface PsdSolidOverlayEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly color: Rgba;
  readonly opacity: number;
}

interface PsdGradientOverlayEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly opacity: number;
  readonly gradient: PsdGradientFill;
}

interface PsdPatternOverlayEffect {
  readonly enabled: boolean;
  readonly blendMode: string;
  readonly opacity: number;
  readonly pattern: PsdPatternFill;
}

type PsdStrokePosition = "inside" | "center" | "outside";

interface PsdStrokeEffect {
  readonly enabled: boolean;
  readonly position: PsdStrokePosition;
  readonly size: number;
  readonly blendMode: string;
  readonly opacity: number;
  readonly color?: Rgba;
  readonly gradient?: PsdGradientFill;
  readonly pattern?: PsdPatternFill;
}

export interface PsdEffects {
  readonly disabled?: boolean;
  readonly dropShadows?: readonly PsdShadowEffect[];
  readonly innerShadows?: readonly PsdShadowEffect[];
  readonly outerGlow?: PsdGlowEffect;
  readonly innerGlow?: PsdGlowEffect;
  readonly bevel?: PsdBevelEffect;
  readonly satin?: PsdSatinEffect;
  readonly solidFills?: readonly PsdSolidOverlayEffect[];
  readonly gradientOverlays?: readonly PsdGradientOverlayEffect[];
  readonly patternOverlays?: readonly PsdPatternOverlayEffect[];
  readonly strokes?: readonly PsdStrokeEffect[];
}

export interface PsdLevelsChannel {
  readonly inputFloor: number;
  readonly inputCeiling: number;
  readonly outputFloor: number;
  readonly outputCeiling: number;
  readonly gamma: number;
}

export interface PsdCurvePoint {
  readonly input: number;
  readonly output: number;
}

interface PsdHueSatRange {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

interface PsdColorBalanceTriplet {
  readonly cyanRed: number;
  readonly magentaGreen: number;
  readonly yellowBlue: number;
}

export interface PsdSelectiveColorChannel {
  readonly cyan: number;
  readonly magenta: number;
  readonly yellow: number;
  readonly black: number;
}

interface PsdChannelMixerChannel {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly constant: number;
}

export type PsdAdjustment =
  | {
      readonly type: "brightness/contrast";
      readonly brightness: number;
      readonly contrast: number;
      readonly useLegacy: boolean;
    }
  | {
      readonly type: "hue/saturation";
      readonly colorize: boolean;
      readonly master: {
        readonly hue: number;
        readonly saturation: number;
        readonly lightness: number;
      };
      readonly colorization?: {
        readonly hue: number;
        readonly saturation: number;
        readonly lightness: number;
      };
      readonly ranges?: readonly PsdHueSatRange[];
    }
  | {
      readonly type: "exposure";
      readonly exposure: number;
      readonly offset: number;
      readonly gamma: number;
    }
  | {
      readonly type: "levels";
      readonly rgb?: PsdLevelsChannel;
      readonly red?: PsdLevelsChannel;
      readonly green?: PsdLevelsChannel;
      readonly blue?: PsdLevelsChannel;
    }
  | {
      readonly type: "curves";
      readonly rgb?: readonly PsdCurvePoint[];
      readonly red?: readonly PsdCurvePoint[];
      readonly green?: readonly PsdCurvePoint[];
      readonly blue?: readonly PsdCurvePoint[];
    }
  | {
      readonly type: "vibrance";
      readonly vibrance: number;
      readonly saturation: number;
    }
  | {
      readonly type: "black & white";
      readonly reds: number;
      readonly yellows: number;
      readonly greens: number;
      readonly cyans: number;
      readonly blues: number;
      readonly magentas: number;
      readonly useTint: boolean;
      readonly tintColor?: Rgba;
    }
  | { readonly type: "invert" }
  | { readonly type: "posterize"; readonly levels: number }
  | { readonly type: "threshold"; readonly level: number }
  | {
      readonly type: "color balance";
      readonly shadows: PsdColorBalanceTriplet;
      readonly midtones: PsdColorBalanceTriplet;
      readonly highlights: PsdColorBalanceTriplet;
      readonly preserveLuminosity: boolean;
    }
  | {
      readonly type: "channel mixer";
      readonly monochrome: boolean;
      readonly red: PsdChannelMixerChannel;
      readonly green: PsdChannelMixerChannel;
      readonly blue: PsdChannelMixerChannel;
      readonly gray: PsdChannelMixerChannel;
    }
  | {
      readonly type: "photo filter";
      readonly color: Rgba;
      readonly density: number;
      readonly preserveLuminosity: boolean;
    }
  | {
      readonly type: "gradient map";
      readonly reverse: boolean;
      readonly colorStops: readonly PsdGradientColorStop[];
    }
  | {
      readonly type: "selective color";
      readonly mode: "relative" | "absolute";
      readonly reds?: PsdSelectiveColorChannel;
      readonly yellows?: PsdSelectiveColorChannel;
      readonly greens?: PsdSelectiveColorChannel;
      readonly cyans?: PsdSelectiveColorChannel;
      readonly blues?: PsdSelectiveColorChannel;
      readonly magentas?: PsdSelectiveColorChannel;
      readonly whites?: PsdSelectiveColorChannel;
      readonly neutrals?: PsdSelectiveColorChannel;
      readonly blacks?: PsdSelectiveColorChannel;
    }
  | { readonly type: "unsupported"; readonly rawType: string };

export interface PsdLayerFrameState {
  readonly frameIds: readonly number[];
  readonly enabled?: boolean;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly opacity?: number;
  readonly fillOpacity?: number;
}

export interface PsdTimelineKey {
  readonly timeSeconds: number;
  readonly interpolation: "linear" | "hold";
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
}

export interface PsdLayerTimeline {
  readonly inSeconds: number;
  readonly outSeconds: number;
  readonly opacityKeys?: readonly PsdTimelineKey[];
  readonly positionKeys?: readonly PsdTimelineKey[];
}

export interface PsdVideoTimeline {
  readonly enabled: boolean;
  readonly frameRate: number;
  readonly durationSeconds: number;
  readonly workInSeconds: number;
  readonly workOutSeconds: number;
  readonly currentTimeSeconds: number;
  readonly repeats?: number;
}

export interface PsdLayer {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly hidden: boolean;
  readonly opacity: number;
  readonly fillOpacity: number;
  readonly blendMode: string;
  readonly clipping: boolean;
  readonly locked: boolean;
  readonly positionLocked: boolean;
  readonly opened?: boolean;
  readonly artboard?: PsdArtboard;
  readonly blendClippedElements?: boolean;
  readonly blendInteriorElements?: boolean;
  readonly adjustment?: PsdAdjustment;
  readonly vectorMask?: PsdVectorMask;
  readonly solidColor?: Rgba;
  readonly gradientFill?: PsdGradientFill;
  readonly patternFill?: PsdPatternFill;
  readonly effects?: PsdEffects;
  readonly pixels?: PixelBuffer;
  readonly mask?: PsdMask;
  readonly realMask?: PsdMask;
  readonly animationFrames?: readonly PsdLayerFrameState[];
  readonly videoTimeline?: PsdLayerTimeline;
  readonly children?: readonly PsdLayer[];
}

export interface PsdAnimationFrame {
  readonly id: number;
  /** Delay in seconds as stored in Photoshop `AnDs`. */
  readonly delaySeconds: number;
}

export interface PsdAnimationSequence {
  readonly id: number;
  readonly frameIds: readonly number[];
  readonly repeats?: number;
  readonly activeFrame?: number;
}

export interface PsdAnimations {
  readonly activeAnimation?: number;
  readonly frames: readonly PsdAnimationFrame[];
  readonly sequences: readonly PsdAnimationSequence[];
}

export interface PsdSlice {
  readonly id: number;
  readonly groupId: number;
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly color?: Rgba;
}

export interface PsdDocument {
  readonly width: number;
  readonly height: number;
  readonly colorMode: PsdColorMode;
  readonly bitsPerChannel: number;
  readonly palette?: readonly Rgba[];
  readonly patterns?: readonly PsdPattern[];
  readonly children?: readonly PsdLayer[];
  readonly composite?: PixelBuffer;
  readonly animations?: PsdAnimations;
  readonly videoTimeline?: PsdVideoTimeline;
  readonly slices?: readonly PsdSlice[];
}
