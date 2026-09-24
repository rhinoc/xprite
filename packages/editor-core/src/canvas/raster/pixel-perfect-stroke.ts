import type { PixelBuffer, Point, Rgba } from "$/base/primitives";
import type { RasterResult } from "$/base/primitives";
import { symmetryBrushMask } from "$/canvas/assistance/symmetry";
import { PixelPerfectPath, PixelPerfectTracePolicy } from "$/canvas/raster/pixel-perfect";
import type { RasterOptions } from "$/canvas/raster/types";
import { projectTiledPixel } from "$/canvas/tiled-canvas";
import type { ToolSettings } from "$/drawing/tool-settings";

import {
  allows,
  paintStroke,
  eraseStroke,
  blurStroke,
  pixelWriter,
  samplePixel,
  brushMask,
} from ".";

/** Freehand and selection tools that use the pixel-center corner filter. */
export function supportsPixelPerfect(settings: Pick<ToolSettings, "tool">): boolean {
  return (
    settings.tool === "lasso" ||
    settings.tool === "pencil" ||
    settings.tool === "eraser" ||
    settings.tool === "blur" ||
    settings.tool === "contour"
  );
}

interface SavedBrushPixel {
  x: number;
  y: number;
  color: Rgba;
  index?: number;
  covered?: boolean;
}

export interface PixelPerfectSavedArea {
  point: Point;
  pixels: Map<number, SavedBrushPixel>;
}

/** A transformed copy of a pixel-center operation. The path is generated in
 * the original stroke's coordinate space, then mapped through symmetry. */
export interface PixelPerfectReplica {
  key: number;
  point: Point;
  options: RasterOptions;
}
export type PixelPerfectReplicaMapper = (
  point: Point,
  brush: RasterOptions["brush"],
) => readonly PixelPerfectReplica[];

/** Save the brush stamp's pixel bounds so a discarded corner can restore the
 * exact prior colors, indices, and overlap coverage. */
export function savePixelPerfectArea(
  image: PixelBuffer,
  point: Point,
  options: RasterOptions,
): PixelPerfectSavedArea {
  const mask = symmetryBrushMask(brushMask(options.brush), options.symmetryIndex ?? 0);
  const pixels = new Map<number, SavedBrushPixel>();
  const cx = Math.floor(point.x),
    cy = Math.floor(point.y);
  for (let my = 0; my < mask.height; my++) {
    for (let mx = 0; mx < mask.width; mx++) {
      const projected = projectTiledPixel(cx + mask.x + mx, cy + mask.y + my, options.tiled);
      if (!allows(image, projected.x, projected.y, options)) continue;
      const key = projected.y * image.width + projected.x;
      const existing = pixels.get(key);
      const covered = mask.data[my * mask.width + mx]
        ? (options.coverage?.has(key) ?? false)
        : existing?.covered;
      pixels.set(
        key,
        existing
          ? { ...existing, covered }
          : {
              x: projected.x,
              y: projected.y,
              color: samplePixel(image, projected),
              index: options.indexedPixelWriter?.read(projected.x, projected.y),
              covered,
            },
      );
    }
  }
  return { point: { ...point }, pixels };
}

/** Restore a saved brush stamp, including indexed-color identity and the
 * simple-ink overlap coverage used by the rest of the stroke. */
export function restorePixelPerfectArea(
  image: PixelBuffer,
  point: Point,
  saved: PixelPerfectSavedArea | null,
  options: RasterOptions,
): RasterResult["dirty"] {
  if (!saved || saved.point.x !== point.x || saved.point.y !== point.y) return null;
  const indexedPixelWriter = options.indexedPixelWriter;
  const restoreOptions = indexedPixelWriter
    ? {
        ...options,
        indexedPixelWriter: {
          ...indexedPixelWriter,
          resolve: undefined,
          write: (x: number, y: number, color: Rgba) =>
            indexedPixelWriter.write(x, y, color, saved.pixels.get(y * image.width + x)?.index),
        },
      }
    : options;
  const writer = pixelWriter(image, restoreOptions);
  for (const pixel of saved.pixels.values()) writer.write(pixel.x, pixel.y, pixel.color);
  if (options.coverage) {
    for (const [key, pixel] of saved.pixels) {
      if (pixel.covered === undefined) continue;
      if (pixel.covered) options.coverage.add(key);
      else options.coverage.delete(key);
    }
  }
  return writer.result().dirty;
}

/** Applies a pixel-center operation stream to a gesture's mutable cel.
 * Geometry operates image-locally after the controller expands/repositions the cel.
 */
export class PixelPerfectStroke {
  constructor(private readonly ink: "paint" | "erase" | "blur" = "paint") {}
  private path = new PixelPerfectPath();
  private saved = new Map<number, PixelPerfectSavedArea>();
  paint(
    image: PixelBuffer,
    points: readonly Point[],
    options: RasterOptions,
    tracePolicy: PixelPerfectTracePolicy = PixelPerfectTracePolicy.Accumulate,
    brushAngleStatic = true,
    replicasForPoint?: PixelPerfectReplicaMapper,
  ): void {
    if (tracePolicy === PixelPerfectTracePolicy.Last) this.saved.clear();
    for (const operation of this.path.join(points, tracePolicy, {
      brush: options.brush,
      brushAngleStatic,
    })) {
      const { point } = operation;
      const replicas = replicasForPoint?.(point, options.brush) ?? [
        {
          key: options.symmetryIndex ?? 0,
          point,
          options,
        },
      ];
      // Apply each source point to all symmetry copies before advancing. Keep a
      // separate saved area per copy so overlapping branches roll back in the
      // same order as their corresponding paint operations.
      for (const replica of replicas) {
        if (operation.kind === "save") {
          this.saved.set(replica.key, savePixelPerfectArea(image, replica.point, replica.options));
        } else if (operation.kind === "restore") {
          // Restore exact pre-stamp bytes and index values; do not erase.
          restorePixelPerfectArea(
            image,
            replica.point,
            this.saved.get(replica.key) ?? null,
            replica.options,
          );
        } else {
          const stamp =
            this.ink === "erase" ? eraseStroke : this.ink === "blur" ? blurStroke : paintStroke;
          stamp(image, [replica.point], replica.options);
        }
      }
    }
  }
}
