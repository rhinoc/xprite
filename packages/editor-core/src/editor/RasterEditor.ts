import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PointerInput } from "$/base/pointer-input";
import type { Rect, PixelBuffer, PixelMask, Point, Rgba } from "$/base/primitives";
import { canToolSnapToGrid, snapStrokePoint } from "$/canvas/assistance/grid";
import { CanvasController } from "$/canvas/controller";
import { brushMask } from "$/canvas/raster";
import type { ViewSettings, DocumentViewOptions } from "$/canvas/types";
import { ClipboardController } from "$/clipboard/controller";
import type { FloatingPaste } from "$/clipboard/types";
import {
  normalizeAsepriteDocument,
  libreSpriteWorkingBrushColor,
} from "$/color/operations/color-mode";
import { PaletteController } from "$/color/palette/controller";
import { DocumentController } from "$/document/controller";
import { ensureTimeline, syncTimeline, activateTimelineCel } from "$/document/document";
import { expandActiveLayer } from "$/document/layer-expansion";
import { EditorDocumentLifecycleController } from "$/document/lifecycle-controller";
import type { EditorDocument } from "$/document/types";
import { DrawingRuntimeController, type DrawingLinePreview } from "$/drawing/controller";
import { resolveRightClickTool } from "$/drawing/right-click";
import { DrawingSettingsController } from "$/drawing/settings-controller";
import { BitmapTextController } from "$/drawing/text/controller";
import { EditorToolId, type EditorTool, type ToolSettings } from "$/drawing/tool-settings";
import { composeEditorModules, type EditorCompositionHost } from "$/editor/composition";
import { EditorPriorityGestureController } from "$/editor/input/priority-gesture-controller";
import { EditorInputRouter } from "$/editor/input/router";
import { EditorKernel, type EditorSnapshotDraft } from "$/editor/kernel";
import {
  clonePersistenceSnapshot,
  type EditorPersistenceSnapshot,
} from "$/editor/persistence-snapshot";
import type { RasterChange } from "$/editor/types";
import { HistoryController } from "$/history/controller";
import type { HistoryCommand } from "$/history/history";
import { ImageEditingController } from "$/image-editing/controller";
import type { ImportExportController } from "$/import-export/controller";
import { SelectionController } from "$/selection/controller";
import { isSelectionTool } from "$/selection/operations";
import type { SelectionTransform } from "$/selection/transform";
import { SpriteController } from "$/sprite/controller";
import { TilemapController } from "$/tilemap/controller";
import { TilemapGestureController } from "$/tilemap/gesture-controller";
import { commitTilemapPixels } from "$/tilemap/model";
import { TilemapDisplayMode, TilesetMode } from "$/tilemap/types";
import { TimelineController } from "$/timeline/controller";
import { ensureLayerUuids } from "$/timeline/layer-uuid";
import { layerEditable, isBackgroundLayer, type SpriteTimeline } from "$/timeline/timeline";

