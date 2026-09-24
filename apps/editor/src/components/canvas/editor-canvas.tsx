import { useInsertionEffect, useLayoutEffect, useRef, useState } from "react";

import {
  presentationToCanvasLogical,
  presentationDeltaToCanvasLogical,
} from "$/components/canvas/create-canvas-command-context";
import { EditorInlineTextEditor } from "$/components/canvas/inline-text-editor";
import {
  SlicePropertiesDialog,
  MultiSlicePropertiesDialog,
} from "$/components/dialogs/slice-properties-dialog";
import { tUi } from "$/i18n";
import { cursorPreviewGeometry, cursorPreviewRaster } from "$/managers/canvas/canvas-manager";
import {
  CanvasPointerController,
  CanvasToolId,
  CanvasZoomGesture,
  type CanvasQuickTool,
  type CanvasShortcutDrag,
  CanvasPointerTarget,
  resolveCanvasPointerTarget,
  CanvasHistoryGestureController,
  CanvasPinchZoomController,
  resolvePointerActionModifiers,
  canvasAutoScroll,
  cursorNeedsWhite,
  usesBrushBoundaryCursor,
  StagedTouchIntent,
  createTouchContact,
  updateTouchContact,
  touchTapStart,
  type TouchContact,
  type CanvasPointerSample,
  useCanvasInputController,
  useCanvasManager,
  useCanvasOverlayState,
  rasterUploadLayout,
  canOffsetRaster,
} from "$/managers/canvas/canvas-manager";
import {
  workingColorProfile,
  convertPixelsToSrgb,
  INLINE_TEXT_MOVE_REGION_PADDING,
} from "$/managers/canvas/canvas-presentation";
import { tileNumberLabels } from "$/managers/canvas/canvas-presentation";
import { tiledCanvasLayout } from "$/managers/canvas/canvas-presentation";
import {
  resolveSymmetryMode,
  clipSymmetryLine,
  symmetryHandles,
  symmetryAxisPosition,
  type SymmetryHandle,
} from "$/managers/canvas/canvas-presentation";
import { offsetGridLines } from "$/managers/canvas/canvas-presentation";
import {
  SelectionMode,
  canMoveSelectionPixels,
  canTransformTimelineSelection,
  selectionModeForInput,
} from "$/managers/canvas/canvas-presentation";
import { sliceKeyAt } from "$/managers/canvas/canvas-presentation";
import {
  selectionHandlePositions,
  asepriteSelectionHandleRect as handleRect,
  hitSelectionHandles,
  selectionBoundaryContains,
  selectionBoundarySegments,
  projectSelectionBoundarySegments,
  selectionPivotPoint,
  selectionTransformPivotPoint,
  asepriteSelectionBoundaryWhite,
  selectionShaderOffset,
  type SelectionBoundarySegment,
  maskContains,
  type SelectionHandle,
} from "$/managers/canvas/canvas-presentation";
import {
  createAsepriteSelectionAntsState,
  paintAsepriteSelectionAnts,
  requestAsepriteSelectionAntsTick,
  syncAsepriteSelectionAnts,
  type AsepriteSelectionAntsState,
} from "$/managers/canvas/canvas-presentation";
import type { Point, PointerInput, PixelMask } from "$/managers/canvas/canvas-presentation";
import {
  clampCanvasPan,
  documentToScreen,
  screenToDocument,
  stepZoom,
} from "$/managers/canvas/canvas-presentation";
import {
  libreSpriteGridGeometry,
  libreSpritePixelGridGeometry,
  documentLayerEdgeGeometry,
  documentAutoGuideGeometry,
  documentGuideDashVisible,
} from "$/managers/canvas/canvas-presentation";
import { getAutoCelGuides } from "$/managers/canvas/canvas-presentation";
import { libreSpriteWorkingBrushColor } from "$/managers/canvas/canvas-presentation";
import { isBackgroundLayer } from "$/managers/canvas/canvas-presentation";
import { isSelectionTool } from "$/managers/canvas/canvas-presentation";
import { isShapeTool } from "$/managers/canvas/canvas-presentation";
import { isTwoPointShape } from "$/managers/canvas/canvas-presentation";
import { getXpriteToolCapabilities } from "$/managers/canvas/canvas-presentation";
import { timelineWheelFrameIndex } from "$/managers/canvas/canvas-presentation";
import { AsepriteInk, UINT8_MAX } from "$/managers/canvas/canvas-presentation";
import { useColorSource } from "$/managers/colors/color-sources";
import { useTouchInteractionPreferences } from "$/managers/input/input-interaction-context";
import {
  useWheelInput,
  wheelZoomSteps,
  wheelScalarDelta,
  brushSizeAfterWheel,
  EditorWheelSurface,
  EditorWheelAction as WheelAction,
} from "$/managers/input/use-wheel-input";
import {
  checkerboardCellSize,
  type CanvasDisplayPreferences,
} from "$/managers/preferences/canvas-display-preferences";
import {
  CursorColorType,
  PaintingCursorType,
  resolveBrushPreview,
} from "$/managers/preferences/cursor-preferences";
import { DEFAULT_GUIDE_SLICE_PREFERENCES } from "$/managers/preferences/guide-slice-preferences";
import { useTouchInputPreferences } from "$/managers/preferences/use-touch-input-preferences";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import { parseEditorColor } from "$/managers/tools/color-control";
import { ToolTilemapDisplayMode } from "$/managers/tools/tool-options";
import { usePresentationMetrics, type SurfaceBounds } from "@xprite/ui";
import { ContextMenu, PointerClickSequence } from "@xprite/ui";
import {
  measureUiText,
  uiFontHeight,
  paintUiPart,
  paintUiText,
  useUiAssets,
} from "@xprite/ui/assets";
import { UI_SCALE_X, UI_SCALE_Y, surfaceLayout } from "@xprite/ui/canvas";
import { CanvasRenderer, resizeCanvasBuffer } from "@xprite/ui/canvas";
import {
  layoutSize,
  displayPixelRatio,
  clientPoint,
  clientRect,
  clientToSurface,
  clientDeltaToSurface,
  observeResize,
} from "@xprite/ui/utils";

import styles from "$/components/canvas/editor-canvas.module.css";

const SYMMETRY_AUXILIARY_ALPHA_DIVISOR = 4;
const PIVOT_HANDLE_HIT_RADIUS = 3;
const CANVAS_BACKING_SCALE = 2;
const RGBA_CHANNEL_COUNT = 4;
const PAINTING_CURSOR_CENTER = 3;
const CENTER_DOT_COLOR_BIT = 8;
const PAINTING_CURSOR_DOT_ZOOM_PER_SCALE = 4;
const TOUCH_COLOR_PREVIEW_WIDTH = 40;
const TOUCH_COLOR_PREVIEW_HEIGHT = 24;
const TOUCH_COLOR_PREVIEW_OFFSET = 16;
const CANVAS_BUFFER_BLOCK_SIZE = 128;

enum RasterUploadDiagnosticMode {
  None = "none",
  Unchanged = "unchanged",
  Partial = "partial",
  Full = "full",
}

function paintCheckerboard(
  context: CanvasRenderingContext2D,
  preferences: CanvasDisplayPreferences,
  tileBounds: { x: number; y: number; width: number; height: number },
  origin: Point,
  zoom: number,
  viewport: { width: number; height: number },
  bounds: SurfaceBounds,
) {
  const cell = checkerboardCellSize(preferences);
  // Cover the same integer backing pixels as the image clip and its border.
  context.save();
  context.setTransform(CANVAS_BACKING_SCALE, 0, 0, CANVAS_BACKING_SCALE, 0, 0);
  context.fillStyle = preferences.checkerboardColor1;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.restore();
  if (preferences.checkerboardZoom) {
    context.fillStyle = preferences.checkerboardColor2;
    const x0 = Math.max(
        Math.floor(tileBounds.x / cell.width),
        Math.floor(-origin.x / zoom / cell.width),
      ),
      y0 = Math.max(
        Math.floor(tileBounds.y / cell.height),
        Math.floor(-origin.y / zoom / cell.height),
      ),
      x1 = Math.min(
        Math.ceil((tileBounds.x + tileBounds.width) / cell.width),
        Math.ceil((viewport.width - origin.x) / zoom / cell.width),
      ),
      y1 = Math.min(
        Math.ceil((tileBounds.y + tileBounds.height) / cell.height),
        Math.ceil((viewport.height - origin.y) / zoom / cell.height),
      );
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if ((x + y) & 1) context.fillRect(x * cell.width, y * cell.height, cell.width, cell.height);
    return;
  }

  context.save();
  context.setTransform(CANVAS_BACKING_SCALE, 0, 0, CANVAS_BACKING_SCALE, 0, 0);
  context.beginPath();
  context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.clip();
  context.fillStyle = preferences.checkerboardColor1;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.fillStyle = preferences.checkerboardColor2;
  const x0 = Math.max(
      Math.floor((bounds.x - origin.x) / cell.width),
      Math.floor(-origin.x / cell.width),
    ),
    y0 = Math.max(
      Math.floor((bounds.y - origin.y) / cell.height),
      Math.floor(-origin.y / cell.height),
    ),
    x1 = Math.min(
      Math.ceil((bounds.x + bounds.width - origin.x) / cell.width),
      Math.ceil((viewport.width - origin.x) / cell.width),
    ),
    y1 = Math.min(
      Math.ceil((bounds.y + bounds.height - origin.y) / cell.height),
      Math.ceil((viewport.height - origin.y) / cell.height),
    );
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if ((x + y) & 1)
        context.fillRect(
          origin.x + x * cell.width,
          origin.y + y * cell.height,
          cell.width,
          cell.height,
        );
  context.restore();
}

function canvasRasterBounds(bounds: SurfaceBounds, origin: Point, zoom: number): SurfaceBounds {
  const project = (value: number, offset: number) =>
    Math.trunc((offset + value * zoom) * CANVAS_BACKING_SCALE) / CANVAS_BACKING_SCALE;
  const x = project(bounds.x, origin.x);
  const y = project(bounds.y, origin.y);
  return {
    x,
    y,
    width: project(bounds.x + bounds.width, origin.x) - x,
    height: project(bounds.y + bounds.height, origin.y) - y,
  };
}

function paintGridLines(
  context: CanvasRenderingContext2D,
  lines: readonly SurfaceBounds[],
  bounds: SurfaceBounds,
) {
  for (const line of lines)
    context.fillRect(
      line.x,
      line.y,
      line.height === 1 ? bounds.width : line.width,
      line.width === 1 ? bounds.height : line.height,
    );
  // The terminal lattice lines fall outside the half-open clip. Paint the last
  // visible column and row explicitly, as LibreSprite's drawGrid does.
  context.fillRect(bounds.x + bounds.width - 1, bounds.y, 1, bounds.height);
  context.fillRect(bounds.x, bounds.y + bounds.height - 1, bounds.width, 1);
}

export interface EditorCanvasProps {
  /** Share between document canvases to retain pen detection across tabs. */
  inputController?: CanvasPointerController;
  cursor?: string;
  className?: string;
  autoScroll?: boolean;
  zoomFromCenterWithWheel?: boolean;
  surfaceBounds?: SurfaceBounds;
}
const defaultSurfaceBounds: SurfaceBounds = {
  x: 166,
  y: 98,
  width: 1700,
  height: 672,
};

/** Pixel-corner cross, with size independent of sprite zoom. */
function paintSelectionCross(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  scale: number,
  color?: string,
) {
  const bx = Math.floor(x * CANVAS_BACKING_SCALE),
    by = Math.floor(y * CANVAS_BACKING_SCALE);
  const size = Math.max(scale, Math.round(zoom * CANVAS_BACKING_SCALE));
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  const mark = (px: number, py: number) => {
    const sampled = context.getImageData(px, py, 1, 1).data;
    context.fillStyle =
      color ?? (cursorNeedsWhite(sampled[0], sampled[1], sampled[2]) ? "#fff" : "#000");
    context.fillRect(px, py, scale, scale);
  };
  for (let i = 0; i < 3; i++) {
    mark(bx - 3 * scale + i * scale, by - scale);
    mark(bx + size + i * scale, by - scale);
    mark(bx - 3 * scale + i * scale, by + size);
    mark(bx + size + i * scale, by + size);
  }
  for (let i = 0; i < 2; i++) {
    mark(bx - scale, by - 3 * scale + i * scale);
    mark(bx + size, by - 3 * scale + i * scale);
    mark(bx - scale, by + size + scale + i * scale);
    mark(bx + size, by + size + scale + i * scale);
  }
  context.restore();
}

