import type { Rgba } from "$/base/primitives";

/** The intentionally conservative result of the image import heuristic. */
export enum PixelArtClassification {
  LikelyPixelArt = "likely-pixel-art",
  LikelyPhoto = "likely-photo",
  Uncertain = "uncertain",
}

export interface PixelArtMetrics {
  width: number;
  height: number;
  sampledPixels: number;
  uniqueColors: number;
  uniqueColorsCapped: boolean;
  uniqueColorRatio: number;
  exactNeighborRatio: number;
  nearNeighborRatio: number;
  edgeDensity: number;
  colorEntropy: number;
  transparentRatio: number;
  opaqueRatio: number;
}

export interface PixelArtAnalysisOptions {
  /** Apply the user's choice after the heuristic has run. */
  userOverride?: PixelArtClassification | null;
  /** Bound work for very large photographs while retaining deterministic sampling. */
  maxSamplePixels?: number;
  /** Grid detection algorithm; Auto when omitted. */
  algorithm?: PixelationAlgorithm;
  /** Output size for entries that take one (Custom size); ignored by the others. */
  size?: PixelationSize;
}

export interface PixelArtAnalysis {
  /** The choice a caller should use, including an explicit user override. */
  classification: PixelArtClassification;
  /** The heuristic's choice before applying a user override. */
  suggestedClassification: PixelArtClassification;
  /** A 0..1 indication of how far the heuristic was from its decision boundary. */
  confidence: number;
  /** Signed score: positive favors pixel art, negative favors a photo. */
  score: number;
  /** Human-readable, deliberately non-authoritative reasons for the suggestion. */
  evidence: readonly string[];
  metrics: PixelArtMetrics;
  userOverride: PixelArtClassification | null;
  overrideApplied: boolean;
  /** This is a heuristic and must never silently replace a user's choice. */
  isHeuristic: true;
  grid: PixelGridAnalysis;
}

export enum PixelationMethod {
  Nearest = "nearest",
  Box = "box",
  MostFrequent = "most-frequent",
  Dominant = "dominant",
  Structure = "structure",
}

export enum PixelationMode {
  Convert = "convert",
  RecoverGrid = "recover-grid",
}

export enum PixelationAlgorithm {
  Auto = "auto",
  EdgeGrid = "edge-grid",
  UniformGrid = "uniform-grid",
  /** The user names the output size; the image is split into that many even blocks. */
  CustomSize = "custom-size",
  Resize = "resize",
}

/**
 * The outline pre-pass ahead of the colour rule. PixelOE runs outline expansion + colour match;
 * PixelOE + lines also guides the expansion weight with an XDoG line drawing of the source.
 */
export enum OutlinePrepass {
  None = "none",
  Pixeloe = "pixeloe",
  PixeloeLines = "pixeloe-lines",
}

/** How a line drawing changes PixelOE's outline weight (1 = spread dark, 0 = spread bright). */
export enum LineGuideMode {
  /** max(weight, lines): PixelOE's own weight, plus dark spreading along every line. */
  Union = "union",
  /** weight = lines: dark spreads only along lines, bright everywhere else. */
  Replace = "replace",
}

/** How one colour is chosen for each grid cell, independent of how the grid was found. */
export enum CellColorPicker {
  MostCommon = "most-common",
  Average = "average",
  Median = "median",
  KMeans = "k-means",
  Contrast = "contrast",
  Nearest = "nearest",
}

export enum ImportDialogChoice {
  AlwaysAsk = "always-ask",
  AlwaysImportAsIs = "always-import-as-is",
  AlwaysPixelate = "always-pixelate",
}
export interface PixelGridGeometry {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  /** Explicit cell boundaries (pixel indices, first 0, last = image size) for irregular grids. */
  cutsX?: readonly number[];
  cutsY?: readonly number[];
}
export interface PixelGridAnalysis extends PixelGridGeometry {
  confidence: number;
  reliable: boolean;
  /** Registry entry that produced this analysis. */
  algorithm?: PixelationAlgorithm;
  /**
   * Degrees the source was rotated to straighten a tilted grid before it was detected. The cuts
   * are measured in that straightened image, so recovery applies the same rotation first.
   */
  rotation?: number;
}

