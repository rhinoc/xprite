import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PointerInput } from "$/base/pointer-input";
import type { Rect, PixelBuffer, PixelMask, Point, Rgba } from "$/base/primitives";
import { CanvasController } from "$/canvas/controller";
import { supportsPixelPerfect } from "$/canvas/raster/pixel-perfect-stroke";
import type { ViewSettings, DocumentViewOptions } from "$/canvas/types";
import { ClipboardController } from "$/clipboard/controller";
import { copyDocumentSelection } from "$/clipboard/image";
import { pasteTilemapClipboard } from "$/clipboard/tile";
import type { FloatingPaste } from "$/clipboard/types";
import {
  normalizeAsepriteDocument,
  updateAsepriteFramePalette,
  createAsepriteIndexWriter,
  createIndexedShadingWriter,
} from "$/color/operations/color-mode";
import { PaletteController } from "$/color/palette/controller";
import { DocumentController } from "$/document/controller";
import {
  ensureTimeline,
  trimActiveCel,
  syncTimeline,
  activateTimelineCel,
  layerAtPoint,
} from "$/document/document";
import { EditorDocumentLifecycleController } from "$/document/lifecycle-controller";
import type { EditorDocument } from "$/document/types";
import { DrawingRuntimeController, type DrawingLinePreview } from "$/drawing/controller";
import { DrawingSettingsController } from "$/drawing/settings-controller";
import { BitmapTextController } from "$/drawing/text/controller";
import { AsepriteDynamicSensor, type ToolSettings } from "$/drawing/tool-settings";
import { EditorPriorityGestureController } from "$/editor/input/priority-gesture-controller";
import { EditorInputRouter } from "$/editor/input/router";
import { EditorKernel, type EditorSnapshotDraft } from "$/editor/kernel";
import type { EditorKernelTransactionResult } from "$/editor/kernel";
import { HistoryController } from "$/history/controller";
import type { HistoryCommand } from "$/history/history";
import { ImageEditingController } from "$/image-editing/controller";
import { transformClipboardAsepriteSamples } from "$/import-export/aseprite/profile-clipboard";
import { ImportExportController } from "$/import-export/controller";
import {
  activeCelContentColorReference,
  activeCelContentProjection,
} from "$/selection/cel-content";
import { SelectionController } from "$/selection/controller";
import { canColorRangeSelection, isSelectionTool } from "$/selection/operations";
import type { SelectionTransform } from "$/selection/transform";
import { SelectionTransformController } from "$/selection/transform-controller";
import { SelectionMode } from "$/selection/types";
import { SpriteController } from "$/sprite/controller";
import { TilemapController } from "$/tilemap/controller";
import { TilemapGestureController } from "$/tilemap/gesture-controller";
import {
  manualTilemapPreviewChanged,
  refreshManualPixelPerfectTilemapPreview,
} from "$/tilemap/operations/manual-pixel-perfect-preview";
import {
  clearTilemapSelectionForTransform,
  transformTilemapSelection,
} from "$/tilemap/operations/tile-selection-transform";
import { AsepriteTilemapIndexWriter } from "$/tilemap/tools";
import { TilemapDisplayMode, TilesetMode } from "$/tilemap/types";
import { TimelineCelMovement } from "$/timeline";
import { TimelineController } from "$/timeline/controller";
import { layerEditable } from "$/timeline/timeline";
import { LAYER_REFERENCE, type SpriteTimeline } from "$/timeline/timeline";

export interface EditorCompositionHost {
  getPresentationInput(): { document: EditorDocument } | null;
  kernel: EditorKernel;
  getDocument(): EditorDocument | null;
  getSettings(): ToolSettings;
  getInputSettings(): ToolSettings;
  setSettings(settings: ToolSettings): void;
  getView(): ViewSettings;
  setView(view: ViewSettings): void;
  getDefaultDocumentView(): Readonly<DocumentViewOptions>;
  getPalette(): Rgba[];
  setPalette(palette: Rgba[]): void;
  getPointer(): Point | null;
  setPointer(point: Point | null): void;
  getLastDrawingPoint(): Point | null;
  clearLastDrawingPoint(): void;
  setLastDrawingPoint(point: Point): HistoryCommand | undefined;
  getLinePreview(): DrawingLinePreview | null;
  setLinePreview(preview: DrawingLinePreview | null): void;
  getSelectionPreview(): PixelMask | null | undefined;
  setSelectionPreview(preview: PixelMask | null | undefined): void;
  getStatus(): string;
  setStatus(message: string): void;
  setError(error: EditorAllocationError | null): void;
  beginHistoryTransaction(document: EditorDocument, label: string): void;
  captureHistory(image: PixelBuffer, rect: Rect): void;
  commitHistoryTransaction(
    document: EditorDocument,
    replacesSelection?: boolean,
    extraCommands?: readonly HistoryCommand[],
  ): boolean;
  commitHistory(
    document: EditorDocument,
    replacesSelection?: boolean,
    extraCommands?: readonly HistoryCommand[],
    manualTilemapPreview?: SpriteTimeline,
  ): boolean;
  cancelHistoryTransaction(document: EditorDocument): boolean;
  replaceDocument(document: EditorDocument | null, dirty?: boolean): void;
  runHistoryTransaction(
    document: EditorDocument,
    label: string,
    change: () => void,
    prepareCommit: () => void,
    replacesSelection?: boolean,
    extraCommands?: readonly HistoryCommand[],
  ): EditorKernelTransactionResult;
  beginTransaction(label: string): ReturnType<EditorKernel["beginTransaction"]>;
  publishSnapshot(snapshot: EditorSnapshotDraft, pixelsChanged?: boolean): void;
  changeDocument(
    change: (document: EditorDocument) => void,
    replacesSelection?: boolean,
    label?: string,
  ): void;
  changeLayers(
    operation: (timeline: SpriteTimeline, document: EditorDocument) => SpriteTimeline,
    label?: string,
  ): void;
  editable(): boolean | null;
  expandCel(extra?: Rect): void;
  activeLayerIsBackground(): boolean;
  activeLayerClearColor(): Rgba;
  resolvePendingCel(): boolean;
  snappedInput(input: PointerInput): PointerInput;
  preparePointerDown(input: PointerInput): PointerInput;
  prepareNewGesture(input: PointerInput): void;
  pointerUp(input?: PointerInput): void;
  cancelGesture(): void;
  cancelEditorPriorityGesture(): void;
  syncGridView(): void;
  publish(pixelsChanged?: boolean): void;
}

