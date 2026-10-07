import type { AsepriteImageSamples } from "$/base/image";
import type { PixelBuffer, Rect, Rgba } from "$/base/primitives";
import type {
  AsepriteCelMetadata,
  AsepriteColorProfile,
  AsepriteFrameMetadata,
  AsepriteLayer,
  AsepriteSourceMetadata,
  AsepriteTag,
  AsepriteTileset,
  AsepriteUserData,
} from "$/import-export/aseprite/model";
import type { SpriteSlice } from "$/sprite/slices";
import type { TilemapImage } from "$/tilemap/types";

export interface TimelineLayer {
  source?: AsepriteLayer;
  userData?: AsepriteUserData | null;
  kind?: "image" | "group" | "tilemap";
  tilesetId?: number;
  parentId?: string | null;
  blendMode?: number;
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  flags: number;
}

export interface TimelineCel {
  tilemap?: TilemapImage;
  asepriteSamples?: AsepriteImageSamples;
  source?: AsepriteCelMetadata;
  userData?: AsepriteUserData | null;
  preciseBounds?: Rect;
  pixels: PixelBuffer;
  x: number;
  y: number;
  opacity: number;
  zIndex: number;
}

export interface TimelineFrame {
  palette?: readonly Rgba[];
  source?: AsepriteFrameMetadata;
  duration: number;
  cels: readonly (TimelineCel | null)[];
}

export interface TimelineRange {
  kind: "frames" | "layers" | "cels";
  frames: readonly number[];
  layers: readonly number[];
}

export enum TimelineLayerDropPosition {
  Above = "above",
  Below = "below",
  Inside = "inside",
}

export interface SpriteTimeline {
  /** Total full-animation plays, including the first; 0 is infinite, absent uses editor defaults. */
  loopCount?: number;
  slices?: readonly SpriteSlice[];
  tilesets?: readonly AsepriteTileset[];
  gridBounds?: Rect;
  colorDepth?: 8 | 16 | 32;
  transparentIndex?: number;
  pixelRatio?: readonly [width: number, height: number];
  useLayerUuids?: boolean;
  userData?: AsepriteUserData | null;
  colorProfile?: AsepriteColorProfile | null;
  composeGroups?: boolean;
  range?: TimelineRange;
  tags?: readonly AsepriteTag[];
  asepriteSource?: AsepriteSourceMetadata;
  layers: readonly TimelineLayer[];
  frames: readonly TimelineFrame[];
  activeLayer: number;
  activeFrame: number;
}

export interface OnionSkinSettings {
  active: boolean;
  previousFrames: number;
  nextFrames: number;
  opacityBase: number;
  opacityStep: number;
  type: "merge" | "red-blue";
  loopTag: boolean;
  currentLayer: boolean;
  position: "behind" | "in-front";
}

export interface PlaybackSettings {
  speed: number;
  playOnce: boolean;
  playAll: boolean;
  playSubtags: boolean;
  rewindOnStop: boolean;
}
