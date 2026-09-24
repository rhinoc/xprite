import type { Rect } from "$/base/primitives";

export interface SpriteSliceKey {
  frame: number;
  bounds: Rect;
  center?: Rect;
  pivot?: { x: number; y: number };
}

export type SliceKey = SpriteSliceKey;

export interface SpriteSlice {
  id: string;
  name: string;
  keys: readonly SpriteSliceKey[];
  color?: string;
  data?: string;
  properties?: Uint8Array;
}

export interface SlicePropertiesEdit {
  name?: string;
  bounds?: Partial<Rect>;
  center?: Partial<Rect> | null;
  pivot?: Partial<{ x: number; y: number }> | null;
  color?: string;
  data?: string;
  properties?: Uint8Array;
}
