import type { EditorDocument } from "@xprite/editor-core";
import { cloneGraph } from "@xprite/editor-core/base";

/** Tileset output uses the active tilemap layer and frame. */
export function tilesetExportSource(document: EditorDocument): EditorDocument {
  const source = cloneGraph(document);
  if (source.timeline)
    source.timeline.range = {
      kind: "layers",
      layers: [source.timeline.activeLayer],
      frames: [source.timeline.activeFrame],
    };
  return source;
}
