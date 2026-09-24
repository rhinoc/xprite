import { sliceKeyAt } from "@xprite/editor-core";

export interface SlicePoint {
  x: number;
  y: number;
}

export interface SliceRect extends SlicePoint {
  width: number;
  height: number;
}

export interface SliceKeyView {
  frame: number;
  bounds: SliceRect;
  center?: SliceRect;
  pivot?: SlicePoint;
}

export interface SpriteSliceView {
  id: string;
  name: string;
  keys: readonly SliceKeyView[];
  color?: string;
  data?: string;
  properties?: Uint8Array;
}

export interface SlicePropertiesEditView {
  name?: string;
  bounds?: Partial<SliceRect>;
  center?: Partial<SliceRect> | null;
  pivot?: Partial<SlicePoint> | null;
  color?: string;
  data?: string;
  properties?: Uint8Array;
}

export function getSliceKeyAt(slice: SpriteSliceView, frame: number): SliceKeyView | undefined {
  return sliceKeyAt(slice, frame);
}
