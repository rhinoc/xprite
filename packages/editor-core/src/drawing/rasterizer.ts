import { EditorAllocationError } from "$/base/errors";
import { UINT8_MAX } from "$/base/numeric-constants";
import type {
  BitmapFont,
  Brush,
  PixelBuffer,
  PixelMask,
  Point,
  Rect,
  Rgba,
} from "$/base/primitives";
import { generateSymmetryStrokes, type SymmetryIndex } from "$/canvas/assistance/symmetry";
import {
  blurStroke,
  brushMask,
  eraseStroke,
  fillPolygon,
  floodFill,
  jumbleStroke,
  JumbleStrokeScratch,
  lineStrokePoints,
  paintLine,
  paintStroke,
  polygonMask,
  ReplaceColorMode,
  replaceColorStroke,
  SprayStrokeScratch,
  sprayStroke,
} from "$/canvas/raster";
import { DynamicPaintStroke, usesDynamicBrush } from "$/canvas/raster/dynamic-paint-stroke";
import { PixelPerfectPath, PixelPerfectTracePolicy } from "$/canvas/raster/pixel-perfect";
import {
  supportsPixelPerfect,
  PixelPerfectStroke,
  type PixelPerfectReplica,
} from "$/canvas/raster/pixel-perfect-stroke";
import { StrokeDynamics } from "$/canvas/raster/stroke-dynamics";
import type { RasterOptions } from "$/canvas/raster/types";
import { indexedPaletteColorIndex } from "$/color/samples";
import type { AsepriteIndexWriter } from "$/color/types";
import { getXpriteToolCapabilities } from "$/drawing/capabilities";
import { isShapeTool, paintShape } from "$/drawing/shapes";
import { roundedRectanglePixels } from "$/drawing/shapes/rounded-rectangle";
import { paintText } from "$/drawing/text/text";
import {
  FillReference,
  AsepriteDynamicSensor,
  AsepriteInk,
  type AsepriteDynamicsSettings,
  type ToolSettings,
} from "$/drawing/tool-settings";
import { GradientDither, GradientType } from "$/drawing/types";
import {
  combineSelection,
  ellipseSelection,
  isSelectionTool,
  magicWandSelection,
  rectangleSelection,
  compactSelection,
  selectionLayerReference,
} from "$/selection/operations";
import { SelectionMode } from "$/selection/types";

export type DrawingRasterTool = ToolSettings["tool"];
export type AsepriteIndexMatchMode = "bestfit" | "octree";
export interface DrawingSymmetryPoint extends Point {
  symmetry: SymmetryIndex;
  size?: number;
}

/** Only the settings read by raster painting; never pass the complete editor settings object. */
export interface DrawingRasterSettings {
  tool: DrawingRasterTool;
  brush: Brush;
  foreground: Rgba;
  background: Rgba;
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  ink?: AsepriteInk;
  dynamics?: AsepriteDynamicsSettings;
  shade?: readonly Rgba[];
  shadeIndices?: readonly number[];
  opacity: number;
  pixelPerfect: boolean;
  symmetryEnabled?: boolean;
  symmetryMode?: number;
  symmetryX?: number;
  symmetryY?: number;
  sprayWidth: number;
  spraySpeed: number;
  tolerance: number;
  contiguous: boolean;
  selectionCornerRadius?: number;
  rectangleCornerRadius?: number;
  fillReference?: FillReference;
  gradientType?: GradientType;
  gradientDither?: GradientDither;
  text: string;
  font: BitmapFont | null;
  textScale: number;
  tiledMode?: 0 | 1 | 2 | 3;
  /** Tilemap options are projected to booleans by the tilemap/editor boundary. */
  tilemapPixelMode?: boolean;
  manualTilesetMode?: boolean;
}

/** Current mutable raster plus the small document-space projection painting needs. */
export interface DrawingRasterPaintTarget {
  image: PixelBuffer;
  documentWidth: number;
  documentHeight: number;
  layerOffset: Point;
  selection: PixelMask | null;
  colorDepth?: number;
  palette?: readonly Rgba[];
  framePalette?: readonly Rgba[];
  transparentIndex?: number;
  backgroundLayer: boolean;
}

