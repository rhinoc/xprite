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
  Resize = "resize",
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
}
export interface PixelGridAnalysis extends PixelGridGeometry {
  confidence: number;
  reliable: boolean;
}

export interface PixelationSize {
  width: number;
  height: number;
}

export interface PixelateOptions {
  mode?: PixelationMode;
  grid?: PixelGridGeometry;
  outlineStrength?: number;
  /** Sampling rule used to choose one representative color per output cell. */
  method?: PixelationMethod;
  /** The low-resolution dimensions to generate. */
  targetWidth?: number;
  targetHeight?: number;
  targetSize?: PixelationSize;
  /** Choose low-resolution dimensions by grouping this many source pixels. */
  blockSize?: number | PixelationSize;
  /** Nearest-neighbor upscale to the source dimensions after pixelation. */
  preserveDimensions?: boolean;
  /** Limit RGB colors (maximum 256); alpha coverage remains independent. */
  maxColors?: number;
  /** Optional palette to use for reduction; otherwise a deterministic palette is extracted. */
  palette?: readonly Rgba[];
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
  reduceColors: boolean;
  outlineStrength: number;
  autoGrid: boolean;
  gridCellWidth: number;
  gridCellHeight: number;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  method: PixelationMethod;
  preserveDimensions: boolean;
  removeNoise: boolean;
  lockAspectRatio: boolean;
  palette: readonly Rgba[] | null;
  paletteName: string;
}

export interface ImportDialogPreference {
  choice: ImportDialogChoice;
  algorithm: PixelationAlgorithm;
}
