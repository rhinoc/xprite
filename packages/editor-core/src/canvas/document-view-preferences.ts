import type { DocumentViewOptions } from "$/canvas/types";
import { normalizeOnionSkin, normalizePlayback } from "$/timeline/animation-options";
export enum DocumentViewTarget {
  Document = "document",
  Defaults = "defaults",
}
/** Copy only document preferences; viewport geometry and appearance are not inherited. */
export function copyDocumentViewOptions(value: DocumentViewOptions): Readonly<DocumentViewOptions> {
  return Object.freeze({
    onionSkin: value.onionSkin ? normalizeOnionSkin(value.onionSkin) : undefined,
    playback: value.playback ? normalizePlayback(value.playback) : undefined,
    symmetryMode: value.symmetryMode,
    symmetryX: value.symmetryX,
    symmetryY: value.symmetryY,
    tiledMode: value.tiledMode,
    gridX: value.gridX,
    gridY: value.gridY,
    snapToGrid: value.snapToGrid,
    grid: value.grid,
    pixelGrid: value.pixelGrid,
    selectionEdges: value.selectionEdges,
    guides: value.guides,
    layerEdges: value.layerEdges,
    slices: value.slices,
    tileNumbers: value.tileNumbers,
    brushPreview: value.brushPreview,
    gridWidth: value.gridWidth,
    gridHeight: value.gridHeight,
  });
}
export function updateDocumentViewOptions(
  current: Readonly<DocumentViewOptions>,
  patch: Partial<DocumentViewOptions>,
): Readonly<DocumentViewOptions> {
  const size = (next: number | undefined, old: number) =>
    next !== undefined && Number.isFinite(next) ? Math.max(1, Math.floor(next)) : old;
  const bool = (next: boolean | undefined, old: boolean) =>
    typeof next === "boolean" ? next : old;
  const next = {
    ...current,
    ...validatedAdditionalViewOptions(patch),
    grid: bool(patch.grid, current.grid),
    pixelGrid: bool(patch.pixelGrid, current.pixelGrid),
    selectionEdges: bool(patch.selectionEdges, current.selectionEdges),
    guides: bool(patch.guides, current.guides),
    layerEdges: bool(patch.layerEdges, current.layerEdges),
    slices: bool(patch.slices, current.slices),
    tileNumbers: bool(patch.tileNumbers, current.tileNumbers),
    brushPreview: bool(patch.brushPreview, current.brushPreview),
    gridWidth: size(patch.gridWidth, current.gridWidth),
    gridHeight: size(patch.gridHeight, current.gridHeight),
  };
  return (Object.keys(next) as (keyof DocumentViewOptions)[]).every(
    (key) => next[key] === current[key],
  )
    ? current
    : Object.freeze(next);
}

function validatedAdditionalViewOptions(
  value: Partial<DocumentViewOptions>,
): Partial<DocumentViewOptions> {
  const out: Partial<DocumentViewOptions> = {};
  for (const key of ["symmetryX", "symmetryY", "gridX", "gridY"] as const) {
    const next = value[key];
    if (next !== undefined && Number.isFinite(next))
      out[key] = key.startsWith("grid") ? Math.trunc(next) : next;
  }
  if (value.symmetryMode !== undefined && Number.isInteger(value.symmetryMode))
    out.symmetryMode = value.symmetryMode & 15;
  if (value.tiledMode !== undefined && Number.isInteger(value.tiledMode))
    out.tiledMode = (value.tiledMode & 3) as 0 | 1 | 2 | 3;
  if (value.onionSkin) out.onionSkin = normalizeOnionSkin(value.onionSkin);
  if (value.playback) out.playback = normalizePlayback(value.playback);
  if (typeof value.snapToGrid === "boolean") out.snapToGrid = value.snapToGrid;
  return out;
}