/** Bound to the current editor internally; no document/editor object crosses this port. */
export interface DrawingRasterTargetPort {
  getPaintTarget(): DrawingRasterPaintTarget | null;
  /** Visible-layer pixels in the paint target's local coordinates. */
  getVisibleLayersReference?(target: DrawingRasterPaintTarget): PixelBuffer | null;
  /** Expand/prepare the writable cel and return the fresh target projection. */
  preparePaintTarget(): DrawingRasterPaintTarget | null;
  reportAllocationFailure(error: EditorAllocationError): void;
}

export interface DrawingRasterCapturePort {
  capture(image: PixelBuffer, rect: Rect): void;
}

export interface DrawingAsepriteIndexWriterPort {
  create(
    preferredIndex?: number,
    matchMode?: AsepriteIndexMatchMode,
  ): AsepriteIndexWriter | undefined;
  createShading(
    direction: "left" | "right",
    shade: readonly Rgba[] | undefined,
    shadeIndices: readonly number[] | undefined,
  ): AsepriteIndexWriter | undefined;
}

export interface DrawingTilemapRasterContext {
  active: boolean;
  tileSelectionMode: boolean;
  pixelMode: boolean;
  manualTileset: boolean;
  tileWidth?: number;
  tileHeight?: number;
}

/** Tilemap-specific index storage and tile-space selection stay behind this adapter. */
export interface DrawingTilemapRasterPort {
  getContext(target: DrawingRasterPaintTarget): DrawingTilemapRasterContext;
  createAsepriteIndexWriter(
    preferredIndex?: number,
    matchMode?: AsepriteIndexMatchMode,
  ): AsepriteIndexWriter;
}

export interface DrawingRasterPorts {
  target: DrawingRasterTargetPort;
  capture: DrawingRasterCapturePort;
  asepriteIndexWriter: DrawingAsepriteIndexWriterPort;
  tilemap?: DrawingTilemapRasterPort;
}

/** Mutable per-pointer state consumed by the painter; the gesture owner can satisfy it structurally. */
export interface DrawingRasterGestureState {
  pressure: number;
  previousPressure: number;
  speed: Point;
  sprayRemainder: number;
  sprayBrushPatternOrigin?: Point;
  previousBrush?: Brush;
  previousGradient?: number;
  brushPatternOrigin?: Point;
  dynamics: StrokeDynamics | null;
  dynamicPaint?: DynamicPaintStroke;
  dynamicBranches?: Map<number, DynamicPaintStroke>;
  indexedPixelWriter?: unknown;
  points: Point[];
  tool: DrawingRasterTool;
  wrotePixels?: boolean;
  coverage: Set<number>;
  pixelPerfect: PixelPerfectStroke | null;
  fillPixelPerfect: PixelPerfectPath | null;
  twoPoints?: { angle: number; gradientSeed?: Point; cornerRadius?: number };
}

export interface DrawingRasterIncomingSelectionState {
  points: Point[];
  tool: DrawingRasterTool;
  fillPixelPerfect?: PixelPerfectPath | null;
  dynamics?: StrokeDynamics | null;
  previousBrush?: Brush;
  twoPoints?: { angle: number; cornerRadius?: number };
}

function roundedMarquee(
  start: Point,
  end: Point,
  width: number,
  height: number,
  radius: number,
  angle = 0,
): PixelMask | null {
  if (!radius && Math.abs(angle) < 0.001) return rectangleSelection(start, end, width, height);
  const data = new Uint8Array(width * height);
  roundedRectanglePixels(start, end, radius, true, angle, (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) data[y * width + x] = 1;
  });
  return compactSelection({ x: 0, y: 0, width, height, data });
}

const cloneColor = (color: Rgba): Rgba => [color[0], color[1], color[2], color[3]];

