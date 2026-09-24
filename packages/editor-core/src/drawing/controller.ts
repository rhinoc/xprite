import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PointerInput } from "$/base/pointer-input";
import type { PixelBuffer, PixelMask, Point, Rgba } from "$/base/primitives";
import type { EditorRenderInput } from "$/canvas/editor-renderer";
import {
  blurStroke,
  eraseStroke,
  lineStrokePoints,
  mulUn8,
  paintLine,
  paintStroke,
  samplePixel,
} from "$/canvas/raster";
import { supportsPixelPerfect } from "$/canvas/raster/pixel-perfect-stroke";
import type { RasterOptions } from "$/canvas/raster/types";
import type { ViewSettings } from "$/canvas/types";
import { stepZoom } from "$/canvas/view";
import type { FloatingPaste } from "$/clipboard/types";
import { asepriteBestFit, paletteForColors } from "$/color/samples";
import type { AsepriteIndexWriter } from "$/color/types";
import { layerAtPoint } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { getXpriteToolCapabilities } from "$/drawing/capabilities";
import { applyEyedropperChannel } from "$/drawing/eyedropper";
import {
  DrawingGestureController,
  type DrawingGestureSettings,
  type DrawingGestureState,
  type DrawingGestureTransaction,
  type DrawingPaintTarget,
} from "$/drawing/gesture-controller";
import { AsepriteLineFreehandController } from "$/drawing/line/controller";
import {
  DrawingRasterizer,
  type AsepriteIndexMatchMode,
  type DrawingRasterPaintTarget,
  type DrawingRasterSettings,
} from "$/drawing/rasterizer";
import type { DrawingSettingsController } from "$/drawing/settings-controller";
import { paintShape } from "$/drawing/shapes";
import { isShapeTool } from "$/drawing/shapes";
import type { BitmapTextController } from "$/drawing/text/controller";
import type { InlineTextDraft } from "$/drawing/text/inline-text";
import { FillReference } from "$/drawing/tool-settings";
import type { ToolSettings } from "$/drawing/tool-settings";
import type { EditorTool } from "$/drawing/tool-settings";
import { EyedropperChannel, EyedropperSample } from "$/drawing/types";
import type { HistoryCommand } from "$/history/history";
import type { SelectionController } from "$/selection/controller";
import { selectionLayerReference } from "$/selection/operations";
import { combineSelection, isSelectionTool, selectionModeForInput } from "$/selection/operations";
import { maskContains } from "$/selection/transform";
import { SelectionMode } from "$/selection/types";
import type { TilemapGestureController } from "$/tilemap/gesture-controller";
import { TilemapDisplayMode, TilesetMode } from "$/tilemap/types";
import { canMoveTimelineLayer, isLayerInCelMovementRange } from "$/timeline";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";
import type { SpriteTimeline, TimelineCel } from "$/timeline/timeline";
import { effectiveLayerVisible, LAYER_REFERENCE, layerAncestors } from "$/timeline/timeline";

const TRANSPARENT_INDEX = 0;
const TRANSPARENT_COLOR: Rgba = [0, 0, 0, 0];
const NORMAL_BLEND_MODE = 0;

function cropReferenceImage(reference: PixelBuffer, target: DrawingRasterPaintTarget): PixelBuffer {
  const output: PixelBuffer = {
    width: target.image.width,
    height: target.image.height,
    data: new Uint8ClampedArray(target.image.width * target.image.height * 4),
  };
  const offsetX = Math.floor(target.layerOffset.x),
    offsetY = Math.floor(target.layerOffset.y),
    left = Math.max(0, -offsetX),
    top = Math.max(0, -offsetY),
    right = Math.min(target.image.width, reference.width - offsetX),
    bottom = Math.min(target.image.height, reference.height - offsetY);
  for (let y = top; y < bottom; y++) {
    const sourceStart = ((offsetY + y) * reference.width + offsetX + left) * 4,
      targetStart = (y * target.image.width + left) * 4,
      length = (right - left) * 4;
    output.data.set(reference.data.subarray(sourceStart, sourceStart + length), targetStart);
  }
  return output;
}

interface EyedropperPixel {
  color: Rgba;
  index?: number;
}

