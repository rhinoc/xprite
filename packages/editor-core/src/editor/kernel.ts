import type { PixelBuffer, Rect } from "$/base/primitives";
import { activateTimelineCel } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import {
  clonePersistenceSnapshot,
  type EditorPersistenceSnapshot,
} from "$/editor/persistence-snapshot";
import type { EditorSnapshot } from "$/editor/types";
import { EditorHistory, type HistoryCommand, type UndoOptions } from "$/history/history";
import type { SpriteTimeline } from "$/timeline/types";

export type EditorSnapshotDraft = Omit<
  EditorSnapshot,
  "revision" | "pixelRevision" | "persistenceRevision"
>;

export interface EditorRevisions {
  revision: number;
  pixelRevision: number;
  persistenceRevision: number;
}

export interface EditorKernelTransaction {
  readonly active: boolean;
  update(change: (document: EditorDocument) => void): boolean;
  commit(): boolean;
  cancel(): boolean;
}

export interface EditorKernelTransactionResult {
  committed: boolean;
  pixelsChanged: boolean;
}

/** Shared document/history kernel. Feature controllers will receive narrower ports. */
export class EditorKernel {
  private document: EditorDocument | null = null;
  private history = new EditorHistory();
  private linkedKernels = new Set<EditorKernel>([this]);
  private receivingLinkedPublication = false;
  private refreshLinkedView: ((pixels: boolean) => void) | null = null;

  private readonly listeners = new Set<() => void>();
  private snapshot!: EditorSnapshot;
  private revision = 0;
  private pixelRevision = 0;
  private persistenceRevision = 0;
  private persistenceSnapshot: EditorPersistenceSnapshot | null = null;
  private persistenceKey: readonly unknown[] = [];
  private persistenceLayers: SpriteTimeline["layers"] | undefined;
  private persistenceLayerKey: readonly unknown[] = [];
  private persistedLayerKey: readonly unknown[] = [];

  /** Linked editors own lightweight active-cel facades over one pixel graph and history. */
  createLinkedKernel(refresh: (pixels: boolean) => void): EditorKernel {
    const linked = new EditorKernel();
    linked.history = this.history;
    linked.linkedKernels = this.linkedKernels;
    linked.refreshLinkedView = refresh;
    linked.document = this.document ? { ...this.document } : null;
    this.linkedKernels.add(linked);
    return linked;
  }

  setLinkedViewRefresh(refresh: (pixels: boolean) => void): void {
    this.refreshLinkedView = refresh;
  }

  detachLinkedView(): void {
    this.linkedKernels.delete(this);
    this.refreshLinkedView = null;
  }

  private receiveLinkedDocument(source: EditorDocument | null, pixels: boolean): void {
    const previous = this.document;
    const previousTimeline = previous?.timeline;
    const sameDocument = !!source && previous?.id === source.id;
    // Keep each controller's facade stable while replacing its shared content graph.
    this.document = source
      ? sameDocument && previous
        ? Object.assign(previous, source)
        : { ...source }
      : null;
    const timeline = this.document?.timeline;
    if (this.document && timeline && sameDocument && previousTimeline) {
      const selectedLayerId = previousTimeline.layers[previousTimeline.activeLayer]?.id;
      const layer = timeline.layers.findIndex((item) => item.id === selectedLayerId);
      const frame = timeline.frames.indexOf(previousTimeline.frames[previousTimeline.activeFrame]);
      activateTimelineCel(
        this.document,
        frame >= 0 ? frame : Math.min(previousTimeline.activeFrame, timeline.frames.length - 1),
        layer >= 0 ? layer : Math.min(previousTimeline.activeLayer, timeline.layers.length - 1),
      );
    }
    this.receivingLinkedPublication = true;
    try {
      this.refreshLinkedView?.(pixels);
    } finally {
      this.receivingLinkedPublication = false;
    }
  }

  getDocument = (): EditorDocument | null => {
    return this.document;
  };

  getSnapshot = (): EditorSnapshot => this.snapshot;
  getRevisions = (): EditorRevisions => ({
    revision: this.revision,
    pixelRevision: this.pixelRevision,
    persistenceRevision: this.persistenceRevision,
  });
  getPersistenceSnapshot = (): EditorPersistenceSnapshot | null =>
    this.persistenceSnapshot ? clonePersistenceSnapshot(this.persistenceSnapshot) : null;
  /** Read-only committed graph, already detached from live pixels. Internal
   * persistence observers may retain it; edits require an owned snapshot copy. */
  getCommittedPersistenceSnapshot = (): Readonly<EditorPersistenceSnapshot> | null =>
    this.persistenceSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get canUndo() {
    return this.history.canUndo;
  }
  get canRedo() {
    return this.history.canRedo;
  }
  get dirty() {
    return this.history.dirty;
  }
  get transactionActive() {
    return this.history.transactionActive;
  }
  get rasterIdentity() {
    return this.history.rasterIdentity;
  }
  get nextUndoLabel() {
    return this.history.nextUndoLabel;
  }
  get nextRedoLabel() {
    return this.history.nextRedoLabel;
  }