export interface EditorCompositionModules {
  document: DocumentController;
  documentLifecycle: EditorDocumentLifecycleController;
  selection: SelectionController;
  color: PaletteController;
  sprite: SpriteController;
  clipboard: ClipboardController;
  imageEditing: ImageEditingController;
  importExport: ImportExportController;
  tilemap: TilemapController;
  timeline: TimelineController;
  canvas: CanvasController;
  drawing: {
    settings: DrawingSettingsController;
    text: BitmapTextController;
    runtime: DrawingRuntimeController;
    eyedropper: { colorAt(at: Point, button?: number): Rgba | null };
  };
  history: HistoryController;
  inputRouter: EditorInputRouter;
  priorityGestures: EditorPriorityGestureController;
  tilemapGestures: TilemapGestureController;
}

class EditorComposition {
  document!: DocumentController;
  documentLifecycle!: EditorDocumentLifecycleController;
  selection!: SelectionController;
  color!: PaletteController;
  sprite!: SpriteController;
  clipboard!: ClipboardController;
  imageEditing!: ImageEditingController;
  importExport!: ImportExportController;
  tilemap!: TilemapController;
  timeline!: TimelineController;
  canvas!: CanvasController;
  drawing!: EditorCompositionModules["drawing"];
  history!: HistoryController;
  inputRouter!: EditorInputRouter;
  priorityGestures!: EditorPriorityGestureController;
  tilemapGestures!: TilemapGestureController;

  private celMovement: {
    document: EditorDocument;
    movement: TimelineCelMovement;
    startOffset: Point;
    autoSelectLayer: boolean;
  } | null = null;
  private clearCelMovementRange: EditorDocument | null = null;

  constructor(private readonly host: EditorCompositionHost) {
    this.assemble();
  }

  get doc() {
    return this.host.getDocument();
  }
  get kernel() {
    return this.host.kernel;
  }
  get settings() {
    return this.host.getSettings();
  }
  get inputSettings() {
    return this.host.getInputSettings();
  }
  set settings(value: ToolSettings) {
    this.host.setSettings(value);
  }
  get view() {
    return this.host.getView();
  }
  set view(value: ViewSettings) {
    this.host.setView(value);
  }
  get defaultDocumentView() {
    return this.host.getDefaultDocumentView();
  }
  get palette() {
    return this.host.getPalette();
  }
  set palette(value: Rgba[]) {
    this.host.setPalette(value);
  }
  get pointer() {
    return this.host.getPointer();
  }
  set pointer(value: Point | null) {
    this.host.setPointer(value);
  }
  get lastDrawingPoint() {
    return this.host.getLastDrawingPoint();
  }
  set lastDrawingPoint(value: Point | null) {
    if (value) this.host.setLastDrawingPoint(value);
    else this.host.clearLastDrawingPoint();
  }
  get lineFreehandPreview() {
    return this.host.getLinePreview();
  }
  set lineFreehandPreview(value: DrawingLinePreview | null) {
    this.host.setLinePreview(value);
  }
  get selectionPreview() {
    return this.host.getSelectionPreview();
  }
  set selectionPreview(value: PixelMask | null | undefined) {
    this.host.setSelectionPreview(value);
  }
  get status() {
    return this.host.getStatus();
  }
  set status(value: string) {
    this.host.setStatus(value);
  }
  get error() {
    return this._error;
  }
  set error(value: EditorAllocationError | null) {
    this._error = value;
    this.host.setError(value);
  }
  private _error: EditorAllocationError | null = null;

  get kernelCanUndo() {
    return this.kernel.canUndo;
  }
  get kernelCanRedo() {
    return this.kernel.canRedo;
  }
  get kernelDirty() {
    return this.kernel.dirty;
  }
  get kernelRasterIdentity() {
    return this.kernel.rasterIdentity;
  }
  get slices() {
    return this.sprite.slices;
  }
  get floatingPaste() {
    return this.clipboard.getFloatingPaste();
  }
  set floatingPaste(value: FloatingPaste | null) {
    this.clipboard.setFloatingPaste(value);
  }
  get selectionTransform() {
    return this.clipboard.getSelectionTransform();
  }
  set selectionTransform(value: SelectionTransform | null) {
    this.clipboard.setSelectionTransform(value);
  }
  get transformedMask() {
    return this.clipboard.getTransformedMask();
  }
  set transformedMask(value: PixelMask | null) {
    this.clipboard.setTransformedMask(value);
  }
  get inlineText() {
    return this.drawing.text.getDraft();
  }
  get drawingGestures() {
    return this.drawing.runtime.gestures;
  }
  get rasterizer() {
    return this.drawing.runtime.rasterizer;
  }