function findPaletteIndex(
  color: Rgba,
  palette: readonly Rgba[],
  preferred?: number,
): number | undefined {
  return palette.length ? indexedPaletteColorIndex(color, palette, preferred) : undefined;
}

function workingBrushColor(
  color: Rgba,
  target: DrawingRasterPaintTarget,
  preferredIndex?: number,
  ink?: AsepriteInk,
): Rgba {
  const palette = target.framePalette ?? target.palette;
  if (target.colorDepth === 16) {
    const selected =
      preferredIndex !== undefined && palette?.[preferredIndex] ? palette[preferredIndex] : color;
    const value = Math.trunc(
      (Math.max(selected[0], selected[1], selected[2]) +
        Math.min(selected[0], selected[1], selected[2])) /
        2,
    );
    return [value, value, value, selected[3]];
  }
  if (target.colorDepth === 8 && palette?.length) {
    const index = findPaletteIndex(color, palette, preferredIndex)!;
    if (
      index === (target.transparentIndex ?? 0) &&
      !target.backgroundLayer &&
      ink !== AsepriteInk.LockAlpha
    )
      return [0, 0, 0, 0];
    return palette[index];
  }
  return color;
}

const dynamicBrushActive = (gesture: DrawingRasterGestureState): boolean =>
  !!gesture.dynamics && usesDynamicBrush(gesture.dynamics.settings);

/** Owns raster option projection, symmetry, indexed-pixel policy, and drawing algorithms. */
export class DrawingRasterizer {
  private readonly sprayScratch = new SprayStrokeScratch();
  private readonly jumbleScratch = new JumbleStrokeScratch();

  constructor(private readonly ports: DrawingRasterPorts) {}

  getPaintTarget(): DrawingRasterPaintTarget | null {
    return this.ports.target.getPaintTarget();
  }

  rasterOptionsForPreview(
    button: number,
    settings: DrawingRasterSettings,
    target = this.ports.target.getPaintTarget(),
  ): RasterOptions | null {
    return target ? this.rasterOptions(button, settings, null, target) : null;
  }

  createAsepriteIndexWriter(
    button: number,
    settings: DrawingRasterSettings,
  ): AsepriteIndexWriter | undefined {
    const target = this.ports.target.getPaintTarget();
    if (!target) return undefined;
    const tilemap = this.ports.tilemap?.getContext(target);
    if (tilemap?.active) {
      if (
        target.colorDepth !== 8 ||
        !tilemap.pixelMode ||
        !tilemap.manualTileset ||
        !settings.pixelPerfect ||
        !supportsPixelPerfect({ tool: settings.tool })
      )
        return undefined;
      const ink = settings.ink ?? AsepriteInk.AlphaCompositing;
      if (!getXpriteToolCapabilities(settings.tool).settings.hasInk)
        return this.ports.tilemap!.createAsepriteIndexWriter();
      const color = button === 2 ? settings.background : settings.foreground;
      const index = findPaletteIndex(
        color,
        target.framePalette ?? target.palette ?? [],
        button === 2
          ? (settings.backgroundIndex ?? undefined)
          : (settings.foregroundIndex ?? undefined),
      );
      const preferred =
        ink === AsepriteInk.AlphaCompositing &&
        index === target.transparentIndex &&
        !target.backgroundLayer
          ? undefined
          : this.hasDirectIndex(settings, ink, index, target)
            ? index
            : undefined;
      return this.ports.tilemap!.createAsepriteIndexWriter(
        preferred,
        ink === AsepriteInk.LockAlpha ? "bestfit" : "octree",
      );
    }

    if (target.colorDepth !== 8) return undefined;
    const ink = settings.ink ?? AsepriteInk.AlphaCompositing;
    if (!getXpriteToolCapabilities(settings.tool).settings.hasInk)
      return this.ports.asepriteIndexWriter.create();
    if (ink === AsepriteInk.Shading)
      return this.ports.asepriteIndexWriter.createShading(
        button === 2 ? "right" : "left",
        settings.shade,
        settings.shadeIndices,
      );
    const color = button === 2 ? settings.background : settings.foreground;
    const index = findPaletteIndex(
      color,
      target.framePalette ?? target.palette ?? [],
      button === 2
        ? (settings.backgroundIndex ?? undefined)
        : (settings.foregroundIndex ?? undefined),
    );
    if (
      ink === AsepriteInk.AlphaCompositing &&
      index === target.transparentIndex &&
      !target.backgroundLayer
    )
      return undefined;
    return this.ports.asepriteIndexWriter.create(
      this.hasDirectIndex(settings, ink, index, target) ? index : undefined,
      ink === AsepriteInk.LockAlpha ? "bestfit" : "octree",
    );
  }

