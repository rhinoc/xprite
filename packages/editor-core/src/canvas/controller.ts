import { INT16_MAX, INT16_MIN, UINT16_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Point, Rect } from "$/base/primitives";
import {
  copyDocumentViewOptions,
  updateDocumentViewOptions,
} from "$/canvas/document-view-preferences";
import { DocumentViewTarget } from "$/canvas/document-view-preferences";
import { EditorCanvasRenderer, type EditorRenderInput } from "$/canvas/editor-renderer";
import type { DocumentShowOption, DocumentViewOptions, ViewSettings } from "$/canvas/types";
import { DEFAULT_VIEW, clampZoom, libreSpriteZoomAtAnchor } from "$/canvas/view";
import { ensureTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { normalizeOnionSkin, normalizePlayback } from "$/timeline/animation-options";
import { defaultOnionSkinSettings, defaultPlaybackSettings } from "$/timeline/animation-options";

export interface CanvasControllerPort {
  getDocument(): EditorDocument | null;
  getPreviewInput(): EditorRenderInput | null;
  isPlaying(): boolean;
  commitDocumentEdit(label: string, change: (document: EditorDocument) => void): void;
  publish(): void;
}

/** View settings, view preferences, viewport rendering, and canvas assistance controls. */
export class CanvasController {
  private view: ViewSettings = { ...DEFAULT_VIEW, pan: { x: 0, y: 0 } };
  private defaultDocumentView: Readonly<DocumentViewOptions> =
    copyDocumentViewOptions(DEFAULT_VIEW);
  private readonly renderer: EditorCanvasRenderer;

  constructor(private readonly port: CanvasControllerPort) {
    this.renderer = new EditorCanvasRenderer(
      () => this.port.getDocument(),
      () => this.port.getPreviewInput(),
      () => this.view,
      () => this.port.isPlaying(),
    );
  }

  getViewSettings(): ViewSettings {
    return this.view;
  }

  setViewState(view: ViewSettings): void {
    this.view = view;
  }

  getDefaultDocumentView(): Readonly<DocumentViewOptions> {
    return this.defaultDocumentView;
  }

  setDefaultDocumentView(view: Readonly<DocumentViewOptions>): void {
    this.defaultDocumentView = copyDocumentViewOptions(view);
  }

  clearCache(): void {
    this.renderer.clearCache();
  }

  composite(): PixelBuffer {
    return this.renderer.composite();
  }

  previewComposite(): PixelBuffer {
    return this.renderer.previewComposite();
  }

  previewRaster(allowOffsetRaster = true) {
    return this.renderer.previewRaster(allowOffsetRaster);
  }

  previewViewport(viewport: Parameters<EditorCanvasRenderer["previewViewport"]>[0]): PixelBuffer {
    return this.renderer.previewViewport(viewport);
  }

  exportComposite(): PixelBuffer {
    return this.renderer.exportComposite();
  }

  toggleDocumentViewOption(
    option: DocumentShowOption,
    target: DocumentViewTarget = DocumentViewTarget.Document,
  ): void {
    const current =
      target === DocumentViewTarget.Defaults || !this.port.getDocument()
        ? this.defaultDocumentView
        : this.view;
    this.setDocumentViewOptions({ [option]: !current[option] }, target);
  }

  setDocumentViewOptions(
    patch: Partial<DocumentViewOptions>,
    target: DocumentViewTarget = DocumentViewTarget.Document,
  ): void {
    if (target === DocumentViewTarget.Defaults || !this.port.getDocument()) {
      const next = updateDocumentViewOptions(this.defaultDocumentView, patch);
      if (next === this.defaultDocumentView) return;
      this.defaultDocumentView = next;
      this.port.publish();
      return;
    }
    const next = updateDocumentViewOptions(this.view, patch);
    if (next !== this.view) this.setView(next);
  }

  setView(patch: Partial<ViewSettings>): void {
    this.view = {
      ...this.view,
      ...patch,
      ...(patch.onionSkin ? { onionSkin: normalizeOnionSkin(patch.onionSkin) } : {}),
      ...(patch.playback ? { playback: normalizePlayback(patch.playback) } : {}),
      zoom: clampZoom(patch.zoom ?? this.view.zoom, this.view.zoom),
      pan: patch.pan ? { ...patch.pan } : this.view.pan,
      gridWidth: Math.max(1, patch.gridWidth ?? this.view.gridWidth),
      gridHeight: Math.max(1, patch.gridHeight ?? this.view.gridHeight),
    };
    this.port.publish();
  }

  zoomTo(zoom: number, viewport: { width: number; height: number }, anchor?: Point): void {
    const nextZoom = clampZoom(zoom, this.view.zoom);
    if (nextZoom === this.view.zoom) return;
    const document = this.port.getDocument();
    if (!document) {
      this.setView({ zoom: nextZoom });
      return;
    }
    this.setView(libreSpriteZoomAtAnchor(nextZoom, viewport, document, this.view, anchor));
  }

  setGridBounds(bounds: Rect): void {
    const document = this.port.getDocument();
    if (!document) return;
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger) ||
      bounds.width < 1 ||
      bounds.height < 1 ||
      bounds.width > UINT16_MAX ||
      bounds.height > UINT16_MAX ||
      bounds.x < INT16_MIN ||
      bounds.x > INT16_MAX ||
      bounds.y < INT16_MIN ||
      bounds.y > INT16_MAX
    )
      throw new RangeError("Invalid grid bounds");
    this.port.commitDocumentEdit("Grid Settings", (current) => {
      const timeline = ensureTimeline(current);
      if (
        timeline.gridBounds &&
        Object.keys(bounds).every(
          (key) => bounds[key as keyof Rect] === timeline.gridBounds![key as keyof Rect],
        )
      )
        return;
      current.timeline = { ...timeline, gridBounds: { ...bounds } };
    });
    this.setView({
      grid: true,
      gridX: bounds.x,
      gridY: bounds.y,
      gridWidth: bounds.width,
      gridHeight: bounds.height,
    });
  }

  setSymmetryMode(mode: number): void {
    this.setView({ symmetryMode: mode & 15 });
  }

  resetSymmetryAxes(center?: Point): void {
    const document = this.port.getDocument();
    if (!document) return;
    this.setView({
      symmetryX: center?.x ?? document.width / 2,
      symmetryY: center?.y ?? document.height / 2,
    });
  }

  syncGridViewFromDocument(): void {
    const grid = this.port.getDocument()?.timeline?.gridBounds;
    if (grid)
      this.view = {
        ...this.view,
        gridX: grid.x,
        gridY: grid.y,
        gridWidth: grid.width,
        gridHeight: grid.height,
      };
  }

  resetDocumentView(): void {
    this.view = {
      ...this.view,
      ...this.defaultDocumentView,
      pan: { x: 0, y: 0 },
      zoom: 1,
    };
  }

  initializeDocumentView(document: EditorDocument): void {
    const timeline = document.timeline;
    this.view = {
      ...this.view,
      ...this.defaultDocumentView,
      pan: { x: 0, y: 0 },
      zoom: 1,
      symmetryMode: 0,
      symmetryX: document.width / 2,
      symmetryY: document.height / 2,
      tiledMode: 0,
      onionSkin: { ...defaultOnionSkinSettings },
      playback: { ...defaultPlaybackSettings },
      ...(timeline?.gridBounds
        ? {
            gridX: timeline.gridBounds.x,
            gridY: timeline.gridBounds.y,
            gridWidth: timeline.gridBounds.width,
            gridHeight: timeline.gridBounds.height,
          }
        : {}),
    };
  }
}
