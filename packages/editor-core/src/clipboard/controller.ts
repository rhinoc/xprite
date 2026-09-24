import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";
import {
  BrushImagePattern,
  type BrushImage,
  type PixelBuffer,
  type PixelMask,
  type Point,
  type Rect,
  type Rgba,
} from "$/base/primitives";
import { normalBlend, pixelWriter, samplePixel } from "$/canvas/raster";
import {
  clipboardPasteMask,
  cloneClipboardImage,
  copyDocumentSelection,
  copyTimelineRangeSelection,
  type ClipboardImage,
} from "$/clipboard/image";
import { pasteTilemapClipboard } from "$/clipboard/tile";
import {
  copyTimelineSelection as copyTimelineRange,
  pasteTimelineClipboard as pasteTimelineRange,
  type TimelineClipboard,
} from "$/clipboard/timeline";
import type { FloatingPaste } from "$/clipboard/types";
import { libreSpriteWorkingBrushColor } from "$/color/operations/color-mode";
import type { AsepriteIndexWriter } from "$/color/types";
import {
  activateTimelineCel,
  ensureTimeline,
  syncTimeline,
  trimActiveCel,
} from "$/document/document";
import { cloneEditorProject, type EditorProject } from "$/document/project";
import type { EditorDocument } from "$/document/types";
import type { ToolSettings } from "$/drawing/tool-settings";
import {
  prepareImageClipboardForDocument,
  prepareTimelineClipboardForDocument,
  transformClipboardAsepriteSamples,
} from "$/import-export/aseprite/profile-clipboard";
import { MultiCelSelectionTransform } from "$/selection";
import type { SelectionTransform } from "$/selection/transform";
import { refreshTilemapProjections } from "$/tilemap/model";
import { TilemapDisplayMode } from "$/tilemap/types";
import {
  clearTimelineRangeSelection,
  flattenLayers,
  insertSelectionLayer,
  insertSelectionLayerRange,
  selectedLayerTree,
} from "$/timeline/layer-operations";
import { validTimelineRange } from "$/timeline/operations/timeline-range";
import {
  isBackgroundLayer,
  LAYER_REFERENCE,
  MAX_TIMELINE_LAYERS,
  renderTimelineFrame,
} from "$/timeline/timeline";
import type { TimelineCel } from "$/timeline/types";

export interface ClipboardControllerSettings {
  foreground: Rgba;
  background: Rgba;
  backgroundIndex?: number | null;
  ink?: ToolSettings["ink"];
  tilemapMode?: TilemapDisplayMode;
  selectionMulticelWhenLayersOrFrames?: boolean;
  selectionAutoOpaque?: boolean;
}

export interface ClipboardControllerPort {
  getDocument(): EditorDocument | null;
  getSettings(): ClipboardControllerSettings;
  getPalette(): readonly Rgba[];
  resolvePendingEdits(): boolean;
  resolveInlineTextAndFloatingPaste(): boolean;
  canPasteTimelineSelection(): boolean;
  commitDocumentEdit(label: string, change: (document: EditorDocument) => void): void;
  syncDocumentTimeline(): void;
  beginHistoryTransaction(document: EditorDocument, label: string): void;
  cancelHistoryTransaction(document: EditorDocument): void;
  captureHistory(image: PixelBuffer, rect: Rect): void;
  commitHistory(document: EditorDocument): boolean;
  expandCel(document: EditorDocument, extra?: Rect): void;
  prepareRasterForCommit(document: EditorDocument): void;
  createAsepriteIndexWriter(document: EditorDocument): AsepriteIndexWriter | undefined;
  isActiveLayerTilemap(): boolean;
  setTool(tool: ToolSettings["tool"]): void;
  setStatus(message: string): void;
  setAllocationError(error: EditorAllocationError | null): void;
  stopPlayback(): void;
  cancelGesture(): void;
  clearPasteDrag(): void;
  publish(pixelsChanged?: boolean): void;
}

/** Clipboard workflows use scoped document and edit capabilities supplied by the editor root. */
export class ClipboardController {
  private floatingPaste: FloatingPaste | null = null;
  private selectionTransform: SelectionTransform | null = null;
  private transformedMask: PixelMask | null = null;
  private multiCelTransform: MultiCelSelectionTransform | null = null;