function sampleTimelineCel(cel: TimelineCel, at: Point, reference = false): EyedropperPixel {
  const image = cel.pixels;
  const bounds =
    reference && cel.preciseBounds
      ? cel.preciseBounds
      : { x: cel.x, y: cel.y, width: image.width, height: image.height };
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return { color: [...TRANSPARENT_COLOR] };
  const x = Math.floor(((at.x - bounds.x) * image.width) / bounds.width);
  const y = Math.floor(((at.y - bounds.y) * image.height) / bounds.height);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height)
    return { color: [...TRANSPARENT_COLOR] };
  const raw = cel.asepriteSamples;
  return {
    color: samplePixel(image, { x, y }),
    ...(raw?.depth === 8 && raw.width === image.width && raw.height === image.height
      ? { index: raw.data[y * raw.width + x] }
      : {}),
  };
}

function firstReferencePixel(document: EditorDocument, at: Point): EyedropperPixel {
  const timeline = document.timeline;
  if (!timeline) return { color: [...TRANSPARENT_COLOR] };
  const frame = timeline.frames[timeline.activeFrame];
  if (!frame) return { color: [...TRANSPARENT_COLOR] };
  const index = timeline.layers.findIndex(
    (layer, layerIndex) =>
      !!(layer.flags & LAYER_REFERENCE) &&
      effectiveLayerVisible(timeline, layerIndex) &&
      !!frame.cels[layerIndex],
  );
  if (index < 0) return { color: [...TRANSPARENT_COLOR] };
  const cel = frame.cels[index]!;
  const { index: paletteIndex, ...sample } = sampleTimelineCel(cel, at, true);
  let opacity = mulUn8(timeline.layers[index].opacity, cel.opacity);
  if (timeline.composeGroups === true)
    for (const ancestor of layerAncestors(timeline, index))
      opacity = mulUn8(opacity, ancestor.opacity);
  return {
    ...sample,
    ...(timeline.colorDepth === 8 && paletteIndex !== undefined ? { index: paletteIndex } : {}),
    color: [sample.color[0], sample.color[1], sample.color[2], mulUn8(sample.color[3], opacity)],
  };
}

function compositePaletteIndex(document: EditorDocument, at: Point): number | undefined {
  const timeline = document.timeline;
  if (timeline?.colorDepth !== 8) return undefined;
  const frame = timeline.frames[timeline.activeFrame];
  if (!frame) return undefined;
  const index = layerAtPoint(document, at.x, at.y);
  if (index === null) return undefined;
  const layer = timeline.layers[index];
  const cel = frame.cels[index];
  if (
    !cel ||
    (layer.blendMode ?? NORMAL_BLEND_MODE) !== NORMAL_BLEND_MODE ||
    layer.opacity !== UINT8_MAX ||
    cel.opacity !== UINT8_MAX ||
    (timeline.composeGroups === true &&
      layerAncestors(timeline, index).some(
        (ancestor) =>
          ancestor.opacity !== UINT8_MAX ||
          (ancestor.blendMode ?? NORMAL_BLEND_MODE) !== NORMAL_BLEND_MODE,
      ))
  )
    return undefined;
  const sample = sampleTimelineCel(cel, at, !!(layer.flags & LAYER_REFERENCE));
  return sample.color[3] === UINT8_MAX ? sample.index : undefined;
}

function bestFitIndex(
  color: Rgba,
  palette: readonly Rgba[],
  paletteIndex: number | undefined,
  maskIndex: number,
): number | undefined {
  if (paletteIndex !== undefined && palette[paletteIndex]) return paletteIndex;
  if (!palette.length) return undefined;
  if (color[3] === 0) return palette[maskIndex] ? maskIndex : undefined;
  const exact = palette.findIndex((entry) =>
    entry.every((value, channel) => value === color[channel]),
  );
  if (exact >= 0) return exact;
  return asepriteBestFit(...color, paletteForColors(palette), maskIndex);
}

export interface DrawingLinePreview {
  start: Point;
  end: Point;
  button: number;
  tool: EditorTool;
}

