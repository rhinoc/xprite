import type { AsepriteImageSamples } from "$/base/image";
import type { PixelBuffer, PixelMask, Point, Rgba } from "$/base/primitives";
import type { AsepriteColorProfile, AsepriteTileset } from "$/import-export/aseprite/model";
import type { TilemapImage } from "$/tilemap/types";
import type { TimelineFrame, TimelineLayer, TimelineRange } from "$/timeline/types";

export interface TilemapClipboard {
  map: TilemapImage;
  selected: Uint8Array;
  tileset: AsepriteTileset;
}

export interface ClipboardImage {
  tilemap?: TilemapClipboard;
  asepriteSamples?: AsepriteImageSamples;
  transparentIndex?: number;
  sourceBackground?: boolean;
  pixels: PixelBuffer;
  mask: PixelMask | null;
  palette?: readonly Rgba[];
  sourceProfile?: AsepriteColorProfile;
}

export interface TimelineClipboard {
  tilesets?: readonly AsepriteTileset[];
  colorDepth?: 8 | 16 | 32;
  transparentIndex?: number;
  sourceProfile?: AsepriteColorProfile;
  kind: TimelineRange["kind"];
  layers: readonly TimelineLayer[];
  frames: readonly TimelineFrame[];
}

export interface FloatingPaste extends Point {
  pixels: PixelBuffer;
  asepriteSamples?: AsepriteImageSamples;
  sourceAsepriteSamples?: AsepriteImageSamples;
  sourceTransparentIndex?: number;
}