  beginHistoryTransaction(document: EditorDocument, label: string) {
    if (this.document !== document) throw new Error("Cannot edit a stale editor document");
    this.history.begin(document, label);
  }
  captureHistory(image: PixelBuffer, rect: Rect) {
    this.history.capture(image, rect);
  }
  commitHistoryTransaction(
    document: EditorDocument,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ) {
    if (this.document !== document) return false;
    return this.history.commit(document, replacesSelection, extraCommands);
  }
  cancelHistoryTransaction(document: EditorDocument) {
    if (this.document !== document) return false;
    this.history.cancel(document);
    return true;
  }
  undo() {
    return this.document ? this.history.undo(this.document) : false;
  }
  redo() {
    return this.document ? this.history.redo(this.document) : false;
  }
  moveToHistoryState(index: number) {
    if (this.document) this.history.moveToState(this.document, index);
  }
  replaceDocument(document: EditorDocument | null, dirty = false) {
    this.document = document;
    this.history.reset(dirty);
  }
  markSaved() {
    this.history.markSaved();
  }
  getHistorySnapshot() {
    return this.history.getHistorySnapshot();
  }
  getHistoryOptions() {
    return this.history.getOptions();
  }
  setHistoryOptions(options: Partial<UndoOptions>) {
    this.history.setOptions(options);
  }

  /** Run a complete document edit under the kernel-owned history transaction. */
  runHistoryTransaction(
    document: EditorDocument,
    label: string,
    change: () => void,
    prepareCommit: () => void,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ): EditorKernelTransactionResult {
    if (this.document !== document) return { committed: false, pixelsChanged: false };
    const rasterIdentity = this.history.rasterIdentity;
    this.history.begin(document, label);
    try {
      change();
      prepareCommit();
      const committed = this.history.commit(document, replacesSelection, extraCommands);
      return {
        committed,
        pixelsChanged: rasterIdentity !== this.history.rasterIdentity,
      };
    } catch (error) {
      this.history.cancel(document);
      throw error;
    }
  }

  beginTransaction(label: string): EditorKernelTransaction | null {
    const document = this.document;
    if (!document) return null;
    this.history.begin(document, label);
    let active = true;
    return {
      get active() {
        return active;
      },
      update: (change) => {
        if (!active || this.document !== document || !this.history.transactionActive) return false;
        change(document);
        return true;
      },
      commit: () => {
        if (!active) return false;
        active = false;
        if (this.document !== document || !this.history.transactionActive) return false;
        return this.history.commit(document);
      },
      cancel: () => {
        if (!active) return false;
        active = false;
        if (this.document !== document || !this.history.transactionActive) return false;
        this.history.cancel(document);
        return true;
      },
    };
  }

  publishSnapshot(draft: EditorSnapshotDraft, pixels = false) {
    this.publishPersistence();
    if (pixels) this.pixelRevision++;
    this.snapshot = {
      ...draft,
      revision: ++this.revision,
      pixelRevision: this.pixelRevision,
      persistenceRevision: this.persistenceRevision,
    };
    for (const listener of this.listeners) listener();
    if (!this.receivingLinkedPublication)
      for (const linked of this.linkedKernels)
        if (linked !== this) linked.receiveLinkedDocument(this.document, pixels);
  }

  private publishPersistence() {
    if (this.history.transactionActive) return;
    const doc = this.document;
    const timeline = doc?.timeline;
    // Layer metadata is shared across view and playback publications. Rebuild
    // its durable key only when the immutable layer array is replaced.
    if (timeline?.layers !== this.persistenceLayers) {
      this.persistenceLayers = timeline?.layers;
      this.persistenceLayerKey =
        timeline?.layers.flatMap((layer) => [
          layer.id,
          layer.name,
          layer.visible,
          layer.locked,
          layer.opacity,
          layer.flags,
          layer.source,
          layer.kind,
          layer.parentId,
          layer.blendMode,
          layer.tilesetId,
        ]) ?? [];
    }
    // Frame/layer navigation replaces containers. Compare durable child graphs
    // and layer values separately from history's pixel identity.
    const key: unknown[] = doc
      ? [
          doc.id,
          doc.name,
          doc.format,
          doc.width,
          doc.height,
          this.history.contentIdentity,
          this.history.dirty,
          timeline?.frames[timeline.activeFrame]?.palette ? undefined : doc.palette,
          timeline?.frames,
          timeline?.tags,
          timeline?.asepriteSource,
          timeline?.tilesets,
          timeline?.slices,
        ]
      : [];
    const sameLayers =
      this.persistenceLayerKey === this.persistedLayerKey ||
      (this.persistenceLayerKey.length === this.persistedLayerKey.length &&
        this.persistenceLayerKey.every((value, index) => value === this.persistedLayerKey[index]));
    if (
      sameLayers &&
      key.length === this.persistenceKey.length &&
      key.every((value, index) => value === this.persistenceKey[index])
    ) {
      this.persistedLayerKey = this.persistenceLayerKey;
      return;
    }
    this.persistenceKey = key;
    this.persistedLayerKey = this.persistenceLayerKey;
    this.persistenceSnapshot = doc
      ? clonePersistenceSnapshot({ version: 1, document: doc, dirty: this.history.dirty })
      : null;
    this.persistenceRevision++;
  }
}