  private hasDirectIndex(
    settings: DrawingRasterSettings,
    ink: AsepriteInk,
    index: number | undefined,
    target: DrawingRasterPaintTarget,
  ): boolean {
    const palette = target.framePalette ?? target.palette;
    return (
      (settings.dynamics?.gradient ?? AsepriteDynamicSensor.Static) ===
        AsepriteDynamicSensor.Static &&
      (ink === AsepriteInk.Simple ||
        ink === AsepriteInk.CopyColor ||
        (ink === AsepriteInk.AlphaCompositing &&
          settings.opacity === UINT8_MAX &&
          index !== undefined &&
          palette?.[index]?.[3] === UINT8_MAX))
    );
  }

  private fillReferenceImage(
    settings: DrawingRasterSettings,
    target: DrawingRasterPaintTarget,
  ): PixelBuffer | undefined {
    return settings.fillReference === FillReference.VisibleLayers
      ? (this.ports.target.getVisibleLayersReference?.(target) ?? undefined)
      : undefined;
  }

  local(point: Point, target = this.ports.target.getPaintTarget()): Point {
    return target
      ? { x: point.x - target.layerOffset.x, y: point.y - target.layerOffset.y }
      : { ...point };
  }

  symmetryStrokes(
    points: readonly Point[],
    tool: DrawingRasterTool,
    settings: DrawingRasterSettings,
    gesture: Pick<DrawingRasterGestureState, "dynamics" | "previousBrush"> | null = null,
    target = this.ports.target.getPaintTarget(),
  ): DrawingSymmetryPoint[][] {
    if (!target) return [];
    const brush = gesture?.dynamics?.brush(settings.brush) ?? settings.brush;
    const onePoint = isSelectionTool(tool) || tool === "bucket";
    const mask = brushMask(brush);
    return generateSymmetryStrokes(
      points.map((point, index) => ({
        ...point,
        symmetry: 0 as SymmetryIndex,
        size: index === 0 ? (gesture?.previousBrush?.size ?? brush.size) : brush.size,
      })),
      {
        enabled: !!settings.symmetryEnabled,
        mode: settings.symmetryMode ?? 0,
        x: settings.symmetryX ?? target.documentWidth / 2,
        y: settings.symmetryY ?? target.documentHeight / 2,
      },
      {
        width: mask.width,
        height: mask.height,
        center: { x: -mask.x, y: -mask.y },
        floodFill: onePoint,
        dynamic: !onePoint && !!gesture?.dynamics && usesDynamicBrush(gesture.dynamics.settings),
      },
    );
  }