export interface DrawingRuntimePort {
  state: {
    getDocument(): EditorDocument | null;
    getSettings(): ToolSettings;
    getView(): ViewSettings;
    getPalette(): readonly Rgba[];
    isActiveLayerBackground(): boolean;
    getSheetPreview(): EditorDocument | null;
    getEffectPreview(): EditorDocument | null;
    getSelectionPreview(): PixelMask | null | undefined;
    getLinePreview(): DrawingLinePreview | null;
    getFloatingPaste(): FloatingPaste | null;
    getInlineText(): InlineTextDraft | null;
    getPointer(): Point | null;
    setPointer(point: Point | null): void;
    getLastDrawingPoint(): Point | null;
    setLastDrawingPoint(point: Point): HistoryCommand | undefined;
    setLinePreview(preview: DrawingLinePreview | null): void;
    setStatus(message: string): void;
    setAllocationError(error: EditorAllocationError | null): void;
    setSelectionPreview(preview: PixelMask | null | undefined): void;
    publish(pixelsChanged?: boolean): void;
  };
  edit: {
    isEditable(): boolean;
    beginHistoryTransaction(document: EditorDocument, label: string): void;
    captureHistory(
      image: PixelBuffer,
      rect: { x: number; y: number; width: number; height: number },
    ): void;
    commitHistory(
      document: EditorDocument,
      replacesSelection?: boolean,
      extraCommands?: readonly HistoryCommand[],
      manualTilemapPreview?: SpriteTimeline,
    ): void;
    cancelHistoryTransaction(document: EditorDocument): void;
    expandCel(extra?: { x: number; y: number; width: number; height: number }): void;
    prepareRasterForCommit(): void;
    beginCelMovement(useTimelineRange?: boolean, autoSelectLayer?: boolean): boolean;
    endCelMovement(): void;
    cancelCelMovement(): void;
    setLayerOffset(offset: Point): void;
  };
  selection: Pick<SelectionController, "beginTransform">;
  tilemap: {
    gestures: Pick<TilemapGestureController, "getSnapshot" | "hasPendingDocumentEdit">;
    isActiveLayerTilemap(): boolean;
    getManualPreviewBase(): SpriteTimeline | undefined;
    refreshManualPreview(gesture: DrawingGestureState): void;
    manualPreviewChanged(base: SpriteTimeline, preview: SpriteTimeline): boolean;
    getRasterContext(target: DrawingRasterPaintTarget): {
      active: boolean;
      tileSelectionMode: boolean;
      pixelMode: boolean;
      manualTileset: boolean;
      tileWidth?: number;
      tileHeight?: number;
    };
    createAsepriteIndexWriter(
      document: EditorDocument,
      preferredIndex?: number,
      matchMode?: AsepriteIndexMatchMode,
    ): AsepriteIndexWriter;
  };
  color: {
    createAsepriteIndexWriter(
      document: EditorDocument,
      preferredIndex?: number,
      matchMode?: AsepriteIndexMatchMode,
    ): AsepriteIndexWriter | undefined;
    createShadingWriter(
      document: EditorDocument,
      direction: "left" | "right",
      shade: readonly Rgba[] | undefined,
      shadeIndices: readonly number[] | undefined,
    ): AsepriteIndexWriter | undefined;
  };
  canvas: {
    snapInput(input: PointerInput): PointerInput;
    setView(patch: Partial<ViewSettings>): void;
    composite(): PixelBuffer;
  };
  timeline: {
    selectLayer(index: number): void;
  };
  text: Pick<BitmapTextController, "beginInlineText">;
  settings: Pick<
    DrawingSettingsController,
    "discardImageBrush" | "setSettings" | "setInputCornerRadius"
  >;
}

const floorPoint = (value: Point): Point => ({ x: Math.floor(value.x), y: Math.floor(value.y) });

/** Owns drawing gesture wiring, raster targets, and drawing-specific transient behavior. */
export class DrawingRuntimeController {
  readonly gestures: DrawingGestureController;
  readonly rasterizer: DrawingRasterizer;
  private eyedropperPointer: { document: EditorDocument; button: number } | null = null;
  // Reused only for symmetry passes sharing one freshly prepared paint target.
  private visibleLayersReferenceCache: {
    target: DrawingRasterPaintTarget;
    image: PixelBuffer;
  } | null = null;

  constructor(private readonly port: DrawingRuntimePort) {
    this.gestures = this.createGestureController();
    this.rasterizer = this.createRasterizer();
  }

  getRasterSettings(): DrawingRasterSettings {
    return this.rasterSettings();
  }

  getPaintTarget(): DrawingRasterPaintTarget | null {
    return this.paintTarget();
  }

  isEyedropperInput(input: PointerInput): boolean {
    const settings = this.port.state.getSettings();
    return (
      settings.tool === "eyedropper" ||
      (!input.actionModifiers &&
        !!input.alt &&
        (isShapeTool(settings.tool) ||
          [
            "pencil",
            "spray",
            "eraser",
            "bucket",
            "line",
            "rectangle",
            "contour",
            "blur",
            "jumble",
          ].includes(settings.tool)))
    );
  }

