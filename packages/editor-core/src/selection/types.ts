import type { PixelBuffer, PixelMask, Point, Rect, Rgba } from "$/base/primitives";

export enum SelectionMode {
  Replace = "replace",
  Add = "add",
  Subtract = "subtract",
  Intersect = "intersect",
}

export enum SelectionModifier {
  Expand = "expand",
  Contract = "contract",
  Border = "border",
}

export enum SelectionRotationAlgorithm {
  Fast = "fast",
  RotSprite = "rotsprite",
}

export enum SelectionPivotPosition {
  Northwest = "northwest",
  North = "north",
  Northeast = "northeast",
  West = "west",
  Center = "center",
  East = "east",
  Southwest = "southwest",
  South = "south",
  Southeast = "southeast",
}

export type SelectionHandle =
  | "move"
  | "bounds"
  | "pivot"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw"
  | "rotate-ne"
  | "rotate-se"
  | "rotate-sw"
  | "rotate-nw";

export interface SelectionTransform {
  source: PixelBuffer;
  mask: PixelMask;
  /** Signed dimensions preserve source corner identity when scaling through an anchor. */
  bounds: Rect;
  angle: number;
  copy: boolean;
  rotationAlgorithm?: SelectionRotationAlgorithm;
  pivotPosition?: Point;
  pivotPoint?: Point;
  opaque?: boolean;
  transparentColor?: Rgba;
}