  constructor(private readonly port: ClipboardControllerPort) {}

  getFloatingPaste(): FloatingPaste | null {
    return this.floatingPaste;
  }

  setFloatingPaste(value: FloatingPaste | null): void {
    this.floatingPaste = value;
    if (!value) this.multiCelTransform = null;
  }

  getSelectionTransform(): SelectionTransform | null {
    return this.selectionTransform;
  }

  setSelectionTransform(value: SelectionTransform | null): void {
    if (value && this.multiCelTransform)
      this.multiCelTransform.render(value, transformClipboardAsepriteSamples);
    this.selectionTransform = value;
    if (!value) this.multiCelTransform = null;
  }

  prepareMultiCelSelectionTransform(document: EditorDocument, mask: PixelMask): boolean {
    const settings = this.port.getSettings();
    this.multiCelTransform = MultiCelSelectionTransform.create(document, mask, {
      enabled: settings.selectionMulticelWhenLayersOrFrames !== false,
      autoOpaque: settings.selectionAutoOpaque !== false,
      background: settings.background,
      backgroundIndex: settings.backgroundIndex,
    });
    return !!this.multiCelTransform;
  }

  previewMultiCelSelectionTransform(): EditorDocument | null {
    const document = this.port.getDocument();
    return document && this.selectionTransform && this.multiCelTransform?.belongsTo(document)
      ? this.multiCelTransform.preview(
          document,
          this.selectionTransform,
          transformClipboardAsepriteSamples,
        )
      : null;
  }

  getTransformedMask(): PixelMask | null {
    return this.transformedMask;
  }

  setTransformedMask(value: PixelMask | null): void {
    this.transformedMask = value;
  }

  copyTimelineSelection(): TimelineClipboard | null {
    const document = this.port.getDocument();
    return document ? copyTimelineRange(ensureTimeline(document)) : null;
  }

  pasteTimelineClipboard(data: TimelineClipboard): boolean {
    const document = this.port.getDocument();
    if (!document || !this.port.canPasteTimelineSelection()) return false;
    const before = ensureTimeline(document);
    const next = pasteTimelineRange(before, prepareTimelineClipboardForDocument(data, document));
    if (next === before) return false;
    this.port.commitDocumentEdit("Paste Cels", (current) => {
      current.timeline = next;
      activateTimelineCel(current, next.activeFrame, next.activeLayer);
    });
    return true;
  }

  beginImagePaste(image: ClipboardImage, position?: Point): boolean {
    const document = this.port.getDocument();
    if (!document || document.layer.locked) return false;
    const owned = cloneClipboardImage(prepareImageClipboardForDocument(image, document));
    if (!this.port.resolveInlineTextAndFloatingPaste()) return false;
    this.port.stopPlayback();
    this.port.cancelGesture();
    const origin = position ??
      owned.mask ?? {
        x: Math.trunc(document.width / 2) - Math.trunc(owned.pixels.width / 2),
        y: Math.trunc(document.height / 2) - Math.trunc(owned.pixels.height / 2),
      };
    if (
      owned.tilemap &&
      this.port.isActiveLayerTilemap() &&
      (this.port.getSettings().tilemapMode ?? TilemapDisplayMode.Tiles) === TilemapDisplayMode.Tiles
    ) {
      let pasted = false;
      this.port.commitDocumentEdit("Paste", (current) => {
        pasted = pasteTilemapClipboard(current, owned, origin);
        if (pasted) current.selection = clipboardPasteMask(owned, origin);
      });
      return pasted;
    }
    const mask = clipboardPasteMask(owned, origin);
    this.port.beginHistoryTransaction(document, "Paste");
    document.selection = mask;
    this.selectionTransform = {
      source: owned.pixels,
      mask,
      bounds: { x: mask.x, y: mask.y, width: mask.width, height: mask.height },
      angle: 0,
      copy: true,
    };
    this.transformedMask = mask;
    this.floatingPaste = {
      pixels: owned.pixels,
      x: mask.x,
      y: mask.y,
      asepriteSamples: owned.asepriteSamples,
      sourceAsepriteSamples: owned.asepriteSamples,
      sourceTransparentIndex: owned.transparentIndex,
    };
    this.port.clearPasteDrag();
    this.port.setTool("marquee");
    this.port.setAllocationError(null);
    this.port.setStatus("Move selection; Enter to commit, Escape to cancel");
    this.port.publish();
    return true;
  }