export interface PixelationSize {
  width: number;
  height: number;
}

/** Limit colors, applied to the pixelated image (see palette-snap.ts). */
export interface PaletteSnapOptions {
  /** Number of colours to cluster into (k-means); ignored when `palette` is given. */
  colors?: number;
  /** Snap every visible pixel to its nearest entry (CIE Lab) instead of clustering. */
  palette?: readonly Rgba[];
}

export interface PixelateOptions {
  mode?: PixelationMode;
  algorithm?: PixelationAlgorithm;
  /** Per-cell colour rule when a grid is recovered; MostCommon when omitted. */
  colorPicker?: CellColorPicker;
  grid?: PixelGridGeometry;
  outlineStrength?: number;
  /**
   * Outline pre-pass; None when omitted. With the Contrast picker and no grid recovered from the
   * source (a plain convert or Custom size), a PixelOE pre-pass runs stock PixelOE end to end
   * (contrast downscale + colour match at the output size); otherwise it is an image -> image step
   * before the picker or sampler.
   */
  prepass?: OutlinePrepass;
  /** How the line drawing guides PixelOE + lines; Union when omitted. */
  lineGuide?: LineGuideMode;
  /** Sampling rule used to choose one representative color per output cell. */
  method?: PixelationMethod;
  /** Split the image into even blocks of the target size and let `colorPicker` choose each colour (instead of `method`). */
  blockPicker?: boolean;
  /** The low-resolution dimensions to generate. */
  targetWidth?: number;
  targetHeight?: number;
  targetSize?: PixelationSize;
  /** Choose low-resolution dimensions by grouping this many source pixels. */
  blockSize?: number | PixelationSize;
  /** Nearest-neighbor upscale to the source dimensions after pixelation. */
  preserveDimensions?: boolean;
  /**
   * Limit colors: Lab k-means to a colour count that keeps rare colours, or snapping to a given
   * palette. Alpha stays per pixel. Off when omitted.
   */
  paletteSnap?: PaletteSnapOptions;
  /** Light smoothing of similar neighboring colors on the working grid. */
  removeNoise?: boolean;
  /** Box mode defaults to straight channel means; premultiplied is useful for compositing. */
  alphaMode?: "straight" | "premultiplied";
}

export interface PaletteEntry {
  color: Rgba;
  count: number;
  coverage: number;
}

export interface ExtractPaletteOptions {
  /** Number of entries to return. Values above 256 are capped. */
  maxColors?: number;
  ignoreTransparent?: boolean;
}

/** Shared conversion draft used by import and standalone tools. */
export interface PixelationSettings {
  mode: PixelationMode;
  /**
   * Limit colors: snap the result to `maxColors` colours (k-means keeping rare colours) or, when
   * one is loaded, to `palette`.
   */
  reduceColors: boolean;
  outlineStrength: number;
  /** Outline pre-pass ahead of the colour rule (see `PixelateOptions.prepass`). */
  prepass: OutlinePrepass;
  /** Line guide of the PixelOE + lines pre-pass. */
  lineGuide: LineGuideMode;
  colorPicker: CellColorPicker;
  autoGrid: boolean;
  gridCellWidth: number;
  gridCellHeight: number;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  method: PixelationMethod;
  /** Colour each target-size block with `colorPicker` rather than resampling with `method`. */
  blockPicker: boolean;
  preserveDimensions: boolean;
  removeNoise: boolean;
  lockAspectRatio: boolean;
  palette: readonly Rgba[] | null;
  paletteName: string;
}

export interface ImportDialogPreference {
  choice: ImportDialogChoice;
  algorithm: PixelationAlgorithm;
  colorPicker: CellColorPicker;
}