  eyedropperColorAt(at: Point, button = 0): Rgba | null {
    return this.eyedropperSampleAt(at, button)?.color ?? null;
  }

  private eyedropperSampleAt(at: Point, button = 0): EyedropperPixel | null {
    const document = this.port.state.getDocument();
    if (!document) return null;
    const settings = this.port.state.getSettings();
    const target = button === 2 ? "background" : "foreground";
    const timeline = document.timeline;
    const frame = timeline?.frames[timeline.activeFrame];
    if (timeline && !frame) return { color: [...TRANSPARENT_COLOR] };

    let sampled: EyedropperPixel;
    if (settings.eyedropperSample === EyedropperSample.ReferenceLayer) {
      sampled = firstReferencePixel(document, at);
    } else if (settings.eyedropperSample === EyedropperSample.CurrentLayer) {
      const local = { x: at.x - document.layer.x, y: at.y - document.layer.y };
      const activeLayer = timeline?.layers[timeline.activeLayer];
      const cel = timeline && frame ? frame.cels[timeline.activeLayer] : undefined;
      const sourceSample =
        timeline?.colorDepth === 8 && activeLayer && cel
          ? sampleTimelineCel(cel, at, !!(activeLayer.flags & LAYER_REFERENCE))
          : undefined;
      sampled = {
        color: samplePixel(document.layer.pixels, local),
        ...(sourceSample?.index === undefined ? {} : { index: sourceSample.index }),
      };
    } else {
      sampled = { color: samplePixel(this.port.canvas.composite(), at) };
    }

    if (settings.eyedropperChannel === EyedropperChannel.Index) {
      const currentTimeline = document.timeline;
      const currentFrame = currentTimeline?.frames[currentTimeline.activeFrame];
      const palette = currentFrame?.palette ?? document.palette ?? this.port.state.getPalette();
      const maskIndex =
        currentTimeline?.colorDepth === 8
          ? (currentTimeline.transparentIndex ?? TRANSPARENT_INDEX)
          : TRANSPARENT_INDEX;
      const index = bestFitIndex(
        sampled.color,
        palette,
        sampled.index ??
          (settings.eyedropperSample === EyedropperSample.AllLayers
            ? compositePaletteIndex(document, at)
            : undefined),
        maskIndex,
      );
      const indexedColor = index === undefined ? undefined : palette[index];
      return {
        color: applyEyedropperChannel(
          settings[target],
          indexedColor ?? sampled.color,
          settings.eyedropperChannel,
        ),
        ...(index === undefined ? {} : { index }),
      };
    }
    return {
      color: applyEyedropperChannel(settings[target], sampled.color, settings.eyedropperChannel),
    };
  }

