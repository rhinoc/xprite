import "$/components/palette/editor-palette/editor-palette.module.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { ColorbarResizeHandle } from "$/components/palette/colorbar-splitter";
import { PaletteSurface, type PaletteRgba } from "$/components/palette/palette-surface";
import { PaletteToolbar } from "$/components/palette/palette-toolbar";
import { InlineTileset, TilemapModeBar } from "$/components/palette/tilemap-colorbar";
import { useEditorLayoutSettings } from "$/components/shared/editor-layout-context";
import { useElementSize } from "$/components/shared/use-size";
import { useColorProfile } from "$/components/tools/color-profile";
import { tUi, useUiLanguage } from "$/i18n";
import { useColorSource } from "$/managers/colors/color-sources";
import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import {
  useWheelInput,
  EditorWheelSurface,
  EditorWheelAction,
  wheelCellSizeDelta,
} from "$/managers/input/use-wheel-input";
import { useEditorPaletteModel } from "$/managers/palette/editor-palette-model";
import { usePaletteCursorStyle } from "$/managers/palette/interaction-cursors";
import {
  formatPaletteEntry as paletteHex,
  PALETTE_COLOR_CHANNEL_MAX as UINT8_MAX,
  resizeEditorPalette as resizePaletteColors,
} from "$/managers/palette/palette-operations";
import {
  getPaletteGridLayout as asepritePaletteLayout,
  getPaletteSelectionFrames as paletteSelectionGeometry,
  findPaletteSelectionOutline as hitPaletteSelectionOutline,
  previewPaletteDrop as dropPaletteColors,
  getPaletteResizeHandle as paletteResizeHandle,
  getPaletteResizeTarget as paletteResizeTarget,
  MAX_EDITOR_PALETTE_COLORS as MAX_PALETTE_COLORS,
} from "$/managers/palette/palette-view";
import {
  TilemapPaletteDisplayMode as TilemapDisplayMode,
  useTilemapPalettePreferences,
} from "$/managers/palette/tilemap-model";
import { EditorCursorName } from "$/managers/ports/platform";
import { usePaletteBoxSizePreference } from "$/managers/preferences/use-panel-layout-preferences";
import { parseEditorColor } from "$/managers/tools/color-control";
import { Scrollbar, TOUCH_LONG_PRESS_DELAY_MS, TOUCH_MOVE_THRESHOLD } from "@xprite/ui";
import { UI_SCALE_X, UI_SCALE_Y, surfaceLayout } from "@xprite/ui/canvas";
import {
  clientPoint,
  hitElement,
  clientScale,
  clientToSurface,
  clientDeltaToSurface,
  PointerDragActivation,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

const PALETTE_VIEWPORT_INSET = 6;
const MIN_PALETTE_SURFACE_EXTENT = 24;
const PALETTE_CELL_INSET = 2;
const PALETTE_SCROLLBAR_WIDTH = 12;
const PALETTE_DRAG_SCROLL_ROWS_PER_SECOND = 12;
const PALETTE_DRAG_SCROLL_MAX_FRAME_MS = 50;
const MILLISECONDS_PER_SECOND = 1000;

const samePaletteColors = (
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
) =>
  left.length === right.length &&
  left.every((color, index) => {
    const otherColor = right[index];
    return (
      otherColor !== undefined &&
      color.length === otherColor.length &&
      color.every((channel, channelIndex) => channel === otherColor[channelIndex])
    );
  });

export function EditorPalette({
  colors: sourceColors,
  columns: _initialColumns,
  panelDocked = false,
}: {
  colors: readonly (readonly number[])[];
  columns?: number;
  panelDocked?: boolean;
}) {
  useUiLanguage();
  const { resolve: resolveWheel, connect: connectWheel } = useWheelInput();
  const cursorStyle = usePaletteCursorStyle();
  const editor = useEditorPaletteModel();
  const { colorbarSplitPosition, workspaceLayoutConfiguration } = useEditorLayoutSettings();
  const paletteConfiguration = workspaceLayoutConfiguration.palette;
  const paletteRoot = useRef<HTMLElement>(null);
  const paletteSize = useElementSize(paletteRoot);
  const previousPaletteSource = useRef<{
    colors: readonly (readonly number[])[];
    functional: boolean;
  } | null>(null);
  const tilemapActive = editor.tilemapLayerActive && editor.hasTileset;
  const { showBoth: showColorAndTiles, setShowBoth: setShowColorAndTiles } =
    useTilemapPalettePreferences();
  const tilemapMode = editor.tilemapDisplayMode;
  const showPalette =
    !paletteConfiguration.splitTileset ||
    panelDocked ||
    !tilemapActive ||
    showColorAndTiles ||
    tilemapMode === TilemapDisplayMode.Pixels;
  const showTiles =
    paletteConfiguration.splitTileset &&
    !panelDocked &&
    tilemapActive &&
    (showColorAndTiles || tilemapMode === TilemapDisplayMode.Tiles);
  const fullHeight = Math.max(24, paletteSize.height / UI_SCALE_Y),
    headerHeight = panelDocked || tilemapActive ? paletteConfiguration.headerHeight : 0;
  const paneGap = showPalette && showTiles ? 6 : 0,
    bottomInset = showTiles ? 8 : 0;
  const paneSpace = Math.max(
    MIN_PALETTE_SURFACE_EXTENT,
    fullHeight - headerHeight - paneGap - bottomInset,
  );
  const paletteHeight = showPalette ? (showTiles ? Math.floor(paneSpace / 2) : paneSpace) : 0;
  const tileHeight = showTiles ? paneSpace - paletteHeight : 0;
  const paletteBounds = {
    x: 4,
    y: headerHeight,
    width: Math.max(24, paletteSize.width / UI_SCALE_X - (tilemapActive ? 6 : 4)),
    height: Math.max(0, paletteHeight),
  };
  const tilesetBounds = {
    x: 4,
    y: headerHeight + paletteHeight + paneGap,
    width: paletteBounds.width,
    height: tileHeight,
  };
  const paletteViewport = {
    x: paletteBounds.x + PALETTE_VIEWPORT_INSET,
    y: paletteBounds.y + PALETTE_VIEWPORT_INSET,
    width: Math.max(0, paletteBounds.width - PALETTE_VIEWPORT_INSET * 2),
    height: Math.max(0, paletteBounds.height - PALETTE_VIEWPORT_INSET * 2),
  };
  const paletteOrigin = {
    x: paletteViewport.x + PALETTE_CELL_INSET,
    y: paletteViewport.y + PALETTE_CELL_INSET,
  };
  const innerHeight = paletteViewport.height;
  const mainCssTop = 0;
  const { setPaletteColors } = editor;
  useEffect(() => {
    const previous = previousPaletteSource.current;
    previousPaletteSource.current = { colors: sourceColors, functional: editor.functional };
    // Palette sources can return a fresh array on every workspace render.
    if (
      !editor.functional &&
      (!previous || previous.functional || !samePaletteColors(sourceColors, previous.colors))
    )
      setPaletteColors(sourceColors);
  }, [sourceColors, setPaletteColors, editor.functional]);
  const colors = editor.functional
    ? editor.paletteColors
    : editor.paletteColors.length
      ? editor.paletteColors
      : sourceColors;
  const colorProfile = useColorProfile();
  useColorSource(paletteRoot, (_point, hit) => {
    const swatch = hit.closest<HTMLElement>("[data-palette-index]");
    if (!swatch || !paletteRoot.current?.contains(swatch)) return null;
    const index = Number(swatch.dataset.paletteIndex);
    const color = colors[index];
    return color
      ? { color: parseEditorColor(paletteHex(color)), profile: colorProfile, paletteIndex: index }
      : null;
  });
  const { boxSize, setBoxSize } = usePaletteBoxSizePreference();
  const effectiveBoxSize = boxSize;
  const [scrollY, setScrollY] = useState(0);
  const dragScrollY = useRef(0);
  const touchPaletteScroll = useRef<{
    owner: object;
    pointer: number;
    index: number;
    x: number;
    y: number;
    scroll: number;
    moved: boolean;
    target: WorkingColorTarget;
    mode: "pending" | "scroll" | "reorder";
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const lastTouchPaletteTap = useRef<{
    index: number;
    at: number;
    x: number;
    y: number;
    foreground: string;
    paletteIndex: number | null;
    selection: number[];
  } | null>(null);
  const layout = asepritePaletteLayout(
    colors.length,
    effectiveBoxSize,
    undefined,
    innerHeight,
    paletteBounds.width - 14,
  );
  const { columns, cellSize, pitch } = layout;
  const scroll = Math.min(scrollY, layout.maxScroll);
  dragScrollY.current = scroll;
  const selectionOptions = { cellSize, scrollY: scroll, origin: paletteOrigin };
  useEffect(() => {
    setScrollY((current) => Math.min(current, layout.maxScroll));
  }, [layout.maxScroll]);
  const [selectionHot, setSelectionHot] = useState(false);
  const [resizePreview, setResizePreview] = useState<number | null>(null);
  const [resizeHot, setResizeHot] = useState(false);
  const resizeDrag = useRef<{
    pointer: number;
    target: number;
    owner: object;
    activation: PointerDragActivation;
  } | null>(null);
  const resizeGeometry = { origin: paletteOrigin, columns, cellSize, scrollY: scroll };
  const resizeHandle = paletteResizeHandle(resizePreview ?? colors.length, resizeGeometry);
  const displayColors = useMemo(
    () =>
      resizePreview === null
        ? colors
        : resizePreview === 0
          ? []
          : resizePaletteColors(colors, resizePreview),
    [colors, resizePreview],
  );
  const firstVisibleColor = Math.max(0, Math.floor(scroll / pitch) - 1) * columns;
  const lastVisibleColor = Math.min(
    colors.length,
    (Math.ceil((scroll + innerHeight) / pitch) + 1) * columns,
  );
  useEffect(() => {
    const node = paletteRoot.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (
        outlineDrag.current ||
        paletteDrag.current ||
        resizeDrag.current ||
        event.defaultPrevented
      )
        return;
      event.preventDefault();
      const decision = resolveWheel(event, EditorWheelSurface.Palette);
      const { precise } = decision;
      if (decision.action === EditorWheelAction.CellSize) {
        setBoxSize((current) => current + wheelCellSizeDelta(decision));
      } else {
        const canvas = node.querySelector("canvas");
        const delta =
          precise && canvas
            ? clientDeltaToSurface(canvas, { x: decision.x, y: decision.y }, paletteBounds).y
            : Math.sign(decision.y) * 3 * cellSize;
        setScrollY((current) => Math.max(0, Math.min(layout.maxScroll, current + delta)));
      }
    };
    return connectWheel(node, wheel);
  }, [
    resolveWheel,
    connectWheel,
    cellSize,
    layout.maxScroll,
    setBoxSize,
    paletteBounds.width,
    paletteBounds.height,
  ]);
  const [outlinePreview, setOutlinePreview] = useState<ReturnType<typeof dropPaletteColors> | null>(
    null,
  );
  const outlineDrag = useRef<{
    owner: object;
    pointer: number;
    target: number;
    copy: boolean;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [outlineDragging, setOutlineDragging] = useState(false);
  const advanceOutlineDrag = useRef<(elapsedMs: number) => void>(() => {});
  useEffect(() => {
    if (!outlineDragging) return;
    let previousTime: number | null = null;
    let frame: number;
    const tick = (time: number) => {
      if (!outlineDrag.current) return;
      const elapsed = previousTime === null ? 0 : time - previousTime;
      previousTime = time;
      advanceOutlineDrag.current(Math.min(elapsed, PALETTE_DRAG_SCROLL_MAX_FRAME_MS));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [outlineDragging]);
  const palettePoint = (node: HTMLElement, clientX: number, clientY: number) => {
    const canvas = node.querySelector("canvas");
    if (!canvas) return null;
    return clientToSurface(canvas, { x: clientX, y: clientY }, paletteBounds);
  };
  const cancelOutline = () => {
    const pointer = outlineDrag.current?.pointer;
    outlineDrag.current = null;
    setOutlineDragging(false);
    if (pointer !== undefined && paletteRoot.current?.hasPointerCapture(pointer))
      paletteRoot.current.releasePointerCapture(pointer);
    setOutlinePreview(null);
  };
  const cancelResize = () => {
    const pointer = resizeDrag.current?.pointer;
    resizeDrag.current = null;
    setResizePreview(null);
    setResizeHot(false);
    if (pointer !== undefined && paletteRoot.current?.hasPointerCapture(pointer))
      paletteRoot.current.releasePointerCapture(pointer);
  };
  const commitResize = (size: number) => {
    const count = Math.max(1, size);
    editor.setPaletteColors(resizePaletteColors(colors, count));
    editor.setPaletteSelection(editor.paletteSelection.filter((index) => index < count));
    if (editor.paletteIndex !== null && editor.paletteIndex >= count) editor.setPaletteIndex(null);
    if (editor.backgroundIndex !== null && editor.backgroundIndex >= count)
      editor.setBackgroundIndex(null);
  };
  const updateCopyModifier = (event: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => {
    const drag = outlineDrag.current;
    if (!drag) return;
    const copy = event.ctrlKey || event.altKey || event.metaKey;
    if (copy === drag.copy) return;
    drag.copy = copy;
    const preview = dropPaletteColors(colors, editor.paletteSelection, drag.target, drag.copy);
    setOutlinePreview(preview);
    editor.setNotice(
      preview.capacityExceeded
        ? tUi("ui.palette.capacity.reached", { value1: MAX_PALETTE_COLORS })
        : tUi("ui.to.2", { value1: drag.copy ? "Copy" : "Move", value2: drag.target }),
    );
  };
  const updateOutlineTarget = (point: { x: number; y: number }, currentScroll: number) => {
    const drag = outlineDrag.current;
    if (!drag) return;
    const column = Math.max(
      0,
      Math.min(columns - 1, Math.floor((point.x - paletteOrigin.x) / pitch)),
    );
    const visibleY = Math.max(
      paletteOrigin.y,
      Math.min(paletteViewport.y + innerHeight - 1, point.y),
    );
    const row = Math.max(0, Math.floor((visibleY - paletteOrigin.y + currentScroll) / pitch));
    const target = Math.min(
      MAX_PALETTE_COLORS - editor.paletteSelection.length,
      row * columns + column,
    );
    if (target === drag.target) return;
    drag.target = target;
    const preview = dropPaletteColors(colors, editor.paletteSelection, target, drag.copy);
    setOutlinePreview(preview);
    editor.setNotice(
      preview.capacityExceeded
        ? tUi("ui.palette.capacity.reached", { value1: MAX_PALETTE_COLORS })
        : tUi("ui.to.2", { value1: drag.copy ? "Copy" : "Move", value2: target }),
    );
  };
  advanceOutlineDrag.current = (elapsedMs) => {
    const drag = outlineDrag.current;
    const node = paletteRoot.current;
    if (!drag || !node || !showPalette || !innerHeight) return;
    if (touchPaletteScroll.current?.mode === "reorder" && !touchPaletteScroll.current.moved) return;
    if (!editor.isGestureOwnerCurrent(drag.owner)) {
      cancelPaletteGestures();
      return;
    }
    const point = palettePoint(node, clientPoint(drag).x, clientPoint(drag).y);
    if (!point) return;
    const edgeSize = Math.min(pitch, innerHeight / 2);
    const topEdge = paletteViewport.y + edgeSize;
    const bottomEdge = paletteViewport.y + innerHeight - edgeSize;
    const direction =
      point.y < topEdge
        ? -Math.min(1, (topEdge - point.y) / edgeSize)
        : point.y > bottomEdge
          ? Math.min(1, (point.y - bottomEdge) / edgeSize)
          : 0;
    const nextScroll = Math.max(
      0,
      Math.min(
        layout.maxScroll,
        dragScrollY.current +
          (direction * pitch * PALETTE_DRAG_SCROLL_ROWS_PER_SECOND * elapsedMs) /
            MILLISECONDS_PER_SECOND,
      ),
    );
    if (nextScroll !== dragScrollY.current) {
      dragScrollY.current = nextScroll;
      setScrollY(nextScroll);
    }
    updateOutlineTarget(point, nextScroll);
  };

  const paletteDrag = useRef<{
    owner: object;
    pointer: number;
    anchor: number;
    button: number;
    base: number[];
  } | null>(null);
  const cancelPaletteGestures = () => {
    const resizePointer = resizeDrag.current?.pointer;
    resizeDrag.current = null;
    setResizePreview(null);
    setResizeHot(false);
    if (resizePointer !== undefined && paletteRoot.current?.hasPointerCapture(resizePointer))
      paletteRoot.current.releasePointerCapture(resizePointer);
    const outlinePointer = outlineDrag.current?.pointer;
    const colorPointer = paletteDrag.current?.pointer;
    const touchPointer = touchPaletteScroll.current?.pointer;
    const grid = paletteRoot.current?.querySelector<HTMLElement>(".xse-palette-grid");
    outlineDrag.current = null;
    setOutlineDragging(false);
    paletteDrag.current = null;
    if (touchPaletteScroll.current?.timer) clearTimeout(touchPaletteScroll.current.timer);
    touchPaletteScroll.current = null;
    lastTouchPaletteTap.current = null;
    if (outlinePointer !== undefined && paletteRoot.current?.hasPointerCapture(outlinePointer))
      paletteRoot.current.releasePointerCapture(outlinePointer);
    if (colorPointer !== undefined && grid?.hasPointerCapture(colorPointer))
      grid.releasePointerCapture(colorPointer);
    if (touchPointer !== undefined && grid?.hasPointerCapture(touchPointer))
      grid.releasePointerCapture(touchPointer);
    setOutlinePreview(null);
    setSelectionHot(false);
    if (outlinePointer !== undefined || resizePointer !== undefined) editor.setNotice("");
  };
  useLayoutEffect(() => {
    cancelPaletteGestures();
    return () => cancelPaletteGestures();
  }, [editor.gestureOwner, editor.paletteEditable, editor.workingColorTarget, showPalette]);
  useEffect(() => {
    window.addEventListener("blur", cancelPaletteGestures);
    return () => window.removeEventListener("blur", cancelPaletteGestures);
  }, [editor.setNotice]);

  useEffect(() => {
    const clearOutsidePalette = (target: EventTarget | null) => {
      const root = paletteRoot.current;
      if (!root || (target instanceof Node && root.contains(target))) return;
      if (target instanceof Element) {
        const menu = target.closest<HTMLElement>('[role="menu"]');
        const owner =
          target.closest<HTMLElement>("[data-menu-owner]")?.dataset.menuOwner ??
          menu?.querySelector<HTMLElement>("[data-menu-owner]")?.dataset.menuOwner;
        if (
          owner &&
          Array.from(
            root.querySelectorAll<HTMLElement>('[aria-haspopup="menu"][aria-controls]'),
          ).some((trigger) => trigger.getAttribute("aria-controls") === owner)
        )
          return;
      }
      editor.setPaletteSelection((current) => (current.length ? [] : current));
    };
    const pointerDown = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".xse-timeline") &&
        (event.ctrlKey || event.shiftKey)
      )
        return;
      clearOutsidePalette(event.target);
    };
    const focusIn = (event: FocusEvent) => clearOutsidePalette(event.target);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("focusin", focusIn, true);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("focusin", focusIn, true);
    };
  }, [editor.setPaletteSelection]);

  const chooseColor = (index: number, background = false) => {
    const rowY = Math.floor(index / columns) * pitch;
    if (rowY < scroll) setScrollY(rowY);
    else if (rowY + cellSize + 2 > scroll + innerHeight)
      setScrollY(Math.min(layout.maxScroll, rowY + cellSize + 2 - innerHeight));
    if (background) {
      editor.setBackgroundIndex(index);
      editor.setBackground(paletteHex(colors[index]));
    } else {
      editor.setPaletteIndex(index);
      editor.setForeground(paletteHex(colors[index]));
    }
  };

  return (
    <>
      <aside
        ref={paletteRoot}
        data-ui-region="palette"
        className="xse-palette"
        aria-label={tUi("ui.palette")}
        style={{
          flex: `${colorbarSplitPosition} 1 0px`,
          cursor:
            resizeHot || resizePreview !== null
              ? cursorStyle(EditorCursorName.HorizontalResize, "ew-resize")
              : selectionHot
                ? cursorStyle(EditorCursorName.Move, "move")
                : cursorStyle(EditorCursorName.Normal),
        }}
        tabIndex={-1}
        {...stylusPointerInputProps()}
        onPointerDownCapture={(event) => {
          if (!editor.isGestureOwnerCurrent(editor.gestureOwner)) {
            event.preventDefault();
            event.stopPropagation();
            cancelPaletteGestures();
            return;
          }
          if (event.target instanceof Element && event.target.closest(".xse-palette-toolbar"))
            return;
          const isResizeHandleTarget =
            event.target instanceof Element && event.target.closest(".xse-palette-resize-handle");
          if (event.pointerType === "touch" && (!isResizeHandleTarget || !editor.paletteEditable))
            return;
          if (event.target instanceof Element && event.target.closest("[data-tileset-panel]"))
            return;
          if (event.target instanceof Element && event.target.closest('[role="scrollbar"]')) return;
          if (event.button !== 0) return;
          const point = palettePoint(
            event.currentTarget,
            clientPoint(event).x,
            clientPoint(event).y,
          );
          if (!point) return;
          const outline = hitPaletteSelectionOutline(
            point,
            paletteSelectionGeometry(
              editor.paletteSelection,
              colors.length,
              columns,
              selectionOptions,
            ),
          );
          if (outline === null) {
            const handle = paletteResizeHandle(colors.length, resizeGeometry);
            if (
              point.x < handle.x ||
              point.x >= handle.x + handle.width ||
              point.y < handle.y ||
              point.y >= handle.y + handle.height
            ) {
              if (
                !(event.target instanceof Element && event.target.closest("[data-palette-index]"))
              )
                editor.setPaletteSelection([]);
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeDrag.current = {
              pointer: event.pointerId,
              activation: new PointerDragActivation(event),
              target: colors.length,
              owner: editor.gestureOwner,
            };
            setResizePreview(colors.length);
            editor.setNotice(tUi("ui.new.palette.size", { value1: colors.length }));
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const target = Math.min(...editor.paletteSelection);
          const copy = event.ctrlKey || event.altKey || event.metaKey;
          outlineDrag.current = {
            owner: editor.gestureOwner,
            pointer: event.pointerId,
            target,
            copy,
            clientX: clientPoint(event).x,
            clientY: clientPoint(event).y,
          };
          setOutlineDragging(true);
          const preview = dropPaletteColors(colors, editor.paletteSelection, target, copy);
          setOutlinePreview(preview);
          if (preview.capacityExceeded)
            editor.setNotice(tUi("ui.palette.capacity.reached", { value1: MAX_PALETTE_COLORS }));
        }}
        onPointerMove={(event) => {
          const owner = outlineDrag.current?.owner ?? resizeDrag.current?.owner;
          if (owner && !editor.isGestureOwnerCurrent(owner)) {
            cancelPaletteGestures();
            return;
          }
          if (event.target instanceof Element && event.target.closest('[role="scrollbar"]')) {
            setSelectionHot(false);
            return;
          }
          const point = palettePoint(
            event.currentTarget,
            clientPoint(event).x,
            clientPoint(event).y,
          );
          if (!point) return;
          const resize = resizeDrag.current;
          if (resize && resize.pointer === event.pointerId) {
            if (!resize.activation.update(event)) return;
            resize.target = paletteResizeTarget(point, resizeGeometry);
            setResizePreview(resize.target);
            editor.setNotice(tUi("ui.new.palette.size", { value1: Math.max(1, resize.target) }));
            return;
          }
          setResizeHot(
            point.x >= resizeHandle.x &&
              point.x < resizeHandle.x + resizeHandle.width &&
              point.y >= resizeHandle.y &&
              point.y < resizeHandle.y + resizeHandle.height,
          );
          const drag = outlineDrag.current;
          if (touchPaletteScroll.current?.mode === "reorder" && !touchPaletteScroll.current.moved)
            return;
          if (drag && drag.pointer === event.pointerId) {
            clientPoint(drag).x = clientPoint(event).x;
            clientPoint(drag).y = clientPoint(event).y;
            updateCopyModifier(event);
            updateOutlineTarget(point, dragScrollY.current);
          } else
            setSelectionHot(
              hitPaletteSelectionOutline(
                point,
                paletteSelectionGeometry(
                  editor.paletteSelection,
                  colors.length,
                  columns,
                  selectionOptions,
                ),
              ) !== null,
            );
        }}
        onPointerLeave={() => {
          setSelectionHot(false);
          setResizeHot(false);
        }}
        onPointerUp={(event) => {
          const owner = outlineDrag.current?.owner ?? resizeDrag.current?.owner;
          if (owner && !editor.isGestureOwnerCurrent(owner)) {
            cancelPaletteGestures();
            return;
          }
          const resize = resizeDrag.current;
          if (resize && resize.pointer === event.pointerId) {
            const point = palettePoint(
              event.currentTarget,
              clientPoint(event).x,
              clientPoint(event).y,
            );
            if (point && resize.activation.update(event))
              resize.target = paletteResizeTarget(point, resizeGeometry);
            if (resize.target !== colors.length) commitResize(resize.target);
            cancelResize();
            editor.setNotice("");
            return;
          }
          const drag = outlineDrag.current;
          if (!drag || drag.pointer !== event.pointerId) return;
          let capacityExceeded = false;
          const point = palettePoint(
            event.currentTarget,
            clientPoint(event).x,
            clientPoint(event).y,
          );
          if (point) {
            updateCopyModifier(event);
            updateOutlineTarget(point, dragScrollY.current);
            const result = dropPaletteColors(
              colors,
              editor.paletteSelection,
              drag.target,
              drag.copy,
            );
            capacityExceeded = result.capacityExceeded;
            if (!capacityExceeded) {
              editor.setPaletteColors(result.colors);
              editor.setPaletteSelection(result.selected);
              if (editor.paletteIndex !== null)
                editor.setPaletteIndex(result.remap[editor.paletteIndex] ?? null);
              if (editor.backgroundIndex !== null)
                editor.setBackgroundIndex(result.remap[editor.backgroundIndex] ?? null);
            }
          }
          cancelOutline();
          editor.setNotice(
            capacityExceeded
              ? tUi("ui.palette.capacity.reached", { value1: MAX_PALETTE_COLORS })
              : "",
          );
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          cancelOutline();
          cancelResize();
          editor.setNotice("");
        }}
        onLostPointerCapture={() => {
          cancelOutline();
          cancelResize();
        }}
        onKeyDownCapture={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          const deleteKey = event.key === "Delete" || event.key === "Backspace";
          const unmodified = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
          const inPalette = target !== null && paletteRoot.current?.contains(target);
          const inTilesetPanel = target?.closest("[data-tileset-panel]");
          const inTileList = target?.closest('[data-tileset-panel] [role="listbox"]');
          if (deleteKey && unmodified && inTilesetPanel && !inTileList) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (deleteKey && unmodified && inPalette && !inTilesetPanel) {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            lastTouchPaletteTap.current = null;
            if (target?.closest(".xse-palette-toolbar")) return;
            const paletteEntry = target?.closest<HTMLElement>("[data-palette-index]");
            const nextFocusIndex = editor.deleteSelectedPaletteColors(
              paletteEntry ? Number(paletteEntry.dataset.paletteIndex) : undefined,
            );
            if (nextFocusIndex !== null) {
              paletteRoot.current?.focus({ preventScroll: true });
              requestAnimationFrame(() =>
                paletteRoot.current
                  ?.querySelector<HTMLElement>(`[data-palette-index="${nextFocusIndex}"]`)
                  ?.focus({ preventScroll: true }),
              );
            }
            return;
          }
          if (event.key === "Escape" && (outlineDrag.current || resizeDrag.current)) {
            event.preventDefault();
            event.stopPropagation();
            cancelOutline();
            cancelResize();
            editor.setNotice("");
          } else updateCopyModifier(event);
        }}
        onKeyUpCapture={updateCopyModifier}
      >
        {panelDocked && <PaletteToolbar model={editor} />}
        {tilemapActive && paletteConfiguration.splitTileset && !panelDocked && (
          <TilemapModeBar
            width={paletteSize.width / UI_SCALE_X}
            showBoth={showColorAndTiles}
            onShowBothChange={setShowColorAndTiles}
          />
        )}
        <div style={{ display: showPalette ? "block" : "none", position: "absolute", inset: 0 }}>
          <PaletteSurface
            bounds={paletteBounds}
            colors={(outlinePreview?.colors ?? displayColors) as readonly PaletteRgba[]}
            foregroundIndex={
              tilemapActive && tilemapMode === TilemapDisplayMode.Tiles
                ? null
                : (editor.paletteIndex ??
                  colors.findIndex(
                    (color) => paletteHex(color).toLowerCase() === editor.foreground.toLowerCase(),
                  ))
            }
            backgroundIndex={
              tilemapActive && tilemapMode === TilemapDisplayMode.Tiles
                ? null
                : (editor.backgroundIndex ??
                  (!editor.functional && colors.length === 108 ? 41 : null))
            }
            selectedIndices={outlinePreview?.selected ?? editor.paletteSelection}
            transparentIndex={editor.indexedColorMode ? editor.transparentPaletteIndex : null}
            dragIndices={outlinePreview?.selected}
            selectionHot={selectionHot}
            columns={columns}
            boxSize={effectiveBoxSize}
            scrollY={scroll}
            showScrollbar={layout.showScrollbar}
            contentHeight={layout.contentHeight}
            style={{
              position: "absolute",
              left: 4 * UI_SCALE_X,
              top: surfaceLayout(paletteBounds).top - mainCssTop,
              // Keep the stationary edge attached to the pane while React
              // catches up with its measured size during splitter movement.
              height: showTiles
                ? surfaceLayout(paletteBounds).height
                : `max(${MIN_PALETTE_SURFACE_EXTENT * UI_SCALE_Y}px, calc(100% - ${(headerHeight + bottomInset) * UI_SCALE_Y}px))`,
            }}
          />
          <button
            type="button"
            {...stylusPointerInputProps(editor.paletteEditable)}
            className="xse-palette-resize-handle"
            aria-label={tUi("ui.resize.palette")}
            title={tUi("ui.drag.to.resize.palette")}
            aria-description={tUi("ui.count.colors", {
              count: Math.max(1, resizePreview ?? colors.length),
            })}
            onKeyDown={(event) => {
              const delta =
                event.key === "ArrowLeft"
                  ? -1
                  : event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowUp"
                      ? -columns
                      : event.key === "ArrowDown"
                        ? columns
                        : 0;
              if (delta) {
                event.preventDefault();
                commitResize(Math.max(1, Math.min(MAX_PALETTE_COLORS, colors.length + delta)));
              }
            }}
            style={{
              position: "absolute",
              left: resizeHandle.x * UI_SCALE_X,
              top: resizeHandle.y * UI_SCALE_Y - mainCssTop,
              width: resizeHandle.width * UI_SCALE_X,
              height: resizeHandle.height * UI_SCALE_Y,
              visibility:
                resizeHandle.y + resizeHandle.height <= paletteBounds.y + 6 ||
                resizeHandle.y >= paletteBounds.y + paletteBounds.height - 6
                  ? "hidden"
                  : "visible",
              border: 0,
              padding: 0,
              background: "transparent",
              touchAction: "none",
              cursor: cursorStyle(EditorCursorName.HorizontalResize, "ew-resize"),
              zIndex: 3,
            }}
          />
          {layout.showScrollbar && (
            <Scrollbar
              bounds={{
                x: paletteBounds.x + paletteBounds.width - 18,
                y: paletteBounds.y + 6,
                width: 12,
                height: innerHeight,
              }}
              relativeTo={{ x: 0, y: mainCssTop / UI_SCALE_Y }}
              visibleSize={innerHeight}
              contentSize={layout.contentHeight}
              value={scroll}
              onValueChange={setScrollY}
              style={
                showTiles ? undefined : { top: "auto", bottom: PALETTE_VIEWPORT_INSET * UI_SCALE_Y }
              }
              aria-label="Palette scroll"
            />
          )}
          <div
            style={{
              position: "absolute",
              left: paletteViewport.x * UI_SCALE_X,
              top: paletteViewport.y * UI_SCALE_Y - mainCssTop,
              width:
                Math.max(
                  0,
                  paletteViewport.width - (layout.showScrollbar ? PALETTE_SCROLLBAR_WIDTH : 0),
                ) * UI_SCALE_X,
              height: innerHeight * UI_SCALE_Y,
              overflow: "hidden",
            }}
          >
            <div
              className="xse-palette-grid"
              role="listbox"
              aria-label={tUi("ui.palette.colors")}
              aria-multiselectable="true"
              style={{
                display: "block",
                height: Math.ceil(colors.length / columns) * pitch * UI_SCALE_Y,
                width: columns * pitch * UI_SCALE_X,
                marginLeft: PALETTE_CELL_INSET * UI_SCALE_X,
                marginTop: (PALETTE_CELL_INSET - scroll) * UI_SCALE_Y,
                touchAction: "none",
              }}
              onPointerMove={(event) => {
                const owner = touchPaletteScroll.current?.owner ?? paletteDrag.current?.owner;
                if (owner && !editor.isGestureOwnerCurrent(owner)) {
                  cancelPaletteGestures();
                  return;
                }
                const touchScroll = touchPaletteScroll.current;
                if (touchScroll?.pointer === event.pointerId) {
                  if (
                    Math.hypot(
                      clientPoint(event).x - touchScroll.x,
                      clientPoint(event).y - touchScroll.y,
                    ) >= TOUCH_MOVE_THRESHOLD
                  ) {
                    touchScroll.moved = true;
                    if (touchScroll.timer !== null) clearTimeout(touchScroll.timer);
                    touchScroll.timer = null;
                    if (touchScroll.mode === "pending") touchScroll.mode = "scroll";
                  }
                  if (touchScroll.mode === "reorder") return;
                  if (touchScroll.moved) {
                    event.preventDefault();
                    setScrollY(
                      Math.max(
                        0,
                        Math.min(
                          layout.maxScroll,
                          touchScroll.scroll -
                            (clientPoint(event).y - touchScroll.y) /
                              (UI_SCALE_Y * clientScale(event.currentTarget).y),
                        ),
                      ),
                    );
                  }
                  return;
                }
                const drag = paletteDrag.current;
                if (!drag || drag.pointer !== event.pointerId) return;
                const target = hitElement(
                  { x: clientPoint(event).x, y: clientPoint(event).y },
                  document,
                )?.closest<HTMLElement>("[data-palette-index]");
                if (!target || !event.currentTarget.contains(target)) return;
                const index = Number(target.dataset.paletteIndex);
                const first = Math.min(drag.anchor, index),
                  last = Math.max(drag.anchor, index);
                editor.setPaletteSelection([
                  ...new Set([
                    ...drag.base,
                    ...Array.from({ length: last - first + 1 }, (_, offset) => first + offset),
                  ]),
                ]);
                chooseColor(index, drag.button === 2);
              }}
              onPointerUp={(event) => {
                const owner = touchPaletteScroll.current?.owner ?? paletteDrag.current?.owner;
                if (owner && !editor.isGestureOwnerCurrent(owner)) {
                  cancelPaletteGestures();
                  return;
                }
                const touchScroll = touchPaletteScroll.current;
                if (touchScroll?.pointer === event.pointerId) {
                  if (touchScroll.timer !== null) clearTimeout(touchScroll.timer);
                  touchPaletteScroll.current = null;
                  if (touchScroll.mode === "reorder") {
                    lastTouchPaletteTap.current = null;
                    if (!touchScroll.moved) cancelOutline();
                    // The outer palette handler commits a moved outline on this release.
                    return;
                  }
                  if (!touchScroll.moved) {
                    const previous = lastTouchPaletteTap.current;
                    const doubleTap =
                      touchScroll.target === WorkingColorTarget.Foreground &&
                      previous?.index === touchScroll.index &&
                      event.timeStamp - previous.at < 380 &&
                      Math.hypot(
                        clientPoint(event).x - previous.x,
                        clientPoint(event).y - previous.y,
                      ) < 18;
                    if (doubleTap && previous) {
                      lastTouchPaletteTap.current = null;
                      editor.setPaletteIndex(previous.paletteIndex);
                      editor.setForeground(previous.foreground);
                      editor.setPaletteSelection(previous.selection);
                      chooseColor(touchScroll.index, true);
                    } else {
                      lastTouchPaletteTap.current = {
                        index: touchScroll.index,
                        at: event.timeStamp,
                        x: clientPoint(event).x,
                        y: clientPoint(event).y,
                        foreground: editor.foreground,
                        paletteIndex: editor.paletteIndex,
                        selection: [...editor.getPaletteSelection()],
                      };
                      editor.setPaletteSelection([touchScroll.index]);
                      chooseColor(
                        touchScroll.index,
                        touchScroll.target === WorkingColorTarget.Background,
                      );
                    }
                    event.currentTarget
                      .querySelector<HTMLElement>(`[data-palette-index="${touchScroll.index}"]`)
                      ?.focus({ preventScroll: true });
                  } else lastTouchPaletteTap.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  return;
                }
                if (paletteDrag.current?.pointer !== event.pointerId) return;
                paletteDrag.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                if (touchPaletteScroll.current?.timer)
                  clearTimeout(touchPaletteScroll.current.timer);
                touchPaletteScroll.current = null;
                lastTouchPaletteTap.current = null;
                paletteDrag.current = null;
              }}
              onLostPointerCapture={() => {
                if (touchPaletteScroll.current?.timer)
                  clearTimeout(touchPaletteScroll.current.timer);
                touchPaletteScroll.current = null;
                paletteDrag.current = null;
              }}
            >
              {colors
                .slice(firstVisibleColor, lastVisibleColor)
                .map(([red, green, blue, alpha], offset) => {
                  const index = firstVisibleColor + offset;
                  const color = `rgba(${red}, ${green}, ${blue}, ${(alpha ?? UINT8_MAX) / UINT8_MAX})`;
                  return (
                    <span
                      key={index}
                      {...stylusPointerInputProps()}
                      data-palette-index={index}
                      role="option"
                      tabIndex={index === (editor.paletteIndex ?? 0) ? 0 : -1}
                      aria-label={tUi("ui.color.2", { value1: index, value2: color })}
                      aria-selected={editor.paletteSelection.includes(index)}
                      title={tUi("ui.index.3", { value1: index, value2: color })}
                      onPointerDown={(event) => {
                        if (event.button === 1) {
                          event.preventDefault();
                          event.stopPropagation();
                          editor.setTransparentPaletteIndex(index);
                          return;
                        }
                        if (event.pointerType === "touch") {
                          event.preventDefault();
                          if (touchPaletteScroll.current) {
                            cancelPaletteGestures();
                            return;
                          }
                          const grid = event.currentTarget.parentElement!;
                          grid.setPointerCapture(event.pointerId);
                          const contact = {
                            owner: editor.gestureOwner,
                            pointer: event.pointerId,
                            index,
                            x: clientPoint(event).x,
                            y: clientPoint(event).y,
                            scroll,
                            moved: false,
                            target: editor.workingColorTarget,
                            mode: "pending" as "pending" | "scroll" | "reorder",
                            timer: null as ReturnType<typeof setTimeout> | null,
                          };
                          touchPaletteScroll.current = contact;
                          if (editor.paletteEditable)
                            contact.timer = setTimeout(() => {
                              if (
                                touchPaletteScroll.current !== contact ||
                                contact.mode !== "pending" ||
                                !editor.isGestureOwnerCurrent(contact.owner)
                              )
                                return;
                              contact.timer = null;
                              contact.mode = "reorder";
                              lastTouchPaletteTap.current = null;
                              const selected = editor.getPaletteSelection();
                              const indices = selected.includes(index) ? selected : [index];
                              editor.setPaletteSelection(indices);
                              outlineDrag.current = {
                                owner: contact.owner,
                                pointer: contact.pointer,
                                target: Math.min(...indices),
                                copy: false,
                                clientX: contact.x,
                                clientY: contact.y,
                              };
                              setOutlineDragging(true);
                            }, TOUCH_LONG_PRESS_DELAY_MS);
                          return;
                        }
                        if (
                          (event.button !== 0 && event.button !== 2) ||
                          outlineDrag.current ||
                          resizeDrag.current
                        )
                          return;
                        event.preventDefault();
                        event.currentTarget.focus({ preventScroll: true });
                        const grid = event.currentTarget.parentElement!;
                        grid.setPointerCapture(event.pointerId);
                        const base =
                          event.ctrlKey || event.metaKey || event.shiftKey
                            ? editor.getPaletteSelection()
                            : [];
                        paletteDrag.current = {
                          owner: editor.gestureOwner,
                          pointer: event.pointerId,
                          anchor: index,
                          button: event.button,
                          base,
                        };
                        editor.setPaletteSelection([...new Set([...base, index])]);
                        chooseColor(index, event.button === 2);
                      }}
                      onClick={(event) => {
                        if (event.detail !== 0) return;
                        editor.setPaletteSelection([index]);
                        chooseColor(index);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        editor.setBackgroundIndex(index);
                        editor.setBackground(paletteHex(colors[index]));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          editor.setPaletteSelection([index]);
                          chooseColor(index);
                        }
                        const delta = (
                          {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -columns,
                            ArrowDown: columns,
                          } as Record<string, number>
                        )[e.key];
                        if (delta) {
                          e.preventDefault();
                          const nextIndex = Math.max(0, Math.min(colors.length - 1, index + delta));
                          editor.setPaletteSelection([nextIndex]);
                          chooseColor(nextIndex);
                          requestAnimationFrame(() =>
                            paletteRoot.current
                              ?.querySelector<HTMLElement>(`[data-palette-index="${nextIndex}"]`)
                              ?.focus({ preventScroll: true }),
                          );
                        }
                      }}
                      style={
                        {
                          position: "absolute",
                          left: (index % columns) * pitch * UI_SCALE_X,
                          top: Math.floor(index / columns) * pitch * UI_SCALE_Y,
                          width: pitch * UI_SCALE_X,
                          height: pitch * UI_SCALE_Y,
                          backgroundColor: color,
                          "--palette-color": color,
                        } as CSSProperties
                      }
                    />
                  );
                })}
            </div>
          </div>
        </div>
        {showTiles && <InlineTileset bounds={tilesetBounds} />}
      </aside>
      {!panelDocked && <ColorbarResizeHandle />}
    </>
  );
}
