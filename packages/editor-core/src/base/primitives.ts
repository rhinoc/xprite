import type { AsepriteImageSamples } from "$/base/image";

export type Rgba = readonly [number, number, number, number];

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export enum PixelResizeMethod {
  Nearest = "nearest",
  Bilinear = "bilinear",
  RotSprite = "rotsprite",
}

export interface PixelMask extends Rect {
  data: Uint8Array;
}

export type BrushShape = "circle" | "square" | "line" | "image";
export enum BrushImagePattern {
  AlignedToSource = "aligned-to-source",
  AlignedToDestination = "aligned-to-destination",
  PaintBrush = "paint-brush",
}

export interface BrushPatternImage extends PixelBuffer {
  asepriteSamples?: AsepriteImageSamples;
  palette?: readonly Rgba[];
  transparentIndex?: number;
  sourceBackground?: boolean;
}

export interface BrushImageColors {
  main?: Rgba;
  background?: Rgba;
  mainIndex?: number;
  backgroundIndex?: number;
}

export interface BrushImage extends PixelBuffer {
  anchor?: Point;
  mask?: Uint8Array;
  asepriteSamples?: AsepriteImageSamples;
  palette?: readonly Rgba[];
  transparentIndex?: number;
  sourceBackground?: boolean;
  pattern?: BrushImagePattern;
  patternOrigin?: Point;
  patternImage?: BrushPatternImage;
  imageColors?: BrushImageColors;
}

export interface Brush {
  shape: BrushShape;
  size: number;
  angle: number;
  image?: BrushImage;
}

export interface BitmapGlyph {
  width: number;
  height: number;
  advance: number;
  alpha: Uint8Array;
}

export interface BitmapFont {
  height: number;
  lineHeight: number;
  glyphs: Readonly<Record<string, BitmapGlyph>>;
}

export interface RasterResult {
  dirty: Rect | null;
}