  cancelFloatingPaste(): void {
    if (!this.floatingPaste) return;
    const transformed = !!this.selectionTransform;
    const document = this.port.getDocument();
    if (transformed && document) this.port.cancelHistoryTransaction(document);
    this.selectionTransform = null;
    this.multiCelTransform = null;
    this.transformedMask = null;
    this.floatingPaste = null;
    this.port.clearPasteDrag();
    this.port.setStatus("Ready");
    this.port.setAllocationError(null);
    this.port.publish(transformed);
  }

  commitFloatingPaste(preserveSelection = false): boolean {
    const floating = this.floatingPaste;
    const document = this.port.getDocument();
    if (!floating || !document) return true;
    if (document.layer.locked && !this.multiCelTransform) {
      this.port.setStatus("Layer is locked");
      this.port.publish();
      return false;
    }
    if (
      this.multiCelTransform &&
      this.selectionTransform &&
      this.multiCelTransform.belongsTo(document)
    ) {
      try {
        const timeline = this.multiCelTransform.render(
          this.selectionTransform,
          transformClipboardAsepriteSamples,
        );
        // Recheck editability before installing the immutable result.
        if (
          document.timeline?.layers.some(
            (layer, index) => layer.locked !== timeline.layers[index]?.locked,
          )
        ) {
          this.cancelFloatingPaste();
          return false;
        }
        document.timeline = { ...timeline, layers: document.timeline?.layers ?? timeline.layers };
        activateTimelineCel(document, timeline.activeFrame, timeline.activeLayer);
        if (!preserveSelection) document.selection = this.transformedMask ?? document.selection;
        this.port.commitHistory(document);
        this.selectionTransform = null;
        this.multiCelTransform = null;
        this.transformedMask = null;
        this.floatingPaste = null;
        this.port.clearPasteDrag();
        this.port.setAllocationError(null);
        this.port.setStatus("Ready");
        this.port.publish(true);
        return true;
      } catch (error) {
        this.cancelFloatingPaste();
        if (!(error instanceof EditorAllocationError)) throw error;
        this.port.setAllocationError(error);
        this.port.setStatus(error.message);
        this.port.publish();
        return false;
      }
    }
    if (!this.selectionTransform) this.port.beginHistoryTransaction(document, "Paste");
    try {
      this.port.expandCel(document, {
        x: floating.x,
        y: floating.y,
        width: floating.pixels.width,
        height: floating.pixels.height,
      });
    } catch (error) {
      this.port.cancelHistoryTransaction(document);
      const transformed = !!this.selectionTransform;
      if (transformed) {
        this.selectionTransform = null;
        this.transformedMask = null;
        this.floatingPaste = null;
        this.port.clearPasteDrag();
      }
      if (!(error instanceof EditorAllocationError)) throw error;
      this.port.setAllocationError(error);
      this.port.setStatus(error.message);
      this.port.publish(transformed);
      return false;
    }
    const indexedPixelWriter =
      floating.asepriteSamples?.depth === 8
        ? this.port.createAsepriteIndexWriter(document)
        : undefined;
    const image = document.layer.pixels;
    const settings = this.port.getSettings();
    const writer = pixelWriter(image, {
      indexedPixelWriter:
        indexedPixelWriter && floating.asepriteSamples
          ? {
              read: indexedPixelWriter.read,
              write: (x, y, color) => {
                const sx = x + document.layer.x - floating.x;
                const sy = y + document.layer.y - floating.y;
                return indexedPixelWriter.write(
                  x,
                  y,
                  color,
                  floating.asepriteSamples!.data[sy * floating.asepriteSamples!.width + sx],
                );
              },
            }
          : undefined,
      color: settings.foreground,
      brush: { shape: "square", size: 1, angle: 0 },
      beforeWrite: (rect) => this.port.captureHistory(image, rect),
    });
    for (let y = 0; y < floating.pixels.height; y++)
      for (let x = 0; x < floating.pixels.width; x++) {
        const color = samplePixel(floating.pixels, { x, y });
        const indexed =
          floating.asepriteSamples?.depth === 8 && document.timeline?.colorDepth === 8;
        if (
          indexed
            ? floating.asepriteSamples!.data[y * floating.asepriteSamples!.width + x] ===
              (floating.sourceTransparentIndex ?? document.timeline?.transparentIndex ?? 0)
            : !color[3]
        )
          continue;
        const point = {
          x: floating.x + x - document.layer.x,
          y: floating.y + y - document.layer.y,
        };
        writer.write(
          point.x,
          point.y,
          indexed ? color : normalBlend(samplePixel(image, point), color, UINT8_MAX),
        );
      }
    if (!preserveSelection)
      document.selection = this.transformedMask ?? {
        x: floating.x,
        y: floating.y,
        width: floating.pixels.width,
        height: floating.pixels.height,
        data: new Uint8Array(floating.pixels.width * floating.pixels.height).fill(UINT8_MAX),
      };
    if (!this.port.isActiveLayerTilemap()) this.port.prepareRasterForCommit(document);
    this.port.commitHistory(document);
    this.selectionTransform = null;
    this.transformedMask = null;
    this.floatingPaste = null;
    this.port.clearPasteDrag();
    this.port.setAllocationError(null);
    this.port.setStatus("Ready");
    this.port.publish(true);
    return true;
  }

