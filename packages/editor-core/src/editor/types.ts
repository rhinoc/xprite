import type { EditorAllocationError } from "$/base/errors";
import type { PixelBuffer, Point, Rect, Rgba } from "$/base/primitives";
import type { DocumentViewOptions, ViewSettings } from "$/canvas/types";
import type { FloatingPaste } from "$/clipboard/types";
import type { EditorDocument } from "$/document/types";
import type { InlineTextDraft } from "$/drawing/text/types";
import type { ToolSettings, EditorTool } from "$/drawing/tool-settings";
import type { SelectionTransform } from "$/selection/types";

export interface GesturePreview {
  tool: EditorTool;
  points: readonly Point[];
  offset?: Point;
  button: number;
  selectionMode?: ToolSettings["selectionMode"];
}

export interface EditorSnapshot {
  /** Local source bounds accumulated through consecutive raster writes.
   * Consumers fall back to full uploads when sources or revisions differ. */
  rasterChange?: RasterChange | null;
  selectedSliceIds?: readonly string[];
  sliceMark?: Rect | null;
  playing: boolean;
  document: EditorDocument | null;
  settings: ToolSettings;
  view: ViewSettings;
  /** Home preferences copied into new images when no document is open. */
  defaultDocumentView: Readonly<DocumentViewOptions>;
  revision: number;
  pixelRevision: number;
  /** Committed recovery state; excludes pointer, view, playback and drafts. */
  persistenceRevision: number;
  palette: readonly Rgba[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  preview: GesturePreview | null;
  linePreview?: GesturePreview | null;
  floatingPaste: FloatingPaste | null;
  selectionTransform: SelectionTransform | null;
  inlineText: InlineTextDraft | null;
  pointer: Point | null;
  status: string;
  undoNotice?: { id: number; text: string } | null;
  error: EditorAllocationError | null;
}

export interface RasterChange {
  pixels: PixelBuffer;
  bounds: Rect;
  fromRevision: number;
  revision: number;
}
