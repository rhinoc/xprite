import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { PaletteSurface, type PaletteRgba } from "$/components/palette/palette-surface";
import { tUi, tUiSource } from "$/i18n";
import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import {
  useWheelInput,
  useWheelInputHandler,
  EditorWheelSurface,
  EditorWheelAction,
  wheelCellSizeDelta,
} from "$/managers/input/use-wheel-input";
import { getPaletteGridLayout as asepritePaletteLayout } from "$/managers/palette/palette-view";
import {
  paletteTileIndex,
  paletteTileSourcePoint,
  TilemapPaletteDisplayMode,
  TilesetEditingMode,
  useTilemapModeBarModel,
  useTilemapPaletteModel,
} from "$/managers/palette/tilemap-model";
import { ContextMenu as EditorContextMenu } from "@xprite/ui";
import { Button, Scrollbar, TOUCH_LONG_PRESS_DELAY_MS, TOUCH_MOVE_THRESHOLD } from "@xprite/ui";
import { CanvasSurface, type SurfaceBounds } from "@xprite/ui";
import { useUi } from "@xprite/ui";
import {
  useUiAssets,
  paintUiText,
  measureUiText,
  uiFontHeight,
  centerUiPixel,
} from "@xprite/ui/assets";
import { UI_SCALE_Y } from "@xprite/ui/canvas";
import {
  hitElement,
  clientPoint,
  clientRect,
  clientScale,
  clientDeltaToLocal,
  PointerDragActivation,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

const TILESET_VIEWPORT_INSET = 6;
const TILESET_CELL_INSET = 2;
const TILESET_SCROLLBAR_WIDTH = 12;

const TILESET_EDITING_MODES = [
  TilesetEditingMode.Manual,
  TilesetEditingMode.Auto,
  TilesetEditingMode.Stack,
] as const;

/** ColorBar::m_tilesHBox: visible only for a selected Tilemap layer. */
export function TilemapModeBar({
  width,
  showBoth,
  onShowBothChange,
  canToggleBoth = true,
}: {
  width: number;
  showBoth: boolean;
  onShowBothChange: (value: boolean) => void;
  canToggleBoth?: boolean;
}) {
  const editor = useTilemapModeBarModel();
  const { style: uiStyle } = useUi();
  const mode = editor.mode;
  const setMode = editor.tilesetMode;
  const [contextMode, setContextMode] = useState(setMode);
  const toggleBoth = () => onShowBothChange(!showBoth);
  const first = { x: 4, y: 0, width: 30, height: 32 };
  const itemWidth = 30,
    itemPitch = 28,
    itemStart = 42;
  return (
    <EditorContextMenu
      label={tUi("ui.tileset.mode", { value1: tUiSource(contextMode) })}
      longPressTarget="[data-tileset-mode]"
      items={[
        {
          label: "Reorder Tiles by Touch",
          checked: editor.tilesetEditable,
          disabled: !editor.canReorderTiles,
          onSelect: () => editor.setTilesetEditable(!editor.tilesetEditable),
        },
        ...(canToggleBoth
          ? [{ label: "Show Colors and Tiles", checked: showBoth, onSelect: toggleBoth }]
          : []),
        {
          label: "Set As Default",
          checked: editor.defaultTilesetMode === contextMode,
          onSelect: () => editor.saveDefaultTilesetMode(contextMode),
        },
      ]}
      onContextMenu={(event) => {
        const target = (event.target as Element).closest<HTMLElement>("[data-tileset-mode]");
        const value = TILESET_EDITING_MODES.find((item) => item === target?.dataset.tilesetMode);
        if (value) setContextMode(value);
        else event.preventDefault();
      }}
    >
      <div
        className="xse-tilemap-mode-bar"
        data-tileset-panel=""
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height: 36,
          zIndex: 4,
          background: "var(--xse-workspace,#7d929e)",
        }}
      >
        <Button
          bounds={first}
          icon="tiles"
          part="buttonset_item_normal"
          selectedPart="buttonset_item_active"
          selected={mode === TilemapPaletteDisplayMode.Tiles}
          tintIcon
          color={
            mode === TilemapPaletteDisplayMode.Tiles
              ? uiStyle.colors.button_selected_text
              : uiStyle.colors.button_normal_text
          }
          aria-label="Show Tileset"
          title={tUiSource(
            canToggleBoth ? "Show Tileset / Right-click to Show Only the Tileset" : "Show Tileset",
          )}
          aria-pressed={mode === TilemapPaletteDisplayMode.Tiles}
          onClick={editor.toggleDisplayMode}
          onContextMenu={(event) => {
            event.preventDefault();
            if (canToggleBoth) toggleBoth();
          }}
        />
        {TILESET_EDITING_MODES.map((value, index) => {
          const labels = {
            manual: "Manual: Modify existing tiles, don't create new tiles automatically",
            auto: "Auto: Modify and reuse existing tiles, create/delete tiles if needed/possible",
            stack: "Stack: Don't modify existing tiles, generate and stack new tiles automatically",
          };
          return (
            <Button
              key={value}
              data-tileset-mode={value}
              bounds={{ x: itemStart + index * itemPitch, y: 0, width: itemWidth, height: 32 }}
              icon={`tiles_${value}`}
              part="buttonset_item_normal"
              selectedPart="buttonset_item_hot"
              selected={setMode === value}
              aria-label={tUi("ui.tileset.mode.2", {
                value1: tUiSource(value[0].toUpperCase() + value.slice(1)),
              })}
              title={labels[value]}
              aria-pressed={setMode === value}
              onClick={() => editor.setTilesetMode(value)}
            />
          );
        })}
      </div>
    </EditorContextMenu>
  );
}