  copySelection(merged = false): ClipboardImage | null {
    const document = this.port.getDocument();
    if (!document || !this.port.resolveInlineTextAndFloatingPaste()) return null;
    return copyDocumentSelection(
      document,
      merged,
      (this.port.getSettings().tilemapMode ?? TilemapDisplayMode.Tiles) ===
        TilemapDisplayMode.Tiles,
    );
  }

  createBrushImageFromSelection(): BrushImage | null {
    if (!this.port.resolvePendingEdits()) return null;
    const document = this.port.getDocument();
    if (!document) return null;
    const selected = copyDocumentSelection(document, false, false);
    if (!selected?.mask) return null;
    const { pixels } = selected;
    return {
      width: pixels.width,
      height: pixels.height,
      data: pixels.data.slice(),
      anchor: { x: Math.floor(pixels.width / 2), y: Math.floor(pixels.height / 2) },
      mask: selected.mask.data.slice(),
      ...(selected.asepriteSamples
        ? {
            asepriteSamples: {
              ...selected.asepriteSamples,
              data: selected.asepriteSamples.data.slice(),
            },
          }
        : {}),
      ...(selected.palette ? { palette: selected.palette.map((color) => [...color] as Rgba) } : {}),
      ...(selected.transparentIndex !== undefined
        ? { transparentIndex: selected.transparentIndex }
        : {}),
      ...(selected.sourceBackground !== undefined
        ? { sourceBackground: selected.sourceBackground }
        : {}),
      pattern: BrushImagePattern.AlignedToSource,
      patternOrigin: { x: selected.mask.x, y: selected.mask.y },
    };
  }

  createSpriteFromSelection(): { image: ClipboardImage; name: string } | null {
    if (!this.port.resolvePendingEdits()) return null;
    const document = this.port.getDocument();
    if (!document) return null;
    const image = copyDocumentSelection(document, false, false);
    const mask = document.selection;
    if (!image || !mask) return null;
    const title = (document.name.split(/[\\/]/).pop() ?? document.name).replace(/\.[^/.]+$/, "");
    return { image, name: `${title}-${mask.x}x${mask.y}-${mask.width}x${mask.height}` };
  }

  duplicateProject(flatten = false): EditorProject | null {
    if (!this.port.resolvePendingEdits()) return null;
    this.port.syncDocumentTimeline();
    const document = this.port.getDocument();
    if (!document) return null;
    const source = ensureTimeline(document);
    const base = { ...source, range: undefined };
    let timeline = flatten ? flattenLayers(base, document.width, document.height, false) : base;
    if (flatten) timeline = { ...timeline, asepriteSource: undefined };
    const image = renderTimelineFrame(
      timeline,
      document.width,
      document.height,
      timeline.activeFrame,
    );
    return cloneEditorProject({ image, timeline, palette: document.palette });
  }

