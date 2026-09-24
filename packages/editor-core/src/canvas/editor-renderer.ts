import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { mulUn8 } from "$/canvas/blend-modes";
import type { ViewSettings } from "$/canvas/types";
import { ensureTimeline, syncTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { selectedLayerTree } from "$/timeline";
import { renderOnionSkinViewport } from "$/timeline/onion-skin";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";
import { LAYER_REFERENCE } from "$/timeline/timeline";
import type { SpriteTimeline } from "$/timeline/types";
import {
  renderTimelineViewport,
  type TimelineViewport,
  type TimelineViewportOverlay,
} from "$/timeline/viewport-renderer";

export interface EditorRenderInput {
  document: EditorDocument;
  overlay?: TimelineViewportOverlay;
}

const NORMAL_BLEND_MODE = 0;

/** Canvas compositing and viewport rendering. Preview input assembly stays with the editor host. */
export class EditorCanvasRenderer {
  private cachedDocument: EditorDocument | null = null;
  private cachedComposite: PixelBuffer | null = null;

  constructor(
    private readonly getDocument: () => EditorDocument | null,
    private readonly getPreviewInput: () => EditorRenderInput | null,
    private readonly getViewSettings: () => ViewSettings,
    private readonly isPlaying: () => boolean,
  ) {}

  clearCache(): void {
    this.cachedDocument = null;
    this.cachedComposite = null;
  }

  private editorPreviewInput(): EditorRenderInput | null {
    const input = this.getPreviewInput();
    const opacity = this.getViewSettings().nonActiveLayersOpacity ?? UINT8_MAX;
    const timeline = input?.document.timeline;
    if (!input || !timeline || opacity === UINT8_MAX) return input;
    const selected = new Set(
      selectedLayerTree(
        timeline,
        timeline.range?.layers.length ? timeline.range.layers : [timeline.activeLayer],
      ),
    );
    selected.add(timeline.activeLayer);
    const layers = timeline.layers.map((layer, index) =>
      layer.kind === "group" || selected.has(index)
        ? layer
        : { ...layer, opacity: mulUn8(layer.opacity, opacity) },
    );
    return { ...input, document: { ...input.document, timeline: { ...timeline, layers } } };
  }

  composite(): PixelBuffer {
    const document = this.getDocument();
    if (!document) return { width: 0, height: 0, data: new Uint8ClampedArray() };
    if (this.cachedDocument === document && this.cachedComposite) return this.cachedComposite;
    this.cachedDocument = document;
    this.cachedComposite = compositeTimeline(document);
    return this.cachedComposite;
  }

  previewComposite(): PixelBuffer {
    const input = this.editorPreviewInput();
    const activeDocument = this.getDocument();
    if (!input) return this.composite();
    return input.document === activeDocument && !input.overlay
      ? this.composite()
      : compositeTimeline(input.document, undefined, input.overlay);
  }

  /** Borrow an ordinary cel for presentation instead of allocating a full
   * document composite. Complex blends, reference/tile layers and overlays
   * retain the compositor. Callers must clip this raster to document bounds. */
  previewRaster(allowOffsetRaster = true): { pixels: PixelBuffer; x: number; y: number } {
    const input = this.editorPreviewInput();
    if (!input) return { pixels: this.composite(), x: 0, y: 0 };
    const document = input.document;
    ensureTimeline(document);
    syncTimeline(document);
    const current = document.timeline!;
    const layer = current.layers[0];
    const cel = current.frames[current.activeFrame]?.cels[0];
    const plainLayer =
      !!layer &&
      !input.overlay &&
      current.layers.length === 1 &&
      layer.kind !== "group" &&
      layer.kind !== "tilemap" &&
      !layer.parentId &&
      !(layer.flags & LAYER_REFERENCE) &&
      (layer.blendMode ?? NORMAL_BLEND_MODE) === NORMAL_BLEND_MODE;
    if (plainLayer && (!layer?.visible || !cel))
      return { pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) }, x: 0, y: 0 };
    if (
      plainLayer &&
      layer?.visible &&
      layer.opacity === UINT8_MAX &&
      cel?.opacity === UINT8_MAX &&
      (allowOffsetRaster ||
        (cel.x === 0 &&
          cel.y === 0 &&
          cel.pixels.width === document.width &&
          cel.pixels.height === document.height)) &&
      Number.isInteger(cel.x) &&
      Number.isInteger(cel.y)
    )
      return { pixels: cel.pixels, x: cel.x, y: cel.y };
    return {
      pixels:
        document === this.getDocument() && !input.overlay
          ? this.composite()
          : compositeTimeline(document, undefined, input.overlay),
      x: 0,
      y: 0,
    };
  }

  previewViewport(viewport: TimelineViewport): PixelBuffer {
    const input = this.editorPreviewInput();
    const settings = this.getViewSettings();
    if (!input)
      return {
        width: viewport.width,
        height: viewport.height,
        data: new Uint8ClampedArray(viewport.width * viewport.height * 4),
      };
    ensureTimeline(input.document);
    syncTimeline(input.document);
    let timeline: SpriteTimeline = input.document.timeline!;
    const layer = input.document.layer;
    const frameIndex = timeline.activeFrame;
    const layerIndex = timeline.activeLayer;
    const cel = timeline.frames[frameIndex].cels[layerIndex];
    if (timeline.layers[layerIndex].kind === "tilemap" && layer.pixels !== cel?.pixels)
      timeline = {
        ...timeline,
        frames: timeline.frames.map((frame, index) =>
          index === frameIndex
            ? {
                ...frame,
                cels: frame.cels.map((currentCel, currentLayer) =>
                  currentLayer === layerIndex
                    ? {
                        ...currentCel,
                        pixels: layer.pixels,
                        x: layer.x,
                        y: layer.y,
                        opacity: layer.celOpacity ?? UINT8_MAX,
                        zIndex: layer.zIndex ?? 0,
                      }
                    : currentCel,
                ),
              }
            : frame,
        ),
      };
    return settings.onionSkin?.active && !this.isPlaying()
      ? renderOnionSkinViewport(timeline, viewport, settings.onionSkin, undefined, input.overlay)
      : renderTimelineViewport(timeline, viewport, undefined, input.overlay);
  }

  exportComposite(): PixelBuffer {
    const document = this.getDocument();
    if (!document) return { width: 0, height: 0, data: new Uint8ClampedArray() };
    return compositeTimeline(document, undefined, undefined, false);
  }
}
