import type { EditorDocument } from "@xprite/editor-core";
import { cloneGraph } from "@xprite/editor-core/base";

/** Pick the active layer when it is a tilemap, otherwise fall back to the first tilemap layer. */
export function resolveTilesetExportLayerIndex(document: EditorDocument): number {
  const timeline = document.timeline;
  if (!timeline) return -1;
  if (timeline.layers[timeline.activeLayer]?.kind === "tilemap") return timeline.activeLayer;
  return timeline.layers.findIndex((layer) => layer.kind === "tilemap");
}

export function hasExportableTileset(document: EditorDocument): boolean {
  return resolveTilesetExportLayerIndex(document) >= 0;
}

/** Tileset output uses the active tilemap layer when selected, or the first tilemap layer otherwise. */
export function tilesetExportSource(document: EditorDocument): EditorDocument {
  const source = cloneGraph(document);
  if (source.timeline) {
    const layerIndex = resolveTilesetExportLayerIndex(source);
    if (layerIndex >= 0) {
      source.timeline.activeLayer = layerIndex;
      source.timeline.range = {
        kind: "layers",
        layers: [layerIndex],
        frames: [source.timeline.activeFrame],
      };
    }
  }
  return source;
}
