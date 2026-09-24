import type { SurfaceBounds } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";

export interface ControlPixelSize {
  width: number;
  height: number;
}

/** Authored coordinates always include a complete box. */
export interface PositionedControlPlacement {
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  pixelSize?: never;
}

/** A normal-layout control has dimensions, never an authored origin. */
export interface FlowControlPlacement {
  bounds?: never;
  relativeTo?: never;
  pixelSize?: ControlPixelSize;
}

export type ControlPlacement = PositionedControlPlacement | FlowControlPlacement;

/** Tracks, graphs and lists need explicit dimensions in normal layout. */
export type SizedControlPlacement =
  | PositionedControlPlacement
  | (FlowControlPlacement & { pixelSize: ControlPixelSize });

export function sizedControlBounds(placement: SizedControlPlacement): SurfaceBounds {
  if (placement.bounds) return placement.bounds;
  return {
    x: 0,
    y: 0,
    width: placement.pixelSize.width * RASTER_SCALE,
    height: placement.pixelSize.height * RASTER_SCALE,
  };
}
