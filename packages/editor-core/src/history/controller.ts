import type { EditorDocument } from "$/document/types";
import type { EditorHistory, UndoOptions } from "$/history/history";

type HistorySnapshot = ReturnType<EditorHistory["getHistorySnapshot"]>;

export interface HistoryKernelPort {
  undo(): boolean;
  redo(): boolean;
  moveToState(index: number): void;
  markSaved(): void;
  getRasterIdentity(): number;
  getNextUndoLabel(): string;
  getNextRedoLabel(): string;
  getOptions(): UndoOptions;
  getSnapshot(): HistorySnapshot;
  setOptions(options: Partial<UndoOptions>): void;
}

export interface HistoryEditorPort {
  getDocument(): EditorDocument | null;
  stopPlayback(): void;
  cancelInlineText(): void;
  hasFloatingPaste(): boolean;
  cancelFloatingPaste(): void;
  cancelGesture(): void;
  retainSlices(): void;
  syncGridView(): void;
  activateCel(document: EditorDocument, frame: number, layer: number): void;
  getStatus(): string;
  setStatus(message: string): void;
  publish(pixelsChanged?: boolean): void;
}

/** User-facing history workflows, backed by the editor kernel's history port. */
export class HistoryController {
  private undoNotice: { id: number; text: string } | null = null;
  private undoNoticeId = 0;

  constructor(
    private readonly kernel: HistoryKernelPort,
    private readonly editor: HistoryEditorPort,
  ) {}

  getSnapshot(): HistorySnapshot {
    return this.kernel.getSnapshot();
  }

  getUndoNotice(): { id: number; text: string } | null {
    return this.undoNotice;
  }

  clearNotice(): void {
    this.undoNotice = null;
  }

  setOptions(options: Partial<UndoOptions>): void {
    this.kernel.setOptions(options);
    this.editor.publish();
  }

  undo(): void {
    this.editor.stopPlayback();
    this.editor.cancelInlineText();
    if (this.editor.hasFloatingPaste()) {
      this.editor.cancelFloatingPaste();
      return;
    }
    this.editor.cancelGesture();
    const document = this.editor.getDocument();
    const rasterIdentity = this.kernel.getRasterIdentity();
    const position = document?.timeline
      ? { frame: document.timeline.activeFrame, layer: document.timeline.activeLayer }
      : null;
    const label = this.kernel.getNextUndoLabel();
    if (!document || !this.kernel.undo()) return;
    this.restorePosition(document, position);
    this.editor.retainSlices();
    this.editor.syncGridView();
    this.finishTraversal(`Undid ${label}`, rasterIdentity);
  }

  redo(): void {
    this.editor.stopPlayback();
    this.editor.cancelInlineText();
    this.editor.cancelGesture();
    const document = this.editor.getDocument();
    const rasterIdentity = this.kernel.getRasterIdentity();
    const position = document?.timeline
      ? { frame: document.timeline.activeFrame, layer: document.timeline.activeLayer }
      : null;
    const label = this.kernel.getNextRedoLabel();
    if (!document || !this.kernel.redo()) return;
    this.restorePosition(document, position);
    this.editor.retainSlices();
    this.editor.syncGridView();
    this.finishTraversal(`Redid ${label}`, rasterIdentity);
  }

  moveToState(index: number): void {
    this.editor.stopPlayback();
    this.editor.cancelGesture();
    const document = this.editor.getDocument();
    if (!document) return;
    const rasterIdentity = this.kernel.getRasterIdentity();
    this.kernel.moveToState(index);
    this.editor.retainSlices();
    this.editor.syncGridView();
    this.editor.publish(rasterIdentity !== this.kernel.getRasterIdentity());
  }

  markSaved(name?: string, format?: EditorDocument["format"]): void {
    const document = this.editor.getDocument();
    if (document && format) document.format = format;
    if (document && name) {
      const previousStatus = `${document.name} · ${document.width} × ${document.height}`;
      document.name = name;
      if (this.editor.getStatus() === previousStatus)
        this.editor.setStatus(`${name} · ${document.width} × ${document.height}`);
    }
    this.kernel.markSaved();
    this.editor.publish();
  }

  private restorePosition(
    document: EditorDocument,
    position: { frame: number; layer: number } | null,
  ): void {
    if (this.kernel.getOptions().gotoModified || !position || !document.timeline) return;
    this.editor.activateCel(
      document,
      Math.min(position.frame, document.timeline.frames.length - 1),
      Math.min(position.layer, document.timeline.layers.length - 1),
    );
  }

  private finishTraversal(message: string, previousRasterIdentity: number): void {
    if (this.kernel.getOptions().showTooltip) {
      this.editor.setStatus("Ready");
      this.undoNotice = { id: ++this.undoNoticeId, text: message };
    } else {
      this.editor.setStatus(message);
      this.undoNotice = null;
    }
    this.editor.publish(previousRasterIdentity !== this.kernel.getRasterIdentity());
  }
}