const point = (p: Point): Point => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
function mergeRasterBounds(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
/** Public editor facade and composition root for the editing modules. */
export class RasterEditor {
  private pointerButtonOverride = false;
  private pendingRasterChange: { pixels: PixelBuffer; bounds: Rect } | null | undefined;
  private rasterChange: RasterChange | null = null;
  private readonly kernel: EditorKernel;
  private lastDrawingPoint: Point | null = null;
  private lineFreehandPreview: DrawingLinePreview | null = null;
  private palette: Rgba[] = [];
  private readonly tilemapGestures!: TilemapGestureController;
  readonly selection!: SelectionController;
  readonly color!: PaletteController;
  readonly sprite!: SpriteController;
  readonly clipboard!: ClipboardController;
  readonly imageEditing!: ImageEditingController;
  readonly importExport!: ImportExportController;
  readonly document!: DocumentController;
  readonly tilemap!: TilemapController;
  private readonly inputRouter!: EditorInputRouter;
  private readonly priorityGestures!: EditorPriorityGestureController;
  readonly timeline!: TimelineController;
  private selectionPreview: PixelMask | null | undefined = undefined;
  private pointer: Point | null = null;
  private status = "Ready";
  readonly canvas!: CanvasController;
  readonly drawing!: {
    readonly settings: DrawingSettingsController;
    readonly text: BitmapTextController;
    readonly runtime: DrawingRuntimeController;
    readonly eyedropper: { colorAt(at: Point, button?: number): Rgba | null };
  };
  private error: EditorAllocationError | null = null;
  readonly history!: HistoryController;
  private readonly documentLifecycle!: EditorDocumentLifecycleController;

  private get slices() {
    return this.sprite.slices;
  }

  private get floatingPaste() {
    return this.clipboard.getFloatingPaste();
  }
  private set floatingPaste(value: FloatingPaste | null) {
    this.clipboard.setFloatingPaste(value);
  }
  private get selectionTransform() {
    return this.clipboard.getSelectionTransform();
  }
  private set selectionTransform(value: SelectionTransform | null) {
    this.clipboard.setSelectionTransform(value);
  }
  private get transformedMask(): PixelMask | null {
    return this.clipboard.getTransformedMask();
  }
  private set transformedMask(value: PixelMask | null) {
    this.clipboard.setTransformedMask(value);
  }

  private get inlineText() {
    return this.drawing.text.getDraft();
  }

  private get drawingGestures() {
    return this.drawing.runtime.gestures;
  }

  private get rasterizer() {
    return this.drawing.runtime.rasterizer;
  }

  private get doc() {
    return this.kernel.getDocument();
  }

  private get settings(): ToolSettings {
    return this.drawing.settings.getSettings();
  }
  private set settings(value: ToolSettings) {
    this.drawing.settings.replaceSettings(value);
  }

  private get view(): ViewSettings {
    return this.canvas.getViewSettings();
  }
  private set view(value: ViewSettings) {
    this.canvas.setViewState(value);
  }
  private get defaultDocumentView(): Readonly<DocumentViewOptions> {
    return this.canvas.getDefaultDocumentView();
  }

  getSnapshot = () => this.kernel.getSnapshot();
  getRevisions = () => this.kernel.getRevisions();
  getPersistenceSnapshot = () => this.kernel.getPersistenceSnapshot();
  getCommittedPersistenceSnapshot = () => this.kernel.getCommittedPersistenceSnapshot();
  subscribe = (listener: () => void) => this.kernel.subscribe(listener);

  private get kernelCanUndo() {
    return this.kernel.canUndo;
  }
  private get kernelCanRedo() {
    return this.kernel.canRedo;
  }
  private get kernelDirty() {
    return this.kernel.dirty;
  }
  private get kernelRasterIdentity() {
    return this.kernel.rasterIdentity;
  }
  private beginHistoryTransaction(document: EditorDocument, label: string) {
    this.pendingRasterChange = undefined;
    this.rasterChange = null;
    this.kernel.beginHistoryTransaction(document, label);
  }
  private captureHistory(image: PixelBuffer, rect: Rect) {
    this.kernel.captureHistory(image, rect);
    const pending = this.pendingRasterChange;
    if (pending === null) return;
    if (pending && pending.pixels !== image) {
      this.pendingRasterChange = null;
      return;
    }
    this.pendingRasterChange = {
      pixels: image,
      bounds: pending ? mergeRasterBounds(pending.bounds, rect) : { ...rect },
    };
  }
  private commitHistoryTransaction(
    document: EditorDocument,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ) {
    return this.kernel.commitHistoryTransaction(document, replacesSelection, extraCommands);
  }
  private cancelHistoryTransaction(document: EditorDocument) {
    this.pendingRasterChange = undefined;
    this.rasterChange = null;
    return this.kernel.cancelHistoryTransaction(document);
  }
  private replaceDocument(document: EditorDocument | null, dirty = false) {
    this.kernel.replaceDocument(document, dirty);
  }
  private runHistoryTransaction(
    document: EditorDocument,
    label: string,
    change: () => void,
    prepareCommit: () => void,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ) {
    return this.kernel.runHistoryTransaction(
      document,
      label,
      change,
      prepareCommit,
      replacesSelection,
      extraCommands,
    );
  }
  private beginTransaction(label: string) {
    return this.kernel.beginTransaction(label);
  }
  private publishSnapshot(snapshot: EditorSnapshotDraft, pixels = false) {
    this.kernel.publishSnapshot(snapshot, pixels);
  }

  constructor(image?: PixelBuffer, name = "Untitled", linkedSource?: RasterEditor) {
    this.kernel = linkedSource
      ? linkedSource.kernel.createLinkedKernel((pixels) => this.publish(pixels))
      : new EditorKernel();
    this.kernel.setLinkedViewRefresh((pixels) => this.publish(pixels));
    Object.assign(this, composeEditorModules(this.compositionHost()));
    if (linkedSource) {
      this.palette = linkedSource.palette;
      this.drawing.settings.applyPreferences(linkedSource.drawing.settings.capturePreferences());
      this.canvas.setViewState({ ...linkedSource.view, pan: { ...linkedSource.view.pan } });
      this.canvas.setDefaultDocumentView(linkedSource.defaultDocumentView);
    }
    this.publish();
    if (image) this.document.loadImage(image, name);
  }

  /** Create another editing view without cloning document pixels or undo history. */
  createLinkedView(): RasterEditor {
    return new RasterEditor(undefined, "Untitled", this);
  }

  detachLinkedView(): void {
    this.kernel.detachLinkedView();
  }

  /** Apply staged edits before changing or closing a view, as document tabs do. */
  finishViewEdit(): boolean {
    if (this.inlineText && !this.drawing.text.commitInlineText()) return false;
    if (this.floatingPaste && !this.clipboard.commitFloatingPaste()) return false;
    this.finishInterruptedGesture();
    this.cancelGesture();
    return !this.hasPendingDocumentEdit();
  }

  private compositionHost(): EditorCompositionHost {
    return {
      kernel: this.kernel,
      getDocument: () => this.doc,
      getSettings: () => this.settings,
      getInputSettings: () => this.drawing.settings.getInputSettings(),
      setSettings: (value) => {
        this.settings = value;
      },
      getView: () => this.view,
      setView: (value) => {
        this.view = value;
      },
      getDefaultDocumentView: () => this.defaultDocumentView,
      getPalette: () => this.palette,
      setPalette: (value) => {
        this.palette = value;
      },
      getPointer: () => this.pointer,
      setPointer: (value) => {
        this.pointer = value;
      },
      getLastDrawingPoint: () => this.lastDrawingPoint,
      clearLastDrawingPoint: () => {
        this.lastDrawingPoint = null;
      },
      setLastDrawingPoint: (value) => this.setLastDrawingPoint(value),
      getLinePreview: () => this.lineFreehandPreview,
      setLinePreview: (value) => {
        this.lineFreehandPreview = value;
      },
      getSelectionPreview: () => this.selectionPreview,
      setSelectionPreview: (value) => {
        this.selectionPreview = value;
      },
      getStatus: () => this.status,
      setStatus: (value) => {
        this.status = value;
      },
      setError: (value) => {
        this.error = value;
      },
      beginHistoryTransaction: (document, label) => this.beginHistoryTransaction(document, label),
      captureHistory: (image, rect) => this.captureHistory(image, rect),
      commitHistoryTransaction: (document, replacesSelection, extraCommands) =>
        this.commitHistoryTransaction(document, replacesSelection, extraCommands),
      commitHistory: (document, replacesSelection, extraCommands, manualTilemapPreview) =>
        this.commitHistory(document, replacesSelection, extraCommands, manualTilemapPreview),
      cancelHistoryTransaction: (document) => this.cancelHistoryTransaction(document),
      replaceDocument: (document, dirty) => this.replaceDocument(document, dirty),
      runHistoryTransaction: (document, label, change, prepareCommit, replacesSelection, extra) =>
        this.runHistoryTransaction(
          document,
          label,
          change,
          prepareCommit,
          replacesSelection,
          extra,
        ),
      beginTransaction: (label) => this.beginTransaction(label),
      publishSnapshot: (snapshot, pixelsChanged) => this.publishSnapshot(snapshot, pixelsChanged),
      changeDocument: (change, replacesSelection, label) =>
        this.changeDocument(change, replacesSelection, label),
      changeLayers: (operation, label) => this.changeLayers(operation, label),
      editable: () => this.editable(),
      expandCel: (extra) => this.expandCel(extra),
      activeLayerIsBackground: () => this.activeLayerIsBackground(),
      activeLayerClearColor: () => this.activeLayerClearColor(),
      resolvePendingCel: () => this.resolvePendingCel(),
      snappedInput: (input) => this.snappedInput(input),
      preparePointerDown: (input) => this.preparePointerDown(input),
      prepareNewGesture: (input) => this.prepareNewGesture(input),
      pointerUp: (input) => this.pointerUp(input),
      cancelGesture: () => this.cancelGesture(),
      cancelEditorPriorityGesture: () => this.cancelEditorPriorityGesture(),
      syncGridView: () => this.syncGridView(),
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    };
  }

  hasPendingDocumentEdit = (): boolean =>
    !!(
      this.drawingGestures.hasPendingDocumentEdit() ||
      this.tilemapGestures.hasPendingDocumentEdit() ||
      this.slices.hasPendingDocumentEdit() ||
      this.floatingPaste ||
      this.selectionTransform ||
      this.inlineText?.text
    );
  /** Validate before replacement. Restoring never marks an external file saved. */
  restorePersistenceSnapshot(snapshot: EditorPersistenceSnapshot) {
    if (
      snapshot?.version !== 1 ||
      typeof snapshot.dirty !== "boolean" ||
      !snapshot.document ||
      typeof snapshot.document.name !== "string" ||
      !snapshot.document.timeline
    )
      throw new TypeError("Invalid editor recovery snapshot");
    const owned = clonePersistenceSnapshot(snapshot);
    const doc = owned.document;
    const validated = new RasterEditor();
    validated.document.loadTimeline(doc.timeline!, doc.width, doc.height, doc.name, doc.palette);
    this.documentLifecycle.installDocument(
      { ...validated.doc!, format: doc.format },
      doc.palette,
      undefined,
      owned.dirty,
    );
  }

  private publish(pixels = false) {
    const activePalette =
      this.imageEditing.getEffectPreview()?.palette ?? this.doc?.palette ?? this.palette;
    for (const target of ["foreground", "background"] as const) {
      const index = this.settings[target === "foreground" ? "foregroundIndex" : "backgroundIndex"],
        color = index == null ? undefined : activePalette[index];
      if (color && !color.every((v, i) => v === this.settings[target][i]))
        this.settings = { ...this.settings, [target]: [...color] as unknown as Rgba };
    }
    if (this.doc?.timeline && this.doc.timeline.composeGroups !== !!this.settings.composeGroups) {
      this.doc.timeline = { ...this.doc.timeline, composeGroups: !!this.settings.composeGroups };
      pixels = true;
    }
    if (this.doc) {
      syncTimeline(this.doc);
      if (this.doc.timeline) {
        const locked = !layerEditable(this.doc.timeline, this.doc.timeline.activeLayer);
        if (this.doc.layer.locked !== locked) this.doc.layer = { ...this.doc.layer, locked };
      }
    }
    if (pixels) {
      this.canvas.clearCache();
      const pending = this.pendingRasterChange;
      const revision = this.kernel.getRevisions().pixelRevision;
      const previous = this.rasterChange;
      const continues =
        pending && previous?.pixels === pending.pixels && previous.revision === revision;
      this.rasterChange = pending
        ? {
            pixels: pending.pixels,
            bounds: continues ? mergeRasterBounds(previous.bounds, pending.bounds) : pending.bounds,
            fromRevision: continues ? previous.fromRevision : revision,
            revision: revision + 1,
          }
        : null;
      this.pendingRasterChange = undefined;
    }
    const sliceSnapshot = this.slices.getSnapshot();
    const tilemapPreview = this.tilemapGestures.getSnapshot().preview;
    const drawingPreview = this.drawingGestures.getPreview();
    const snapshot: EditorSnapshotDraft = {
      rasterChange: this.rasterChange,
      playing: this.timeline.isPlaying(),
      document: this.doc
        ? {
            ...(this.importExport.getSpriteSheetPreview() ?? this.doc),
            ...(this.selectionPreview !== undefined ? { selection: this.selectionPreview } : {}),
            layer: { ...(this.importExport.getSpriteSheetPreview() ?? this.doc).layer },
          }
        : null,
      settings: this.settings,
      selectedSliceIds: sliceSnapshot.selectedSliceIds,
      sliceMark: sliceSnapshot.mark,
      view: this.view,
      defaultDocumentView: this.defaultDocumentView,
      palette: this.imageEditing.getEffectPreview()?.palette ?? this.doc?.palette ?? this.palette,
      canUndo: this.kernelCanUndo,
      canRedo: this.kernelCanRedo,
      dirty: this.kernelDirty,
      preview: drawingPreview ? drawingPreview : tilemapPreview ? tilemapPreview : null,
      linePreview: this.lineFreehandPreview
        ? {
            tool: this.lineFreehandPreview.tool,
            points: [this.lineFreehandPreview.start, this.lineFreehandPreview.end],
            button: this.lineFreehandPreview.button,
          }
        : null,
      floatingPaste: this.floatingPaste,
      selectionTransform: this.selectionTransform,
      inlineText: this.inlineText,
      pointer: this.pointer,
      status: this.status,
      undoNotice: this.history.getUndoNotice(),
      error: this.error,
    };
    this.publishSnapshot(snapshot, pixels);
  }
  private resolvePendingCel(): boolean {
    if (this.inlineText && !this.drawing.text.commitInlineText()) return false;
    if (this.floatingPaste && !this.clipboard.commitFloatingPaste()) return false;
    this.cancelGesture();
    if (this.doc) syncTimeline(this.doc);
    return !!this.doc;
  }
  private changeLayers(
    operation: (timeline: SpriteTimeline, doc: EditorDocument) => SpriteTimeline,
    label = "Edit Layer",
  ) {
    this.changeDocument(
      (doc) => {
        syncTimeline(doc);
        const t = ensureTimeline(doc),
          next = operation(t, doc);
        if (next === t) return;
        doc.timeline = next;
        activateTimelineCel(doc, next.activeFrame, next.activeLayer);
      },
      false,
      label,
    );
  }
  private editable() {
    return this.doc && this.doc.layer.visible && !this.doc.layer.locked;
  }
  private expandCel(extra?: Rect) {
    const document = this.doc;
    if (document) expandActiveLayer(document, extra, () => this.activeLayerClearColor());
  }
  private activeLayerIsBackground(): boolean {
    const timeline = this.doc?.timeline;
    return !!timeline && isBackgroundLayer(timeline.layers[timeline.activeLayer]);
  }
  private activeLayerClearColor(): Rgba {
    if (!this.activeLayerIsBackground()) return [0, 0, 0, 0];
    const color = this.doc
      ? libreSpriteWorkingBrushColor(
          this.settings.background,
          ensureTimeline(this.doc),
          this.doc.palette ?? this.palette,
          this.settings.backgroundIndex ?? undefined,
          this.settings.ink,
        )
      : this.settings.background;
    return [color[0], color[1], color[2], UINT8_MAX];
  }
  clearPointer() {
    if (this.drawingGestures.isGestureActive() || (!this.pointer && !this.lineFreehandPreview))
      return;
    this.pointer = null;
    this.lineFreehandPreview = null;
    this.publish();
  }
  /** The same channel/sample rules used on click, exposed for the hover status. */
  private snappedInput(input: PointerInput): PointerInput {
    const settings = this.drawing.settings.getInputSettings();
    if (settings.tool === EditorToolId.Move) return input;
    if (this.priorityGestures.isSelectionTransformMoveActive()) return input;
    if (
      this.tilemap.isActiveLayerTilemap() &&
      (this.settings.tilemapMode ?? TilemapDisplayMode.Tiles) === TilemapDisplayMode.Tiles &&
      isSelectionTool(settings.tool)
    ) {
      const t = this.doc!.timeline!,
        set = t.tilesets!.find((s) => s.id === t.layers[t.activeLayer].tilesetId)!,
        cel = t.frames[t.activeFrame].cels[t.activeLayer],
        x = cel?.x ?? t.gridBounds?.x ?? 0,
        y = cel?.y ?? t.gridBounds?.y ?? 0;
      return {
        ...input,
        x: x + Math.floor((input.x - x) / set.tileWidth) * set.tileWidth,
        y: y + Math.floor((input.y - y) / set.tileHeight) * set.tileHeight,
      };
    }
    if (
      !this.view.snapToGrid ||
      this.floatingPaste ||
      this.inlineText ||
      !canToolSnapToGrid(settings.tool)
    )
      return input;
    const mask = brushMask(settings.brush),
      center = isSelectionTool(settings.tool) ? { x: 0, y: 0 } : { x: -mask.x, y: -mask.y };
    return {
      ...input,
      ...snapStrokePoint(
        input,
        {
          x: this.view.gridX ?? 0,
          y: this.view.gridY ?? 0,
          width: this.view.gridWidth,
          height: this.view.gridHeight,
        },
        center,
      ),
    };
  }
  private preparePointerDown(input: PointerInput): PointerInput {
    this.timeline.setPlaying(false);
    if (
      this.tilemap.isActiveLayerTilemap() &&
      this.settings.tilemapMode === TilemapDisplayMode.Pixels
    ) {
      const t = this.doc!.timeline!,
        set = t.tilesets?.find((s) => s.id === t.layers[t.activeLayer].tilesetId);
      if (set?.external && !(set.flags & 2)) this.tilemap.setTilemapMode(TilemapDisplayMode.Tiles);
    }
    return this.snappedInput(input);
  }

  private prepareNewGesture(input: PointerInput) {
    this.lineFreehandPreview = null;
    this.selectionPreview = undefined;
    this.error = null;
    this.pointer = point(input);
  }

  resolvePointerTool(input: PointerInput): EditorTool | null {
    if (
      (input.space && !this.drawing.settings.getQuickTool()) ||
      this.floatingPaste ||
      this.inlineText ||
      this.selectionTransform ||
      this.drawingGestures.isGestureActive() ||
      this.tilemapGestures.isGestureActive() ||
      this.priorityGestures.hasGesture()
    )
      return null;
    const quickTool = this.drawing.settings.getQuickTool();
    if (quickTool) return quickTool;
    if (input.quickMove) return EditorToolId.Move;
    if (input.button !== 2 || input.alt) return null;
    return resolveRightClickTool(this.settings);
  }

  private drawingPointerInput(input: PointerInput): PointerInput {
    return this.pointerButtonOverride &&
      this.drawing.settings.getInputSettings().tool !== this.settings.tool
      ? { ...input, button: 0 }
      : input;
  }

  pointerDown(input: PointerInput) {
    const tool = this.resolvePointerTool(input);
    this.pointerButtonOverride =
      !!tool && !this.drawing.settings.getQuickTool() && !input.quickMove;
    this.drawing.settings.setPointerTool(tool);
    this.inputRouter.pointerDown(this.drawingPointerInput(input));
  }

  pointerMove(input: PointerInput) {
    this.inputRouter.pointerMove(this.drawingPointerInput(input));
  }

  pointerUp(input?: PointerInput) {
    try {
      this.inputRouter.pointerUp(input ? this.drawingPointerInput(input) : undefined);
    } finally {
      this.drawing.settings.setPointerTool(null);
      this.pointerButtonOverride = false;
    }
  }
  /** Finish applied ink when the browser loses a pointer before its release. */
  finishInterruptedStroke(): boolean {
    // Capture loss and window blur can arrive before pointerup. Keep ink that
    // has already reached the document; explicit Escape still cancels it.
    if (!this.doc || !this.drawingGestures.shouldFinishInterruptedStroke()) return false;
    this.pointerUp();
    return true;
  }
  /** Preserve a visible selection drag when browser capture disappears. */
  finishInterruptedGesture(): boolean {
    if (this.finishInterruptedStroke()) return true;
    if (this.doc && this.drawingGestures.shouldFinishInterruptedSelection()) {
      this.pointerUp();
      return true;
    }
    if (this.priorityGestures.hasMovedSelectionBounds()) {
      this.pointerUp();
      return true;
    }
    return false;
  }
  /** Pointer arbitration cancels only the current drag; staged paste/text stay
   * available for explicit Apply/Cancel after navigation or a pen takeover. */
  cancelPointerGesture() {
    this.inputRouter.pointerCancel();
    this.drawing.settings.setPointerTool(null);
    this.pointerButtonOverride = false;
  }
  cancelGesture() {
    this.inputRouter.cancelGesture();
    this.drawing.settings.setPointerTool(null);
    this.pointerButtonOverride = false;
  }
  private cancelEditorPriorityGesture() {
    const hadLinePreview = !!this.lineFreehandPreview;
    this.lineFreehandPreview = null;
    if (this.priorityGestures.cancelGesture()) return;
    if (hadLinePreview) this.publish();
  }
  private syncGridView() {
    this.canvas.syncGridViewFromDocument();
  }
  private setLastDrawingPoint(point: Point): HistoryCommand | undefined {
    const before = this.lastDrawingPoint ? { ...this.lastDrawingPoint } : null;
    const after = { ...point };
    if (before?.x === after.x && before?.y === after.y) return undefined;
    this.lastDrawingPoint = after;
    return {
      undo: () => {
        this.lastDrawingPoint = before ? { ...before } : null;
      },
      redo: () => {
        this.lastDrawingPoint = { ...after };
      },
    };
  }
  private commitHistory(
    doc: EditorDocument,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
    manualTilemapPreview?: SpriteTimeline,
  ) {
    this.prepareHistoryCommit(doc, manualTilemapPreview);
    const committed = this.commitHistoryTransaction(doc, replacesSelection, extraCommands);
    this.showSelectionEdgesAfterEdit(doc, replacesSelection);
    return committed;
  }
  private prepareHistoryCommit(doc: EditorDocument, manualTilemapPreview?: SpriteTimeline) {
    const t = doc.timeline;
    if (t?.layers[t.activeLayer].kind === "tilemap") {
      if (manualTilemapPreview) doc.timeline = manualTilemapPreview;
      else {
        const cel = t.frames[t.activeFrame].cels[t.activeLayer],
          p = doc.layer.pixels;
        const differs = cel
          ? p.width !== cel.pixels.width ||
            p.height !== cel.pixels.height ||
            p.data.some((v, i) => v !== cel.pixels.data[i])
          : p.data.some((v, i) => i % 4 === 3 && v !== 0);
        if (differs)
          doc.timeline = commitTilemapPixels(
            t,
            t.activeFrame,
            t.activeLayer,
            p,
            doc.layer.x,
            doc.layer.y,
            this.settings.tilesetMode ?? TilesetMode.Auto,
          );
        else {
          if (cel) doc.layer = { ...doc.layer, pixels: cel.pixels };
          syncTimeline(doc);
        }
      }
      const next = doc.timeline!;
      activateTimelineCel(doc, next.activeFrame, next.activeLayer);
    }
    syncTimeline(doc);
    normalizeAsepriteDocument(doc);
    if (doc.timeline) doc.timeline = ensureLayerUuids(doc.timeline);
  }
  private showSelectionEdgesAfterEdit(doc: EditorDocument, replacesSelection: boolean) {
    if (
      this.settings.selectionAutoShowEdges !== false &&
      replacesSelection &&
      doc.selection &&
      !this.view.selectionEdges
    )
      this.view = { ...this.view, selectionEdges: true };
  }
  private changeDocument(
    change: (doc: EditorDocument) => void,
    replacesSelection = false,
    label = "Edit",
  ) {
    this.selectionPreview = undefined;
    this.imageEditing.clearPreview();
    this.timeline.setPlaying(false);
    if (this.floatingPaste && !this.clipboard.commitFloatingPaste()) return;
    if (this.inlineText && !this.drawing.text.commitInlineText()) return;
    this.cancelGesture();
    if (!this.doc) return;
    const document = this.doc;
    try {
      const transaction = this.runHistoryTransaction(
        document,
        label,
        () => change(document),
        () => this.prepareHistoryCommit(document),
        replacesSelection,
      );
      this.showSelectionEdgesAfterEdit(document, replacesSelection);
      this.publish(transaction.pixelsChanged);
    } catch (error) {
      this.publish(true);
      throw error;
    }
  }
  /** Aseprite selection rotation uses transformed pixels in Pixels mode. The
   * Tilemap Tiles path cannot rotate tile words at arbitrary angles. */
}