  beginHistoryTransaction(document: EditorDocument, label: string) {
    this.host.beginHistoryTransaction(document, label);
  }
  captureHistory(image: PixelBuffer, rect: Rect) {
    this.host.captureHistory(image, rect);
  }
  commitHistoryTransaction(
    document: EditorDocument,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ) {
    return this.host.commitHistoryTransaction(document, replacesSelection, extraCommands);
  }
  commitHistory(
    document: EditorDocument,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
    manualTilemapPreview?: SpriteTimeline,
  ) {
    const committed = this.host.commitHistory(
      document,
      replacesSelection,
      extraCommands,
      manualTilemapPreview,
    );
    if (this.clearCelMovementRange === document) {
      this.clearCelMovementRange = null;
      if (document === this.doc && document.timeline)
        document.timeline = { ...document.timeline, range: undefined };
    }
    return committed;
  }
  cancelHistoryTransaction(document: EditorDocument) {
    return this.host.cancelHistoryTransaction(document);
  }
  replaceDocument(document: EditorDocument | null, dirty = false) {
    this.host.replaceDocument(document, dirty);
  }
  runHistoryTransaction(
    document: EditorDocument,
    label: string,
    change: () => void,
    prepareCommit: () => void,
    replacesSelection = false,
    extraCommands: readonly HistoryCommand[] = [],
  ) {
    return this.host.runHistoryTransaction(
      document,
      label,
      change,
      prepareCommit,
      replacesSelection,
      extraCommands,
    );
  }
  beginTransaction(label: string) {
    return this.host.beginTransaction(label);
  }
  publishSnapshot(snapshot: EditorSnapshotDraft, pixelsChanged = false) {
    this.host.publishSnapshot(snapshot, pixelsChanged);
  }
  changeDocument(
    change: (document: EditorDocument) => void,
    replacesSelection = false,
    label = "Edit",
  ) {
    this.host.changeDocument(change, replacesSelection, label);
  }
  changeLayers(
    operation: (timeline: SpriteTimeline, document: EditorDocument) => SpriteTimeline,
    label = "Edit Layer",
  ) {
    this.host.changeLayers(operation, label);
  }
  editable() {
    return this.host.editable();
  }
  expandCel(extra?: Rect) {
    this.host.expandCel(extra);
  }
  activeLayerIsBackground() {
    return this.host.activeLayerIsBackground();
  }
  activeLayerClearColor() {
    return this.host.activeLayerClearColor();
  }
  resolvePendingCel() {
    return this.host.resolvePendingCel();
  }
  snappedInput(input: PointerInput) {
    return this.host.snappedInput(input);
  }
  preparePointerDown(input: PointerInput) {
    return this.host.preparePointerDown(input);
  }
  prepareNewGesture(input: PointerInput) {
    this.host.prepareNewGesture(input);
  }
  pointerUp(input?: PointerInput) {
    this.host.pointerUp(input);
  }
  cancelGesture() {
    this.host.cancelGesture();
  }
  cancelEditorPriorityGesture() {
    this.host.cancelEditorPriorityGesture();
  }
  syncGridView() {
    this.host.syncGridView();
  }
  setLastDrawingPoint(point: Point) {
    return this.host.setLastDrawingPoint(point);
  }
  publish(pixelsChanged = false) {
    this.host.publish(pixelsChanged);
  }