type TileDrag = {
  owner: object;
  pointer: number;
  startX: number;
  startY: number;
  indices: number[];
  started: boolean;
};
/** Aseprite's PaletteView tiles adapter, sharing its frame and selection painter. */
export function InlineTileset({ bounds }: { bounds: SurfaceBounds }) {
  const { resolve: resolveWheel } = useWheelInput();
  const wheelTarget = useRef<HTMLDivElement>(null);
  const editor = useTilemapPaletteModel();
  const assets = useUiAssets();
  const [boxSize, setBoxSize] = useState(16),
    [scrollY, setScrollY] = useState(0);
  const [selected, setSelected] = useState<number[]>([]),
    [anchor, setAnchor] = useState(0),
    [dropBefore, setDropBefore] = useState<number | null>(null);
  const touch = useRef<{
    owner: object;
    pointer: number;
    index: number;
    x: number;
    y: number;
    scroll: number;
    mode: "pending" | "scroll" | "reorder";
    timer: number | null;
    target: WorkingColorTarget;
  } | null>(null);
  const lastTouchTileTap = useRef<{
    index: number;
    at: number;
    x: number;
    y: number;
    foreground: number;
    selected: number[];
    anchor: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<number | null>(null),
    resize = useRef<{
      pointer: number;
      target: number;
      activation: PointerDragActivation;
    } | null>(null);
  const [hasRemapSource, setHasRemapSource] = useState(false),
    drag = useRef<TileDrag | null>(null);
  const set = editor.tileset;
  const pixels = set?.pixels;
  const cancelGestures = () => {
    if (touch.current?.timer !== null && touch.current?.timer !== undefined)
      window.clearTimeout(touch.current.timer);
    touch.current = null;
    lastTouchTileTap.current = null;
    drag.current = null;
    resize.current = null;
    setResizePreview(null);
    setDropBefore(null);
  };
  useLayoutEffect(() => {
    cancelGestures();
    return cancelGestures;
  }, [editor.gestureOwner, editor.tilesetEditable, editor.workingColorTarget]);
  useEffect(() => {
    window.addEventListener("blur", cancelGestures);
    return () => window.removeEventListener("blur", cancelGestures);
  });
  useEffect(() => {
    setSelected([]);
    setScrollY(0);
    setHasRemapSource(false);
    setResizePreview(null);
  }, [set?.id]);
  const count = set?.tileCount ?? 0,
    displayCount = resizePreview ?? count,
    innerHeight = Math.max(1, bounds.height - 12),
    layout = asepritePaletteLayout(
      displayCount,
      boxSize,
      undefined,
      innerHeight,
      Math.max(1, bounds.width - 24),
    );
  const { columns, cellSize, pitch } = layout,
    scroll = Math.min(scrollY, layout.maxScroll);
  const colors = useMemo<PaletteRgba[]>(
    () => Array.from({ length: displayCount }, () => [0, 0, 0, 0]),
    [displayCount],
  );
  const foreground = paletteTileIndex(editor.selectedTileWord),
    background = paletteTileIndex(editor.backgroundTileWord);
  const tilesActive = editor.displayMode === TilemapPaletteDisplayMode.Tiles;
  const externalOnly = Boolean(set && !set.hasPixels);
  const select = (
    index: number,
    event?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ) => {
    const rowY = TILESET_CELL_INSET + Math.floor(index / columns) * pitch;
    if (rowY < scroll) setScrollY(rowY);
    else if (rowY + cellSize > scroll + innerHeight)
      setScrollY(Math.min(layout.maxScroll, rowY + cellSize - innerHeight));
    if (event?.shiftKey) {
      const lo = Math.min(anchor, index),
        hi = Math.max(anchor, index);
      setSelected([
        ...new Set([...selected, ...Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)]),
      ]);
    } else if (event?.ctrlKey || event?.metaKey)
      setSelected(
        selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index],
      );
    else setSelected([index]);
    if (!event?.shiftKey) setAnchor(index);
    editor.selectTile(index);
  };
  const targetAt = (x: number, y: number): number | null => {
    const node = hitElement({ x: x, y: y }, document)?.closest<HTMLElement>("[data-tile-index]");
    if (!node || !node.closest("[data-tileset-panel]")) return null;
    const result = Number(node.dataset.tileIndex);
    return Number.isInteger(result) ? result : null;
  };
  const begin = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || !set) return;
    if (event.pointerType === "touch") {
      event.preventDefault();
      if (touch.current) {
        cancelGestures();
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const contact = {
        owner: editor.gestureOwner,
        pointer: event.pointerId,
        index,
        x: clientPoint(event).x,
        y: clientPoint(event).y,
        scroll,
        mode: "pending" as "pending" | "scroll" | "reorder",
        timer: null as number | null,
        target: editor.workingColorTarget,
      };
      touch.current = contact;
      if (editor.tilesetEditable && !externalOnly)
        contact.timer = window.setTimeout(() => {
          if (
            touch.current !== contact ||
            contact.mode !== "pending" ||
            !editor.isGestureOwnerCurrent(contact.owner)
          )
            return;
          contact.mode = "reorder";
          contact.timer = null;
          lastTouchTileTap.current = null;
          const oldSelection = selected.includes(index) ? selected : [index];
          select(index);
          drag.current = {
            owner: contact.owner,
            pointer: contact.pointer,
            startX: contact.x,
            startY: contact.y,
            indices: oldSelection,
            started: false,
          };
        }, TOUCH_LONG_PRESS_DELAY_MS);
      return;
    }
    const oldSelection = selected.includes(index) ? selected : [index];
    select(index, event);
    drag.current = {
      owner: editor.gestureOwner,
      pointer: event.pointerId,
      startX: clientPoint(event).x,
      startY: clientPoint(event).y,
      indices: oldSelection,
      started: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const owner = touch.current?.owner ?? drag.current?.owner;
    if (owner && !editor.isGestureOwnerCurrent(owner)) {
      cancelGestures();
      return;
    }
    const contact = touch.current;
    if (contact?.pointer === event.pointerId) {
      if (
        contact.mode === "pending" &&
        Math.hypot(clientPoint(event).x - contact.x, clientPoint(event).y - contact.y) >=
          TOUCH_MOVE_THRESHOLD
      ) {
        if (contact.timer !== null) window.clearTimeout(contact.timer);
        contact.timer = null;
        contact.mode = "scroll";
      }
      if (contact.mode === "scroll") {
        event.preventDefault();
        setScrollY(
          Math.max(
            0,
            Math.min(
              layout.maxScroll,
              contact.scroll -
                (clientPoint(event).y - contact.y) /
                  (UI_SCALE_Y * clientScale(event.currentTarget).y),
            ),
          ),
        );
        return;
      }
      if (contact.mode === "pending") return;
    }
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId || externalOnly) return;
    if (
      !current.started &&
      Math.hypot(clientPoint(event).x - current.startX, clientPoint(event).y - current.startY) < 5
    )
      return;
    current.started = true;
    const tile = targetAt(clientPoint(event).x, clientPoint(event).y);
    if (tile === null) {
      setDropBefore(count);
      return;
    }
    const node = hitElement(
      { x: clientPoint(event).x, y: clientPoint(event).y },
      document,
    )?.closest<HTMLElement>("[data-tile-index]");
    const rect = clientRect(node);
    setDropBefore(tile + (rect && clientPoint(event).x >= rect.left + rect.width / 2 ? 1 : 0));
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    const owner = touch.current?.owner ?? drag.current?.owner;
    if (owner && !editor.isGestureOwnerCurrent(owner)) {
      cancelGestures();
      return;
    }
    const contact = touch.current;
    if (contact?.pointer === event.pointerId) {
      if (contact.timer !== null) window.clearTimeout(contact.timer);
      touch.current = null;
      if (contact.mode === "pending") {
        const previous = lastTouchTileTap.current;
        const doubleTap =
          contact.target === WorkingColorTarget.Foreground &&
          previous?.index === contact.index &&
          event.timeStamp - previous.at < 380 &&
          Math.hypot(clientPoint(event).x - previous.x, clientPoint(event).y - previous.y) < 18;
        if (doubleTap && previous) {
          lastTouchTileTap.current = null;
          editor.selectTile(previous.foreground);
          setSelected(previous.selected);
          setAnchor(previous.anchor);
          editor.setBackgroundTile(contact.index);
        } else {
          lastTouchTileTap.current = {
            index: contact.index,
            at: event.timeStamp,
            x: clientPoint(event).x,
            y: clientPoint(event).y,
            foreground: editor.selectedTileWord,
            selected: [...selected],
            anchor,
          };
          if (contact.target === WorkingColorTarget.Background) {
            editor.setBackgroundTile(contact.index);
            lastTouchTileTap.current = null;
          } else select(contact.index);
        }
        event.currentTarget.focus({ preventScroll: true });
      } else lastTouchTileTap.current = null;
      if (contact.mode !== "reorder") {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
    }
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const before = dropBefore;
    setDropBefore(null);
    if (!current.started || before === null || externalOnly) return;
    const copy = event.altKey || event.ctrlKey || event.metaKey;
    editor.moveTilesetTiles(current.indices, before, copy);
    if (!copy) setHasRemapSource(true);
  };
  const wheel = (event: WheelEvent) => {
    const node = wheelTarget.current;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    const decision = resolveWheel(event, EditorWheelSurface.Palette);
    if (decision.action === EditorWheelAction.CellSize) {
      setBoxSize((size) => Math.max(4, Math.min(32, size + wheelCellSizeDelta(decision))));
      return;
    }
    const delta = decision.precise
      ? clientDeltaToLocal(node, { x: decision.x, y: decision.y }).y
      : Math.sign(decision.y) * 3 * cellSize;
    setScrollY((value) => Math.max(0, Math.min(layout.maxScroll, value + delta)));
  };
  useWheelInputHandler(wheelTarget, wheel);
  if (!set || !pixels || bounds.height <= 0) return null;
  const candidates = Array.from({ length: count }, (_, i) => i).filter((index) => {
    const y = TILESET_CELL_INSET + Math.floor(index / columns) * pitch;
    return y + pitch >= scroll && y <= scroll + innerHeight;
  });
  const canvasStyle: CSSProperties = { position: "absolute", left: bounds.x, top: bounds.y };
  const handle = assets?.style.parts.pal_resize;
  const handleX =
    bounds.x +
    8 +
    (displayCount % columns) * pitch +
    Math.floor(cellSize / 2) -
    (handle?.width ?? 4);
  const handleY =
    bounds.y +
    8 +
    Math.floor(displayCount / columns) * pitch -
    scroll +
    Math.floor(cellSize / 2) -
    (handle?.height ?? 4);
  const resizeAt = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = resize.current;
    if (!drag || drag.pointer !== event.pointerId || !drag.activation.update(event)) return;
    const host = event.currentTarget.closest<HTMLElement>("[data-tileset-panel]");
    if (!host) return;
    const root = clientRect(host);
    const scale = clientScale(host);
    const x = Math.max(0, (clientPoint(event).x - root.left) / scale.x - bounds.x - 8),
      y = Math.max(0, (clientPoint(event).y - root.top) / scale.y - bounds.y - 8 + scroll);
    const column = Math.max(0, Math.min(columns - 1, Math.floor(x / pitch))),
      row = Math.max(0, Math.floor(y / pitch));
    drag.target = Math.max(1, Math.min(4096, row * columns + column));
    setResizePreview(drag.target);
  };
  const finishResize = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = resize.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (commit) resizeAt(event);
    resize.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit && drag.target !== count) editor.resizeTileset(drag.target);
    setResizePreview(null);
  };
  return (
    <div
      data-tileset-panel=""
      aria-label={tUi("ui.tileset")}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <PaletteSurface
        bounds={bounds}
        colors={colors}
        foregroundIndex={tilesActive ? foreground : null}
        backgroundIndex={tilesActive ? background : null}
        selectedIndices={selected}
        columns={columns}
        boxSize={boxSize}
        scrollY={scroll}
        showScrollbar={layout.showScrollbar}
        contentHeight={layout.contentHeight}
        tileset={{ pixels, tileWidth: set.tileWidth, tileHeight: set.tileHeight }}
        showResizeHandle={!externalOnly}
        style={canvasStyle}
      />
      <div
        role="listbox"
        aria-label={tUi("ui.tiles")}
        aria-multiselectable="true"
        tabIndex={-1}
        ref={wheelTarget}
        onKeyDown={(event) => {
          const delta =
            event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowLeft"
                ? -1
                : event.key === "ArrowDown"
                  ? columns
                  : event.key === "ArrowUp"
                    ? -columns
                    : 0;
          if (delta) {
            event.preventDefault();
            const next = Math.max(0, Math.min(count - 1, foreground + delta));
            select(next);
            const listbox = event.currentTarget;
            requestAnimationFrame(() =>
              listbox
                .querySelector<HTMLElement>(`[data-tile-index="${next}"]`)
                ?.focus({ preventScroll: true }),
            );
          }
          if (
            (event.key === "Delete" || event.key === "Backspace") &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey
          ) {
            event.preventDefault();
            event.stopPropagation();
            lastTouchTileTap.current = null;
            if (event.repeat) return;
            const deletable = selected.filter((index) => index > 0);
            if (!externalOnly && deletable.length > 0) {
              const targetOption =
                event.target instanceof Element
                  ? event.target.closest<HTMLElement>("[data-tile-index]")
                  : null;
              const focusedIndex = targetOption
                ? Number(targetOption.dataset.tileIndex)
                : Math.min(...deletable);
              const deleted = new Set(deletable);
              const retainedIndices = Array.from({ length: count }, (_, index) => index).filter(
                (index) => !deleted.has(index),
              );
              const exactIndex = retainedIndices.indexOf(focusedIndex);
              const nextPosition =
                exactIndex >= 0
                  ? exactIndex
                  : retainedIndices.findIndex((index) => index > focusedIndex);
              const nextFocusIndex = nextPosition >= 0 ? nextPosition : retainedIndices.length - 1;
              const listbox = event.currentTarget;
              listbox.focus({ preventScroll: true });
              editor.deleteTilesetTiles(deletable);
              setSelected([]);
              requestAnimationFrame(() =>
                listbox
                  .querySelector<HTMLElement>(`[data-tile-index="${nextFocusIndex}"]`)
                  ?.focus({ preventScroll: true }),
              );
            }
          }
        }}
        style={{
          position: "absolute",
          left: bounds.x + TILESET_VIEWPORT_INSET,
          top: bounds.y + TILESET_VIEWPORT_INSET,
          width: Math.max(
            0,
            bounds.width -
              TILESET_VIEWPORT_INSET * 2 -
              (layout.showScrollbar ? TILESET_SCROLLBAR_WIDTH : 0),
          ),
          height: innerHeight,
          overflow: "hidden",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      >
        {candidates.map((index) => (
          <button
            key={index}
            type="button"
            role="option"
            data-tile-index={index}
            aria-label={
              index === 0
                ? tUi("ui.empty.tile")
                : tUi("ui.tile", { value1: index + set.baseIndex - 1 })
            }
            aria-selected={selected.includes(index)}
            {...stylusPointerInputProps()}
            onPointerDown={(event) => begin(event, index)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={cancelGestures}
            onLostPointerCapture={cancelGestures}
            onContextMenu={(event) => {
              event.preventDefault();
              editor.setBackgroundTile(index);
              setSelected([index]);
              setAnchor(index);
            }}
            onClick={(event) => {
              if (event.detail === 0) select(index);
            }}
            style={{
              position: "absolute",
              left: TILESET_CELL_INSET + (index % columns) * pitch,
              top: TILESET_CELL_INSET + Math.floor(index / columns) * pitch - scroll,
              width: pitch,
              height: pitch,
              padding: 0,
              border: 0,
              background: "transparent",
              cursor: "var(--ui-cursor-default,default)",
            }}
          />
        ))}
      </div>
      {layout.showScrollbar && (
        <Scrollbar
          bounds={{
            x: bounds.x + bounds.width - TILESET_VIEWPORT_INSET - TILESET_SCROLLBAR_WIDTH,
            y: bounds.y + TILESET_VIEWPORT_INSET,
            width: TILESET_SCROLLBAR_WIDTH,
            height: innerHeight,
          }}
          contentSize={layout.contentHeight}
          visibleSize={innerHeight}
          value={scroll}
          onValueChange={setScrollY}
          aria-label={tUi("ui.tileset.scroll")}
          style={{ pointerEvents: "auto", zIndex: 3 }}
        />
      )}
      {!externalOnly && (
        <button
          type="button"
          {...stylusPointerInputProps()}
          aria-label={tUi("ui.resize.tileset")}
          title={tUi("ui.new.tileset.size", { value1: resizePreview ?? count })}
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.pointerType === "touch" && !editor.tilesetEditable))
              return;
            event.preventDefault();
            event.stopPropagation();
            resize.current = {
              pointer: event.pointerId,
              target: count,
              activation: new PointerDragActivation(event),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizePreview(count);
          }}
          onPointerMove={(event) => {
            if (resize.current?.pointer === event.pointerId) resizeAt(event);
          }}
          onPointerUp={(event) => finishResize(event, true)}
          onPointerCancel={(event) => finishResize(event, false)}
          onLostPointerCapture={(event) => finishResize(event, false)}
          onKeyDown={(event) => {
            const delta =
              event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : event.key === "ArrowDown"
                    ? columns
                    : event.key === "ArrowUp"
                      ? -columns
                      : 0;
            if (delta) {
              event.preventDefault();
              editor.resizeTileset(Math.max(1, count + delta));
            }
          }}
          style={{
            position: "absolute",
            left: handleX - 4,
            top: handleY - 4,
            width: (handle?.width ?? 4) * 2 + 8,
            height: (handle?.height ?? 4) * 2 + 8,
            background: "transparent",
            border: 0,
            padding: 0,
            pointerEvents: "auto",
            touchAction: "none",
            cursor: "var(--ui-cursor-resize-horizontal,ew-resize)",
            visibility:
              handleY + (handle?.height ?? 4) * 2 <= bounds.y + TILESET_VIEWPORT_INSET ||
              handleY >= bounds.y + bounds.height - TILESET_VIEWPORT_INSET
                ? "hidden"
                : "visible",
          }}
        />
      )}
      {hasRemapSource && (
        <Button
          bounds={{
            x: bounds.x + 8,
            y: bounds.y + bounds.height - 30,
            width: Math.min(120, bounds.width - 16),
            height: 26,
          }}
          relativeTo={{ x: 0, y: 0 }}
          text="Remap Tiles"
          aria-label="Remap Tiles"
          style={{ zIndex: 5, pointerEvents: "auto" }}
          onClick={() => {
            editor.remapMovedTiles();
            setHasRemapSource(false);
          }}
        />
      )}
      {dropBefore !== null && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: bounds.x + 8 + (dropBefore % columns) * pitch,
            top: bounds.y + 8 + Math.floor(dropBefore / columns) * pitch - scroll,
            width: 2,
            height: cellSize,
            background: "var(--xse-white, #fff)",
          }}
        />
      )}
    </div>
  );
}