  previewSelection(): PixelMask | null {
    const document = this.port.state.getDocument();
    const gesture = this.gestures.getGestureState();
    if (!document) return null;
    const override = this.port.state.getSelectionPreview();
    if (override !== undefined) return override;
    if (!gesture || !isSelectionTool(gesture.tool)) return document.selection;
    const incoming = this.rasterizer.incomingSelection(
      gesture,
      this.rasterSettings(),
      this.paintTarget(),
    );
    try {
      return combineSelection(
        gesture.selectionBase ?? null,
        incoming,
        gesture.selectionMode ?? SelectionMode.Replace,
        document.width,
        document.height,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return document.selection;
    }
  }

  previewInput(): EditorRenderInput | null {
    const document =
      this.port.state.getSheetPreview() ??
      this.port.state.getEffectPreview() ??
      this.port.state.getDocument();
    const gesture = this.gestures.getGestureState();
    if (!document) return null;
    const settings = this.rasterSettings();
    const target = this.paintTarget();
    if (!target) return { document };
    const inlineText = this.port.state.getInlineText();
    const overlay = inlineText
      ? { pixels: inlineText.pixels, x: inlineText.bounds.x, y: inlineText.bounds.y }
      : this.port.state.getFloatingPaste();
    if (overlay) return { document, overlay };

    const view = this.port.state.getView();
    const linePreview = this.port.state.getLinePreview();
    if (linePreview && this.port.state.getDocument()) {
      const source = this.port.state.getDocument()!;
      const image = selectionLayerReference(source.layer, source.width, source.height);
      const segment = new AsepriteLineFreehandController(linePreview.start).move(linePreview.end);
      const baseOptions: RasterOptions = {
        ...this.rasterizer.rasterOptionsForPreview(linePreview.button, settings, target)!,
        indexedPixelWriter: undefined,
        selection: source.selection ?? undefined,
        clip: { x: 0, y: 0, width: source.width, height: source.height },
        patternOrigin: { x: 0, y: 0 },
        tiled: view.tiledMode
          ? {
              mode: view.tiledMode,
              width: source.width,
              height: source.height,
              origin: { x: 0, y: 0 },
            }
          : undefined,
        beforeWrite: undefined,
        coverage: new Set(),
      };
      for (const stroke of this.rasterizer.symmetryStrokes(
        segment,
        linePreview.tool,
        settings,
        null,
        target,
      )) {
        const points = lineStrokePoints(stroke).slice(1);
        const options = { ...baseOptions, symmetryIndex: stroke[0]?.symmetry ?? 0 };
        if (linePreview.tool === "pencil") paintStroke(image, points, options);
        else if (linePreview.tool === "eraser") eraseStroke(image, points, options);
        else if (linePreview.tool === "blur") blurStroke(image, points, options);
      }
      return { document: { ...source, layer: { ...source.layer, pixels: image, x: 0, y: 0 } } };
    }

    if (
      gesture &&
      (isShapeTool(gesture.tool) || ["line", "rectangle", "contour"].includes(gesture.tool))
    ) {
      const image = selectionLayerReference(document.layer, document.width, document.height);
      const referenceImage =
        gesture.tool === "gradient" && settings.fillReference === FillReference.VisibleLayers
          ? this.port.canvas.composite()
          : undefined;
      const baseOptions: RasterOptions = {
        ...this.rasterizer.rasterOptionsForPreview(gesture.button, settings, target)!,
        referenceImage,
        selection: document.selection ?? undefined,
        clip: { x: 0, y: 0, width: document.width, height: document.height },
        patternOrigin: { x: 0, y: 0 },
        tiled: view.tiledMode
          ? {
              mode: view.tiledMode,
              width: document.width,
              height: document.height,
              origin: { x: 0, y: 0 },
            }
          : undefined,
        beforeWrite: undefined,
        indexedPixelWriter: undefined,
        coverage: new Set(),
      };
      for (const points of this.rasterizer.symmetryStrokes(
        gesture.fillPixelPerfect?.getPoints() ?? gesture.points,
        gesture.tool,
        settings,
        gesture,
        target,
      )) {
        const options = { ...baseOptions, symmetryIndex: points[0]?.symmetry ?? 0 };
        if (isShapeTool(gesture.tool))
          paintShape(image, points, gesture.tool, {
            ...options,
            shapeAngle: gesture.twoPoints?.angle,
            cornerRadius: gesture.twoPoints?.cornerRadius ?? settings.rectangleCornerRadius,
            gradientSeed: gesture.twoPoints?.gradientSeed,
            background: gesture.button === 2 ? settings.foreground : settings.background,
            gradientType: settings.gradientType,
            gradientDither: settings.gradientDither,
            tolerance: settings.tolerance,
            contiguous: settings.contiguous,
            preview: true,
          });
        else if (gesture.tool === "line")
          paintLine(image, points[0], points[points.length - 1], options);
        else paintStroke(image, [...points, points[0]], options);
      }
      return { document: { ...document, layer: { ...document.layer, pixels: image, x: 0, y: 0 } } };
    }
    return { document };
  }

  private rasterSettings(): DrawingRasterSettings {
    const settings = this.port.state.getSettings();
    const view = this.port.state.getView();
    return {
      tool: settings.tool,
      brush: settings.brush,
      foreground: settings.foreground,
      background: settings.background,
      foregroundIndex: settings.foregroundIndex,
      backgroundIndex: settings.backgroundIndex,
      ink: settings.ink,
      dynamics: settings.dynamics,
      shade: settings.shade,
      shadeIndices: settings.shadeIndices,
      opacity: settings.opacity,
      pixelPerfect: settings.pixelPerfect,
      symmetryEnabled: settings.symmetryEnabled,
      symmetryMode: view.symmetryMode,
      symmetryX: view.symmetryX,
      symmetryY: view.symmetryY,
      sprayWidth: settings.sprayWidth,
      spraySpeed: settings.spraySpeed,
      tolerance: settings.tolerance,
      contiguous: settings.contiguous,
      selectionCornerRadius: settings.selectionCornerRadius,
      rectangleCornerRadius: settings.rectangleCornerRadius,
      fillReference: settings.fillReference,
      gradientType: settings.gradientType,
      gradientDither: settings.gradientDither,
      text: settings.text,
      font: settings.font,
      textScale: settings.textScale,
      tiledMode: view.tiledMode,
      tilemapPixelMode: settings.tilemapMode === TilemapDisplayMode.Pixels,
      manualTilesetMode: settings.tilesetMode === TilesetMode.Manual,
    };
  }

  private paintTarget(): DrawingRasterPaintTarget | null {
    const document = this.port.state.getDocument();
    if (!document) return null;
    const timeline = document.timeline;
    return {
      image: document.layer.pixels,
      documentWidth: document.width,
      documentHeight: document.height,
      layerOffset: { x: document.layer.x, y: document.layer.y },
      selection: document.selection,
      colorDepth: timeline?.colorDepth,
      palette: document.palette ?? this.port.state.getPalette(),
      framePalette: timeline?.frames[timeline.activeFrame]?.palette,
      transparentIndex: timeline?.transparentIndex,
      backgroundLayer: this.port.state.isActiveLayerBackground(),
    };
  }

  private beginGestureTransaction(label: string): DrawingGestureTransaction | null {
    const document = this.port.state.getDocument();
    if (!document) return null;
    this.port.edit.beginHistoryTransaction(document, label);
    let active = true;
    return {
      capture: (image, rect) => {
        if (active && this.port.state.getDocument() === document)
          this.port.edit.captureHistory(image, rect);
      },
      commit: (options = {}) => {
        if (!active) return;
        active = false;
        if (this.port.state.getDocument() !== document) return;
        this.port.edit.commitHistory(
          document,
          options.replacesSelection ?? false,
          options.extraCommands ?? [],
          options.manualTilemapPreview,
        );
      },
      cancel: () => {
        if (!active) return;
        active = false;
        if (this.port.state.getDocument() === document)
          this.port.edit.cancelHistoryTransaction(document);
      },
    };
  }

  private createRasterizer(): DrawingRasterizer {
    return new DrawingRasterizer({
      target: {
        getPaintTarget: () => this.paintTarget(),
        getVisibleLayersReference: (target) => {
          if (this.visibleLayersReferenceCache?.target === target)
            return this.visibleLayersReferenceCache.image;
          const document = this.port.state.getDocument();
          if (!document) return null;
          const image = cropReferenceImage(compositeTimeline(document), target);
          this.visibleLayersReferenceCache = { target, image };
          return image;
        },
        preparePaintTarget: () => {
          if (!this.port.state.getDocument()) return null;
          this.port.edit.expandCel();
          return this.paintTarget();
        },
        reportAllocationFailure: (error) => {
          this.port.state.setAllocationError(error);
          this.port.state.setStatus(error.message);
        },
      },
      capture: {
        capture: (image, rect) => this.gestures.capturePixelWrite(image, rect),
      },
      asepriteIndexWriter: {
        create: (preferredIndex, matchMode) => {
          const document = this.port.state.getDocument();
          return document
            ? this.port.color.createAsepriteIndexWriter(document, preferredIndex, matchMode)
            : undefined;
        },
        createShading: (direction, shade, shadeIndices) => {
          const document = this.port.state.getDocument();
          return document
            ? this.port.color.createShadingWriter(document, direction, shade, shadeIndices)
            : undefined;
        },
      },
      tilemap: {
        getContext: (target) => this.port.tilemap.getRasterContext(target),
        createAsepriteIndexWriter: (preferredIndex, matchMode) => {
          const document = this.port.state.getDocument();
          if (!document) throw new Error("No active document for tilemap writing");
          return this.port.tilemap.createAsepriteIndexWriter(document, preferredIndex, matchMode);
        },
      },
    });
  }

  private createGestureController(): DrawingGestureController {
    return new DrawingGestureController({
      getSettings: () => {
        const settings = this.port.state.getSettings();
        return {
          tool: settings.tool,
          brush: settings.brush,
          pixelPerfect: settings.pixelPerfect,
          dynamics: settings.dynamics,
          selectionMode: settings.selectionMode,
          selectionMoveOnAddMode: settings.selectionMoveOnAddMode,
          selectionCornerRadius: settings.selectionCornerRadius,
          rectangleCornerRadius: settings.rectangleCornerRadius,
          fontHeight: settings.font?.height,
          textScale: settings.textScale,
          autoSelectLayer: settings.autoSelectLayer,
          eyedropperChannel: settings.eyedropperChannel,
          discardBrushOnEyedropper: settings.discardBrushOnEyedropper,
        };
      },
      getPaintTarget: () => this.paintGestureTarget(),
      handlePointerDownAction: (input, settings, target) =>
        this.handlePointerDownAction(input, settings, target),
      isSelectionTool,
      selectionModeForInput: (input, mode) => selectionModeForInput(mode, input),
      selectionContains: maskContains,
      beginSelectionTransform: (handle, at, copy) =>
        this.port.selection.beginTransform(handle, at, copy),
      beginTransaction: (label) => this.beginGestureTransaction(label),
      createAsepriteIndexWriter: (button) =>
        this.rasterizer.createAsepriteIndexWriter(button, this.rasterSettings()),
      getManualTilemapBase: () => this.port.tilemap.getManualPreviewBase(),
      getLastDrawingPoint: () => this.port.state.getLastDrawingPoint(),
      getPointer: () => this.port.state.getPointer(),
      preparePointerMove: (input) => this.port.canvas.snapInput(input),
      supportsPixelPerfect: () => supportsPixelPerfect(this.port.state.getSettings()),
      draw: (gesture, points, tool, button, tracePolicy) =>
        this.rasterizer.draw(gesture, points, tool, button, this.rasterSettings(), tracePolicy),
      applySelection: (gesture, clearClick) => this.applyGestureSelection(gesture, clearClick),
      beginCelMovement: (useTimelineRange, autoSelectLayer) =>
        this.port.edit.beginCelMovement(useTimelineRange, autoSelectLayer),
      endCelMovement: () => this.port.edit.endCelMovement(),
      cancelCelMovement: () => this.port.edit.cancelCelMovement(),
      setLayerOffset: (offset) => this.port.edit.setLayerOffset(offset),
      refreshManualTilemapPreview: (gesture) => this.port.tilemap.refreshManualPreview(gesture),
      manualTilemapPreviewChanged: (base, preview) =>
        this.port.tilemap.manualPreviewChanged(base, preview),
      isTilemapTarget: () => this.port.tilemap.isActiveLayerTilemap(),
      prepareRasterForCommit: () => this.port.edit.prepareRasterForCommit(),
      setLastDrawingPoint: (at) => this.port.state.setLastDrawingPoint(at),
      setLineFreehandPreview: (preview) => this.port.state.setLinePreview(preview),
      updateIdlePointer: (input) => this.updateIdlePointer(input),
      isPointerActionActive: () => this.eyedropperPointer !== null,
      clearPointerAction: () => {
        this.eyedropperPointer = null;
      },
      setPointer: (at) => this.port.state.setPointer(at),
      setStatus: (message) => this.port.state.setStatus(message),
      reportDrawFailure: (error) => {
        if (!(error instanceof EditorAllocationError)) throw error;
        this.port.state.setAllocationError(error);
        this.port.state.setStatus(error.message);
      },
      beginInlineText: (bounds) => this.port.text.beginInlineText(bounds),
      updateCornerRadius: (radius) => this.port.settings.setInputCornerRadius(radius),
      publish: (pixelsChanged) => this.port.state.publish(pixelsChanged),
    });
  }

  private paintGestureTarget(): DrawingPaintTarget | null {
    const document = this.port.state.getDocument();
    if (!document) return null;
    const timeline = document.timeline;
    const layerIndex = timeline?.activeLayer ?? 0;
    return {
      width: document.width,
      height: document.height,
      layerOffset: { x: document.layer.x, y: document.layer.y },
      selection: document.selection,
      editable: this.port.edit.isEditable(),
      movable: timeline
        ? canMoveTimelineLayer(timeline, layerIndex)
        : document.layer.visible && !document.layer.locked,
      positionLocked: !!(timeline && timeline.layers[layerIndex]?.flags & 4),
    };
  }

  private handlePointerDownAction(
    input: PointerInput,
    settings: DrawingGestureSettings,
    target: DrawingPaintTarget,
  ): boolean {
    const document = this.port.state.getDocument();
    if (!document) return true;
    const at = floorPoint(input);
    const button = input.button ?? 0;
    const mode = selectionModeForInput(settings.selectionMode ?? SelectionMode.Replace, input);
    if (
      isSelectionTool(settings.tool) &&
      settings.tool !== "magic_wand" &&
      button === 0 &&
      input.pointerType === "touch" &&
      target.selection &&
      (mode === SelectionMode.Replace || mode === SelectionMode.Intersect) &&
      !maskContains(target.selection, at)
    ) {
      this.port.edit.beginHistoryTransaction(document, "Deselect");
      document.selection = null;
      document.hiddenSelection = null;
      this.port.edit.commitHistory(document, true);
      this.port.state.setSelectionPreview(undefined);
      this.port.state.setStatus("Ready");
      this.port.state.publish();
      return true;
    }
    if (this.isEyedropperInput(input)) {
      this.eyedropperPointer = { document, button };
      this.pickEyedropperColor(at, button);
      return true;
    }
    if (settings.tool === "zoom") {
      this.port.canvas.setView({
        zoom: stepZoom(this.port.state.getView().zoom, button === 2 || input.alt ? -1 : 1),
      });
      return true;
    }
    if (
      settings.tool === "move" &&
      (settings.autoSelectLayer || !!input.actionModifiers?.autoSelectLayer)
    ) {
      const layer = layerAtPoint(document, at.x, at.y);
      if (
        layer !== null &&
        layer !== document.timeline?.activeLayer &&
        (!document.timeline ||
          !isLayerInCelMovementRange(
            document.timeline,
            layer,
            input.timelineRangeVisible !== false,
          ))
      )
        this.port.timeline.selectLayer(layer);
      return false;
    }
    return false;
  }

  private applyGestureSelection(gesture: DrawingGestureState, clearClick: boolean): string | null {
    const document = this.port.state.getDocument();
    if (!document) return "No active document";
    if (clearClick) {
      document.selection = null;
      document.hiddenSelection = null;
      return null;
    }
    const incoming = this.rasterizer.incomingSelection(
      gesture,
      this.rasterSettings(),
      this.paintTarget(),
    );
    try {
      document.selection = combineSelection(
        gesture.selectionBase ?? null,
        incoming,
        gesture.selectionMode ?? SelectionMode.Replace,
        document.width,
        document.height,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return error.message;
    }
    document.hiddenSelection = null;
    return null;
  }

  private pickEyedropperColor(at: Point, button: number): void {
    this.port.state.setPointer(at);
    this.port.state.setLinePreview(null);
    const sample = this.eyedropperSampleAt(at, button);
    if (!sample) return;
    const settings = this.port.state.getSettings();
    const patch: Partial<ToolSettings> = {
      [button === 2 ? "background" : "foreground"]: sample.color,
    };
    if (settings.discardBrushOnEyedropper) this.port.settings.discardImageBrush();
    if (settings.eyedropperChannel === EyedropperChannel.Index)
      patch[button === 2 ? "backgroundIndex" : "foregroundIndex"] = sample.index ?? null;
    this.port.settings.setSettings(patch);
  }

  private updateIdlePointer(input: PointerInput): void {
    const at = floorPoint(input);
    this.port.state.setPointer(at);
    const eyedropper = this.eyedropperPointer;
    if (eyedropper) {
      if (eyedropper.document === this.port.state.getDocument()) {
        this.port.state.setLinePreview(null);
        this.pickEyedropperColor(at, eyedropper.button);
        return;
      }
      this.eyedropperPointer = null;
    }
    const tool = this.port.state.getSettings().tool;
    const capabilities = getXpriteToolCapabilities(tool);
    const lastPoint = this.port.state.getLastDrawingPoint();
    if (
      this.port.state.getSettings().straightLinePreview !== false &&
      (input.actionModifiers?.straightLineFromLastPoint ?? input.shift) &&
      lastPoint &&
      capabilities.behavior.connectFreehandStroke
    ) {
      const controller = new AsepriteLineFreehandController(lastPoint);
      controller.move(
        at,
        input.actionModifiers?.angleSnapFromLastPoint ?? input.physicalCtrl ?? input.ctrl,
      );
      this.port.state.setLinePreview({
        start: controller.getStartPoint(),
        end: controller.getLastPoint(),
        button: 0,
        tool,
      });
    } else this.port.state.setLinePreview(null);
    this.port.state.publish();
  }
}