  private assemble() {
    this.selection = new SelectionController(
      {
        readSelectionData: () => {
          const document = this.doc;
          if (!document) return null;
          const timeline = document.timeline;
          const layer = timeline?.layers[timeline.activeLayer];
          const tileset =
            layer?.kind === "tilemap"
              ? timeline?.tilesets?.find((item) => item.id === layer.tilesetId)
              : null;
          const cel = timeline?.frames[timeline.activeFrame]?.cels[timeline.activeLayer];
          return {
            width: document.width,
            height: document.height,
            selection: document.selection,
            hiddenSelection: document.hiddenSelection ?? null,
            grid: {
              x: tileset ? (cel?.x ?? this.view.gridX ?? 0) : (this.view.gridX ?? 0),
              y: tileset ? (cel?.y ?? this.view.gridY ?? 0) : (this.view.gridY ?? 0),
              width: tileset?.tileWidth ?? this.view.gridWidth,
              height: tileset?.tileHeight ?? this.view.gridHeight,
            },
            colorRangeSource: canColorRangeSelection(document)
              ? { pixels: document.layer.pixels, x: document.layer.x, y: document.layer.y }
              : null,
          };
        },
        readCelContent: () => activeCelContentProjection(this.doc),
        readCelContentColorReference: () => activeCelContentColorReference(this.doc, this.palette),
        readPreview: () => this.drawing.runtime.previewSelection(),
        getSelectionMode: () => this.settings.selectionMode ?? SelectionMode.Replace,
        resolvePendingCel: () => this.resolvePendingCel(),
        commitHistoryTransaction: (label, change, replacesSelection) =>
          this.changeDocument(
            (document) => {
              if ("selection" in change) document.selection = change.selection ?? null;
              if ("hiddenSelection" in change)
                document.hiddenSelection = change.hiddenSelection ?? null;
            },
            replacesSelection,
            label,
          ),
        setTool: (tool) => {
          this.settings = { ...this.settings, tool };
        },
        setStatus: (message) => {
          this.status = message;
        },
        setPreview: (preview) => {
          this.selectionPreview = preview;
        },
        publish: () => this.publish(),
      },
      {
        readProjection: () => {
          const document = this.doc;
          if (!document) return null;
          const timeline = document.timeline;
          const layer = timeline?.layers[timeline.activeLayer];
          return {
            selection: document.selection,
            editable: !!this.editable(),
            emptyCel: !!document.layer.emptyCel,
            timelinePresent: !!timeline,
            activeLayer: {
              visible: layer?.visible ?? document.layer.visible,
              editable: timeline
                ? layerEditable(timeline, timeline.activeLayer)
                : !!this.editable(),
              reference: !!((layer?.flags ?? 0) & LAYER_REFERENCE),
              group: layer?.kind === "group",
              tilemap: layer?.kind === "tilemap",
              celExists: !!timeline?.frames[timeline.activeFrame]?.cels[timeline.activeLayer],
            },
            tilemapMode: this.settings.tilemapMode ?? TilemapDisplayMode.Tiles,
            selectedTile: this.settings.selectedTile ?? 0,
            tool: this.settings.tool,
            pointer: this.pointer,
            foreground: this.settings.foreground,
            foregroundIndex: this.settings.foregroundIndex ?? undefined,
            background: this.settings.background,
            backgroundIndex: this.settings.backgroundIndex ?? undefined,
            palette: document.palette ?? this.palette,
            ink: this.settings.ink,
          };
        },
        resolvePendingCel: () => this.resolvePendingCel(),
        mutateDocument: (label, mutate) =>
          this.changeDocument(
            (document) =>
              mutate(document, {
                expandCel: (target, extra) => {
                  if (target !== this.doc) throw new Error("Stale selection edit document");
                  this.expandCel(extra);
                },
                captureHistory: (image, rect) => this.captureHistory(image, rect),
                activeLayerClearColor: () => this.activeLayerClearColor(),
              }),
            false,
            label,
          ),
        setStatus: (message) => {
          this.status = message;
        },
        setAllocationError: (error) => {
          this.error = error;
        },
        publish: (pixelsChanged) => this.publish(pixelsChanged),
        setTool: (tool) => this.drawing.settings.setSettings({ tool }),
        beginSelectionTransform: (handle, at) => this.selection.beginTransform(handle, at),
        readTransformSession: () => ({
          transform: this.selectionTransform,
          floating: this.floatingPaste,
          mask: this.transformedMask,
        }),
        transformFloatingAsepriteSamples: (source, transform, transparentIndex) =>
          transformClipboardAsepriteSamples(source, transform, transparentIndex),
        updateTransformSession: (transform, mask, floating, clearDrag) => {
          this.selectionTransform = transform;
          this.transformedMask = mask;
          this.floatingPaste = floating;
          if (clearDrag) this.priorityGestures.clearPasteDrag();
        },
        finishSelectionBoundsNudge: (dx, dy) => {
          this.pointerUp({ x: dx, y: dy });
          return true;
        },
        nudgeTilemapSelection: (dx, dy) => {
          if (!this.selection.beginTransform("move", { x: 0, y: 0 })) return false;
          this.tilemapGestures.updateSelectionTransform({ x: dx, y: dy });
          this.tilemapGestures.endSelectionTransform();
          return true;
        },
        flipTilemapSelection: (orientation) => {
          const document = this.doc;
          if (!document?.selection) return;
          const image = copyDocumentSelection(document, false, true);
          if (!image?.tilemap || !image.mask) return;
          const output = transformTilemapSelection(
            image,
            { bounds: document.selection, angle: 0 },
            orientation,
            document.selection,
          );
          this.changeDocument(
            (current) => {
              clearTilemapSelectionForTransform(current, ensureTimeline(current));
              pasteTilemapClipboard(current, output.image, output.origin);
              current.selection = output.image.mask;
            },
            false,
            "Flip Selection",
          );
        },
        deleteSelectedSlices: () => this.slices.deleteSelectedSlices(),
      },
      () =>
        new SelectionTransformController(this.clipboard, this.tilemapGestures, {
          getDocument: () => this.doc,
          isEditable: (document) => document === this.doc && !!this.editable(),
          isActiveLayerTilemap: () => this.tilemap.isActiveLayerTilemap(),
          getTilemapMode: () => this.settings.tilemapMode ?? TilemapDisplayMode.Tiles,
          cancelGesture: () => this.cancelGesture(),
          beginHistoryTransaction: (document, label) =>
            this.beginHistoryTransaction(document, label),
          captureHistory: (image, rect) => this.captureHistory(image, rect),
          activeLayerClearColor: () => this.activeLayerClearColor(),
          getTransformSettings: () => {
            const settings = this.settings,
              document = this.doc,
              timeline = document?.timeline,
              palette = timeline?.frames[timeline.activeFrame]?.palette ?? document?.palette,
              effectiveOpaque = settings.selectionAutoOpaque
                ? this.activeLayerIsBackground()
                : !!settings.selectionOpaque,
              configuredColor = settings.selectionTransparentColor ?? [0, 0, 0, 0],
              indexedMaskColor =
                effectiveOpaque &&
                configuredColor.every((channel) => channel === 0) &&
                timeline?.colorDepth === 8
                  ? palette?.[timeline.transparentIndex ?? 0]
                  : undefined;
            return {
              selectionAutoOpaque: settings.selectionAutoOpaque,
              selectionOpaque: settings.selectionOpaque,
              selectionTransparentColor: indexedMaskColor
                ? [indexedMaskColor[0], indexedMaskColor[1], indexedMaskColor[2], UINT8_MAX]
                : configuredColor,
              selectionRotationAlgorithm: settings.selectionRotationAlgorithm,
              selectionPivotPosition: settings.selectionPivotPosition,
              selectionMulticelWhenLayersOrFrames: settings.selectionMulticelWhenLayersOrFrames,
              effectiveOpaque,
            };
          },
          beginBoundsDrag: (at, mask) => this.priorityGestures.beginSelectionBoundsDrag(at, mask),
          beginTransformDrag: (at, handle, transform, floating, mask) =>
            this.priorityGestures.beginSelectionTransformDrag(
              at,
              handle,
              transform,
              floating,
              mask,
            ),
          setStatus: (message) => {
            this.status = message;
          },
          publish: (pixelsChanged) => this.publish(pixelsChanged),
        }),
    );
    this.color = new PaletteController({
      getPalette: () => this.doc?.palette ?? this.palette,
      getColor: (target) => this.settings[target],
      setColor: (target, color) => {
        this.drawing.settings.setSettings(
          target === "foreground" ? { foreground: color } : { background: color },
        );
      },
      commitPalette: (colors) => {
        if (this.doc) {
          this.changeDocument(
            (document) => updateAsepriteFramePalette(document, colors),
            false,
            "Set Palette",
          );
        } else {
          this.palette = colors.map((color) => [...color] as unknown as Rgba);
          this.publish();
        }
      },
    });
    this.timeline = new TimelineController({
      getTimeline: () => this.doc?.timeline ?? null,
      getPlaybackOptions: () => this.view.playback ?? {},
      setPlaybackOptions: (options) => this.canvas.setView({ playback: options }),
      getOnionSkinOptions: () => this.view.onionSkin ?? {},
      setOnionSkinOptions: (options) => this.canvas.setView({ onionSkin: options }),
      resolvePendingEdits: () => this.resolvePendingCel(),
      updateTimelineState: (timeline, options) => {
        if (!this.doc) return;
        this.doc.timeline = timeline;
        if (options.activateCel)
          activateTimelineCel(this.doc, timeline.activeFrame, timeline.activeLayer);
        this.publish(options.pixelsChanged);
      },
      commitTimeline: (label, change, activateSelection) =>
        this.changeDocument(
          (document) => {
            const current = ensureTimeline(document);
            const timeline = change(current);
            if (timeline === current) return;
            document.timeline = timeline;
            if (activateSelection)
              activateTimelineCel(document, timeline.activeFrame, timeline.activeLayer);
          },
          false,
          label,
        ),
      commitLayerTimeline: (label, change) =>
        this.changeLayers(
          (timeline, document) =>
            change(timeline, { width: document.width, height: document.height }),
          label,
        ),
      activateCel: (frame, layer, clearRange) => {
        if (!this.doc) return;
        const timeline = ensureTimeline(this.doc);
        if (clearRange) this.doc.timeline = { ...timeline, range: undefined };
        activateTimelineCel(this.doc, frame, layer);
      },
      setRange: (range) => {
        if (this.doc?.timeline) this.doc.timeline = { ...this.doc.timeline, range };
      },
      setStatusReady: () => {
        this.status = "Ready";
      },
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    this.canvas = new CanvasController({
      getDocument: () => this.doc,
      getPreviewInput: () => {
        const presentation = this.host.getPresentationInput();
        if (presentation) return presentation;
        const multi = this.clipboard.previewMultiCelSelectionTransform();
        return multi ? { document: multi } : this.drawing.runtime.previewInput();
      },
      isPlaying: () => this.timeline.isPlaying(),
      commitDocumentEdit: (label, change) => this.changeDocument(change, false, label),
      publish: () => this.publish(),
    });
    this.imageEditing = new ImageEditingController({
      getDocument: () => this.doc,
      getSettings: () => ({
        foreground: this.settings.foreground,
        background: this.settings.background,
        backgroundIndex: this.settings.backgroundIndex,
        tilesetMode: this.settings.tilesetMode,
      }),
      prepareEffect: () => {
        this.timeline.setPlaying(false);
        return this.resolvePendingCel();
      },
      commitDocumentEdit: (label, change) => this.changeDocument(change, false, label),
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    this.importExport = new ImportExportController({
      getDocument: () => this.doc,
      commitDocumentEdit: (label, change) => this.changeDocument(change, false, label),
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    this.tilemap = new TilemapController({
      getTimeline: () => this.doc?.timeline ?? null,
      getSettings: () => ({
        tilemapMode: this.settings.tilemapMode,
        tilesetMode: this.settings.tilesetMode,
        selectedTile: this.settings.selectedTile,
        backgroundTile: this.settings.backgroundTile,
        background: this.settings.background,
        backgroundIndex: this.settings.backgroundIndex,
      }),
      setSettings: (patch) => this.drawing.settings.setSettings(patch),
      canEditActiveLayer: () => !!this.editable(),
      resolvePendingCel: () => this.resolvePendingCel(),
      changeTimeline: (label, change) => this.changeLayers((timeline) => change(timeline), label),
      setStatus: (message) => {
        this.status = message;
      },
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    this.tilemapGestures = new TilemapGestureController({
      getTimeline: () => this.doc?.timeline ?? null,
      getLayerAtPoint: (point) => (this.doc ? layerAtPoint(this.doc, point.x, point.y) : null),
      getSelectionSource: () => {
        const document = this.doc;
        const selection = document?.selection;
        if (!document || !selection) return null;
        const image = copyDocumentSelection(document, false, true);
        return image?.tilemap && image.mask
          ? { timeline: ensureTimeline(document), image, selection }
          : null;
      },
      getBrushContext: () =>
        this.doc
          ? { width: this.doc.width, height: this.doc.height, selection: this.doc.selection }
          : { width: 0, height: 0, selection: null },
      getSettings: () => ({
        tool: this.inputSettings.tool,
        selectedTile: this.settings.selectedTile,
        backgroundTile: this.settings.backgroundTile,
        discardBrushOnEyedropper: this.inputSettings.discardBrushOnEyedropper,
        eyedropperSample: this.inputSettings.eyedropperSample,
        pixelPerfect: this.inputSettings.pixelPerfect,
        symmetryEnabled: this.settings.symmetryEnabled,
        brush: this.inputSettings.brush,
        brushAngleStatic:
          (this.inputSettings.dynamics?.angle ?? AsepriteDynamicSensor.Static) ===
          AsepriteDynamicSensor.Static,
      }),
      getSymmetry: () => ({
        mode: this.view.symmetryMode ?? 0,
        x: this.view.symmetryX ?? (this.doc?.width ?? 0) / 2,
        y: this.view.symmetryY ?? (this.doc?.height ?? 0) / 2,
      }),
      isEditable: () => !!this.editable(),
      supportsPixelPerfect: () => supportsPixelPerfect(this.inputSettings),
      beginTransaction: (label) => {
        const transaction = this.beginTransaction(label);
        if (!transaction || !this.doc) return null;
        let active = true;
        return {
          setTimeline: (timeline) =>
            transaction.update((document) => {
              document.timeline = timeline;
              activateTimelineCel(document, timeline.activeFrame, timeline.activeLayer);
            }),
          setSelection: (selection) =>
            transaction.update((document) => {
              document.selection = selection;
            }),
          pasteTilemap: (image, origin) =>
            transaction.update((document) => {
              pasteTilemapClipboard(document, image, origin);
            }),
          commit: () => {
            if (!active) return;
            active = false;
            if (this.doc) this.commitHistory(this.doc);
          },
          cancel: () => {
            if (!active) return;
            active = false;
            transaction.cancel();
          },
        };
      },
      discardImageBrush: () => this.drawing.settings.discardImageBrush(),
      setSelectedTile: (tile) => this.tilemap.setSelectedTile(tile),
      setBackgroundTile: (tile) => this.tilemap.setBackgroundTile(tile),
      setPointer: (point) => {
        this.pointer = point;
      },
      setStatus: (message) => {
        this.status = message;
      },
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    this.sprite = new SpriteController(
      {
        getTimeline: () => {
          const timeline = this.doc?.timeline;
          return timeline
            ? { activeFrame: timeline.activeFrame, slices: timeline.slices ?? [] }
            : null;
        },
        getOptions: () => ({
          useKeys: !!this.settings.sliceUseKeys,
          zoom: this.view.zoom,
          defaultSliceColor: this.settings.defaultSliceColor,
        }),
        beginEdit: (label) => {
          const transaction = this.beginTransaction(label);
          if (!transaction) return null;
          return {
            setSlices: (slices) =>
              transaction.update((document) => {
                if (document.timeline) document.timeline = { ...document.timeline, slices };
              }),
            commit: () => transaction.commit(),
            cancel: () => transaction.cancel(),
          };
        },
        setPointer: (value) => {
          this.pointer = value;
        },
        publish: () => this.publish(),
      },
      {
        getTimeline: () => this.doc?.timeline ?? null,
        getBackgroundColor: () => ({
          color: this.settings.background,
          index: this.settings.backgroundIndex ?? undefined,
        }),
        commitDocumentEdit: (label, change) => this.changeDocument(change, false, label),
        commitTimelineEdit: (label, change) =>
          this.changeLayers(
            (timeline, document) =>
              change(timeline, { width: document.width, height: document.height }),
            label,
          ),
      },
    );
    this.clipboard = new ClipboardController({
      getDocument: () => this.doc,
      getSettings: () => ({
        foreground: this.settings.foreground,
        background: this.settings.background,
        backgroundIndex: this.settings.backgroundIndex,
        ink: this.settings.ink,
        tilemapMode: this.settings.tilemapMode,
        selectionMulticelWhenLayersOrFrames: this.settings.selectionMulticelWhenLayersOrFrames,
        selectionAutoOpaque: this.settings.selectionAutoOpaque,
      }),
      getPalette: () => this.palette,
      resolvePendingEdits: () => this.resolvePendingCel(),
      resolveInlineTextAndFloatingPaste: () => {
        if (this.inlineText && !this.drawing.text.commitInlineText()) return false;
        if (this.floatingPaste && !this.clipboard.commitFloatingPaste()) return false;
        return true;
      },
      canPasteTimelineSelection: () =>
        !!this.doc &&
        !this.drawingGestures.isGestureActive() &&
        !this.floatingPaste &&
        !this.inlineText,
      commitDocumentEdit: (label, change) => this.changeDocument(change, false, label),
      syncDocumentTimeline: () => {
        if (this.doc) syncTimeline(this.doc);
      },
      beginHistoryTransaction: (document, label) => this.beginHistoryTransaction(document, label),
      cancelHistoryTransaction: (document) => this.cancelHistoryTransaction(document),
      captureHistory: (image, rect) => this.captureHistory(image, rect),
      commitHistory: (document) => this.commitHistory(document),
      expandCel: (document, extra) => {
        if (document !== this.doc) throw new Error("Cannot paste into a stale editor document");
        this.expandCel(extra);
      },
      prepareRasterForCommit: (document) => {
        syncTimeline(document);
        normalizeAsepriteDocument(document);
        trimActiveCel(document);
      },
      createAsepriteIndexWriter: (document) => createAsepriteIndexWriter(document, undefined),
      isActiveLayerTilemap: () => this.tilemap.isActiveLayerTilemap(),
      setTool: (tool) => {
        this.settings = { ...this.settings, tool };
      },
      setStatus: (message) => {
        this.status = message;
      },
      setAllocationError: (error) => {
        this.error = error;
      },
      stopPlayback: () => this.timeline.setPlaying(false),
      cancelGesture: () => this.cancelGesture(),
      clearPasteDrag: () => this.priorityGestures.clearPasteDrag(),
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    const text = new BitmapTextController({
      getDocument: () => this.doc,
      getSettings: () => ({
        font: this.settings.font ?? null,
        text: this.settings.text,
        textScale: this.settings.textScale,
        foreground: this.settings.foreground,
      }),
      getView: () => this.view,
      canEdit: () => !!this.editable(),
      setToolSettings: (patch) => this.drawing.settings.setSettings(patch),
      getFloatingPaste: () => this.floatingPaste,
      setFloatingPaste: (paste) => {
        this.floatingPaste = paste;
      },
      commitFloatingPaste: (preserveSelection) =>
        this.clipboard.commitFloatingPaste(preserveSelection),
      cancelGesture: () => this.cancelGesture(),
      clearPasteDrag: () => this.priorityGestures.clearPasteDrag(),
      setStatus: (message) => {
        this.status = message;
      },
      setAllocationError: (error) => {
        this.error = error;
      },
      publish: () => this.publish(),
    });
    const settings = new DrawingSettingsController({
      document: {
        getDocument: () => this.doc,
        getFallbackPalette: () => this.palette,
      },
      interaction: {
        clearLinePreview: () => {
          this.lineFreehandPreview = null;
        },
        hasFloatingPaste: () => !!this.floatingPaste,
        commitFloatingPaste: () => this.clipboard.commitFloatingPaste(),
        hasInlineText: () => !!this.inlineText,
        commitInlineText: () => text.commitInlineText(),
        updateInlineText: (patch) => text.updateInlineText(patch),
        cancelGesture: () => this.cancelGesture(),
      },
      color: this.color,
      publish: () => this.publish(),
    });
    const runtime = new DrawingRuntimeController({
      state: {
        getDocument: () => this.doc,
        getSettings: () => this.inputSettings,
        getView: () => this.view,
        getPalette: () => this.palette,
        isActiveLayerBackground: () => this.activeLayerIsBackground(),
        getSheetPreview: () => this.importExport.getSpriteSheetPreview(),
        getEffectPreview: () => this.imageEditing.getEffectPreview(),
        getSelectionPreview: () => this.selectionPreview,
        getLinePreview: () => this.lineFreehandPreview,
        getFloatingPaste: () => this.floatingPaste,
        getInlineText: () => this.inlineText,
        getPointer: () => this.pointer,
        setPointer: (value) => {
          this.pointer = value;
        },
        getLastDrawingPoint: () => this.lastDrawingPoint,
        setLastDrawingPoint: (value) => this.setLastDrawingPoint(value),
        setLinePreview: (value) => {
          this.lineFreehandPreview = value;
        },
        setStatus: (message) => {
          this.status = message;
        },
        setAllocationError: (error) => {
          this.error = error;
        },
        setSelectionPreview: (preview) => {
          this.selectionPreview = preview;
        },
        publish: (pixelsChanged) => this.publish(pixelsChanged),
      },
      edit: {
        isEditable: () => !!this.editable(),
        beginHistoryTransaction: (document, label) => this.beginHistoryTransaction(document, label),
        captureHistory: (image, rect) => this.captureHistory(image, rect),
        commitHistory: (document, replacesSelection, extraCommands, manualTilemapPreview) =>
          this.commitHistory(document, replacesSelection, extraCommands, manualTilemapPreview),
        cancelHistoryTransaction: (document) => this.cancelHistoryTransaction(document),
        expandCel: (extra) => this.expandCel(extra),
        prepareRasterForCommit: () => {
          const document = this.doc;
          if (!document) return;
          syncTimeline(document);
          normalizeAsepriteDocument(document);
          trimActiveCel(document);
        },
        beginCelMovement: (useTimelineRange = true, autoSelectLayer = false) => {
          const document = this.doc;
          if (!document) return false;
          this.clearCelMovementRange = null;
          syncTimeline(document);
          const movement = TimelineCelMovement.create(ensureTimeline(document), useTimelineRange);
          if (!movement) return false;
          this.celMovement = {
            document,
            movement,
            startOffset: { x: document.layer.x, y: document.layer.y },
            autoSelectLayer,
          };
          return true;
        },
        endCelMovement: () => {
          const moving = this.celMovement;
          if (moving && moving.document === this.doc) {
            moving.document.selection = moving.movement.moveSelection(moving.document.selection);
            if (moving.autoSelectLayer && !moving.movement.hasMoved())
              this.clearCelMovementRange = moving.document;
          }
          this.celMovement = null;
          this.selectionPreview = undefined;
        },
        cancelCelMovement: () => {
          this.celMovement = null;
          this.clearCelMovementRange = null;
          this.selectionPreview = undefined;
        },
        setLayerOffset: (offset) => {
          const moving = this.celMovement;
          if (!moving || moving.document !== this.doc) return;
          const document = moving.document;
          document.timeline = moving.movement.render(
            { x: offset.x - moving.startOffset.x, y: offset.y - moving.startOffset.y },
            this.view.snapToGrid
              ? { width: this.view.gridWidth, height: this.view.gridHeight }
              : undefined,
          );
          const timeline = document.timeline;
          if (timeline.frames[timeline.activeFrame].cels[timeline.activeLayer])
            activateTimelineCel(document, timeline.activeFrame, timeline.activeLayer);
          this.selectionPreview = null;
        },
      },
      selection: this.selection,
      tilemap: {
        gestures: this.tilemapGestures,
        isActiveLayerTilemap: () => this.tilemap.isActiveLayerTilemap(),
        getManualPreviewBase: () => {
          const document = this.doc;
          return document &&
            this.tilemap.isActiveLayerTilemap() &&
            this.settings.tilemapMode === TilemapDisplayMode.Pixels &&
            this.settings.tilesetMode === TilesetMode.Manual &&
            this.inputSettings.pixelPerfect &&
            supportsPixelPerfect(this.inputSettings)
            ? ensureTimeline(document)
            : undefined;
        },
        refreshManualPreview: (gesture) => {
          const document = this.doc;
          if (document) refreshManualPixelPerfectTilemapPreview(document, gesture, this.palette);
        },
        manualPreviewChanged: manualTilemapPreviewChanged,
        getRasterContext: () => {
          const timeline = this.doc?.timeline;
          const active = this.tilemap.isActiveLayerTilemap();
          const tileset = timeline?.tilesets?.find(
            (candidate) => candidate.id === timeline.layers[timeline.activeLayer]?.tilesetId,
          );
          return {
            active,
            tileSelectionMode:
              active &&
              (this.settings.tilemapMode ?? TilemapDisplayMode.Tiles) === TilemapDisplayMode.Tiles,
            pixelMode: this.settings.tilemapMode === TilemapDisplayMode.Pixels,
            manualTileset: this.settings.tilesetMode === TilesetMode.Manual,
            tileWidth: tileset?.tileWidth,
            tileHeight: tileset?.tileHeight,
          };
        },
        createAsepriteIndexWriter: (document, preferredIndex, matchMode) =>
          new AsepriteTilemapIndexWriter(document, preferredIndex, matchMode),
      },
      color: {
        createAsepriteIndexWriter: (document, preferredIndex, matchMode) =>
          createAsepriteIndexWriter(document, preferredIndex, matchMode),
        createShadingWriter: (document, direction, shade, shadeIndices) =>
          createIndexedShadingWriter(document, direction, shade, shadeIndices),
      },
      canvas: {
        snapInput: (input) => this.snappedInput(input),
        setView: (patch) => this.canvas.setView(patch),
        composite: () => this.canvas.composite(),
      },
      timeline: { selectLayer: (index) => this.timeline.selectLayer(index) },
      text,
      settings,
    });
    this.drawing = {
      settings,
      text,
      runtime,
      eyedropper: { colorAt: (at, button) => runtime.eyedropperColorAt(at, button) },
    };
    this.priorityGestures = new EditorPriorityGestureController(this.drawing.text, this.clipboard, {
      getDocument: () => this.doc,
      getZoom: () => this.view.zoom,
      getSelectionGrid: () => {
        const view = this.canvas.getViewSettings();
        return {
          enabled: !!view.snapToGrid,
          bounds: {
            x: view.gridX ?? 0,
            y: view.gridY ?? 0,
            width: view.gridWidth,
            height: view.gridHeight,
          },
        };
      },
      setPointer: (value) => {
        this.pointer = value;
      },
      beginHistoryTransaction: (document, label) => this.beginHistoryTransaction(document, label),
      commitHistory: (document) => this.commitHistory(document),
      cancelHistoryTransaction: (document) => this.cancelHistoryTransaction(document),
      snapInput: (input) => this.snappedInput(input),
      setAllocationError: (error) => {
        this.error = error;
      },
      publish: (pixelsChanged) => this.publish(pixelsChanged),
    });
    this.history = new HistoryController(
      {
        undo: () => this.kernel.undo(),
        redo: () => this.kernel.redo(),
        moveToState: (index) => this.kernel.moveToHistoryState(index),
        markSaved: () => this.kernel.markSaved(),
        getRasterIdentity: () => this.kernelRasterIdentity,
        getNextUndoLabel: () => this.kernel.nextUndoLabel,
        getNextRedoLabel: () => this.kernel.nextRedoLabel,
        getOptions: () => this.kernel.getHistoryOptions(),
        getSnapshot: () => this.kernel.getHistorySnapshot(),
        setOptions: (options) => this.kernel.setHistoryOptions(options),
      },
      {
        getDocument: () => this.doc,
        stopPlayback: () => this.timeline.setPlaying(false),
        cancelInlineText: () => this.drawing.text.cancelInlineText(),
        hasFloatingPaste: () => !!this.floatingPaste,
        cancelFloatingPaste: () => this.clipboard.cancelFloatingPaste(),
        cancelGesture: () => this.cancelGesture(),
        retainSlices: () => this.slices.retainExistingSlices(),
        syncGridView: () => this.syncGridView(),
        activateCel: (document, frame, layer) => activateTimelineCel(document, frame, layer),
        getStatus: () => this.status,
        setStatus: (message) => {
          this.status = message;
        },
        publish: (pixelsChanged) => this.publish(pixelsChanged),
      },
    );
    this.inputRouter = new EditorInputRouter(
      this.slices,
      this.tilemapGestures,
      this.drawingGestures,
      {
        preparePointerDown: (input) => this.preparePointerDown(input),
        handlePriorityPointerDown: (input) => this.priorityGestures.handlePointerDown(input),
        prepareNewGesture: (input) => this.prepareNewGesture(input),
        prepareEditorPointerMove: (input) => this.snappedInput(input),
        hasDocument: () => !!this.doc,
        isSliceToolActive: () => this.inputSettings.tool === "slice",
        isEyedropperToolActive: (input) => this.drawing.runtime.isEyedropperInput(input),
        isGridSelectionToolActive: () =>
          isSelectionTool(this.inputSettings.tool) &&
          this.inputSettings.selectionDoubleClickSelectTile !== false,
        isTilemapTilesModeActive: () =>
          this.tilemap.isActiveLayerTilemap() &&
          (this.settings.tilemapMode ?? TilemapDisplayMode.Tiles) === TilemapDisplayMode.Tiles,
        moveEditorPriorityGesture: (input) => this.priorityGestures.move(input),
        endEditorPriorityGesture: (input) => this.priorityGestures.end(input),
        hasEditorPriorityGesture: () =>
          this.priorityGestures.hasGesture() || !!this.lineFreehandPreview,
        cancelEditorPriorityGesture: () => this.cancelEditorPriorityGesture(),
        cancelEditorPointerDrag: () => this.priorityGestures.cancelPointerDrag(),
      },
      this.selection,
    );
    this.documentLifecycle = new EditorDocumentLifecycleController({
      kernel: {
        getDocument: () => this.doc,
        replaceDocument: (document, dirty) => this.replaceDocument(document, dirty),
      },
      state: {
        clearLastDrawingPoint: () => {
          this.lastDrawingPoint = null;
        },
        clearLinePreview: () => {
          this.lineFreehandPreview = null;
        },
        clearSelectionPreview: () => {
          this.selectionPreview = undefined;
        },
        clearSheetPreview: () => this.importExport.clearSpriteSheetPreview(),
        clearError: () => {
          this.error = null;
        },
        setPointer: (point) => {
          this.pointer = point;
        },
        setPalette: (palette) => {
          this.palette = palette;
        },
        getFallbackPalette: () => this.palette,
        getDefaultDocumentView: () => this.defaultDocumentView,
        setStatus: (message) => {
          this.status = message;
        },
        publish: (pixelsChanged) => this.publish(pixelsChanged),
      },
      history: this.history,
      canvas: this.canvas,
      timeline: this.timeline,
      imageEditing: this.imageEditing,
      clipboard: this.clipboard,
      drawing: { text: this.drawing.text, gestures: this.drawingGestures },
      priorityGestures: this.priorityGestures,
      tilemapGestures: this.tilemapGestures,
      slices: this.slices,
      inputRouter: {
        reset: () => {
          this.drawing.settings.setPointerTool(null);
          this.drawing.settings.setQuickTool(null);
          this.inputRouter.reset();
        },
      },
    });
    this.document = new DocumentController({
      installDocument: (document, palette, fallbackImage, dirty) =>
        this.documentLifecycle.installDocument(document, palette, fallbackImage, dirty),
      closeDocument: () => this.documentLifecycle.closeDocument(),
    });
  }

  toModules(): EditorCompositionModules {
    return {
      document: this.document,
      documentLifecycle: this.documentLifecycle,
      selection: this.selection,
      color: this.color,
      sprite: this.sprite,
      clipboard: this.clipboard,
      imageEditing: this.imageEditing,
      importExport: this.importExport,
      tilemap: this.tilemap,
      timeline: this.timeline,
      canvas: this.canvas,
      drawing: this.drawing,
      history: this.history,
      inputRouter: this.inputRouter,
      priorityGestures: this.priorityGestures,
      tilemapGestures: this.tilemapGestures,
    };
  }
}

export function composeEditorModules(host: EditorCompositionHost): EditorCompositionModules {
  return new EditorComposition(host).toModules();
}