  newLayerViaSelection(cut = false): boolean {
    if (!this.port.resolvePendingEdits()) return false;
    const document = this.port.getDocument();
    if (!document) return false;
    const mask = document.selection;
    const timeline = ensureTimeline(document);
    if (!mask || !mask.data.some(Boolean) || timeline.layers.length >= MAX_TIMELINE_LAYERS)
      return false;
    const range =
      timeline.range && validTimelineRange(timeline, timeline.range) ? timeline.range : null;
    const sourceLayers = range ? selectedLayerTree(timeline, range.layers) : [timeline.activeLayer];
    const sourceLayer = timeline.layers[timeline.activeLayer];
    if (
      !range &&
      (!sourceLayer || sourceLayer.kind === "group" || sourceLayer.flags & LAYER_REFERENCE)
    )
      return false;
    const frames = range ? [...range.frames].sort((a, b) => a - b) : [timeline.activeFrame];
    const images = new Map<number, ClipboardImage>();
    if (range) {
      for (const frame of frames) {
        const image = copyTimelineRangeSelection(document, frame, range.layers);
        if (image) images.set(frame, image);
      }
    } else {
      const image = copyDocumentSelection(document, false, false);
      if (image)
        images.set(timeline.activeFrame, prepareImageClipboardForDocument(image, document));
    }
    if (!images.size) return false;
    const copiedCels = new Map<number, TimelineCel>();
    for (const [frame, image] of images)
      copiedCels.set(frame, {
        pixels: image.pixels,
        asepriteSamples: image.asepriteSamples,
        x: mask.x,
        y: mask.y,
        opacity: UINT8_MAX,
        zIndex: 0,
      });
    let changed = false;
    this.port.commitDocumentEdit(cut ? "New Layer via Cut" : "New Layer via Copy", (current) => {
      let currentTimeline = ensureTimeline(current);
      if (cut) {
        const settings = this.port.getSettings();
        const cleared = clearTimelineRangeSelection(
          currentTimeline,
          mask,
          frames,
          sourceLayers,
          (layer, frame) => {
            if (!isBackgroundLayer(currentTimeline.layers[layer])) return [0, 0, 0, 0];
            const colors =
              currentTimeline.frames[frame]?.palette ?? current.palette ?? this.port.getPalette();
            const color = libreSpriteWorkingBrushColor(
              settings.background,
              currentTimeline,
              colors,
              settings.backgroundIndex ?? undefined,
              settings.ink,
            );
            return [color[0], color[1], color[2], UINT8_MAX];
          },
        );
        if (cleared !== currentTimeline) {
          currentTimeline = cleared;
          if (sourceLayers.some((layer) => currentTimeline.layers[layer]?.kind === "tilemap"))
            currentTimeline = refreshTilemapProjections(currentTimeline);
        }
        current.timeline = currentTimeline;
        activateTimelineCel(current, currentTimeline.activeFrame, currentTimeline.activeLayer);
        if (
          sourceLayers.includes(currentTimeline.activeLayer) &&
          currentTimeline.layers[currentTimeline.activeLayer]?.kind !== "tilemap" &&
          !isBackgroundLayer(currentTimeline.layers[currentTimeline.activeLayer])
        ) {
          trimActiveCel(current);
          currentTimeline = ensureTimeline(current);
        }
      }
      syncTimeline(current);
      currentTimeline = ensureTimeline(current);
      const next = range
        ? insertSelectionLayerRange(currentTimeline, copiedCels)
        : insertSelectionLayer(
            currentTimeline,
            copiedCels.get(currentTimeline.activeFrame)!.pixels,
            { x: mask.x, y: mask.y },
            copiedCels.get(currentTimeline.activeFrame)!.asepriteSamples,
          );
      if (next === currentTimeline) return;
      current.timeline = next;
      activateTimelineCel(current, next.activeFrame, next.activeLayer);
      current.selection = mask;
      current.hiddenSelection = null;
      changed = true;
    });
    return changed;
  }
}