/** ColorBar::m_tilesHelpers: large foreground/background tile swatches. */
export function TileFields({ bounds, style }: { bounds: SurfaceBounds; style?: CSSProperties }) {
  const editor = useTilemapPaletteModel();
  const assets = useUiAssets();
  const drag = useRef<{ pointer: number; target: "foreground" | "background" } | null>(null);
  const set = editor.tileset;
  const pixels = set?.pixels;
  const foregroundWord = editor.selectedTileWord >>> 0;
  const backgroundWord = editor.backgroundTileWord >>> 0;
  const foreground = paletteTileIndex(foregroundWord);
  const background = paletteTileIndex(backgroundWord);
  if (!set || !pixels) return null;
  const square = Math.min(64, Math.floor((bounds.width - 16) / 2)),
    verticalSize = square + 4,
    gap = 8,
    left = bounds.x + 8,
    top = bounds.y + bounds.height - square - 4;
  const paint = (context: CanvasRenderingContext2D) => {
    if (!assets) return;
    context.fillStyle = assets.style.colors.workspace;
    context.fillRect(bounds.x, top - 6, bounds.width, bounds.y + bounds.height - top + 6);
    const drawEdge = (
      name: "colorbar_0" | "colorbar_1" | "colorbar_2" | "colorbar_3",
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => {
      const part = assets.style.parts[name];
      context.drawImage(assets.sheet, part.x + sx, part.y + sy, sw, sh, dx, dy, dw, dh);
    };
    const border = (x: number, y: number) => {
      const edge = 10,
        middle = square - edge * 2,
        middleY = verticalSize - edge * 2;
      drawEdge("colorbar_0", 0, 0, 5, 5, x, y, edge, edge);
      drawEdge("colorbar_0", 5, 0, 6, 5, x + edge, y, middle, edge);
      drawEdge("colorbar_1", 11, 0, 5, 5, x + square - edge, y, edge, edge);
      drawEdge("colorbar_0", 0, 5, 5, 6, x, y + edge, edge, middleY);
      drawEdge("colorbar_1", 11, 5, 5, 6, x + square - edge, y + edge, edge, middleY);
      drawEdge("colorbar_2", 0, 11, 5, 5, x, y + verticalSize - edge, edge, edge);
      drawEdge("colorbar_2", 5, 11, 6, 5, x + edge, y + verticalSize - edge, middle, edge);
      drawEdge("colorbar_3", 11, 11, 5, 5, x + square - edge, y + verticalSize - edge, edge, edge);
    };
    for (const [ordinal, word] of [foregroundWord, backgroundWord].entries()) {
      const index = paletteTileIndex(word);
      const x = left + ordinal * (square + gap),
        y = top;
      const content = square - 4,
        contentHeight = verticalSize - 8,
        check = content / 2;
      for (let cy = 0; cy < contentHeight; cy += check)
        for (let cx = 0; cx < content; cx += check) {
          context.fillStyle =
            (Math.floor(cx / check) + Math.floor(cy / check)) % 2 ? "#808080" : "#c0c0c0";
          context.fillRect(x + 2 + cx, y + 4 + cy, check, Math.min(check, contentHeight - cy));
        }
      const stride = set.tileWidth * set.tileHeight * 4,
        offset = index * stride;
      if (index > 0 && pixels.length >= offset + stride) {
        const source = document.createElement("canvas");
        source.width = set.tileWidth;
        source.height = set.tileHeight;
        const tilePixels = new Uint8ClampedArray(stride),
          original = pixels.subarray(offset, offset + stride);
        for (let ty = 0; ty < set.tileHeight; ty++)
          for (let tx = 0; tx < set.tileWidth; tx++) {
            const sourcePoint = paletteTileSourcePoint(word, tx, ty, set.tileWidth, set.tileHeight);
            if (!sourcePoint) continue;
            tilePixels.set(
              original.subarray(
                (sourcePoint.y * set.tileWidth + sourcePoint.x) * 4,
                (sourcePoint.y * set.tileWidth + sourcePoint.x + 1) * 4,
              ),
              (ty * set.tileWidth + tx) * 4,
            );
          }
        source
          .getContext("2d")
          ?.putImageData(new ImageData(tilePixels, set.tileWidth, set.tileHeight), 0, 0);
        context.imageSmoothingEnabled = false;
        context.drawImage(source, x + 2, y + 2, content, verticalSize - 4);
      }
      border(x, y);
      if (index > 0) {
        const label = String(index + set.baseIndex - 1);
        paintUiText(
          context,
          assets,
          label,
          centerUiPixel(x, square, measureUiText(label, "mini")),
          centerUiPixel(y, verticalSize, uiFontHeight("mini")) - 1,
          { font: "mini", color: "#000" },
        );
      }
    }
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const hit = hitElement(
      { x: clientPoint(event).x, y: clientPoint(event).y },
      document,
    )?.closest<HTMLElement>("[data-tile-index]");
    if (!hit) return;
    const index = Number(hit.dataset.tileIndex);
    if (!Number.isInteger(index) || index < 0 || index >= set.tileCount) return;
    if (current.target === "foreground") editor.selectTile(index);
    else editor.setBackgroundTile(index);
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const buttonProps = (target: "foreground" | "background") => ({
    ...stylusPointerInputProps(),
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      editor.setWorkingColorTarget(
        target === "foreground" ? WorkingColorTarget.Foreground : WorkingColorTarget.Background,
      );
      drag.current = { pointer: event.pointerId, target };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: move,
    onPointerUp: release,
    onPointerCancel: release,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pointerEvents: "none",
        ...style,
      }}
    >
      <CanvasSurface bounds={bounds} paint={paint} style={{ pointerEvents: "none" }} />
      <button
        type="button"
        aria-label={tUi("ui.foreground.tile", { value1: foreground })}
        {...buttonProps("foreground")}
        style={{
          position: "absolute",
          left: left - bounds.x,
          top: top - bounds.y,
          width: square,
          height: verticalSize,
          border: 0,
          background: "transparent",
          pointerEvents: "auto",
        }}
      />
      <button
        type="button"
        aria-label={tUi("ui.background.tile", { value1: background })}
        {...buttonProps("background")}
        style={{
          position: "absolute",
          left: left + square + gap - bounds.x,
          top: top - bounds.y,
          width: square,
          height: verticalSize,
          border: 0,
          background: "transparent",
          pointerEvents: "auto",
        }}
      />
    </div>
  );
}