  private rasterOptions(
    button: number,
    settings: DrawingRasterSettings,
    gesture: DrawingRasterGestureState | null,
    target: DrawingRasterPaintTarget,
  ): RasterOptions {
    const selectedColor = button === 2 ? settings.background : settings.foreground;
    const selectedIndex = button === 2 ? settings.backgroundIndex : settings.foregroundIndex;
    const color = workingBrushColor(
      selectedColor,
      target,
      selectedIndex ?? undefined,
      settings.ink,
    );
    const backgroundColor = workingBrushColor(
      settings.background,
      target,
      settings.backgroundIndex ?? undefined,
      settings.ink,
    );
    const baseBrush = gesture?.dynamics?.brush(settings.brush) ?? settings.brush;
    const brush =
      button === 2 && baseBrush.shape === "image" && baseBrush.image
        ? {
            ...baseBrush,
            image: {
              ...baseBrush.image,
              imageColors: {
                ...baseBrush.image.imageColors,
                main: cloneColor(settings.background),
                background: cloneColor(settings.background),
                ...(settings.backgroundIndex !== null && settings.backgroundIndex !== undefined
                  ? {
                      mainIndex: settings.backgroundIndex,
                      backgroundIndex: settings.backgroundIndex,
                    }
                  : {}),
              },
            },
          }
        : baseBrush;
    return {
      color: target.backgroundLayer ? [color[0], color[1], color[2], UINT8_MAX] : color,
      ...(target.backgroundLayer
        ? {
            eraseColor: [
              backgroundColor[0],
              backgroundColor[1],
              backgroundColor[2],
              UINT8_MAX,
            ] as Rgba,
          }
        : {}),
      ink:
        target.colorDepth === 8 &&
        baseBrush.shape !== "image" &&
        settings.ink === AsepriteInk.Simple &&
        (settings.dynamics?.gradient ?? AsepriteDynamicSensor.Static) ===
          AsepriteDynamicSensor.Static
          ? AsepriteInk.CopyColor
          : settings.ink,
      indexedPixelWriter: gesture?.indexedPixelWriter as AsepriteIndexWriter | undefined,
      shade: settings.shade,
      shadeDirection: button === 2 ? "right" : "left",
      jumbleOffset: {
        x: Math.trunc((gesture?.speed.x ?? 0) / 4),
        y: Math.trunc((gesture?.speed.y ?? 0) / 4),
      },
      patternOrigin: { ...target.layerOffset },
      brushPatternOrigin: gesture?.brushPatternOrigin,
      destinationPalette: target.framePalette ?? target.palette,
      destinationTransparentIndex:
        target.colorDepth === 8
          ? target.backgroundLayer
            ? -1
            : (target.transparentIndex ?? 0)
          : 0,
      tiled: settings.tiledMode
        ? {
            mode: settings.tiledMode,
            width: target.documentWidth,
            height: target.documentHeight,
            origin: { ...target.layerOffset },
          }
        : undefined,
      brush,
      opacity: settings.opacity,
      clip: {
        x: -target.layerOffset.x,
        y: -target.layerOffset.y,
        width: target.documentWidth,
        height: target.documentHeight,
      },
      selection: target.selection
        ? {
            ...target.selection,
            x: target.selection.x - target.layerOffset.x,
            y: target.selection.y - target.layerOffset.y,
          }
        : undefined,
      beforeWrite: (rect) => {
        if (gesture) gesture.wrotePixels = true;
        this.ports.capture.capture(target.image, rect);
      },
      coverage:
        gesture && (gesture.tool === "pencil" || gesture.tool === "eraser")
          ? gesture.coverage
          : undefined,
    };
  }

  pixelPerfectReplicas(
    point: Point,
    tool: DrawingRasterTool,
    button: number,
    brush: Brush,
    settings: DrawingRasterSettings,
    gesture: DrawingRasterGestureState | null,
    target = this.ports.target.getPaintTarget(),
  ): PixelPerfectReplica[] {
    if (!target) return [];
    const mask = brushMask(brush);
    const global = {
      x: point.x + target.layerOffset.x,
      y: point.y + target.layerOffset.y,
      size: brush.size,
      symmetry: 0 as SymmetryIndex,
    };
    return generateSymmetryStrokes(
      [global],
      {
        enabled: !!settings.symmetryEnabled,
        mode: settings.symmetryMode ?? 0,
        x: settings.symmetryX ?? target.documentWidth / 2,
        y: settings.symmetryY ?? target.documentHeight / 2,
      },
      {
        width: mask.width,
        height: mask.height,
        center: { x: -mask.x, y: -mask.y },
        floodFill: isSelectionTool(tool) || tool === "bucket",
        dynamic:
          !(isSelectionTool(tool) || tool === "bucket") &&
          !!gesture?.dynamics &&
          usesDynamicBrush(gesture.dynamics.settings),
      },
    ).map(([replica]) => {
      const index = replica?.symmetry ?? 0;
      return {
        key: index,
        point: this.local(replica, target),
        options: {
          ...this.rasterOptions(button, settings, gesture, target),
          brush,
          symmetryIndex: index,
        },
      };
    });
  }

