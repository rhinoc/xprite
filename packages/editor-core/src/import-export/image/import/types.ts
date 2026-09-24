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
}

export enum PixelationMethod {
  Nearest = "nearest",
  Box = "box",
}

export interface PixelationSize {
  width: number;
  height: number;
}

export interface PixelateOptions {
  /** Nearest-neighbor or a coverage-weighted box average. */
  method?: PixelationMethod;
  /** The low-resolution dimensions to generate. */
  targetWidth?: number;
  targetHeight?: number;
  targetSize?: PixelationSize;
  /** Choose low-resolution dimensions by grouping this many source pixels. */
  blockSize?: number | PixelationSize;
  /** Nearest-neighbor upscale to the source dimensions after pixelation. */
  preserveDimensions?: boolean;
  /** Reduce the result to at most this many colors (maximum 256). */
  maxColors?: number;
  /** Optional palette to use for reduction; otherwise a deterministic palette is extracted. */
  palette?: readonly Rgba[];
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
}
