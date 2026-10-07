import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import type { SpriteTimeline } from "$/timeline/types";

export interface EditorLayer {
  opacity?: number;
  celOpacity?: number;
  zIndex?: number;
  emptyCel?: boolean;
  name: string;
  pixels: PixelBuffer;
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
}

export interface EditorDocument {
  /** Runtime identity, never serialized into Aseprite files. */
  id?: number;
  format?: "png" | "aseprite";
  timeline?: SpriteTimeline;
  name: string;
  width: number;
  height: number;
  layer: EditorLayer;
  selection: PixelMask | null;
  /** Hidden selection mask retained for Reselect; selection-only undo state. */
  hiddenSelection?: PixelMask | null;
  /** Document palette; optional for existing external document constructors. */
  palette?: readonly Rgba[];
}

/** Committed document content for persistence, excluding interaction drafts and
 * undo history. Saving recovery does not save an external project file. */
export interface EditorPersistenceSnapshot {
  version: 1;
  document: EditorDocument;
  dirty: boolean;
}
