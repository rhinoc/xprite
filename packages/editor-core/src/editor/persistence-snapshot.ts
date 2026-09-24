import { cloneEditorProject } from "$/document/project";
import type { EditorDocument } from "$/document/types";

/** Recovery contains committed document content, not interaction drafts or undo
 * history. Browser persistence must never interpret a recovery write as export. */
export interface EditorPersistenceSnapshot {
  version: 1;
  document: EditorDocument;
  dirty: boolean;
}

/** Detached graph; Aseprite metadata and linked-cel pixel identity survive. */
export function clonePersistenceSnapshot(
  snapshot: EditorPersistenceSnapshot,
): EditorPersistenceSnapshot {
  const document = snapshot.document;
  if (!document.timeline) throw new TypeError("Recovery requires a timeline");
  const project = cloneEditorProject({
    image: document.layer.pixels,
    timeline: document.timeline,
    palette: document.palette,
  });
  return {
    version: 1,
    dirty: snapshot.dirty,
    document: {
      ...document,
      id: undefined,
      timeline: { ...project.timeline, range: undefined },
      palette: project.palette,
      layer: { ...document.layer, pixels: project.image },
      selection: null,
      hiddenSelection: undefined,
    },
  };
}
