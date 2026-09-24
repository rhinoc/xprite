import type { PixelBuffer, Rgba } from "$/base/primitives";
import type { CanvasController } from "$/canvas/controller";
import { ensureTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import type { BitmapTextController } from "$/drawing/text/controller";
import type { HistoryController } from "$/history/controller";
import type { ImageEditingController } from "$/image-editing/controller";
import { extractPalette } from "$/import-export/image/import/palette";
import type { SpriteController } from "$/sprite/controller";
import type { TilemapGestureController } from "$/tilemap/gesture-controller";
import type { TimelineController } from "$/timeline/controller";
import { ensureLayerUuids } from "$/timeline/layer-uuid";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";

export interface EditorDocumentLifecyclePort {
  kernel: {
    getDocument(): EditorDocument | null;
    replaceDocument(document: EditorDocument | null, dirty?: boolean): void;
  };
  state: {
    clearLastDrawingPoint(): void;
    clearLinePreview(): void;
    clearSelectionPreview(): void;
    clearSheetPreview(): void;
    clearError(): void;
    setPointer(point: null): void;
    setPalette(palette: Rgba[]): void;
    getFallbackPalette(): readonly Rgba[];
    getDefaultDocumentView(): ReturnType<CanvasController["getDefaultDocumentView"]>;
    setStatus(message: string): void;
    publish(pixelsChanged?: boolean): void;
  };
  history: Pick<HistoryController, "clearNotice">;
  canvas: Pick<CanvasController, "initializeDocumentView" | "resetDocumentView" | "clearCache">;
  timeline: Pick<TimelineController, "reset">;
  imageEditing: Pick<ImageEditingController, "clearPreview">;
  clipboard: {
    setSelectionTransform(value: null): void;
    setTransformedMask(value: null): void;
    setFloatingPaste(value: null): void;
  };
  drawing: {
    text: Pick<BitmapTextController, "reset">;
    gestures: { reset(): void };
  };
  priorityGestures: { reset(): void };
  tilemapGestures: Pick<TilemapGestureController, "reset">;
  slices: Pick<SpriteController["slices"], "reset">;
  inputRouter: { reset(): void };
}

/** Document replacement and close reset all transient feature sessions in one place. */
export class EditorDocumentLifecycleController {
  private nextDocumentId = 0;

  constructor(private readonly port: EditorDocumentLifecyclePort) {}

  installDocument(
    document: EditorDocument,
    initialPalette?: readonly Rgba[],
    fallbackImage?: PixelBuffer,
    dirty = false,
  ): void {
    this.port.history.clearNotice();
    this.port.state.clearLastDrawingPoint();
    this.port.state.clearLinePreview();
    document = { ...document, hiddenSelection: null, id: ++this.nextDocumentId };
    this.port.state.clearSelectionPreview();
    this.port.state.clearError();
    this.port.timeline.reset();
    this.port.imageEditing.clearPreview();
    this.port.state.clearSheetPreview();
    this.port.clipboard.setSelectionTransform(null);
    this.port.clipboard.setTransformedMask(null);
    this.port.priorityGestures.reset();
    this.port.drawing.text.reset();
    this.port.clipboard.setFloatingPaste(null);
    this.port.drawing.gestures.reset();
    this.port.tilemapGestures.reset();
    this.port.slices.reset();
    this.port.inputRouter.reset();

    const timeline = ensureLayerUuids(ensureTimeline(document));
    document.timeline = timeline;
    if (!timeline.gridBounds) {
      const defaults = this.port.state.getDefaultDocumentView();
      document.timeline = {
        ...timeline,
        gridBounds: {
          x: defaults.gridX ?? 0,
          y: defaults.gridY ?? 0,
          width: defaults.gridWidth,
          height: defaults.gridHeight,
        },
      };
    }
    this.port.kernel.replaceDocument(document, dirty);
    this.port.canvas.initializeDocumentView(document);
    this.port.canvas.clearCache();
    const palette = initialPalette
      ? initialPalette.map((color) => [...color] as unknown as Rgba)
      : extractPalette(fallbackImage ?? compositeTimeline(document)).map((entry) => entry.color);
    this.port.state.setPalette(palette);
    document.palette = palette;
    this.port.state.setStatus(`${document.name} · ${document.width} × ${document.height}`);
    this.port.state.publish(true);
  }

  closeDocument(): void {
    this.port.history.clearNotice();
    this.port.state.clearLastDrawingPoint();
    this.port.state.clearLinePreview();
    this.port.state.clearSelectionPreview();
    this.port.timeline.reset();
    this.port.imageEditing.clearPreview();
    this.port.state.clearSheetPreview();
    const document = this.port.kernel.getDocument();
    if (document?.palette)
      this.port.state.setPalette(document.palette.map((color) => [...color] as unknown as Rgba));
    this.port.clipboard.setSelectionTransform(null);
    this.port.clipboard.setTransformedMask(null);
    this.port.priorityGestures.reset();
    this.port.drawing.text.reset();
    this.port.clipboard.setFloatingPaste(null);
    this.port.drawing.gestures.reset();
    this.port.tilemapGestures.reset();
    this.port.slices.reset();
    this.port.inputRouter.reset();
    this.port.state.setPointer(null);
    this.port.state.clearError();
    this.port.kernel.replaceDocument(null);
    this.port.canvas.resetDocumentView();
    this.port.state.setStatus("Ready");
    this.port.state.publish(true);
  }
}
