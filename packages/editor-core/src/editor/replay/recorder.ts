import type { PixelBuffer } from "$/base/primitives";
import { ReplayStreamEncoder } from "$/editor/replay/stream";
import type { EditorSnapshot } from "$/editor/types";

interface ReplayCaptureSource {
  getSnapshot(): EditorSnapshot;
  canvas: { previewComposite(): PixelBuffer };
}

/** Owns the editor/raster change policy. Application workflows supply timing
 * and presentation metadata without interpreting editor internals. */
export class EditorReplayRecorder {
  private readonly encoder = new ReplayStreamEncoder();
  private sourceKey: readonly unknown[] = [];
  private editorKey: readonly unknown[] = [];
  private observationKey: readonly unknown[];

  constructor(private source: ReplayCaptureSource) {
    this.observationKey = editKey(source.getSnapshot());
  }

  setSource(source: ReplayCaptureSource) {
    this.source = source;
    this.sourceKey = [];
    this.editorKey = [];
    this.observationKey = editKey(source.getSnapshot());
  }

  /** Attribute input only to meaningful edits in the same publication task. */
  observeEdit(): boolean {
    const snapshot = this.source.getSnapshot();
    if (!snapshot.document?.timeline) return false;
    const key = editKey(snapshot);
    const changed = key.some((value, index) => value !== this.observationKey[index]);
    this.observationKey = key;
    return changed;
  }

  capture() {
    const snapshot = this.source.getSnapshot();
    if (!snapshot.document?.timeline) return null;
    const editorKey = [
      snapshot.persistenceRevision,
      snapshot.settings,
      snapshot.view,
      snapshot.palette,
      snapshot.defaultDocumentView,
      snapshot.document.selection,
      snapshot.document.timeline?.activeFrame,
      snapshot.document.timeline?.activeLayer,
      snapshot.document.timeline?.range,
      snapshot.selectedSliceIds,
      snapshot.sliceMark,
      snapshot.canUndo,
      snapshot.canRedo,
      snapshot.dirty,
      snapshot.playing,
    ];
    const sourceKey = editKey(snapshot);
    if (this.sourceKey.length && sourceKey.every((value, index) => value === this.sourceKey[index]))
      return null;
    const editorChanged = editorKey.some((value, index) => value !== this.editorKey[index]);
    const packet = this.encoder.encode(
      { snapshot: { ...snapshot, error: null }, pixels: this.source.canvas.previewComposite() },
      editorChanged,
    );
    // Retain only identities. Encoded packets own their bytes, including in-flight ink.
    this.sourceKey = sourceKey;
    this.editorKey = editorKey;
    return packet;
  }
}

function editKey(snapshot: EditorSnapshot): readonly unknown[] {
  // Recording follows edits, not save/dirty/history publication or app chrome.
  const timeline = snapshot.document?.timeline;
  return [
    snapshot.settings,
    snapshot.view,
    snapshot.palette,
    snapshot.document?.width,
    snapshot.document?.height,
    snapshot.document?.selection,
    timeline?.layers,
    timeline?.frames,
    timeline?.tags,
    timeline?.slices,
    timeline?.activeFrame,
    timeline?.activeLayer,
    timeline?.range,
    snapshot.selectedSliceIds,
    snapshot.sliceMark,
    snapshot.pixelRevision,
    snapshot.preview,
    snapshot.linePreview,
    snapshot.floatingPaste,
    snapshot.selectionTransform,
    snapshot.inlineText,
  ];
}