export function EditorCanvas({
  inputController,
  cursor,
  className = "",
  autoScroll = true,
  zoomFromCenterWithWheel = false,
  surfaceBounds = defaultSurfaceBounds,
}: EditorCanvasProps) {
  const canvasManager = useCanvasManager();
  const overlayState = useCanvasOverlayState();
  const {
    commands: editor,
    input: canvasInputPort,
    displayPreferences,
    cursorPreferences,
    getSnapshot,
    subscribe,
    drawReferenceViewport,
    clearReferenceViewport,
  } = canvasManager;
  if (!editor || !canvasInputPort)
    throw new Error("EditorCanvas requires injected canvas manager ports");
  const {
    resolve: resolveWheel,
    connect: connectWheel,
    projectDelta: projectWheelDelta,
  } = useWheelInput();
  const defaultInputController = useRef(new CanvasPointerController());
  const sharedInputController = useCanvasInputController();
  const pointers = inputController ?? sharedInputController ?? defaultInputController.current;
  const { touchConstrain, touchDuplicate, touchFromCenter } = useTouchInteractionPreferences();
  const touchPreferencesRef = useRef({ touchConstrain, touchDuplicate, touchFromCenter });
  touchPreferencesRef.current = { touchConstrain, touchDuplicate, touchFromCenter };
  const shortcuts = useShortcutManager();
  const touchInputPreferences = useTouchInputPreferences();
  const touchInputPreferencesRef = useRef(touchInputPreferences);
  touchInputPreferencesRef.current = touchInputPreferences;
  const { scale: presentationScale, pixelRatio } = usePresentationMetrics();
  const surfaceBoundsRef = useRef(surfaceBounds);
  const resizeCanvas = useRef<(() => void) | null>(null);
  useInsertionEffect(() => {
    surfaceBoundsRef.current = surfaceBounds;
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useColorSource(canvasRef, (point) => {
    const canvas = canvasRef.current;
    const snapshot = getSnapshot();
    if (!canvas || !snapshot.document) return null;
    const rect = clientRect(canvas);
    if (!rect.width || !rect.height) return null;
    const layout = surfaceLayout(surfaceBounds);
    const local = presentationToCanvasLogical(
      clientToSurface(canvas, point, layout),
      surfaceBounds,
    );
    const at = screenToDocument(
      local,
      { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 },
      snapshot.document,
      snapshot.view,
    );
    return editor.sampleCompositeColor(at);
  });
  const inlineTextInput = useRef<HTMLInputElement | null>(null);
  const [slicePropertiesIds, setSlicePropertiesIds] = useState<readonly string[] | null>(null);
  const [sliceContextIds, setSliceContextIds] = useState<readonly string[]>([]);
  const sliceContextTarget = useRef<((event: MouseEvent) => readonly string[] | null) | null>(null);
  const sliceTouchMenuAllowed = useRef<
    ((input: { clientX: number; clientY: number }) => boolean) | null
  >(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const inlineText = overlayState.inlineText;
  const _selectedSliceIds = overlayState.selectedSliceIds;
  const inlineState = (overlayState.snapshot ?? getSnapshot())!;
  const inlineViewport = {
    width: surfaceBounds.width / 2,
    height: surfaceBounds.height / 2,
  };
  const inlineOrigin =
    inlineText && inlineState.document
      ? documentToScreen(inlineText.bounds, inlineViewport, inlineState.document, inlineState.view)
      : { x: 0, y: 0 };
  const inlineCssScale =
    (layoutSize(hostRef.current)?.width ?? surfaceBounds.width) / inlineViewport.width;

  const assets = useUiAssets();
  useLayoutEffect(() => {
    if (!assets) return;
    let surfaceBounds = surfaceBoundsRef.current;
    const canvas = canvasRef.current!;
    const presentation = canvas.getContext("2d");
    if (!presentation) return;
    const paintingCursorRenderer = canvasInputPort.cursors.createPaintingCursorRenderer();
    let readyPaintingCursor = canvasInputPort.cursors.cursorStyle("crosshair", "crosshair");
    let pendingPaintingCursor: string | null = null;
    const sourceCanvas = document.createElement("canvas");
    resizeCanvasBuffer(
      sourceCanvas,
      surfaceBounds.width,
      surfaceBounds.height,
      CANVAS_BUFFER_BLOCK_SIZE,
    );
    const context = sourceCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return;
    const disconnectStylusTouchDefaults = canvasInputPort.connectStylusTouchDefaults?.(
      canvas,
      () => !getSnapshot().inlineText || quickTool === CanvasToolId.Hand,
    );
    let renderer = new CanvasRenderer(surfaceBounds);
    canvas.width = renderer.layout.width;
    canvas.height = renderer.layout.height;
    let presentedPixelRatio = displayPixelRatio(window) || 1;
    const present = () => {
      const sourceWidth = Math.trunc(surfaceBounds.width);
      const sourceHeight = Math.trunc(surfaceBounds.height);
      if (sourceWidth <= 0 || sourceHeight <= 0) return;
      const rect = clientRect(canvas),
        dpr = displayPixelRatio(window) || 1,
        ratioX = (dpr * rect.width) / renderer.layout.width,
        ratioY = (dpr * rect.height) / renderer.layout.height;
      renderer.setPixelRatio(ratioX, ratioY);
      presentedPixelRatio = dpr;
      if (canvas.width !== renderer.pixelWidth) canvas.width = renderer.pixelWidth;
      if (canvas.height !== renderer.pixelHeight) canvas.height = renderer.pixelHeight;

      // Only use the browser sampler for exact integer copies. Fractional
      // DPR/browser zoom must share CanvasSurface's rational pixel-center map;
      // rounding a unit tile first changes the scale and moves the document.
      const scaleX = canvas.width / sourceWidth;
      const scaleY = canvas.height / sourceHeight;
      if (
        Number.isInteger(scaleX) &&
        Number.isInteger(scaleY) &&
        renderer.layout.left === surfaceBounds.x * UI_SCALE_X &&
        renderer.layout.top === surfaceBounds.y * UI_SCALE_Y
      ) {
        presentation.setTransform(1, 0, 0, 1, 0, 0);
        presentation.clearRect(0, 0, canvas.width, canvas.height);
        presentation.imageSmoothingEnabled = false;
        presentation.drawImage(
          sourceCanvas,
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        return;
      }
      presentation.putImageData(
        renderer.render(context.getImageData(0, 0, sourceWidth, sourceHeight)),
        0,
        0,
      );
    };
    const baseCanvas = document.createElement("canvas");
    const baseContext = baseCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    let baseKey: readonly unknown[] = [];
    const hoverCanvas = document.createElement("canvas");
    const hoverContext = hoverCanvas.getContext("2d");
    const paintingScale =
      cursorPreferences.paintingCursorType === PaintingCursorType.SpriteUnscaled ? 1 : 2;
    const paintingColor =
      cursorPreferences.colorType === CursorColorType.Specific
        ? cursorPreferences.color
        : undefined;
    const simpleCrosshair = cursorPreferences.paintingCursorType === PaintingCursorType.Simple;
    const imageCanvas = document.createElement("canvas");
    const imageContext = imageCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!imageContext) return;
    let lastPresentedDocument: number | undefined;
    let lastPresentedRevision = -1;
    let rasterUploadMode = RasterUploadDiagnosticMode.None;
    let frame = 0,
      imageRevision = -1,
      imageFloating: unknown = null,
      imageInline: unknown = null,
      imagePreview: unknown = null,
      imageLinePreview: unknown = null,
      imageSettings: unknown = null,
      inside = false,
      pointerScreen: Point | null = null,
      paintingCursorActive = false,
      centerDotCursorActive = false,
      paintingCursorZoom = 1,
      space = false,
      optionModifier = false,
      autoGuidesModifier = false,
      selectionCopyModifier = false,
      selectionModifier = false,
      transformModifier = false;
    let quickTool: CanvasQuickTool | null = null;
    let modifierKeys = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    let imageData: ImageData | null = null;
    let imageX = 0,
      imageY = 0;
    let imageWriteX = 0,
      imageWriteY = 0,
      imageRasterScale = 0;
    let imageTiled: boolean | null = null;
    let imageBorrowMode: boolean | null = null;
    let imageProfile: unknown = null;
    let hoveredTransform: SelectionHandle | null = null;
    const transformTargets = () => {
      const state = getSnapshot(),
        doc = state.document;
      if (
        !doc ||
        !!state.preview ||
        !isSelectionTool(state.settings.tool) ||
        !doc.selection ||
        !doc.layer.visible ||
        (doc.layer.locked &&
          !(
            doc.timeline?.layers[doc.timeline.activeLayer].kind === "group" &&
            canTransformTimelineSelection(
              doc,
              state.settings.selectionMulticelWhenLayersOrFrames !== false,
            )
          ))
      )
        return [];
      const range = doc.timeline?.range;
      if (
        range &&
        (range.kind === "cels" || state.settings.selectionMulticelWhenLayersOrFrames !== false) &&
        !canTransformTimelineSelection(
          doc,
          state.settings.selectionMulticelWhenLayersOrFrames !== false,
        )
      )
        return [];
      const bounds = state.selectionTransform?.bounds ?? doc.selection,
        angle = state.selectionTransform?.angle ?? 0,
        timeline = doc.timeline,
        activeLayer = timeline?.layers[timeline.activeLayer],
        tilemapTileMode =
          activeLayer?.kind === "tilemap" &&
          (state.settings.tilemapMode ?? ToolTilemapDisplayMode.Tiles) ===
            ToolTilemapDisplayMode.Tiles,
        handles = selectionHandlePositions(bounds, angle),
        pivot = state.selectionTransform
          ? selectionTransformPivotPoint(state.selectionTransform)
          : selectionPivotPoint(bounds, angle, state.settings.selectionPivotPosition);
      if (
        !tilemapTileMode &&
        (state.settings.selectionPivotVisible ||
          (!!state.selectionTransform && Math.abs(state.selectionTransform.angle) > 1e-10))
      )
        handles.unshift({ handle: "pivot", point: pivot, angle: 0 });
      return handles.map((item) => ({
        ...item,
        screen: documentToScreen(
          item.point,
          { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 },
          doc,
          state.view,
        ),
      }));
    };
    const hitTransform = (p: Point): SelectionHandle | null => {
      const state = getSnapshot(),
        doc = state.document,
        m = doc?.selection;
      if (!doc || !m || !isSelectionTool(state.settings.tool) || state.preview) return null;
      if (state.settings.selectionModifiersDisableHandles === false || !transformModifier) {
        const targets = transformTargets(),
          pivot = targets.find((target) => target.handle === "pivot");
        if (
          pivot &&
          Math.abs(p.x - pivot.screen.x) <= PIVOT_HANDLE_HIT_RADIUS &&
          Math.abs(p.y - pivot.screen.y) <= PIVOT_HANDLE_HIT_RADIUS
        )
          return "pivot";
        const hit = hitSelectionHandles(
          targets.filter((target) => target.handle !== "pivot"),
          p,
        );
        if (hit) return hit;
      }
      if (!state.floatingPaste && state.settings.selectionMoveEdges !== false) {
        const local = screenToDocument(
            p,
            { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 },
            doc,
            state.view,
          ),
          tolerance = 2 / state.view.zoom;
        if (selectionBoundaryContains(m, local, tolerance)) return "bounds";
      }
      return null;
    };

    let pan: { pointer: number; screen: Point; origin: Point } | null = null;
    let zoomGesture: { pointer: number; gesture: CanvasZoomGesture } | null = null;
    let shortcutDrag: CanvasShortcutDrag | null = null;
    let activePointer: number | null = null;
    const syncQuickTool = (focusCanvas = false) => {
      const editingText =
        document.activeElement instanceof Element &&
        document.activeElement.closest(
          'input,textarea,select,[contenteditable=true],[role="dialog"],[role="menu"],dialog',
        );
      quickTool = editor.updateQuickTool(modifierKeys, actionModifiers(modifierKeys), {
        inside: inside && (focusCanvas || !editingText),
        space,
        pointerActive: activePointer !== null,
      });
    };
    const startShortcutDrag = (point: Point, focusCanvas = false) => {
      if (shortcutDrag) return true;
      if (activePointer !== null || !inside) return false;
      if (
        !focusCanvas &&
        document.activeElement instanceof Element &&
        document.activeElement.closest(
          'input,textarea,select,[contenteditable=true],[role="dialog"],[role="menu"],dialog',
        )
      )
        return false;
      shortcutDrag = editor.beginShortcutDrag(modifierKeys, space, point);
      if (!shortcutDrag) return false;
      editor.setQuickTool(null);
      quickTool = null;
      schedule();
      return true;
    };
    let symmetryDrag: { pointer: number; axis: "x" | "y"; start: Point; initial: number } | null =
      null;
    const currentSymmetry = () => {
      const state = getSnapshot(),
        doc = state.document;
      return {
        enabled: state.settings.symmetryEnabled,
        mode: state.view.symmetryMode ?? 0,
        x: state.view.symmetryX ?? (doc?.width ?? 0) / 2,
        y: state.view.symmetryY ?? (doc?.height ?? 0) / 2,
      };
    };
    const symmetryTargets = () => {
      const state = getSnapshot(),
        doc = state.document;
      if (!doc) return [];
      const mode = state.view.tiledMode ?? 0,
        tiles = tiledCanvasLayout(doc.width, doc.height, mode);
      return symmetryHandles(
        currentSymmetry(),
        documentToScreen({ x: 0, y: 0 }, viewport(), doc, state.view),
        state.view.zoom,
        { x: -tiles.mainTile.x, y: -tiles.mainTile.y, width: tiles.width, height: tiles.height },
        viewport(),
      );
    };
    const hitSymmetry = (p: Point): SymmetryHandle | null =>
      symmetryTargets().find(
        (h) =>
          p.x >= h.bounds.x &&
          p.y >= h.bounds.y &&
          p.x < h.bounds.x + h.bounds.width &&
          p.y < h.bounds.y + h.bounds.height,
      ) ?? null;

    let stagedTouch: {
      intent: StagedTouchIntent;
      event: PointerEvent;
      screen: Point;
      origin: Point;
    } | null = null;
    let touchPick: {
      pointer: number;
      event: PointerEvent;
      x: number;
      y: number;
      timer: number | null;
      active: boolean;
      panOnMove: boolean;
    } | null = null;
    let touchColorPreview: {
      screen: Point;
      pixel: Point;
      color: readonly number[];
    } | null = null;
    const touchPoints = new Map<number, TouchContact>();
    let touchSession: {
      count: number;
      startedAt: number;
      moved: boolean;
      transform: CanvasPinchZoomController | null;
    } | null = null;
    const historyGesture = new CanvasHistoryGestureController(
      () => touchInputPreferencesRef.current,
      editor.traverseTouchHistory,
    );
    const touchTapSlop = 12;
    let selectionPreviewSource: unknown = null,
      selectionPreviewSettings: unknown = null,
      selectionPreviewBase: unknown = null,
      selectionPreviewMask: PixelMask | null = null;
    let selectionCache: object | null = null,
      selectionDocumentSegments: SelectionBoundarySegment[] = [],
      selectionScreenSegments: SelectionBoundarySegment[] = [],
      selectionScreenSource: object | null = null,
      selectionScreenOrigin = { x: Number.NaN, y: Number.NaN },
      selectionScreenZoom = Number.NaN,
      antsState: AsepriteSelectionAntsState = createAsepriteSelectionAntsState();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let antsTimer: ReturnType<typeof setTimeout> | undefined;
    // Touchpads and touchscreens can deliver several view-only events before
    // the next paint. Keep the canvas RAF hot path responsive and publish only
    // the newest view for each frame; pointer-up/cancel flushes the last one.
    let viewFrame = 0;
    let pendingView: { zoom?: number; pan?: Point } | null = null;
    let wheelFraction: Point = { x: 0, y: 0 };
    let disposed = false;
    const viewport = () => ({
      width: surfaceBounds.width / 2,
      height: surfaceBounds.height / 2,
    });
    const drawSelectionBoundary = (
      segments: readonly SelectionBoundarySegment[],
      shaderOffset: Point,
    ) => {
      // Test/diagnostic observability only: capture tooling can verify the
      // actual phase painted without changing the source-driven animation.
      if (segments.length) canvas.dataset.uiSelectionPhase = String(antsState.offset);
      else delete canvas.dataset.uiSelectionPhase;
      if (!segments.length) return;
      context.save();
      // The checkered background uses one-pixel logical GUI coordinates and
      // must not be stretched by sprite zoom. The backing presentation scale
      // remains 2, just like the rest of this Xprite canvas adapter.
      context.setTransform(2, 0, 0, 2, 0, 0);
      for (const segment of segments) {
        let runStart = 0;
        let runWhite = asepriteSelectionBoundaryWhite(
          segment.x + shaderOffset.x,
          segment.y + shaderOffset.y,
          antsState.offset,
        );
        const paint = (start: number, length: number, white: boolean) => {
          context.fillStyle = white ? "#fff" : "#000";
          if (segment.axis === "horizontal")
            context.fillRect(segment.x + start, segment.y, length, 1);
          else context.fillRect(segment.x, segment.y + start, 1, length);
        };
        for (let index = 1; index < segment.length; index++) {
          const x = segment.axis === "horizontal" ? segment.x + index : segment.x;
          const y = segment.axis === "horizontal" ? segment.y : segment.y + index;
          const white = asepriteSelectionBoundaryWhite(
            x + shaderOffset.x,
            y + shaderOffset.y,
            antsState.offset,
          );
          if (white !== runWhite) {
            paint(runStart, index - runStart, runWhite);
            runStart = index;
            runWhite = white;
          }
        }
        paint(runStart, segment.length - runStart, runWhite);
      }
      context.restore();
    };
    const syncAntsPhase = (active: boolean) => {
      // Aseprite starts its timer after painting an active mask and advances the
      // stored offset only after each delivered timer paint. There is no
      // wall-clock catch-up while the mask/timer is stopped.
      antsState = syncAsepriteSelectionAnts(antsState, active);
    };
    const stopAntsTimer = () => {
      syncAntsPhase(false);
      delete canvas.dataset.uiSelectionPhase;
      if (antsTimer) {
        clearTimeout(antsTimer);
        antsTimer = undefined;
      }
    };
    const screenPoint = (event: { clientX: number; clientY: number }) => {
      return presentationToCanvasLogical(
        clientToSurface(canvas, clientPoint(event), renderer.layout),
        surfaceBounds,
      );
    };
    // Aseprite UI messages carry integer GUI coordinates. Raster input below
    // deliberately retains the continuous inverse until core pixel rounding.
    const guiPoint = (event: { clientX: number; clientY: number }) => {
      const point = screenPoint(event);
      return { x: Math.floor(point.x), y: Math.floor(point.y) };
    };
    let latestPointerInput: PointerInput | null = null;
    const clicks = new PointerClickSequence();
    let mousePress: PointerEvent | null = null;
    let clickCount = 1;
    let handledDoubleClick = false;
    let sliceTouchStart: Point | null = null;
    let previousDragPoint: Point | null = null;
    let constrainDragInput = false;
    const actionModifiers = (
      event: Pick<CanvasPointerSample, "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> & {
        pointerType?: string;
      },
    ) => {
      const touch = event.pointerType === "touch" || event.pointerType === "pen";
      return resolvePointerActionModifiers(
        shortcuts,
        event,
        space,
        touch
          ? {
              constrain: touchPreferencesRef.current.touchConstrain,
              duplicate: touchPreferencesRef.current.touchDuplicate,
              fromCenter: touchPreferencesRef.current.touchFromCenter,
            }
          : undefined,
      );
    };
    const updateActionIndicators = (event: Parameters<typeof actionModifiers>[0]) => {
      const actions = actionModifiers(event);
      modifierKeys = {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      };
      autoGuidesModifier = !!actions.autoSelectLayer;
      selectionModifier = !!(
        actions.addSelection ||
        actions.subtractSelection ||
        actions.intersectSelection
      );
      selectionCopyModifier = !!actions.copySelection;
      transformModifier = selectionModifier || selectionCopyModifier || event.altKey;
    };
    const input = (event: CanvasPointerSample, remember = true): PointerInput => {
      const state = getSnapshot(),
        raw = screenPoint(event),
        v = viewport(),
        p = constrainDragInput
          ? {
              x: Math.max(0, Math.min(v.width - 1, raw.x)),
              y: Math.max(0, Math.min(v.height - 1, raw.y)),
            }
          : raw;
      const result: PointerInput = {
        ...(state.document ? screenToDocument(p, viewport(), state.document, state.view) : p),
        button: event.button,
        quickMove: quickTool === CanvasToolId.Move,
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: isSelectionTool(state.settings.tool) ? event.ctrlKey : event.ctrlKey || event.metaKey,
        physicalCtrl: event.ctrlKey,
        actionModifiers: actionModifiers(event),
        space,
        pressure: event.pressure,
        pointerType: event.pointerType,
        timeStamp: event.timeStamp,
        screen: { x: clientPoint(event).x, y: clientPoint(event).y },
      };
      if (remember) {
        optionModifier = event.altKey;
        latestPointerInput = result;
      }
      return result;
    };
    const sampleTouchColor = (event: PointerEvent) => {
      const state = getSnapshot();
      if (!state.document) return;
      const at = screenToDocument(screenPoint(event), viewport(), state.document, state.view);
      const picked = editor.pickTouchColor(at);
      if (picked) touchColorPreview = { ...picked, screen: screenPoint(event) };
      schedule();
    };
    const stageTouchPick = (event: PointerEvent, panOnMove: boolean, pickOnHold = true) => {
      const pending = {
        pointer: event.pointerId,
        event,
        x: clientPoint(event).x,
        y: clientPoint(event).y,
        timer: null as number | null,
        active: false,
        panOnMove,
      };
      if (pickOnHold && touchInputPreferencesRef.current.longPressPickEnabled)
        pending.timer = window.setTimeout(() => {
          if (touchPick !== pending) return;
          pending.timer = null;
          pending.active = true;
          sampleTouchColor(pending.event);
        }, touchInputPreferencesRef.current.longPressPickDelayMs);
      touchPick = pending;
    };
    const touchPair = () => {
      const points = [...touchPoints.values()];
      return points.length === 2 ? (points as [(typeof points)[0], (typeof points)[0]]) : null;
    };
    const touchCenter = (pair: NonNullable<ReturnType<typeof touchPair>>) => ({
      x: (pair[0].x + pair[1].x) / 2,
      y: (pair[0].y + pair[1].y) / 2,
    });
    const touchDistance = (pair: NonNullable<ReturnType<typeof touchPair>>) =>
      Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
    const beginTouchSession = () => {
      const pair = touchPair(),
        state = getSnapshot();
      touchSession = {
        count: touchPoints.size,
        startedAt: touchTapStart(touchPoints.values()),
        moved: [...touchPoints.values()].some((point) => point.moved),
        transform:
          pair && state.document
            ? new CanvasPinchZoomController({
                center: touchCenter(pair),
                screenCenter: screenPoint({
                  clientX: touchCenter(pair).x,
                  clientY: touchCenter(pair).y,
                }),
                distance: touchDistance(pair),
                viewport: viewport(),
                document: {
                  width: state.document.width,
                  height: state.document.height,
                },
                view: state.view,
                mode: touchInputPreferencesRef.current.pinchZoomMode,
              })
            : null,
      };
      historyGesture.begin(touchSession.count, touchSession.startedAt, touchSession.moved);
    };
    const updateTouchSession = () => {
      const session = touchSession;
      if (!session) return;
      for (const point of touchPoints.values()) {
        if (point.moved) {
          session.moved = true;
          break;
        }
      }
      const pair = touchPair(),
        transform = session.transform;
      if (!pair || !transform) {
        historyGesture.update(session.count, session.moved);
        return;
      }
      const center = touchCenter(pair),
        distance = touchDistance(pair);
      if (
        Math.hypot(center.x - transform.startCenter.x, center.y - transform.startCenter.y) >
          touchTapSlop ||
        Math.abs(distance - transform.startDistance) > touchTapSlop
      )
        session.moved = true;
      historyGesture.update(session.count, session.moved);
      // A stationary multi-finger hold belongs to history. Avoid publishing
      // a no-op view patch while its intent is still undecided.
      if (!session.moved) return;
      const state = getSnapshot(),
        currentCenter = screenPoint({
          clientX: center.x,
          clientY: center.y,
        });
      if (state.document) {
        queueView(transform.update(currentCenter, distance, viewport()));
      }
    };
    const finishTouchSession = () => {
      touchSession = null;
      historyGesture.finish(performance.now());
    };
    const flushView = () => {
      if (viewFrame) {
        cancelAnimationFrame(viewFrame);
        viewFrame = 0;
      }
      const next = pendingView;
      pendingView = null;
      if (next) editor.setView(next);
    };
    const queueView = (patch: { zoom?: number; pan?: Point }) => {
      const state = getSnapshot();
      if (patch.pan && state.document)
        patch = {
          ...patch,
          pan: clampCanvasPan(
            patch.pan,
            viewport(),
            state.document,
            patch.zoom ?? state.view.zoom,
            state.view.tiledMode,
          ),
        };
      pendingView = {
        ...pendingView,
        ...patch,
        ...(patch.pan ? { pan: { ...patch.pan } } : {}),
      };
      if (!viewFrame)
        viewFrame = requestAnimationFrame(() => {
          viewFrame = 0;
          const next = pendingView;
          pendingView = null;
          if (next) editor.setView(next);
        });
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(draw);
    };
    // Native cursor images preserve the OS accessibility size. Only install a
    // decoded PNG; retain the current cursor while the next contrast variant loads.
    const updatePaintingCursor = () => {
      if (
        simpleCrosshair ||
        (!paintingCursorActive && !centerDotCursorActive) ||
        !inside ||
        !pointerScreen
      ) {
        pendingPaintingCursor = null;
        return;
      }
      const centerDot = paintingCursorZoom >= PAINTING_CURSOR_DOT_ZOOM_PER_SCALE * paintingScale;
      if (!paintingCursorActive && !centerDot) {
        pendingPaintingCursor = null;
        return;
      }
      let whiteBits = 0;
      if (!paintingColor) {
        const rect = clientRect(canvas);
        const view = viewport();
        if (!view.width || !view.height || !rect.width || !rect.height) return;
        const cx = Math.floor((pointerScreen.x * canvas.width) / view.width);
        const cy = Math.floor((pointerScreen.y * canvas.height) / view.height);
        const sizeX = Math.max(1, Math.round((paintingScale * canvas.width) / rect.width));
        const sizeY = Math.max(1, Math.round((paintingScale * canvas.height) / rect.height));
        const sampleX = Math.max(0, cx - PAINTING_CURSOR_CENTER * sizeX);
        const sampleY = Math.max(0, cy - PAINTING_CURSOR_CENTER * sizeY);
        const sampleWidth =
          Math.min(canvas.width, cx + (PAINTING_CURSOR_CENTER + 1) * sizeX) - sampleX;
        const sampleHeight =
          Math.min(canvas.height, cy + (PAINTING_CURSOR_CENTER + 1) * sizeY) - sampleY;
        if (sampleWidth <= 0 || sampleHeight <= 0) return;
        const firstSample = renderer.sourcePoint(sampleX, sampleY);
        const lastSample = renderer.sourcePoint(
          sampleX + sampleWidth - 1,
          sampleY + sampleHeight - 1,
        );
        const sourceX = Math.max(0, firstSample.x);
        const sourceY = Math.max(0, firstSample.y);
        const sourceWidth = Math.min(Math.trunc(surfaceBounds.width), lastSample.x + 1) - sourceX;
        const sourceHeight = Math.min(Math.trunc(surfaceBounds.height), lastSample.y + 1) - sourceY;
        if (sourceWidth <= 0 || sourceHeight <= 0) return;
        // Sample the CPU painting surface with the presentation's exact map.
        // Reading the displayed canvas forces a GPU readback even for a tiny cursor.
        const sampled = context.getImageData(sourceX, sourceY, sourceWidth, sourceHeight).data;
        const sample = (x: number, y: number, bit: number) => {
          const px = cx + (x - PAINTING_CURSOR_CENTER) * sizeX;
          const py = cy + (y - PAINTING_CURSOR_CENTER) * sizeY;
          if (
            px < sampleX ||
            py < sampleY ||
            px >= sampleX + sampleWidth ||
            py >= sampleY + sampleHeight
          )
            return;
          const source = renderer.sourcePoint(px, py);
          if (
            source.x < sourceX ||
            source.y < sourceY ||
            source.x >= sourceX + sourceWidth ||
            source.y >= sourceY + sourceHeight
          )
            return;
          const offset =
            ((source.y - sourceY) * sourceWidth + source.x - sourceX) * RGBA_CHANNEL_COUNT;
          if (cursorNeedsWhite(sampled[offset], sampled[offset + 1], sampled[offset + 2]))
            whiteBits |= 1 << bit;
        };
        if (paintingCursorActive)
          canvasInputPort.cursors.paintingCrosshairPixels.forEach(([x, y], bit) =>
            sample(x, y, bit),
          );
        if (centerDot) sample(PAINTING_CURSOR_CENTER, PAINTING_CURSOR_CENTER, CENTER_DOT_COLOR_BIT);
      }
      const key = `${paintingCursorActive}:${centerDot}:${whiteBits}`;
      if (pendingPaintingCursor === key) return;
      pendingPaintingCursor = key;
      void paintingCursorRenderer
        .prepare({
          scale: paintingScale,
          crosshair: paintingCursorActive,
          centerDot,
          whiteBits,
          color: paintingColor,
        })
        .then(
          (nextCursor) => {
            if (
              disposed ||
              pendingPaintingCursor !== key ||
              !inside ||
              quickTool === CanvasToolId.Hand ||
              pan ||
              hoveredTransform
            )
              return;
            readyPaintingCursor = nextCursor;
            if (canvas.style.cursor !== nextCursor) canvas.style.cursor = nextCursor;
          },
          () => {
            if (pendingPaintingCursor === key) pendingPaintingCursor = null;
          },
        );
    };
    const antsTick = () => {
      antsTimer = undefined;
      antsState = requestAsepriteSelectionAntsTick(antsState);
      schedule();
      // Keep the Aseprite repeating-timer cadence independent of RAF delivery;
      // pending ticks are painted current-phase-first on the next draw.
      if (!disposed && antsState.active) antsTimer = setTimeout(antsTick, 100);
    };
    const draw = () => {
      const drawStartedAt = performance.now();
      frame = 0;
      if (disposed) return;
      const nextBounds = surfaceBoundsRef.current;
      if (
        nextBounds.x !== surfaceBounds.x ||
        nextBounds.y !== surfaceBounds.y ||
        nextBounds.width !== surfaceBounds.width ||
        nextBounds.height !== surfaceBounds.height
      ) {
        surfaceBounds = nextBounds;
        resizeCanvasBuffer(
          sourceCanvas,
          surfaceBounds.width,
          surfaceBounds.height,
          CANVAS_BUFFER_BLOCK_SIZE,
        );
        renderer = new CanvasRenderer(surfaceBounds);
      }
      const state = getSnapshot(),
        v = viewport(),
        doc = state.document;
      if (v.width <= 0 || v.height <= 0) {
        stopAntsTimer();
        return;
      }
      const width = Math.max(1, Math.round(v.width * 2)),
        height = Math.max(1, Math.round(v.height * 2));
      // Cover the integer backing store before applying the logical transform.
      // clientWidth/scale can be fractional; painting only that extent repeatedly
      // alpha-composited its partially covered last row/column on prior frames.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.fillStyle = assets.style.colors.editor_face;
      context.fillRect(0, 0, width, height);
      context.setTransform(2, 0, 0, 2, 0, 0);
      context.imageSmoothingEnabled = false;
      const cursors: Record<string, string> = {
        pencil: "crosshair",
        spray: "crosshair",
        eraser: "crosshair",
        eyedropper: "crosshair",
        zoom: "zoom-in",
        move: "move",
        bucket: "crosshair",
        line: "crosshair",
        rectangle: "crosshair",
        contour: "crosshair",
        blur: "crosshair",
        jumble: "crosshair",
        text: "crosshair",
        marquee: "crosshair",
        lasso: "crosshair",
        elliptical_marquee: "crosshair",
        polygonal_lasso: "crosshair",
        magic_wand: "crosshair",
        filled_rectangle: "crosshair",
        ellipse: "crosshair",
        filled_ellipse: "crosshair",
        curve: "crosshair",
        polygon: "crosshair",
        gradient: "crosshair",
      };
      const paintingTool =
        [
          "pencil",
          "spray",
          "eraser",
          "blur",
          "jumble",
          "bucket",
          "line",
          "rectangle",
          "contour",
        ].includes(state.settings.tool) || isShapeTool(state.settings.tool);
      const selectionTool = isSelectionTool(state.settings.tool);
      const quickToolActive =
        inside && quickTool === CanvasToolId.Eyedropper && activePointer === null;
      const movingSelection = !!(
        state.floatingPaste ||
        (state.pointer &&
          doc?.selection &&
          !state.preview &&
          canMoveSelectionPixels(
            selectionModeForInput(state.settings.selectionMode ?? SelectionMode.Replace, {
              shift: selectionModifier,
              ctrl: selectionCopyModifier,
              alt: optionModifier,
            }),
            state.settings.selectionMoveOnAddMode !== false,
            selectionCopyModifier && !selectionModifier,
          ) &&
          selectionTool &&
          state.settings.tool !== "magic_wand" &&
          maskContains(doc.selection, state.pointer))
      );
      const forbiddenPaint = paintingTool && !!doc && (!doc.layer.visible || !!doc.layer.locked);
      const paintingActive =
        paintingTool &&
        !forbiddenPaint &&
        !quickToolActive &&
        !hoveredTransform &&
        !pan &&
        quickTool !== CanvasToolId.Hand &&
        !movingSelection;
      const selectionActive =
        selectionTool &&
        !quickToolActive &&
        !hoveredTransform &&
        !pan &&
        quickTool !== CanvasToolId.Hand &&
        !movingSelection;
      const brushColor =
        paintingActive && doc
          ? libreSpriteWorkingBrushColor(
              state.settings.foreground,
              doc.timeline,
              doc.palette ?? state.palette,
              state.settings.foregroundIndex ?? undefined,
              state.settings.ink,
            )
          : undefined;
      const activeTimelineLayer = doc?.timeline?.layers[doc.timeline.activeLayer];
      const transparentLayer = !activeTimelineLayer || !isBackgroundLayer(activeTimelineLayer);
      const transparentInk =
        transparentLayer && brushColor?.[3] === 0 && state.settings.ink !== AsepriteInk.Shading;
      const rawCursorPoint =
        state.pointer && doc && pointerScreen
          ? screenToDocument(pointerScreen, v, doc, state.view)
          : state.pointer;
      const previewGeometry =
        inside && (paintingActive || selectionActive) && rawCursorPoint
          ? cursorPreviewGeometry(state, rawCursorPoint, cursorPreferences)
          : null;
      const tileMode = !!previewGeometry?.tileset;
      const previewMode = tileMode ? cursorPreferences.tilePreview : cursorPreferences.brushPreview;
      const effectBoundary =
        state.settings.tool === "jumble" ||
        (tileMode
          ? state.settings.tool === "eraser" || !state.settings.selectedTile
          : usesBrushBoundaryCursor(
              state.settings.tool,
              state.settings.brush.size,
              state.view.zoom,
              true,
              transparentInk,
            ));
      const previewPolicy = resolveBrushPreview(
        previewMode,
        state.view.brushPreview,
        effectBoundary,
      );
      const brushBoundary = paintingActive && previewPolicy.edges;
      const centerOnly = selectionActive || (brushBoundary && !tileMode);
      const nextCursor = pan
        ? canvasInputPort.cursors.cursorStyle("scroll", "grabbing")
        : quickTool === CanvasToolId.Hand
          ? canvasInputPort.cursors.cursorStyle("hand", "grab")
          : quickToolActive
            ? canvasInputPort.cursors.editorCursor("eyedropper")
            : state.settings.tool === "hand"
              ? canvasInputPort.cursors.cursorStyle("hand", "grab")
              : hoveredTransform
                ? hoveredTransform === "bounds" || hoveredTransform === "pivot"
                  ? canvasInputPort.cursors.cursorStyle("move-selection", "move")
                  : canvasInputPort.cursors.selectionHandleCursor(
                      hoveredTransform,
                      state.selectionTransform?.bounds ?? doc?.selection ?? { width: 1, height: 1 },
                      state.selectionTransform?.angle ?? 0,
                    )
                : movingSelection
                  ? selectionCopyModifier
                    ? canvasInputPort.cursors.cursorStyle("normal_add", "copy")
                    : canvasInputPort.cursors.cursorStyle("move", "move")
                  : forbiddenPaint
                    ? canvasInputPort.cursors.cursorStyle("forbidden", "not-allowed")
                    : (paintingActive || selectionActive) && simpleCrosshair
                      ? canvasInputPort.cursors.cursorStyle("crosshair", "crosshair")
                      : paintingActive || selectionActive
                        ? centerOnly &&
                          state.view.zoom < PAINTING_CURSOR_DOT_ZOOM_PER_SCALE * paintingScale
                          ? "none"
                          : readyPaintingCursor
                        : (cursor ?? cursors[state.settings.tool] ?? "crosshair");
      if (canvas.style.cursor !== nextCursor) canvas.style.cursor = nextCursor;
      if (
        state.settings.tool === "slice" &&
        doc?.timeline &&
        state.pointer &&
        !pan &&
        quickTool !== CanvasToolId.Hand
      ) {
        const p = state.pointer,
          active = (doc.timeline.slices ?? [])
            .filter((s) => state.selectedSliceIds?.includes(s.id))
            .map((s) => sliceKeyAt(s, doc.timeline!.activeFrame)?.bounds)
            .filter((b): b is NonNullable<typeof b> => !!b);
        let sliceCursor = "crosshair";
        if (active.length) {
          const x = Math.min(...active.map((b) => b.x)),
            y = Math.min(...active.map((b) => b.y)),
            right = Math.max(...active.map((b) => b.x + b.width)),
            bottom = Math.max(...active.map((b) => b.y + b.height)),
            tol = Math.max(0.5, 2 / state.view.zoom),
            near = (a: number, b: number) => Math.abs(a - b) <= tol,
            left = near(p.x, x),
            east = near(p.x, right),
            top = near(p.y, y),
            south = near(p.y, bottom);
          if ((left || east) && (top || south))
            sliceCursor = left === top ? "nwse-resize" : "nesw-resize";
          else if (left || east) sliceCursor = "ew-resize";
          else if (top || south) sliceCursor = "ns-resize";
        }
        if (
          sliceCursor === "crosshair" &&
          (doc.timeline.slices ?? []).some((s) => {
            const b = sliceKeyAt(s, doc.timeline!.activeFrame)?.bounds;
            return b && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
          })
        )
          sliceCursor = "move";
        canvas.style.cursor = sliceCursor;
      }
      const axisHover =
        inside && !pan && quickTool !== CanvasToolId.Hand && state.pointer
          ? hitSymmetry(
              documentToScreen(state.pointer, v, doc ?? { width: 1, height: 1 }, state.view),
            )
          : null;
      if (symmetryDrag || axisHover) {
        const axisCursor = canvasInputPort.cursors.cursorStyle(
          (symmetryDrag?.axis ?? axisHover?.axis) === "x" ? "size_we" : "size_ns",
          "move",
        );
        if (canvas.style.cursor !== axisCursor) canvas.style.cursor = axisCursor;
      }
      if (state.inlineText && !symmetryDrag && !axisHover) {
        const bounds = state.inlineText.bounds,
          pointer = state.pointer,
          pad = INLINE_TEXT_MOVE_REGION_PADDING / state.view.zoom;
        const inText =
          !!pointer &&
          pointer.x >= bounds.x &&
          pointer.y >= bounds.y &&
          pointer.x < bounds.x + bounds.width &&
          pointer.y < bounds.y + bounds.height;
        const inMoveArea =
          !!pointer &&
          pointer.x >= bounds.x - pad &&
          pointer.y >= bounds.y - pad &&
          pointer.x < bounds.x + bounds.width + pad &&
          pointer.y < bounds.y + bounds.height + pad;
        const textCursor =
          inMoveArea && !inText ? canvasInputPort.cursors.cursorStyle("move", "move") : "default";
        if (canvas.style.cursor !== textCursor) canvas.style.cursor = textCursor;
      }
      paintingCursorActive =
        paintingActive && (!brushBoundary || tileMode) && !symmetryDrag && !axisHover && !!doc;
      centerDotCursorActive = centerOnly && !symmetryDrag && !axisHover && !!doc;
      paintingCursorZoom = state.view.zoom;
      if (!doc) {
        stopAntsTimer();
        present();
        updatePaintingCursor();
        return;
      }
      const autoGuidesColor =
        state.settings.autoGuidesColor ?? DEFAULT_GUIDE_SLICE_PREFERENCES.autoGuidesColor;
      const [guideRed, guideGreen, guideBlue] = parseEditorColor(autoGuidesColor);
      const guideTextColor = cursorNeedsWhite(guideRed, guideGreen, guideBlue) ? "#fff" : "#000";
      const projectedOrigin = documentToScreen({ x: 0, y: 0 }, v, doc, state.view),
        origin = { x: Math.trunc(projectedOrigin.x), y: Math.trunc(projectedOrigin.y) },
        zoom = state.view.zoom;
      const tiledMode = state.view.tiledMode ?? 0,
        tiles = tiledCanvasLayout(doc.width, doc.height, tiledMode),
        tileBounds = {
          x: -tiles.mainTile.x,
          y: -tiles.mainTile.y,
          width: tiles.width,
          height: tiles.height,
        };
      const rasterBounds = canvasRasterBounds(tileBounds, origin, zoom);
      const right = rasterBounds.x + rasterBounds.width;
      const bottom = rasterBounds.y + rasterBounds.height;
      const floating = state.floatingPaste;
      const offsetPhaseSafe = canOffsetRaster(
        { x: origin.x * CANVAS_BACKING_SCALE, y: origin.y * CANVAS_BACKING_SCALE },
        doc,
        zoom * CANVAS_BACKING_SCALE,
      );
      // Retain a full raster during view-only pan updates rather than switching
      // representations and uploading on every pan sample.
      const borrowRaster =
        offsetPhaseSafe && (imageBorrowMode !== false || imageRevision !== state.pixelRevision);
      const nextBaseKey = [
        doc.id,
        doc.width,
        doc.height,
        state.pixelRevision,
        workingColorProfile(doc.timeline),
        state.view,
        state.playing,
        state.settings,
        state.preview,
        state.linePreview,
        state.inlineText,
        floating,
        surfaceBounds.x,
        surfaceBounds.y,
        width,
        height,
      ];
      const reuseBase =
        baseContext &&
        nextBaseKey.length === baseKey.length &&
        nextBaseKey.every((value, index) => value === baseKey[index]);
      if (reuseBase) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(baseCanvas, 0, 0, width, height, 0, 0, width, height);
        context.setTransform(2, 0, 0, 2, 0, 0);
        context.save();
        context.translate(origin.x, origin.y);
        context.scale(zoom, zoom);
      } else {
        // Image, checkerboard, grids and outline share one raster coordinate map.
        // Keep the border below decorators so handles remain visible above it.
        context.fillStyle = assets.style.colors.editor_sprite_border;
        context.fillRect(rasterBounds.x - 1, rasterBounds.y - 1, rasterBounds.width + 2, 1);
        context.fillRect(rasterBounds.x - 1, bottom, rasterBounds.width + 2, 1);
        context.fillRect(rasterBounds.x - 1, rasterBounds.y, 1, rasterBounds.height);
        context.fillRect(right, rasterBounds.y, 1, rasterBounds.height);
        context.fillStyle = assets.style.colors.editor_sprite_bottom_border;
        context.fillRect(rasterBounds.x - 1, bottom + 1, rasterBounds.width + 2, 1);
        context.save();
        context.translate(origin.x, origin.y);
        context.scale(zoom, zoom);
        context.save();
        context.setTransform(CANVAS_BACKING_SCALE, 0, 0, CANVAS_BACKING_SCALE, 0, 0);
        context.beginPath();
        context.rect(rasterBounds.x, rasterBounds.y, rasterBounds.width, rasterBounds.height);
        context.clip();
        context.translate(origin.x, origin.y);
        context.scale(zoom, zoom);
        paintCheckerboard(context, displayPreferences, tileBounds, origin, zoom, v, rasterBounds);
        if (tiledMode || !drawReferenceViewport(context, origin, v, CANVAS_BACKING_SCALE)) {
          if (
            imageRevision !== state.pixelRevision ||
            imageTiled !== Boolean(tiledMode) ||
            imageBorrowMode !== borrowRaster ||
            imageRasterScale !== zoom * CANVAS_BACKING_SCALE ||
            imageProfile !== workingColorProfile(doc.timeline) ||
            imageFloating !== state.floatingPaste ||
            imageInline !== state.inlineText ||
            imagePreview !== state.preview ||
            imageLinePreview !== state.linePreview ||
            (state.preview && imageSettings !== state.settings) ||
            (state.linePreview && imageSettings !== state.settings)
          ) {
            const raster = tiledMode
              ? { pixels: editor.previewComposite(), x: 0, y: 0 }
              : editor.previewRaster(borrowRaster);
            const image = convertPixelsToSrgb(raster.pixels, workingColorProfile(doc.timeline));
            const upload = rasterUploadLayout(raster, doc, zoom * CANVAS_BACKING_SCALE);
            const uploadWidth = Math.max(1, upload.width);
            const uploadHeight = Math.max(1, upload.height);
            const sameSource =
              imageData?.data.buffer === image.data.buffer &&
              imageData.data.byteOffset === image.data.byteOffset &&
              imageData.width === image.width &&
              imageData.height === image.height;
            const sameGeometry =
              imageCanvas.width === uploadWidth &&
              imageCanvas.height === uploadHeight &&
              imageX === upload.x &&
              imageY === upload.y &&
              imageWriteX === upload.writeX &&
              imageWriteY === upload.writeY;
            if (imageCanvas.width !== uploadWidth) imageCanvas.width = uploadWidth;
            if (imageCanvas.height !== uploadHeight) imageCanvas.height = uploadHeight;
            if (!sameSource)
              imageData = new ImageData(
                image.data as Uint8ClampedArray<ArrayBuffer>,
                image.width,
                image.height,
              );
            const change = state.rasterChange;
            const unchangedPixels =
              sameSource &&
              sameGeometry &&
              imageRevision === state.pixelRevision &&
              imageProfile === workingColorProfile(doc.timeline);
            if (unchangedPixels) {
              rasterUploadMode = RasterUploadDiagnosticMode.Unchanged;
              // New pointer/preview descriptors can still refer to the same
              // unchanged raster. Keep the existing upload in that case.
            } else if (
              sameSource &&
              sameGeometry &&
              upload.width > 0 &&
              upload.height > 0 &&
              image === raster.pixels &&
              change?.pixels === raster.pixels &&
              change.fromRevision <= imageRevision &&
              change.revision === state.pixelRevision
            ) {
              rasterUploadMode = RasterUploadDiagnosticMode.Partial;
              const bounds = change.bounds;
              imageContext.putImageData(
                imageData!,
                upload.writeX,
                upload.writeY,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
              );
            } else {
              rasterUploadMode = RasterUploadDiagnosticMode.Full;
              imageContext.clearRect(0, 0, uploadWidth, uploadHeight);
              if (upload.width && upload.height)
                imageContext.putImageData(imageData!, upload.writeX, upload.writeY);
            }
            imageX = upload.x;
            imageY = upload.y;
            imageWriteX = upload.writeX;
            imageWriteY = upload.writeY;
            imageRasterScale = zoom * CANVAS_BACKING_SCALE;
            imageTiled = Boolean(tiledMode);
            imageBorrowMode = borrowRaster;
            imageProfile = workingColorProfile(doc.timeline);
            imageRevision = state.pixelRevision;
            imageFloating = state.floatingPaste;
            imageInline = state.inlineText;
            imagePreview = state.preview;
            imageLinePreview = state.linePreview;
            imageSettings = state.settings;
          }
          for (const tile of tiles.tiles)
            context.drawImage(
              imageCanvas,
              tile.x - tiles.mainTile.x + imageX,
              tile.y - tiles.mainTile.y + imageY,
            );
        }
        if (state.view.pixelGrid) {
          const pixelGrid = libreSpritePixelGridGeometry(
            tileBounds,
            origin,
            zoom,
            {
              x: 0,
              y: 0,
              width: v.width,
              height: v.height,
            },
            displayPreferences.pixelGridOpacity,
            displayPreferences.pixelGridAutoOpacity,
          );
          if (pixelGrid.lines.length) {
            context.save();
            context.setTransform(2, 0, 0, 2, 0, 0);
            context.beginPath();
            context.rect(rasterBounds.x, rasterBounds.y, rasterBounds.width, rasterBounds.height);
            context.clip();
            context.globalAlpha = pixelGrid.alpha / UINT8_MAX;
            context.fillStyle = displayPreferences.pixelGridColor;
            paintGridLines(context, pixelGrid.lines, rasterBounds);
            context.restore();
          }
        }
        if (state.view.grid) {
          const gridOrigin = {
            x: origin.x + tileBounds.x * zoom,
            y: origin.y + tileBounds.y * zoom,
          };
          const grid = libreSpriteGridGeometry(
            tiles,
            gridOrigin,
            zoom,
            {
              width: state.view.gridWidth,
              height: state.view.gridHeight,
            },
            displayPreferences.gridOpacity,
            displayPreferences.gridAutoOpacity,
          );
          if (grid.lines.length) {
            grid.bounds = rasterBounds;
            grid.lines = offsetGridLines(grid.bounds, gridOrigin, zoom, {
              x: (state.view.gridX ?? 0) + tiles.mainTile.x,
              y: (state.view.gridY ?? 0) + tiles.mainTile.y,
              width: state.view.gridWidth,
              height: state.view.gridHeight,
            });
            context.save();
            context.setTransform(2, 0, 0, 2, 0, 0);
            context.beginPath();
            context.rect(grid.bounds.x, grid.bounds.y, grid.bounds.width, grid.bounds.height);
            context.clip();
            context.globalAlpha = grid.alpha / UINT8_MAX;
            context.fillStyle = displayPreferences.gridColor;
            // Aseprite horizontal lines precede vertical lines; intersections blend
            // twice, so do not merge these rectangles into a single filled path.
            paintGridLines(context, grid.lines, rasterBounds);
            context.restore();
          }
        }
        context.restore();
        if (baseContext) {
          resizeCanvasBuffer(baseCanvas, width, height, CANVAS_BUFFER_BLOCK_SIZE);
          baseContext.setTransform(1, 0, 0, 1, 0, 0);
          baseContext.drawImage(sourceCanvas, 0, 0, width, height, 0, 0, width, height);
          baseKey = nextBaseKey;
        }
      }
      const outline = (path: Path2D, dashed = false) => {
        context.lineWidth = 1 / zoom;
        context.strokeStyle = "#000";
        context.setLineDash([]);
        context.stroke(path);
        context.lineWidth = 0.5 / zoom;
        context.strokeStyle = "#fff";
        context.setLineDash(dashed ? [3 / zoom, 3 / zoom] : []);
        context.lineDashOffset = -((Date.now() / 120) % 6) / zoom;
        context.stroke(path);
        context.setLineDash([]);
      };
      const outlineBrushBoundary = (edges: readonly [number, number, number, number][]) => {
        // BrushPreview's default mask cursor uses one contrast color per edge.
        const sampled = new Map<number, boolean>();
        context.setLineDash([]);
        for (const [x1, y1, x2, y2] of edges) {
          const horizontal = y1 === y2;
          const sampleX = Math.floor((origin.x + (x1 + x2) * 0.5 * zoom) * 2);
          const sampleY = Math.floor((origin.y + (y1 + y2) * 0.5 * zoom) * 2);
          const key = sampleY * width + sampleX;
          let white: boolean;
          const cached = sampled.get(key);
          if (cached !== undefined) white = cached;
          else {
            const pixel =
              sampleX >= 0 && sampleY >= 0 && sampleX < width && sampleY < height
                ? context.getImageData(sampleX, sampleY, 1, 1).data
                : [0, 0, 0, 0];
            white = cursorNeedsWhite(pixel[0], pixel[1], pixel[2]);
            sampled.set(key, white);
          }
          context.fillStyle = paintingColor ?? (white ? "#fff" : "#000");
          if (horizontal) context.fillRect(x1, y1 - 0.5 / zoom, x2 - x1, 1 / zoom);
          else context.fillRect(x1 - 0.5 / zoom, y1, 1 / zoom, y2 - y1);
        }
      };
      const allowLayerEdges = !state.preview || state.preview.tool === "move" || !!pan;
      const autoGuides = getAutoCelGuides(doc, {
        enabled: state.view.guides && !floating,
        tool: state.settings.tool,
        modifierActive: autoGuidesModifier,
        pointer: inside ? state.pointer : null,
        allowLayerEdges,
        screenScale: zoom,
      });
      if (allowLayerEdges && (state.view.layerEdges || autoGuides.showBounds)) {
        const edges = documentLayerEdgeGeometry(
          {
            x: doc.layer.x,
            y: doc.layer.y,
            width: doc.layer.pixels.width,
            height: doc.layer.pixels.height,
          },
          origin,
          zoom,
        );
        context.save();
        context.setTransform(2, 0, 0, 2, 0, 0);
        context.fillStyle =
          state.settings.layerEdgesColor ?? DEFAULT_GUIDE_SLICE_PREFERENCES.layerEdgesColor;
        for (const edge of edges) context.fillRect(edge.x, edge.y, edge.width, edge.height);
        context.restore();
        const timeline = doc.timeline;
        const cel = timeline?.frames[timeline.activeFrame]?.cels[timeline.activeLayer];
        const set = timeline?.tilesets?.find((item) => item.id === activeTimelineLayer?.tilesetId);
        const tileScreenHeight = (set?.tileHeight ?? 0) * zoom;
        const fontSize = uiFontHeight() / 2;
        const lineHeight = fontSize + 1;
        if (
          assets &&
          (state.view.tileNumbers ?? true) &&
          activeTimelineLayer?.kind === "tilemap" &&
          cel?.tilemap &&
          set &&
          tileScreenHeight > lineHeight
        ) {
          const visible = {
            x: -origin.x / zoom,
            y: -origin.y / zoom,
            width: v.width / zoom,
            height: v.height / zoom,
          };
          const labels = tileNumberLabels(
            cel.tilemap,
            set.baseIndex,
            cel.x,
            cel.y,
            set.tileWidth,
            set.tileHeight,
            visible,
          );
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.beginPath();
          context.rect(0, 0, v.width * 2, v.height * 2);
          context.clip();
          for (const label of labels) {
            const cx = Math.trunc(origin.x + (label.x + set.tileWidth / 2) * zoom);
            const cy = Math.trunc(origin.y + (label.y + set.tileHeight / 2) * zoom);
            const paint = (value: string, y: number) => {
              const width = measureUiText(value);
              const x = cx * 2 - Math.trunc(width / 2);
              context.fillStyle = autoGuidesColor;
              context.fillRect(x, y, width, lineHeight * 2);
              paintUiText(context, assets, value, x, y, { font: "default", color: guideTextColor });
            };
            const numberY = Math.trunc((cy - fontSize / 2) * 2);
            paint(label.number, numberY);
            if (label.flags && tileScreenHeight > 2 * lineHeight)
              paint(label.flags, numberY + lineHeight * 2);
          }
          context.restore();
        }
      }
      if (autoGuides.comparisonBounds) {
        context.save();
        context.setTransform(2, 0, 0, 2, 0, 0);
        context.fillStyle = autoGuidesColor;
        for (const edge of documentLayerEdgeGeometry(autoGuides.comparisonBounds, origin, zoom))
          context.fillRect(edge.x, edge.y, edge.width, edge.height);
        context.restore();
      }
      for (const guide of autoGuides.measurements) {
        const geometry = documentAutoGuideGeometry(guide, origin, zoom, doc),
          line = geometry.line;
        context.save();
        context.setTransform(2, 0, 0, 2, 0, 0);
        context.fillStyle = autoGuidesColor;
        context.fillRect(line.x, line.y, line.width, line.height);
        const extension = geometry.extension;
        if (extension)
          for (
            let y = Math.max(0, extension.y);
            y < Math.min(v.height, extension.y + extension.height);
            y++
          )
            for (
              let x = Math.max(0, extension.x);
              x < Math.min(v.width, extension.x + extension.width);
              x++
            ) {
              if (documentGuideDashVisible(x + surfaceBounds.x / 2, y + surfaceBounds.y / 2))
                context.fillRect(x, y, 1, 1);
            }
        if (assets) {
          const text = `${guide.distance}px`,
            width = measureUiText(text, "default"),
            height = 14;
          const x =
            guide.axis === "horizontal"
              ? geometry.midpoint - Math.trunc(width / 4)
              : geometry.position;
          const y =
            guide.axis === "horizontal"
              ? geometry.position - height / 2
              : geometry.midpoint - Math.trunc(height / 4);
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.fillRect(x * 2, y * 2, width, height);
          paintUiText(context, assets, text, x * 2, y * 2, {
            font: "default",
            color: guideTextColor,
          });
        }
        context.restore();
      }
      const inline = state.inlineText;
      if (inline) {
        const border = new Path2D();
        border.rect(inline.bounds.x, inline.bounds.y, inline.bounds.width, inline.bounds.height);
        outline(border, true);
        const a = inline.advances[inline.selectionStart] ?? 0,
          b = inline.advances[inline.selectionEnd] ?? a;
        context.save();
        if (a !== b) {
          context.globalCompositeOperation = "difference";
          context.fillStyle = "#ffffff";
          context.fillRect(
            inline.bounds.x + Math.min(a, b),
            inline.bounds.y,
            Math.abs(b - a),
            inline.pixels.height,
          );
        } else if (Math.floor(Date.now() / 500) % 2 === 0) {
          context.fillStyle = "#000000";
          context.fillRect(inline.bounds.x + a, inline.bounds.y, 1 / zoom, inline.pixels.height);
        }
        context.restore();
      }
      const selectionGesture =
        state.preview && isSelectionTool(state.preview.tool) ? state.preview : null;
      if (
        selectionGesture &&
        (selectionPreviewSource !== selectionGesture ||
          selectionPreviewSettings !== state.settings ||
          selectionPreviewBase !== doc.selection)
      ) {
        selectionPreviewMask = editor.previewSelection();
        selectionPreviewSource = selectionGesture;
        selectionPreviewSettings = state.settings;
        selectionPreviewBase = doc.selection;
      }
      if (!selectionGesture) selectionPreviewSource = null;
      const selection =
        state.preview?.tool === CanvasToolId.Move || (floating && !state.selectionTransform)
          ? null
          : selectionGesture
            ? selectionPreviewMask
            : doc.selection;
      if (selection !== selectionCache) {
        selectionCache = selection;
        selectionDocumentSegments = selection ? selectionBoundarySegments(selection) : [];
        selectionScreenSource = null;
        // A cleared mask is also represented by null. Reset the projected
        // boundary now, since the projection cache sees null as unchanged.
        selectionScreenSegments = [];
      }
      if (
        selectionScreenSource !== selection ||
        selectionScreenOrigin.x !== origin.x ||
        selectionScreenOrigin.y !== origin.y ||
        selectionScreenZoom !== zoom
      ) {
        selectionScreenSource = selection;
        selectionScreenOrigin = { x: origin.x, y: origin.y };
        selectionScreenZoom = zoom;
        selectionScreenSegments = projectSelectionBoundarySegments(
          selectionDocumentSegments,
          origin,
          zoom,
        );
      }
      const showSelectionEdges = state.view.selectionEdges || !!selectionGesture;
      syncAntsPhase(showSelectionEdges && selectionScreenSegments.length > 0);
      drawSelectionBoundary(
        showSelectionEdges ? selectionScreenSegments : [],
        selectionShaderOffset(v, doc, zoom, origin),
      );
      if (showSelectionEdges && selectionScreenSegments.length)
        antsState = paintAsepriteSelectionAnts(antsState).state;
      if (floating && !state.selectionTransform) {
        const border = new Path2D();
        border.rect(floating.x, floating.y, floating.pixels.width, floating.pixels.height);
        outline(border, true);
      }
      if (doc.timeline && state.view.slices !== false) {
        const selected = state.selectedSliceIds ?? [],
          line = 1 / zoom;
        context.save();
        context.lineWidth = line;
        for (const slice of doc.timeline.slices ?? []) {
          const key = sliceKeyAt(slice, doc.timeline.activeFrame);
          if (!key) continue;
          const b = key.bounds,
            hex = (
              slice.color ??
              state.settings.defaultSliceColor ??
              DEFAULT_GUIDE_SLICE_PREFERENCES.defaultSliceColor
            ).replace(/^#/, ""),
            red = Number.parseInt(hex.slice(0, 2), 16) || 0,
            green = Number.parseInt(hex.slice(2, 4), 16) || 0,
            blue = Number.parseInt(hex.slice(4, 6), 16) || 0,
            alpha = hex.length >= 8 ? Number.parseInt(hex.slice(6, 8), 16) : UINT8_MAX;
          context.fillStyle = `rgba(${red},${green},${blue},${alpha / 1020})`;
          context.strokeStyle = context.fillStyle;
          if (key.center) {
            const c = key.center,
              x = b.x + c.x,
              y = b.y + c.y;
            for (const xx of [x, x + c.width])
              if (xx > b.x && xx < b.x + b.width) context.fillRect(xx, b.y, line, b.height);
            for (const yy of [y, y + c.height])
              if (yy > b.y && yy < b.y + b.height) context.fillRect(b.x, yy, b.width, line);
          }
          if (key.pivot) context.strokeRect(b.x + key.pivot.x, b.y + key.pivot.y, 1, 1);
          if (state.settings.tool === "slice" && selected.includes(slice.id)) {
            const bounds = canvasRasterBounds(b, origin, zoom);
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0);
            paintUiPart(
              context,
              assets,
              "colorbar_selection",
              bounds.x * CANVAS_BACKING_SCALE,
              bounds.y * CANVAS_BACKING_SCALE,
              bounds.width * CANVAS_BACKING_SCALE,
              bounds.height * CANVAS_BACKING_SCALE,
              { drawCenter: false },
            );
            context.restore();
          } else {
            context.fillStyle = `rgba(${red},${green},${blue},${alpha / UINT8_MAX})`;
            context.fillRect(b.x, b.y, b.width, line);
            context.fillRect(b.x, b.y + b.height - line, b.width, line);
            context.fillRect(b.x, b.y, line, b.height);
            context.fillRect(b.x + b.width - line, b.y, line, b.height);
          }
        }
        if (state.settings.tool === "slice" && state.sliceMark) {
          const b = state.sliceMark;
          context.strokeStyle = "#ffec57";
          context.setLineDash([3 / zoom, 2 / zoom]);
          context.strokeRect(b.x, b.y, b.width, b.height);
        }
        context.restore();
      }
      if (assets && state.settings.symmetryEnabled && state.view.symmetryMode) {
        const [red, green, blue, alpha] = parseEditorColor(displayPreferences.gridColor);
        const auxiliaryAlpha = Math.floor(alpha / SYMMETRY_AUXILIARY_ALPHA_DIVISOR);
        const symmetry = currentSymmetry(),
          mode = resolveSymmetryMode(symmetry.mode),
          ax = Math.trunc(origin.x) + Math.trunc(symmetry.x * zoom),
          ay = Math.trunc(origin.y) + Math.trunc(symmetry.y * zoom);
        const left = origin.x + tileBounds.x * zoom,
          top = origin.y + tileBounds.y * zoom,
          right = left + tileBounds.width * zoom,
          bottom = top + tileBounds.height * zoom;
        context.save();
        context.setTransform(2, 0, 0, 2, 0, 0);
        context.beginPath();
        context.rect(left, top, right - left, bottom - top);
        context.clip();
        const line = (bit: number, from: Point, to: Point) => {
          const clipped = clipSymmetryLine(from, to, {
            x: Math.max(0, left),
            y: Math.max(0, top),
            width: Math.min(v.width, right) - Math.max(0, left),
            height: Math.min(v.height, bottom) - Math.max(0, top),
          });
          if (!clipped) return;
          [from, to] = clipped;
          context.fillStyle = `rgba(${red},${green},${blue},${(symmetry.mode & bit ? alpha : auxiliaryAlpha) / UINT8_MAX})`;
          const dx = Math.abs(Math.trunc(to.x) - Math.trunc(from.x)),
            dy = Math.abs(Math.trunc(to.y) - Math.trunc(from.y)),
            sx = from.x < to.x ? 1 : -1,
            sy = from.y < to.y ? 1 : -1;
          let x = Math.trunc(from.x),
            y = Math.trunc(from.y),
            err = dx - dy;
          for (;;) {
            context.fillRect(x, y, 1, 1);
            if (x === Math.trunc(to.x) && y === Math.trunc(to.y)) break;
            const e = 2 * err;
            if (e > -dy) {
              err -= dy;
              x += sx;
            }
            if (e < dx) {
              err += dx;
              y += sy;
            }
          }
        };
        if (mode & 1) line(1, { x: ax, y: top }, { x: ax, y: bottom });
        if (mode & 2) line(2, { x: left, y: ay }, { x: right, y: ay });
        const reach = Math.max(right - left, bottom - top) * 2;
        if (mode & 4) line(4, { x: ax - reach, y: ay + reach }, { x: ax + reach, y: ay - reach });
        if (mode & 8) line(8, { x: ax - reach, y: ay - reach }, { x: ax + reach, y: ay + reach });
        context.restore();
        context.save();
        context.setTransform(2, 0, 0, 2, 0, 0);
        const part = assets.style.parts.transformation_handle;
        for (const h of symmetryTargets()) {
          const r = h.bounds;
          context.drawImage(
            assets.sheet,
            part.x,
            part.y,
            part.width,
            part.height,
            r.x,
            r.y,
            r.width,
            r.height,
          );
        }
        context.restore();
      }
      if (
        assets &&
        isSelectionTool(state.settings.tool) &&
        !state.preview &&
        doc.selection &&
        doc.layer.visible &&
        (!doc.layer.locked ||
          (doc.timeline?.layers[doc.timeline.activeLayer].kind === "group" &&
            canTransformTimelineSelection(
              doc,
              state.settings.selectionMulticelWhenLayersOrFrames !== false,
            )))
      ) {
        context.save();
        context.setTransform(2, 0, 0, 2, 0, 0);
        const part = assets.style.parts.transformation_handle;
        for (const target of transformTargets()) {
          if (target.handle === "pivot") {
            const pivotPart = assets.style.parts.pivot_handle;
            context.drawImage(
              assets.sheet,
              pivotPart.x,
              pivotPart.y,
              pivotPart.width,
              pivotPart.height,
              target.screen.x - 2.5,
              target.screen.y - 2.5,
              5,
              5,
            );
            continue;
          }
          const r = handleRect(target.screen.x, target.screen.y, 5, target.angle);
          context.drawImage(assets.sheet, part.x, part.y, part.width, part.height, r.x, r.y, 5, 5);
        }
        context.restore();
      }
      // Deferred paint tools are rasterized by previewComposite(). Selection
      // gestures use the same pixel-mask boundary renderer as committed masks;
      // avoid a second synthetic path hiding the actual document pixels.
      const gesture = floating ? null : state.preview;
      if (gesture?.tool === "text" && gesture.points.length) {
        const first = gesture.points[0],
          last = gesture.points[gesture.points.length - 1];
        const x = Math.min(first.x, last.x),
          y = Math.min(first.y, last.y),
          width = Math.abs(last.x - first.x) + 1,
          height = Math.abs(last.y - first.y) + 1,
          box = new Path2D(),
          outside = new Path2D();
        box.rect(x, y, width, height);
        outside.rect(-origin.x / zoom, -origin.y / zoom, v.width / zoom, v.height / zoom);
        outside.rect(x, y, width, height);
        context.save();
        context.fillStyle = "rgba(0,0,0,0.502)";
        context.fill(outside, "evenodd");
        context.restore();
        context.save();
        context.lineWidth = 1 / zoom;
        context.strokeStyle = "#fff";
        context.setLineDash([]);
        context.stroke(box);
        context.restore();
      }
      if (
        inside &&
        !pan &&
        quickTool !== CanvasToolId.Hand &&
        !floating &&
        !state.preview &&
        doc.layer.visible &&
        !doc.layer.locked &&
        state.view.brushPreview &&
        state.pointer &&
        paintingActive &&
        state.settings.tool !== "gradient"
      ) {
        if (previewGeometry && (previewPolicy.fill || previewPolicy.edges)) {
          const { mask: m, at } = previewGeometry;
          const path = new Path2D();
          const boundaryEdges: [number, number, number, number][] = [];
          const has = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < m.width && y < m.height && !!m.data[y * m.width + x];
          for (let y = 0; y < m.height; y++)
            for (let x = 0; x < m.width; x++)
              if (has(x, y)) {
                const px = at.x + m.x + x,
                  py = at.y + m.y + y;
                if (!doc.selection || maskContains(doc.selection, { x: px, y: py }))
                  path.rect(px, py, 1, 1);
                if (!has(x, y - 1)) boundaryEdges.push([px, py, px + 1, py]);
                if (!has(x, y + 1)) boundaryEdges.push([px, py + 1, px + 1, py + 1]);
                if (!has(x - 1, y)) boundaryEdges.push([px, py, px, py + 1]);
                if (!has(x + 1, y)) boundaryEdges.push([px + 1, py, px + 1, py + 1]);
              }
          if (previewPolicy.fill && hoverContext) {
            const raster = cursorPreviewRaster(state, previewGeometry);
            if (raster) {
              hoverCanvas.width = raster.width;
              hoverCanvas.height = raster.height;
              hoverContext.putImageData(
                new ImageData(
                  raster.pixels.data as Uint8ClampedArray<ArrayBuffer>,
                  raster.width,
                  raster.height,
                ),
                0,
                0,
              );
              context.save();
              context.clip(path);
              paintCheckerboard(
                context,
                displayPreferences,
                tileBounds,
                origin,
                zoom,
                v,
                rasterBounds,
              );
              context.drawImage(hoverCanvas, raster.x, raster.y);
              context.restore();
            }
          }
          if (previewPolicy.edges) outlineBrushBoundary(boundaryEdges);
        }
      }
      context.restore();
      if (
        selectionActive &&
        !simpleCrosshair &&
        !symmetryDrag &&
        !axisHover &&
        inside &&
        previewGeometry
      ) {
        const point = documentToScreen(previewGeometry.at, v, doc, state.view);
        paintSelectionCross(
          context,
          Math.floor(point.x),
          Math.floor(point.y),
          state.view.zoom,
          paintingScale,
          paintingColor,
        );
      }
      if (touchColorPreview) {
        const preview = touchColorPreview;
        const left = Math.max(
          0,
          Math.min(
            v.width - TOUCH_COLOR_PREVIEW_WIDTH,
            preview.screen.x - TOUCH_COLOR_PREVIEW_WIDTH / 2,
          ),
        );
        const top = Math.max(
          0,
          preview.screen.y - TOUCH_COLOR_PREVIEW_HEIGHT - TOUCH_COLOR_PREVIEW_OFFSET,
        );
        context.save();
        context.setTransform(CANVAS_BACKING_SCALE, 0, 0, CANVAS_BACKING_SCALE, 0, 0);
        context.fillStyle = assets.style.colors.editor_face;
        context.fillRect(left, top, TOUCH_COLOR_PREVIEW_WIDTH, TOUCH_COLOR_PREVIEW_HEIGHT);
        context.strokeStyle = assets.style.colors.text;
        context.strokeRect(
          left + 0.5,
          top + 0.5,
          TOUCH_COLOR_PREVIEW_WIDTH - 1,
          TOUCH_COLOR_PREVIEW_HEIGHT - 1,
        );
        const [red, green, blue, alpha] = preview.color;
        context.fillStyle = `rgba(${red},${green},${blue},${alpha / UINT8_MAX})`;
        context.fillRect(left + 3, top + 3, TOUCH_COLOR_PREVIEW_WIDTH - 6, 10);
        paintUiText(context, assets, `${preview.pixel.x}, ${preview.pixel.y}`, left + 3, top + 15, {
          color: assets.style.colors.text,
        });
        context.restore();
      }
      present();
      if (lastPresentedDocument !== doc.id || lastPresentedRevision !== state.pixelRevision) {
        canvasInputPort.debugInput("canvas-presented", undefined, {
          extra: {
            documentId: doc.id,
            pixelRevision: state.pixelRevision,
            persistenceRevision: state.persistenceRevision,
            preview: !!state.preview,
            imageRevision,
            rasterUploadMode,
            reuseBase: !!reuseBase,
            rasterChange: state.rasterChange
              ? {
                  fromRevision: state.rasterChange.fromRevision,
                  revision: state.rasterChange.revision,
                  bounds: state.rasterChange.bounds,
                }
              : null,
            drawing: editor.getDrawingDiagnostics(),
            durationMs: performance.now() - drawStartedAt,
          },
        });
        lastPresentedDocument = doc.id;
        lastPresentedRevision = state.pixelRevision;
      }
      updatePaintingCursor();
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (gesture || floating || state.inlineText) timer = setTimeout(schedule, 100);
      if (selectionScreenSegments.length) {
        if (!antsTimer) antsTimer = setTimeout(antsTick, 100);
      } else if (antsTimer) {
        clearTimeout(antsTimer);
        antsTimer = undefined;
      }
    };
    const anchorZoom = (screen: Point, zoom: number) => {
      editor.zoomTo(zoom, viewport(), {
        x: Math.floor(screen.x),
        y: Math.floor(screen.y),
      });
    };
    const traceInput = (
      kind: string,
      event?: PointerEvent,
      extra: Record<string, unknown> = {},
    ) => {
      try {
        const state = getSnapshot();
        canvasInputPort.debugInput(kind, event, {
          state: {
            documentId: state.document?.id,
            documentWidth: state.document?.width,
            documentHeight: state.document?.height,
            zoom: state.view.zoom,
            panOffset: state.view.pan,
            tool: state.settings.tool,
            foreground: state.settings.foreground,
            opacity: state.settings.opacity,
            brush: { shape: state.settings.brush.shape, size: state.settings.brush.size },
            drawing: editor.getDrawingDiagnostics(),
            pixelRevision: state.pixelRevision,
            persistenceRevision: state.persistenceRevision,
            preview: !!state.preview,
            selection: !!state.document?.selection,
            floating: !!state.floatingPaste,
            transform: !!state.selectionTransform,
            inlineText: !!state.inlineText,
            layerLocked: state.document?.layer.locked,
            layerVisible: state.document?.layer.visible,
            playing: state.playing,
            activePointer,
            pan: !!pan,
            stagedTouch: !!stagedTouch,
            touchPick: !!touchPick,
            symmetryDrag: !!symmetryDrag,
            arbitration: pointers.getDiagnosticSnapshot(),
          },
          extra,
        });
      } catch {
        // Input diagnostics must never affect contact ownership or ink.
      }
    };
    const interruptPointer = (preserveStroke = false) => {
      traceInput("interrupt-pointer", undefined, { preserveStroke });
      if (
        activePointer !== null &&
        !pan &&
        !stagedTouch &&
        !touchPick &&
        !symmetryDrag &&
        !zoomGesture &&
        !shortcutDrag &&
        !(preserveStroke && editor.finishInterruptedGesture())
      )
        editor.cancelPointerGesture();
      if (touchPick?.timer !== null && touchPick?.timer !== undefined)
        window.clearTimeout(touchPick.timer);
      touchPick = null;
      touchColorPreview = null;
      if (symmetryDrag)
        editor.setView(
          symmetryDrag.axis === "x"
            ? { symmetryX: symmetryDrag.initial }
            : { symmetryY: symmetryDrag.initial },
        );
      symmetryDrag = null;
      zoomGesture = null;
      shortcutDrag = null;
      stagedTouch = null;
      flushView();
      pan = null;
      activePointer = null;
      previousDragPoint = null;
      constrainDragInput = false;
      traceInput("after-interrupt-pointer");
    };
    const down = (event: PointerEvent) => {
      traceInput("pointerdown", event);
      if (event.button > 2) {
        traceInput("pointerdown-ignored", event, { reason: "unsupported-button" });
        return;
      }
      // Handwriting can extend beyond the semantic input into the move region.
      // Reserve primary pen contacts for native text entry while a draft is open.
      if (
        event.pointerType === "pen" &&
        event.button === 0 &&
        getSnapshot().inlineText &&
        quickTool !== CanvasToolId.Hand
      ) {
        traceInput("pointerdown-ignored", event, { reason: "native-text-input" });
        return;
      }
      if (event.pointerType !== "mouse") event.preventDefault();
      // Update modifiers before hit testing; selection modifiers may hide handles.
      updateActionIndicators(event);
      inside = true;
      syncQuickTool(true);
      startShortcutDrag(guiPoint(event), true);
      const beforeStart = getSnapshot();
      const target =
        event.pointerType === "touch"
          ? resolveCanvasPointerTarget(
              beforeStart,
              input(event, false),
              !!hitTransform(guiPoint(event)) || !!hitSymmetry(guiPoint(event)),
            )
          : CanvasPointerTarget.Surface;
      const start = pointers.begin(event, target);
      traceInput("pointerdown-route", event, start);
      if (start.action === "ignore") {
        // Receive the eventual release even when an ignored palm leaves the canvas.
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      sliceTouchStart = null;
      mousePress = null;
      handledDoubleClick = false;
      clickCount = 1;
      optionModifier = event.altKey;
      pointerScreen = screenPoint(event);
      inside = true;
      updateActionIndicators(event);
      if (start.interrupt) {
        interruptPointer();
        if (event.pointerType !== "touch") {
          touchPoints.clear();
          touchSession = null;
          historyGesture.cancel();
        }
      }
      const hadInlineText = !!getSnapshot().inlineText;
      if (hadInlineText) inlineTextInput.current?.focus({ preventScroll: true });
      else canvas.focus({ preventScroll: true });
      if (event.pointerType === "touch") {
        touchPoints.set(
          event.pointerId,
          createTouchContact(clientPoint(event).x, clientPoint(event).y, performance.now()),
        );
        canvas.setPointerCapture(event.pointerId);
        if (touchPoints.size > 1) {
          clicks.reset();
          if (!touchSession) {
            beginTouchSession();
          } else {
            touchSession.count = Math.max(touchSession.count, touchPoints.size);
            touchSession.transform = null;
            if (touchPoints.size > 3) touchSession.moved = true;
          }
          updateTouchSession();
          schedule();
          return;
        }
      }
      canvas.setPointerCapture(event.pointerId);
      activePointer = event.pointerId;
      if (shortcutDrag) return;
      const pressedState = getSnapshot();
      if (
        event.pointerType === "touch" &&
        pressedState.settings.tool === "slice" &&
        pressedState.document
      ) {
        const at = screenToDocument(
          screenPoint(event),
          viewport(),
          pressedState.document,
          pressedState.view,
        );
        sliceTouchStart = { x: Math.floor(at.x), y: Math.floor(at.y) };
      }
      syncQuickTool();
      previousDragPoint = guiPoint(event);
      constrainDragInput = false;
      if (getSnapshot().playing && event.button === 2) {
        editor.setPlaying(false);
        return;
      }
      if (
        event.button === 1 ||
        quickTool === CanvasToolId.Hand ||
        editor.resolvePointerTool(input(event)) === "hand" ||
        getSnapshot().settings.tool === "hand" ||
        (getSnapshot().playing && getSnapshot().settings.tool !== "zoom")
      ) {
        pan = {
          pointer: event.pointerId,
          screen: guiPoint(event),
          origin: {
            x: Math.trunc(getSnapshot().view.pan.x),
            y: Math.trunc(getSnapshot().view.pan.y),
          },
        };
        schedule();
        return;
      }
      const state = getSnapshot();
      const draft = state.inlineText ?? state.floatingPaste;
      if (state.settings.tool === "slice" || isSelectionTool(state.settings.tool)) {
        if (event.pointerType === "mouse") {
          mousePress = event;
          return;
        }
        if (start.action === "pan" || (draft && target === CanvasPointerTarget.Surface))
          clicks.reset();
        else clickCount = clicks.press(event, state.settings.tool);
      }
      if (event.pointerType === "touch" && (draft || target === CanvasPointerTarget.Editable)) {
        stagedTouch = {
          intent: new StagedTouchIntent(event, target === CanvasPointerTarget.Editable),
          event,
          screen: guiPoint(event),
          origin: { ...state.view.pan },
        };
        return;
      }
      if (start.action === "pan" && event.pointerType === "touch") {
        stageTouchPick(event, true, state.settings.tool !== "slice");
        return;
      }
      if (event.pointerType === "touch" && state.settings.tool !== "slice") {
        stageTouchPick(event, false);
        return;
      }
      beginEditing(event);
      if (hadInlineText && !getSnapshot().inlineText) canvas.focus({ preventScroll: true });
    };
    const mouseDown = (event: MouseEvent) => {
      const press = mousePress;
      mousePress = null;
      if (!press || activePointer !== press.pointerId) return;
      event.preventDefault();
      clickCount = event.detail === 2 ? 2 : 1;
      beginEditing(press);
    };
    const forwardInlineTextMiddleDown = (event: PointerEvent) => {
      if (event.button === 1 && event.target === inlineTextInput.current) down(event);
    };
    const forwardInlineTextWheel = (event: WheelEvent) => {
      if (event.target === inlineTextInput.current) wheel(event);
    };
    const beginSymmetryDrag = (event: PointerEvent) => {
      const axisHandle = hitSymmetry(guiPoint(event));
      if (!axisHandle || event.button !== 0) return false;
      const state = getSnapshot(),
        doc = state.document!;
      symmetryDrag = {
        pointer: event.pointerId,
        axis: axisHandle.axis,
        start: screenToDocument(screenPoint(event), viewport(), doc, state.view),
        initial: axisHandle.axis === "x" ? currentSymmetry().x : currentSymmetry().y,
      };
      schedule();
      return true;
    };
    const moveSymmetryDrag = (event: PointerEvent) => {
      if (!symmetryDrag || symmetryDrag.pointer !== event.pointerId) return false;
      const state = getSnapshot(),
        doc = state.document;
      if (doc) {
        const p = screenToDocument(screenPoint(event), viewport(), doc, state.view),
          a = symmetryDrag.axis,
          value = symmetryAxisPosition(
            symmetryDrag.initial,
            p[a] - symmetryDrag.start[a],
            a === "x" ? doc.width : doc.height,
          );
        editor.setView(a === "x" ? { symmetryX: value } : { symmetryY: value });
      }
      schedule();
      return true;
    };
    const beginEditing = (event: PointerEvent) => {
      const startedAt = performance.now();
      const beforeRevision = getSnapshot().persistenceRevision;
      const stateBefore = getSnapshot();
      traceInput("begin-editing", event, {
        spritePoint: stateBefore.document
          ? screenToDocument(screenPoint(event), viewport(), stateBefore.document, stateBefore.view)
          : null,
      });
      try {
        const state = getSnapshot();
        if (state.settings.tool === "zoom") {
          zoomGesture = {
            pointer: event.pointerId,
            gesture: new CanvasZoomGesture(guiPoint(event), state.view.zoom, event.button),
          };
          return;
        }
        if (state.settings.tool !== "hand" && beginSymmetryDrag(event)) return;
        if (clickCount === 2 && quickTool !== CanvasToolId.Hand && !pan) {
          if (state.settings.tool === "slice") {
            handledDoubleClick = true;
            openSliceProperties(event);
            return;
          }
          if (
            isSelectionTool(state.settings.tool) &&
            state.settings.selectionDoubleClickSelectTile !== false
          ) {
            handledDoubleClick = true;
            editor.pointerDown({ ...input(event), clickCount: 2 });
            return;
          }
        }
        if (state.settings.tool === "slice") {
          if (event.button === 0) editor.pointerDown(input(event));
          return;
        }
        const hit = hitTransform(guiPoint(event));
        const handle = event.button === 2 ? null : hit;
        if (
          handle &&
          editor.beginSelectionTransform(
            handle,
            input(event),
            !!actionModifiers(event).copySelection,
          )
        ) {
          schedule();
          return;
        }
        editor.pointerDown(input(event));
      } finally {
        traceInput("after-begin-editing", event, {
          durationMs: performance.now() - startedAt,
          beforeRevision,
        });
      }
    };
    const move = (event: PointerEvent) => {
      clicks.move(event);
      const accepted = pointers.acceptsMove(event);
      canvasInputPort.debugInput("pointermove", event, {
        extra: {
          activePointer,
          accepted,
          preview: !!getSnapshot().preview,
          pixelRevision: getSnapshot().pixelRevision,
          stagedTouch: !!stagedTouch,
        },
      });
      if (!accepted) return;
      optionModifier = event.altKey;
      pointerScreen = screenPoint(event);
      updateActionIndicators(event);
      if (!shortcutDrag && activePointer === null) startShortcutDrag(guiPoint(event));
      if (shortcutDrag) {
        if (editor.isShortcutDragPressed(shortcutDrag, modifierKeys, space)) {
          editor.updateShortcutDrag(shortcutDrag, guiPoint(event));
          schedule();
          return;
        }
        shortcutDrag = null;
      }
      if (zoomGesture?.pointer === event.pointerId) {
        const zoom = zoomGesture.gesture.move(guiPoint(event));
        if (zoom !== null) anchorZoom(zoomGesture.gesture.origin, zoom);
        schedule();
        return;
      }
      if (moveSymmetryDrag(event)) return;

      if (event.pointerType === "touch") {
        const point = touchPoints.get(event.pointerId);
        if (!point) return;
        updateTouchContact(point, clientPoint(event).x, clientPoint(event).y, touchTapSlop);
        if (touchSession) {
          updateTouchSession();
          schedule();
          return;
        }
      }
      if (touchPick?.pointer === event.pointerId) {
        if (touchPick.active) {
          sampleTouchColor(event);
          return;
        }
        if (Math.hypot(clientPoint(event).x - touchPick.x, clientPoint(event).y - touchPick.y) < 9)
          return;
        const pending = touchPick;
        if (pending.timer !== null) window.clearTimeout(pending.timer);
        touchPick = null;
        const contact = touchPoints.get(event.pointerId);
        if (contact) contact.moved = true;
        if (pending.panOnMove) {
          pan = {
            pointer: event.pointerId,
            screen: guiPoint(pending.event),
            origin: { ...getSnapshot().view.pan },
          };
        } else beginEditing(pending.event);
      }
      if (stagedTouch) {
        const action = stagedTouch.intent.move(event);
        if (action === "wait") return;
        // Once a real drag activates, a following stationary second finger
        // cannot reinterpret the interrupted edit as a history tap.
        const contact = touchPoints.get(event.pointerId);
        if (contact) contact.moved = true;
        const pending = stagedTouch;
        stagedTouch = null;
        if (action === "pan")
          pan = { pointer: event.pointerId, screen: pending.screen, origin: pending.origin };
        else beginEditing(pending.event);
      }
      if (moveSymmetryDrag(event)) return;
      const previousGuideModifier = autoGuidesModifier;
      const previousQuickTool = quickTool;
      updateActionIndicators(event);
      const entered = !inside;
      inside = true;
      syncQuickTool();
      const previousHandle = hoveredTransform;
      hoveredTransform = hitTransform(guiPoint(event));
      if (previousHandle !== hoveredTransform) schedule();
      if (
        entered ||
        previousGuideModifier !== autoGuidesModifier ||
        previousQuickTool !== quickTool
      )
        schedule();
      if (pan) {
        const p = guiPoint(event);
        queueView({
          pan: {
            x: pan.origin.x + p.x - pan.screen.x,
            y: pan.origin.y + p.y - pan.screen.y,
          },
        });
      } else {
        const stateBeforeMove = getSnapshot(),
          at = guiPoint(event);
        if (
          autoScroll &&
          activePointer === event.pointerId &&
          previousDragPoint &&
          (stateBeforeMove.preview ||
            stateBeforeMove.floatingPaste ||
            stateBeforeMove.inlineText ||
            isSelectionTool(stateBeforeMove.settings.tool))
        ) {
          flushView();
          const next = canvasAutoScroll(previousDragPoint, at, getSnapshot().view.pan, viewport());
          constrainDragInput = true;
          if (
            next.pan.x !== stateBeforeMove.view.pan.x ||
            next.pan.y !== stateBeforeMove.view.pan.y
          )
            editor.setView({
              pan: stateBeforeMove.document
                ? clampCanvasPan(
                    next.pan,
                    viewport(),
                    stateBeforeMove.document,
                    stateBeforeMove.view.zoom,
                    stateBeforeMove.view.tiledMode,
                  )
                : next.pan,
            });
        }
        previousDragPoint = at;
        const next = input(event),
          state = getSnapshot();
        // Idle pointer publications carry only floored sprite coordinates.
        // Subpixel movement inside the same pixel cannot change its outline or
        // status. Keep active gestures and modifier/enter repaints untouched.
        if (
          activePointer === null &&
          !state.preview &&
          state.pointer?.x === Math.floor(next.x) &&
          state.pointer.y === Math.floor(next.y)
        ) {
          updatePaintingCursor();
          return;
        }
        const samples =
          event.pointerType === "pen" && activePointer === event.pointerId
            ? canvasInputPort.pointerSamples(event)
            : [event];
        for (const sample of samples) editor.pointerMove(sample === event ? next : input(sample));
      }
    };
    const up = (event: PointerEvent) => {
      traceInput("pointerup", event);
      // Some browsers coalesce the final displacement into pointerup only.
      if (stagedTouch && event.pointerId === activePointer) move(event);
      const accepted = pointers.end(event);
      traceInput("pointerup-route", event, { accepted });
      if (!accepted) return;
      updateActionIndicators(event);
      sliceTouchStart = null;
      clicks.release(event);
      mousePress = null;
      if (event.pointerType === "touch") {
        const point = touchPoints.get(event.pointerId);
        if (!point) return;
        updateTouchContact(point, clientPoint(event).x, clientPoint(event).y, touchTapSlop);
        if (touchSession) {
          updateTouchSession();
          if (touchPoints.size === 2 && touchSession.transform) {
            const transform = touchSession.transform;
            touchSession.transform = null;
            flushView();
            const state = getSnapshot();
            const snapped = state.document ? transform.finish(viewport(), state.view) : null;
            if (snapped) editor.setView(snapped);
          }
          historyGesture.release();
        }
        touchPoints.delete(event.pointerId);
        if (canvas.hasPointerCapture(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
        if (touchSession) {
          if (touchPoints.size === 0) {
            flushView();
            finishTouchSession();
          }
          schedule();
          return;
        }
      }
      if (activePointer !== event.pointerId) return;
      if (touchPick?.pointer === event.pointerId) {
        const pending = touchPick;
        if (pending.timer !== null) window.clearTimeout(pending.timer);
        touchPick = null;
        if (pending.active || pending.panOnMove) {
          if (!pending.active && pending.panOnMove)
            traceInput("navigation-tap", event, {
              dismissedSelection: editor.finishNavigationTap(input(pending.event)),
            });
          touchColorPreview = null;
          activePointer = null;
          previousDragPoint = null;
          constrainDragInput = false;
          schedule();
          return;
        }
        beginEditing(pending.event);
        if (Math.hypot(clientPoint(event).x - pending.x, clientPoint(event).y - pending.y) >= 3)
          editor.pointerMove(input(event));
      }
      const hadInlineText = !!getSnapshot().inlineText;
      if (stagedTouch) {
        const pending = stagedTouch;
        stagedTouch = null;
        if (pending.intent.tap() === "pan") {
          activePointer = null;
          previousDragPoint = null;
          constrainDragInput = false;
          if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
          schedule();
          return;
        }
        beginEditing(pending.event);
      }
      flushView();
      if (shortcutDrag) {
        editor.updateShortcutDrag(shortcutDrag, guiPoint(event));
        shortcutDrag = null;
      } else if (zoomGesture?.pointer === event.pointerId) {
        anchorZoom(zoomGesture.gesture.origin, zoomGesture.gesture.finish(guiPoint(event)));
        zoomGesture = null;
      } else if (symmetryDrag) symmetryDrag = null;
      else if (pan) pan = null;
      else {
        const startedAt = performance.now();
        const beforeRevision = getSnapshot().persistenceRevision;
        const stateBefore = getSnapshot();
        traceInput("stroke-end-start", event, {
          spritePoint: stateBefore.document
            ? screenToDocument(
                screenPoint(event),
                viewport(),
                stateBefore.document,
                stateBefore.view,
              )
            : null,
        });
        let completed = false;
        try {
          editor.pointerUp(input(event));
          completed = true;
        } finally {
          traceInput("stroke-end-completed", event, {
            completed,
            durationMs: performance.now() - startedAt,
            beforeRevision,
            revisionChanged: getSnapshot().persistenceRevision !== beforeRevision,
          });
        }
      }
      if (hadInlineText && !getSnapshot().inlineText) canvas.focus({ preventScroll: true });
      traceInput("after-pointerup", event);
      activePointer = null;
      previousDragPoint = null;
      constrainDragInput = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      syncQuickTool();
      schedule();
    };
    const cancel = (event?: PointerEvent, kind = "pointercancel") => {
      traceInput(kind, event);
      if (event) {
        const accepted = pointers.cancel(event);
        traceInput("pointercancel-route", event, { kind, accepted });
        if (!accepted) return;
      }
      sliceTouchStart = null;
      mousePress = null;
      clicks.reset();
      if (symmetryDrag) {
        editor.setView(
          symmetryDrag.axis === "x"
            ? { symmetryX: symmetryDrag.initial }
            : { symmetryY: symmetryDrag.initial },
        );
        symmetryDrag = null;
      }
      if (!event) pointers.reset();
      interruptPointer(!!event);
      syncQuickTool();
      touchPoints.clear();
      touchSession = null;
      historyGesture.cancel();
      // Escape remains the explicit command to discard staged editing.
      if (!event) editor.cancelGesture();
      schedule();
    };
    const gotCapture = (event: PointerEvent) => traceInput("gotpointercapture", event);
    const lostCapture = (event: PointerEvent) => cancel(event, "lostpointercapture");
    const leave = () => {
      inside = false;
      pointerScreen = null;
      updatePaintingCursor();
      hoveredTransform = null;
      syncQuickTool();
      if (activePointer === null) editor.clearPointer();
      schedule();
    };
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || (!event.deltaX && !event.deltaY)) return;
      event.preventDefault();
      const state = getSnapshot(),
        v = viewport();
      const decision = resolveWheel(event, EditorWheelSurface.Canvas);
      const { action, precise } = decision;
      const preciseDelta = presentationDeltaToCanvasLogical(
        clientDeltaToSurface(canvas, { x: event.deltaX, y: event.deltaY }, renderer.layout),
      );
      const { x: dx, y: dy } = projectWheelDelta(decision, preciseDelta, v);
      if (action === WheelAction.Horizontal || action === WheelAction.Vertical) {
        const accumulated = { x: dx + wheelFraction.x, y: dy + wheelFraction.y };
        const scroll = { x: Math.trunc(accumulated.x), y: Math.trunc(accumulated.y) };
        wheelFraction = precise
          ? { x: accumulated.x - scroll.x, y: accumulated.y - scroll.y }
          : { x: 0, y: 0 };
        const basePan = pendingView?.pan ?? state.view.pan;
        queueView({
          pan: {
            x: basePan.x - scroll.x,
            y: basePan.y - scroll.y,
          },
        });
      } else if (action === WheelAction.Zoom) {
        const steps = wheelZoomSteps(decision, { x: dx, y: dy });
        if (steps)
          anchorZoom(
            zoomFromCenterWithWheel ? { x: v.width / 2, y: v.height / 2 } : screenPoint(event),
            stepZoom(state.view.zoom, steps),
          );
      } else if (action === WheelAction.Brush)
        editor.updateDrawingSettings({
          brush: {
            ...state.settings.brush,
            size: brushSizeAfterWheel(state.settings.brush.size, decision, { x: dx, y: dy }),
          },
        });
      else if (action === WheelAction.Foreground || action === WheelAction.Background) {
        const target = action === WheelAction.Foreground ? "foreground" : "background";
        const colors = state.palette;
        if (!colors.length) return;
        const selected = state.settings[target];
        const current = Math.max(
          0,
          colors.findIndex((c) => c.every((channel, i) => channel === selected[i])),
        );
        const next = Math.max(
          0,
          Math.min(
            colors.length - 1,
            current + Math.trunc(wheelScalarDelta(decision, { x: dx, y: dy })),
          ),
        );
        editor.updateDrawingSettings({ [target]: colors[next] });
      } else if (action === WheelAction.Frame && state.document?.timeline) {
        const timeline = state.document.timeline;
        editor.selectFrame(
          timelineWheelFrameIndex(timeline.activeFrame, timeline.frames.length, dx + dy, precise),
        );
      }
    };
    const updateGestureModifiers = (event: KeyboardEvent) => {
      const state = getSnapshot();
      const shapeModifier =
        !!state.preview &&
        (isTwoPointShape(state.preview.tool) ||
          ["curve", "polygon", "polygonal_lasso"].includes(state.preview.tool));
      const capabilities = getXpriteToolCapabilities(state.settings.tool);
      const freehandLineModifier = inside && capabilities.behavior.connectFreehandStroke;
      const selectionTransformModifier = activePointer !== null && !!state.selectionTransform;
      if (
        latestPointerInput &&
        (shapeModifier || freehandLineModifier || selectionTransformModifier)
      ) {
        editor.pointerMove({
          ...latestPointerInput,
          shift: event.shiftKey,
          alt: event.altKey,
          ctrl: event.ctrlKey || event.metaKey,
          physicalCtrl: event.ctrlKey,
          actionModifiers: actionModifiers({
            pointerType: latestPointerInput.pointerType,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
          }),
          space,
        });
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.code === "Space") space = true;
      optionModifier = event.altKey;
      updateActionIndicators(event);
      if (shortcutDrag && !editor.isShortcutDragPressed(shortcutDrag, modifierKeys, space))
        shortcutDrag = null;
      syncQuickTool();
      if (pointerScreen)
        startShortcutDrag({ x: Math.floor(pointerScreen.x), y: Math.floor(pointerScreen.y) });
      hoveredTransform =
        inside && pointerScreen
          ? hitTransform({ x: Math.floor(pointerScreen.x), y: Math.floor(pointerScreen.y) })
          : null;
      if (inside) schedule();
      if (
        event.code === "Space" &&
        (quickTool === CanvasToolId.Hand ||
          shortcutDrag ||
          (getSnapshot().preview && actionModifiers(event).moveOrigin)) &&
        (document.activeElement === canvas || inside) &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            'input,textarea,select,button,[contenteditable=true],[role="dialog"],[role="menu"],dialog',
          )
        )
      ) {
        event.preventDefault();
        schedule();
      }
      updateGestureModifiers(event);
      if (event.key === "Escape" && !event.defaultPrevented && document.activeElement === canvas) {
        canvasInputPort.debugInput("escape", event, {
          extra: {
            selection: !!getSnapshot().document?.selection,
            floating: !!getSnapshot().floatingPaste,
            transform: !!getSnapshot().selectionTransform,
          },
        });
        // Handle the semantic command before resetting pointer bookkeeping.
        // Otherwise the outer shortcut sees an already-cancelled draft/drag
        // and runs a second, different cancellation against the restored mask.
        event.preventDefault();
        if (symmetryDrag) {
          cancel();
          return;
        }
        editor.executeCommand({ type: "cancel" }, { scene: "document", viewport: viewport() });
        cancel();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      optionModifier = event.altKey;
      updateActionIndicators(event);
      if (event.code === "Space") space = false;
      if (shortcutDrag && !editor.isShortcutDragPressed(shortcutDrag, modifierKeys, space))
        shortcutDrag = null;
      syncQuickTool();
      hoveredTransform =
        inside && pointerScreen
          ? hitTransform({ x: Math.floor(pointerScreen.x), y: Math.floor(pointerScreen.y) })
          : null;
      if (inside) schedule();
      if (event.code === "Space") {
        schedule();
      }
      updateGestureModifiers(event);
    };
    const blur = () => {
      traceInput("canvas-blur");
      sliceTouchStart = null;
      clicks.reset();
      mousePress = null;
      space = false;
      optionModifier = false;
      autoGuidesModifier = false;
      shortcutDrag = null;
      modifierKeys = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
      quickTool = null;
      editor.setQuickTool(null);
      selectionCopyModifier = false;
      selectionModifier = false;
      transformModifier = false;
      if (activePointer !== null || touchSession) {
        pointers.reset();
        interruptPointer(true);
        touchPoints.clear();
        touchSession = null;
        historyGesture.cancel();
      } else if (getSnapshot().linePreview) editor.cancelGesture();
      schedule();
    };
    const visibilityChanged = () => {
      traceInput("canvas-visibility", undefined, { hidden: document.hidden });
      if (!document.hidden) return;
      blur();
      leave();
    };
    const moveShortcutDragOutsideCanvas = (event: PointerEvent) => {
      if (!shortcutDrag || event.target === canvas || activePointer !== null) return;
      updateActionIndicators(event);
      if (!editor.isShortcutDragPressed(shortcutDrag, modifierKeys, space)) {
        shortcutDrag = null;
        syncQuickTool();
        schedule();
        return;
      }
      editor.updateShortcutDrag(shortcutDrag, guiPoint(event));
      schedule();
    };
    sliceContextTarget.current = (event) => {
      const state = getSnapshot();
      if (state.settings.tool !== "slice") return null;
      const hit = sliceHit(event);
      if (!hit) return null;
      const selected = state.selectedSliceIds ?? [];
      if (selected.includes(hit.id)) return [...selected];
      editor.selectSlice(hit.id);
      return [hit.id];
    };
    sliceTouchMenuAllowed.current = (contact) => {
      const state = getSnapshot(),
        doc = state.document;
      if (
        !doc ||
        !sliceTouchStart ||
        pan ||
        symmetryDrag ||
        quickTool === CanvasToolId.Hand ||
        state.floatingPaste ||
        state.inlineText ||
        !sliceHit(contact)
      )
        return false;
      const at = screenToDocument(screenPoint(contact), viewport(), doc, state.view);
      return (
        Math.floor(at.x) === sliceTouchStart.x &&
        Math.floor(at.y) === sliceTouchStart.y &&
        editor.canOpenSliceContextMenu()
      );
    };
    const openSliceProperties = (event: MouseEvent) => {
      const state = getSnapshot(),
        doc = state.document,
        t = doc?.timeline;
      if (state.settings.tool !== "slice" || !doc || !t) return;
      const hit = sliceHit(event);
      if (hit) {
        event.preventDefault();
        editor.selectSlice(hit.id);
        setSlicePropertiesIds([hit.id]);
      }
    };
    const onCanvasDoubleClick = (event: MouseEvent) => {
      event.preventDefault();
      if (handledDoubleClick || activePointer !== null) return;
      const state = getSnapshot();
      if (state.settings.tool === "slice") openSliceProperties(event);
    };
    const sliceHit = (event: { clientX: number; clientY: number }) => {
      const state = getSnapshot(),
        doc = state.document,
        timeline = doc?.timeline;
      if (!doc || !timeline || state.view.slices === false) return null;
      const at = screenToDocument(screenPoint(event), viewport(), doc, state.view);
      return (
        [...(timeline.slices ?? [])].reverse().find((slice) => {
          const bounds = sliceKeyAt(slice, timeline.activeFrame)?.bounds;
          return (
            bounds &&
            at.x >= bounds.x &&
            at.y >= bounds.y &&
            at.x < bounds.x + bounds.width &&
            at.y < bounds.y + bounds.height
          );
        }) ?? null
      );
    };
    const sliceKeys = (event: KeyboardEvent) => {
      if (document.activeElement !== canvas || getSnapshot().settings.tool !== "slice") return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopImmediatePropagation();
        editor.deleteSelectedSlices();
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("mousedown", mouseDown);
    hostRef.current?.addEventListener("pointerdown", forwardInlineTextMiddleDown);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    traceInput("canvas-input-attached", undefined, {
      stylusTouchDefaults: !!disconnectStylusTouchDefaults,
    });
    canvas.addEventListener("gotpointercapture", gotCapture);
    canvas.addEventListener("lostpointercapture", lostCapture);
    canvas.addEventListener("pointerleave", leave);
    const disconnectWheel = connectWheel(canvas, wheel);
    const disconnectInlineTextWheel = hostRef.current
      ? connectWheel(hostRef.current, forwardInlineTextWheel)
      : undefined;
    canvas.addEventListener("dblclick", onCanvasDoubleClick);
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointermove", moveShortcutDragOutsideCanvas);
    window.addEventListener("keydown", sliceKeys, true);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibilityChanged);
    let resizePending = false;
    resizeCanvas.current = () => {
      const next = surfaceBoundsRef.current;
      if (
        next.x !== surfaceBounds.x ||
        next.y !== surfaceBounds.y ||
        next.width !== surfaceBounds.width ||
        next.height !== surfaceBounds.height
      ) {
        if (resizePending) return;
        resizePending = true;
        // Parent layout effects preserve the document origin after a resize.
        // Paint once after that commit, with both the new bounds and pan.
        queueMicrotask(() => {
          resizePending = false;
          if (disposed) return;
          cancelAnimationFrame(frame);
          draw();
        });
      } else if (presentedPixelRatio !== (displayPixelRatio(window) || 1)) {
        present();
        updatePaintingCursor();
      }
    };
    const unsubscribe = subscribe(schedule),
      resize = observeResize([canvas], () => {
        const rect = clientRect(canvas);
        const dpr = displayPixelRatio(window) || 1;
        if (
          Math.round(rect.width * dpr) !== renderer.pixelWidth ||
          Math.round(rect.height * dpr) !== renderer.pixelHeight
        )
          schedule();
      });

    draw();
    return () => {
      traceInput("canvas-input-detached");
      disconnectStylusTouchDefaults?.();
      pointers.reset();
      clicks.reset();
      historyGesture.cancel();
      sliceContextTarget.current = null;
      sliceTouchMenuAllowed.current = null;
      editor.setQuickTool(null);
      interruptPointer(true);
      disposed = true;
      resizeCanvas.current = null;
      unsubscribe();
      resize();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(viewFrame);
      viewFrame = 0;
      pendingView = null;
      if (timer) clearTimeout(timer);
      if (antsTimer) clearTimeout(antsTimer);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("mousedown", mouseDown);
      hostRef.current?.removeEventListener("pointerdown", forwardInlineTextMiddleDown);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("gotpointercapture", gotCapture);
      canvas.removeEventListener("lostpointercapture", lostCapture);
      canvas.removeEventListener("pointerleave", leave);
      disconnectWheel();
      disconnectInlineTextWheel?.();
      canvas.removeEventListener("dblclick", onCanvasDoubleClick);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointermove", moveShortcutDragOutsideCanvas);
      window.removeEventListener("keydown", sliceKeys, true);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibilityChanged);
      clearReferenceViewport();
      paintingCursorRenderer.dispose();
    };
  }, [
    presentationScale,
    pointers,
    editor,
    getSnapshot,
    subscribe,
    drawReferenceViewport,
    clearReferenceViewport,
    cursor,
    resolveWheel,
    connectWheel,
    projectWheelDelta,
    autoScroll,
    zoomFromCenterWithWheel,
    assets,
    displayPreferences,
    cursorPreferences,
    canvasInputPort,
    shortcuts,
  ]);
  useLayoutEffect(() => {
    resizeCanvas.current?.();
  }, [surfaceBounds.x, surfaceBounds.y, surfaceBounds.width, surfaceBounds.height, pixelRatio]);
  return (
    <div
      ref={hostRef}
      data-slot="editor-canvas-host"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <ContextMenu
        label={tUi("ui.slice.menu")}
        gestureScope={canvasManager.identity}
        canOpenTouchMenu={(input) => sliceTouchMenuAllowed.current?.(input) ?? false}
        longPressTarget={
          canvasManager.snapshot?.settings.tool === "slice" ? "[data-editor-canvas]" : false
        }
        onContextMenu={(event) => {
          const ids = sliceContextTarget.current?.(event.nativeEvent);
          if (!ids) event.preventDefault();
          else setSliceContextIds(ids);
        }}
        items={[
          { label: "Slice Properties...", onSelect: () => setSlicePropertiesIds(sliceContextIds) },
          { label: "Duplicate Slice", onSelect: () => editor.duplicateSlices(sliceContextIds) },
          { label: "Delete Slice", onSelect: () => editor.deleteSlices(sliceContextIds) },
        ]}
      >
        <canvas
          ref={canvasRef}
          data-ui-x={surfaceBounds.x}
          data-ui-y={surfaceBounds.y}
          data-ui-width={surfaceBounds.width}
          data-ui-height={surfaceBounds.height}
          className={[styles.canvas, className].filter(Boolean).join(" ")}
          tabIndex={0}
          role="application"
          data-editor-canvas
          aria-label={tUi("ui.sprite.canvas")}
        />
      </ContextMenu>
      {slicePropertiesIds &&
        getSnapshot().document?.timeline?.slices?.some((s) => slicePropertiesIds.includes(s.id)) &&
        (() => {
          const state = getSnapshot(),
            t = state.document!.timeline!,
            slices = t.slices!.filter((s) => slicePropertiesIds.includes(s.id));
          const close = () => {
            setSlicePropertiesIds(null);
            canvasRef.current?.focus();
          };
          return slices.length > 1 ? (
            <MultiSlicePropertiesDialog
              key={slicePropertiesIds.join(",")}
              slices={slices}
              defaultColor={
                state.settings.defaultSliceColor ??
                DEFAULT_GUIDE_SLICE_PREFERENCES.defaultSliceColor
              }
              onSave={(patch) => {
                editor.editSlicesProperties(slicePropertiesIds, patch);
                close();
              }}
              onClose={close}
            />
          ) : (
            <SlicePropertiesDialog
              key={slices[0].id}
              slice={slices[0]}
              frame={t.activeFrame}
              defaultColor={
                state.settings.defaultSliceColor ??
                DEFAULT_GUIDE_SLICE_PREFERENCES.defaultSliceColor
              }
              onSave={(patch) => {
                editor.editSliceProperties(slices[0].id, patch);
                close();
              }}
              onClose={close}
            />
          );
        })()}
      {inlineText && (
        <EditorInlineTextEditor
          draft={inlineText}
          bounds={{
            x: inlineOrigin.x * inlineCssScale,
            y: inlineOrigin.y * inlineCssScale,
            width: inlineText.bounds.width * inlineState.view.zoom * inlineCssScale,
            height: inlineText.bounds.height * inlineState.view.zoom * inlineCssScale,
          }}
          pixelsToCss={inlineState.view.zoom * inlineCssScale}
          onChange={(text, selectionStart, selectionEnd) =>
            editor.updateInlineText({ text, selectionStart, selectionEnd })
          }
          onCommit={() => {
            if (editor.commitInlineText() && !getSnapshot().inlineText) canvasRef.current?.focus();
          }}
          onCancel={() => {
            editor.cancelInlineText();
            canvasRef.current?.focus();
          }}
          onInputElement={(input) => {
            inlineTextInput.current = input;
          }}
        />
      )}
    </div>
  );
}