  incomingSelection(
    gesture: DrawingRasterIncomingSelectionState,
    settings: DrawingRasterSettings,
    target = this.ports.target.getPaintTarget(),
  ): PixelMask | null {
    if (!target) return null;
    let incoming: PixelMask | null = null;
    const gestureProjection = {
      dynamics: gesture.dynamics ?? null,
      previousBrush: gesture.previousBrush,
    };
    for (const points of this.symmetryStrokes(
      gesture.fillPixelPerfect?.getPoints() ?? gesture.points,
      gesture.tool,
      settings,
      gestureProjection,
      target,
    )) {
      const start = points[0];
      const end = points[points.length - 1];
      if (!start || !end) continue;
      const mask =
        gesture.tool === "marquee"
          ? roundedMarquee(
              start,
              end,
              target.documentWidth,
              target.documentHeight,
              gesture.twoPoints?.cornerRadius ?? settings.selectionCornerRadius ?? 0,
              gesture.twoPoints?.angle,
            )
          : gesture.tool === "elliptical_marquee"
            ? ellipseSelection(start, end, target.documentWidth, target.documentHeight)
            : gesture.tool === "magic_wand"
              ? magicWandSelection(
                  selectionLayerReference(
                    { pixels: target.image, x: target.layerOffset.x, y: target.layerOffset.y },
                    target.documentWidth,
                    target.documentHeight,
                  ),
                  start,
                  settings.tolerance,
                  settings.contiguous,
                )
              : polygonMask(points, target.documentWidth, target.documentHeight);
      incoming = combineSelection(
        incoming,
        mask,
        SelectionMode.Add,
        target.documentWidth,
        target.documentHeight,
      );
    }
    const tilemap = this.ports.tilemap?.getContext(target);
    if (incoming && tilemap?.active && tilemap.tileSelectionMode && gesture.tool === "marquee") {
      const start = gesture.points[0];
      const end = gesture.points[gesture.points.length - 1];
      if (start && end && tilemap.tileWidth && tilemap.tileHeight)
        return roundedMarquee(
          { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) },
          {
            x: Math.max(start.x, end.x) + tilemap.tileWidth - 1,
            y: Math.max(start.y, end.y) + tilemap.tileHeight - 1,
          },
          target.documentWidth,
          target.documentHeight,
          gesture.twoPoints?.cornerRadius ?? settings.selectionCornerRadius ?? 0,
        );
    }
    return incoming;
  }

  draw(
    gesture: DrawingRasterGestureState,
    points: Point[],
    tool: DrawingRasterTool,
    button: number,
    settings: DrawingRasterSettings,
    tracePolicy: PixelPerfectTracePolicy = PixelPerfectTracePolicy.Accumulate,
  ): boolean {
    let target: DrawingRasterPaintTarget | null;
    try {
      target = this.ports.target.preparePaintTarget();
    } catch (error) {
      if (!(error instanceof EditorAllocationError)) throw error;
      this.ports.target.reportAllocationFailure(error);
      return false;
    }
    if (!target) return false;
    const pressureTool = tool === "spray" || tool === "jumble";
    const strokes = this.symmetryStrokes(points, tool, settings, gesture, target).map((stroke) =>
      stroke.map((point, index) => ({
        ...point,
        symmetry: point.symmetry,
        pressure: pressureTool
          ? points.length === 1
            ? gesture.pressure
            : index === 0
              ? gesture.previousPressure
              : gesture.pressure
          : undefined,
      })),
    );

    if (tool === "jumble") {
      jumbleStroke(
        target.image,
        strokes.map((stroke) => ({
          points: stroke.map((point) => ({
            ...this.local(point, target),
            pressure: point.pressure,
          })),
          options: {
            ...this.rasterOptions(button, settings, gesture, target),
            symmetryIndex: stroke[0]?.symmetry ?? 0,
          },
        })),
        this.jumbleScratch,
      );
      return true;
    }
    if (tool === "spray") {
      const result = sprayStroke(
        target.image,
        strokes.map((stroke) => ({
          points: stroke.map((point) => ({
            ...this.local(point, target),
            pressure: point.pressure,
          })),
          options: {
            ...this.rasterOptions(button, settings, gesture, target),
            symmetryIndex: stroke[0]?.symmetry ?? 0,
          },
        })),
        this.sprayScratch,
        settings.sprayWidth,
        settings.spraySpeed,
        gesture.sprayRemainder,
        gesture.sprayBrushPatternOrigin,
      );
      gesture.sprayRemainder = result.remainder;
      gesture.sprayBrushPatternOrigin = result.brushPatternOrigin;
      return true;
    }

    const wantsPixelPerfect =
      (tool === "pencil" || tool === "eraser" || tool === "blur") &&
      settings.pixelPerfect &&
      supportsPixelPerfect({ tool });
    const hasDynamics = dynamicBrushActive(gesture);
    const dynamicPixelPerfectSupported = ["circle", "square", "image", "line"].includes(
      settings.brush.shape,
    );
    if (wantsPixelPerfect && hasDynamics && dynamicPixelPerfectSupported && gesture.dynamics) {
      const stroke =
        strokes[0] ?? points.map((point) => ({ ...point, symmetry: 0 as SymmetryIndex }));
      const pointsLocal = stroke.map((point) => this.local(point, target));
      const options = {
        ...this.rasterOptions(button, settings, gesture, target),
        symmetryIndex: 0 as SymmetryIndex,
      };
      const secondary = workingBrushColor(
        button === 2 ? settings.foreground : settings.background,
        target,
      );
      const painter = (gesture.dynamicPaint ??= new DynamicPaintStroke());
      const mapReplicas = (point: Point, brush: Brush) =>
        this.pixelPerfectReplicas(point, tool, button, brush, settings, gesture, target);
      painter.paint(
        target.image,
        pointsLocal,
        options,
        gesture.dynamics,
        secondary,
        tool,
        settings.brush,
        true,
        tracePolicy,
        mapReplicas,
      );
      gesture.previousBrush = options.brush;
      gesture.previousGradient = gesture.dynamics.gradient();
      return true;
    }

    if (gesture.pixelPerfect && !hasDynamics) {
      const stroke =
        strokes[0] ?? points.map((point) => ({ ...point, symmetry: 0 as SymmetryIndex }));
      const pointsLocal = stroke.map((point) => this.local(point, target));
      const options = {
        ...this.rasterOptions(button, settings, gesture, target),
        symmetryIndex: 0 as SymmetryIndex,
      };
      const mapReplicas = (point: Point, brush: Brush) =>
        this.pixelPerfectReplicas(point, tool, button, brush, settings, gesture, target);
      gesture.pixelPerfect.paint(
        target.image,
        pointsLocal,
        options,
        tracePolicy,
        true,
        mapReplicas,
      );
      return true;
    }

    for (const stroke of strokes) {
      const symmetryIndex = stroke[0]?.symmetry ?? 0;
      const pointsLocal = stroke.map((point) => this.local(point, target));
      const options = { ...this.rasterOptions(button, settings, gesture, target), symmetryIndex };
      const rasterPoints =
        tracePolicy === PixelPerfectTracePolicy.Last && pointsLocal.length > 1
          ? lineStrokePoints(pointsLocal).slice(1)
          : pointsLocal;
      const secondary = workingBrushColor(
        button === 2 ? settings.foreground : settings.background,
        target,
      );
      if (
        (tool === "pencil" || tool === "eraser" || tool === "blur") &&
        gesture.dynamics &&
        usesDynamicBrush(gesture.dynamics.settings)
      ) {
        const root = (gesture.dynamicPaint ??= new DynamicPaintStroke());
        const branches = (gesture.dynamicBranches ??= new Map());
        let painter = branches.get(symmetryIndex);
        if (!painter) {
          painter = symmetryIndex === 0 ? root : root.fork();
          branches.set(symmetryIndex, painter);
        }
        painter.paint(
          target.image,
          pointsLocal,
          options,
          gesture.dynamics,
          secondary,
          tool,
          settings.brush,
          settings.pixelPerfect && supportsPixelPerfect({ tool }),
          tracePolicy,
        );
        gesture.previousBrush = options.brush;
        gesture.previousGradient = gesture.dynamics.gradient();
      } else if (tool === "pencil") paintStroke(target.image, rasterPoints, options);
      else if (tool === "eraser") {
        if (button === 2) {
          const palette = target.framePalette ?? target.palette ?? [];
          const foregroundIndex =
            target.colorDepth === 8
              ? findPaletteIndex(
                  settings.foreground,
                  palette,
                  settings.foregroundIndex ?? undefined,
                )
              : (settings.foregroundIndex ?? findPaletteIndex(settings.foreground, palette));
          const backgroundIndex =
            target.colorDepth === 8
              ? findPaletteIndex(
                  settings.background,
                  palette,
                  settings.backgroundIndex ?? undefined,
                )
              : (settings.backgroundIndex ?? findPaletteIndex(settings.background, palette));
          let foreground = workingBrushColor(
            settings.foreground,
            target,
            foregroundIndex,
            settings.ink,
          );
          let background = workingBrushColor(
            settings.background,
            target,
            backgroundIndex,
            settings.ink,
          );
          if (target.backgroundLayer) {
            foreground = [foreground[0], foreground[1], foreground[2], UINT8_MAX];
            background = [background[0], background[1], background[2], UINT8_MAX];
          }
          replaceColorStroke(
            target.image,
            rasterPoints,
            options,
            foreground,
            background,
            target.colorDepth === 8
              ? ReplaceColorMode.Indexed
              : target.colorDepth === 16
                ? ReplaceColorMode.Gray
                : ReplaceColorMode.Rgba,
            foregroundIndex ?? undefined,
            backgroundIndex ?? undefined,
          );
        } else eraseStroke(target.image, rasterPoints, options);
      } else if (tool === "blur") blurStroke(target.image, rasterPoints, options);
      else if (tool === "line")
        paintLine(target.image, pointsLocal[0], pointsLocal[pointsLocal.length - 1], options);
      else if (tool === "rectangle")
        paintShape(target.image, pointsLocal, "rectangle", {
          ...options,
          background: secondary,
          shapeAngle: gesture.twoPoints?.angle,
          cornerRadius: gesture.twoPoints?.cornerRadius ?? settings.rectangleCornerRadius,
        });
      else if (tool === "contour") fillPolygon(target.image, pointsLocal, options);
      else if (isShapeTool(tool))
        paintShape(target.image, pointsLocal, tool, {
          ...options,
          shapeAngle: gesture.twoPoints?.angle,
          cornerRadius: gesture.twoPoints?.cornerRadius ?? settings.rectangleCornerRadius,
          gradientSeed: gesture.twoPoints?.gradientSeed
            ? this.local(gesture.twoPoints.gradientSeed, target)
            : undefined,
          background: secondary,
          gradientType: settings.gradientType,
          gradientDither: settings.gradientDither,
          tolerance: settings.tolerance,
          contiguous: settings.contiguous,
          referenceImage:
            tool === "gradient" ? this.fillReferenceImage(settings, target) : undefined,
        });
      else if (tool === "bucket")
        floodFill(target.image, pointsLocal[0], {
          ...options,
          tolerance: settings.tolerance,
          contiguous: settings.contiguous,
          referenceImage: this.fillReferenceImage(settings, target),
        });
      else if (tool === "text" && settings.font)
        paintText(
          target.image,
          pointsLocal[0],
          settings.text,
          settings.font,
          settings.textScale,
          options,
        );
    }
    return true;
  }
}
