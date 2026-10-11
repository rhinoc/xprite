import { useEffect, useRef, useState, type PointerEvent } from "react";

import type {
  AnimalCrossingSettings,
  animalCrossingGrid,
} from "@xprite/editor-core/import-export/animal-crossing";
import { Button, CanvasSurface, Text, TextVariant } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";
import {
  clientPoint,
  clientScale,
  clientToLocal,
  PointerDragActivation,
  PointerDragAxis,
  PointerResizeGesture,
} from "@xprite/ui/utils";

import styles from "$/animal-crossing/grid-overlay.module.css";
const UNIT_VIEWPORT = { sceneWidth: 1, sceneHeight: 1, width: 1, height: 1 };
const HANDLE_HIT_SIZE = 16;
const HANDLE_HIT_RADIUS = HANDLE_HIT_SIZE / 2;
const HANDLE_MARK_SIZE = 8;
const HANDLE_MARK_RADIUS = HANDLE_MARK_SIZE / 2;
const GAP_HANDLE_OFFSET = 24;

enum GridHandle {
  Move = "move",
  Width = "width",
  Height = "height",
  Corner = "corner",
  SpacingX = "spacingX",
  SpacingY = "spacingY",
}
const HANDLE_LABELS: Record<GridHandle, string> = {
  [GridHandle.Move]: "Move grid",
  [GridHandle.Width]: "Resize cell width",
  [GridHandle.Height]: "Resize cell height",
  [GridHandle.Corner]: "Resize cell width and height",
  [GridHandle.SpacingX]: "Adjust horizontal spacing",
  [GridHandle.SpacingY]: "Adjust vertical spacing",
};
interface GridDrag {
  pointer: number;
  target: HTMLButtonElement;
  handle: GridHandle;
  activation: PointerDragActivation;
  resize?: PointerResizeGesture;
  start: { x: number; y: number };
  settings: AnimalCrossingSettings;
  factor: { x: number; y: number };
}

export interface AnimalCrossingGridOverlayProps {
  source: { width: number; height: number };
  settings: AnimalCrossingSettings;
  grid: ReturnType<typeof animalCrossingGrid> | null;
  selected: number;
  view: { zoom: number; origin: { x: number; y: number } };
  size: { width: number; height: number };
  disabled: boolean;
  editable: boolean;
  navigating?: boolean;
  translate?(message: string): string;
  onSettingsChange(patch: Partial<AnimalCrossingSettings>): void;
  onSelect(index: number): void;
  onBeginEdit(): void;
  onEndEdit(cancel?: boolean): void;
}
export function AnimalCrossingGridOverlay({
  source,
  settings,
  grid,
  selected,
  view,
  size,
  disabled,
  editable,
  navigating = false,
  translate = (message) => message,
  onSettingsChange,
  onSelect,
  onBeginEdit,
  onEndEdit,
}: AnimalCrossingGridOverlayProps) {
  const assets = useUiAssets();
  const endEdit = useRef(onEndEdit);
  endEdit.current = onEndEdit;
  const host = useRef<HTMLDivElement | null>(null);
  const drag = useRef<GridDrag | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<GridHandle | null>(null);
  const [focusedHandle, setFocusedHandle] = useState<GridHandle | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<GridHandle | null>(null);
  const tap = useRef<{
    pointer: number;
    activation: PointerDragActivation;
    moved: boolean;
    pan: boolean;
  } | null>(null);
  const point = (event: PointerEvent<HTMLElement>) =>
    clientToLocal(host.current!, clientPoint(event));
  const endDrag = (cancel = false) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    setDraggingHandle(null);
    setFocusedHandle(null);
    setHoveredHandle(null);
    if (active.target.hasPointerCapture(active.pointer))
      active.target.releasePointerCapture(active.pointer);
    endEdit.current(cancel);
  };
  useEffect(
    () => () => {
      const active = drag.current;
      if (!active) return;
      drag.current = null;
      if (active.target.hasPointerCapture(active.pointer))
        active.target.releasePointerCapture(active.pointer);
      endEdit.current(true);
    },
    [],
  );
  useEffect(() => {
    if (disabled || !editable || navigating) endDrag(true);
  }, [disabled, editable, navigating]);
  const origin = {
    x: view.origin.x + settings.offsetX * view.zoom,
    y: view.origin.y + settings.offsetY * view.zoom,
  };
  const selectedCell = grid?.cells[selected];
  const selectedBox = {
    x: view.origin.x + (selectedCell?.x ?? settings.offsetX) * view.zoom,
    y: view.origin.y + (selectedCell?.y ?? settings.offsetY) * view.zoom,
    width: (selectedCell?.width ?? settings.cellWidth) * view.zoom,
    height: (selectedCell?.height ?? settings.cellHeight) * view.zoom,
  };
  const right = selectedBox.x + selectedBox.width,
    bottom = selectedBox.y + selectedBox.height;
  const firstRight = origin.x + settings.cellWidth * view.zoom,
    firstBottom = origin.y + settings.cellHeight * view.zoom;
  const spacingWidth = settings.spacingX * view.zoom,
    spacingHeight = settings.spacingY * view.zoom;
  const square = (x: number, y: number) => ({
    x: x - HANDLE_HIT_RADIUS,
    y: y - HANDLE_HIT_RADIUS,
    width: HANDLE_HIT_SIZE,
    height: HANDLE_HIT_SIZE,
  });
  const handles = [
    {
      handle: GridHandle.Move,
      x: origin.x,
      y: origin.y,
      cursor: "move",
      hit: square(origin.x, origin.y),
    },
    {
      handle: GridHandle.Width,
      x: right,
      y: selectedBox.y + selectedBox.height / 2,
      cursor: "ew-resize",
      hit: {
        x: right - HANDLE_HIT_RADIUS,
        y: selectedBox.y + HANDLE_HIT_RADIUS,
        width: HANDLE_HIT_SIZE,
        height: Math.max(1, selectedBox.height - HANDLE_HIT_SIZE),
      },
    },
    {
      handle: GridHandle.Height,
      x: selectedBox.x + selectedBox.width / 2,
      y: bottom,
      cursor: "ns-resize",
      hit: {
        x: selectedBox.x + HANDLE_HIT_RADIUS,
        y: bottom - HANDLE_HIT_RADIUS,
        width: Math.max(1, selectedBox.width - HANDLE_HIT_SIZE),
        height: HANDLE_HIT_SIZE,
      },
    },
    {
      handle: GridHandle.Corner,
      x: right,
      y: bottom,
      cursor: "nwse-resize",
      hit: square(right, bottom),
    },
    {
      handle: GridHandle.SpacingX,
      x: firstRight + spacingWidth / 2,
      y: origin.y - GAP_HANDLE_OFFSET,
      cursor: "ew-resize",
      hit: {
        x: firstRight - HANDLE_HIT_RADIUS,
        y: origin.y - GAP_HANDLE_OFFSET - HANDLE_HIT_RADIUS,
        width: spacingWidth + HANDLE_HIT_SIZE,
        height: HANDLE_HIT_SIZE,
      },
    },
    {
      handle: GridHandle.SpacingY,
      x: origin.x - GAP_HANDLE_OFFSET,
      y: firstBottom + spacingHeight / 2,
      cursor: "ns-resize",
      hit: {
        x: origin.x - GAP_HANDLE_OFFSET - HANDLE_HIT_RADIUS,
        y: firstBottom - HANDLE_HIT_RADIUS,
        width: HANDLE_HIT_SIZE,
        height: spacingHeight + HANDLE_HIT_SIZE,
      },
    },
  ];
  const visibleHandle =
    disabled || !editable || navigating ? null : (draggingHandle ?? hoveredHandle ?? focusedHandle);
  const activeHandle = handles.find((item) => item.handle === visibleHandle);
  const resolveHandle = (point: { x: number; y: number }) => {
    if (disabled || !editable || navigating) return null;
    return (
      handles.find(
        ({ hit }) =>
          point.x >= hit.x &&
          point.y >= hit.y &&
          point.x <= hit.x + hit.width &&
          point.y <= hit.y + hit.height,
      )?.handle ?? null
    );
  };
  return (
    <div
      ref={host}
      className={styles.stage}
      aria-label={translate("Source grid")}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag.current) {
          endDrag(true);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const columns = grid?.columns ?? 0;
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
        if (delta && grid && !disabled) {
          onSelect(Math.max(0, Math.min(grid.cells.length - 1, selected + delta)));
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerDown={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        tap.current = {
          pointer: event.pointerId,
          activation: new PointerDragActivation(event),
          moved: false,
          pan: navigating || event.button !== 0,
        };
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocusedHandle(null);
        setHoveredHandle(null);
        tap.current = null;
        endDrag(true);
      }}
      onPointerLeave={(event) => {
        if (!drag.current && event.pointerType !== "touch") {
          setHoveredHandle(null);
        }
      }}
      onPointerMove={(event) => {
        if (!drag.current && event.pointerType !== "touch") {
          const p = point(event);
          setHoveredHandle(resolveHandle(p));
        }
        if (tap.current?.pointer === event.pointerId && tap.current.activation.update(event))
          tap.current.moved = true;
      }}
      onPointerUp={(event) => {
        const start = tap.current;
        tap.current = null;
        if (
          !start ||
          start.pointer !== event.pointerId ||
          start.moved ||
          start.pan ||
          navigating ||
          disabled
        )
          return;
        const p = point(event);
        if (event.pointerType === "touch") {
          const handle = resolveHandle(p);
          setHoveredHandle(handle);
          if (handle) return;
        }
        const x = (p.x - view.origin.x) / view.zoom,
          y = (p.y - view.origin.y) / view.zoom;
        const index =
          grid?.cells.findIndex(
            (cell) =>
              x >= cell.x && y >= cell.y && x < cell.x + cell.width && y < cell.y + cell.height,
          ) ?? -1;
        if (index >= 0) onSelect(index);
      }}
      onPointerCancel={() => {
        tap.current = null;
      }}
    >
      <CanvasSurface
        className={styles.artwork}
        bounds={{ x: 0, y: 0, width: size.width, height: size.height }}
        viewport={UNIT_VIEWPORT}
        aria-hidden
        paint={(ctx) => {
          for (const [index, cell] of (grid?.cells ?? []).entries()) {
            const x = Math.round(view.origin.x + cell.x * view.zoom),
              y = Math.round(view.origin.y + cell.y * view.zoom);
            const width = Math.round(cell.width * view.zoom),
              height = Math.round(cell.height * view.zoom);
            ctx.strokeStyle = "rgba(0,0,0,0.75)";
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 0.5, y + 0.5, width, height);
            ctx.strokeStyle =
              index === selected ? (assets?.style.colors.select_box_ruler ?? "#0000ff") : "#fff";
            ctx.lineWidth = index === selected ? 2 : 1;
            ctx.strokeRect(x + 0.5, y + 0.5, width, height);
            if (index === selected) {
              ctx.fillStyle = "rgba(64,96,255,0.18)";
              ctx.fillRect(x, y, width, height);
            }
          }
          if (activeHandle) {
            ctx.strokeStyle = assets?.style.colors.select_box_ruler ?? "#0000ff";
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (visibleHandle === GridHandle.SpacingX) {
              ctx.moveTo(firstRight, activeHandle.y);
              ctx.lineTo(firstRight + spacingWidth, activeHandle.y);
              ctx.moveTo(firstRight, activeHandle.y - 4);
              ctx.lineTo(firstRight, activeHandle.y + 4);
              ctx.moveTo(firstRight + spacingWidth, activeHandle.y - 4);
              ctx.lineTo(firstRight + spacingWidth, activeHandle.y + 4);
            } else if (visibleHandle === GridHandle.SpacingY) {
              ctx.moveTo(activeHandle.x, firstBottom);
              ctx.lineTo(activeHandle.x, firstBottom + spacingHeight);
              ctx.moveTo(activeHandle.x - 4, firstBottom);
              ctx.lineTo(activeHandle.x + 4, firstBottom);
              ctx.moveTo(activeHandle.x - 4, firstBottom + spacingHeight);
              ctx.lineTo(activeHandle.x + 4, firstBottom + spacingHeight);
            }
            ctx.stroke();
            const x = Math.round(activeHandle.x),
              y = Math.round(activeHandle.y);
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#000";
            ctx.fillRect(
              x - HANDLE_MARK_RADIUS,
              y - HANDLE_MARK_RADIUS,
              HANDLE_MARK_SIZE,
              HANDLE_MARK_SIZE,
            );
            ctx.strokeRect(
              x - HANDLE_MARK_RADIUS + 0.5,
              y - HANDLE_MARK_RADIUS + 0.5,
              HANDLE_MARK_SIZE - 1,
              HANDLE_MARK_SIZE - 1,
            );
          }
        }}
      />
      {handles.map(({ handle, hit, cursor }) => (
        <Button
          key={handle}
          className={styles.gridHandle}
          paintArtwork={false}
          data-visible={visibleHandle === handle || undefined}
          aria-label={translate(HANDLE_LABELS[handle])}
          title={translate(HANDLE_LABELS[handle])}
          disabled={disabled || !editable}
          bounds={hit}
          viewport={UNIT_VIEWPORT}
          style={{ cursor }}
          onFocus={() => setFocusedHandle(handle)}
          onBlur={() => setFocusedHandle(null)}
          onPointerEnter={() => {
            if (!drag.current) setHoveredHandle(handle);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current || navigating) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            onBeginEdit();
            setDraggingHandle(handle);
            const factor = {
              x: grid ? (selected % grid.columns) + 1 : 1,
              y: grid ? Math.floor(selected / grid.columns) + 1 : 1,
            };
            const horizontal = handle === GridHandle.Width || handle === GridHandle.SpacingX;
            const vertical = handle === GridHandle.Height || handle === GridHandle.SpacingY;
            const key =
              handle === GridHandle.Width
                ? "cellWidth"
                : handle === GridHandle.Height
                  ? "cellHeight"
                  : handle === GridHandle.SpacingX
                    ? "spacingX"
                    : "spacingY";
            const scale = clientScale(host.current!);
            drag.current = {
              pointer: event.pointerId,
              target: event.currentTarget,
              handle,
              factor,
              start: point(event),
              settings: { ...settings },
              activation: new PointerDragActivation(event),
              resize:
                horizontal || vertical
                  ? new PointerResizeGesture(event, {
                      axis: horizontal ? PointerDragAxis.Horizontal : PointerDragAxis.Vertical,
                      initialValue: settings[key],
                      pixelsPerUnit:
                        view.zoom *
                        (horizontal ? scale.x : scale.y) *
                        (handle === GridHandle.Width
                          ? factor.x
                          : handle === GridHandle.Height
                            ? factor.y
                            : 1),
                    })
                  : undefined,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointer !== event.pointerId || !active.activation.update(event))
              return;
            const current = point(event);
            const dx = Math.round((current.x - active.start.x) / view.zoom),
              dy = Math.round((current.y - active.start.y) / view.zoom);
            const draft = active.settings;
            const value = active.resize?.valueAt(event);
            if (handle === GridHandle.Move)
              onSettingsChange({
                offsetX: Math.max(0, Math.min(source.width - 1, draft.offsetX + dx)),
                offsetY: Math.max(0, Math.min(source.height - 1, draft.offsetY + dy)),
              });
            else if (handle === GridHandle.Corner)
              onSettingsChange({
                cellWidth: Math.max(
                  1,
                  draft.cellWidth +
                    Math.round((current.x - active.start.x) / (view.zoom * active.factor.x)),
                ),
                cellHeight: Math.max(
                  1,
                  draft.cellHeight +
                    Math.round((current.y - active.start.y) / (view.zoom * active.factor.y)),
                ),
              });
            else if (value !== null && value !== undefined) {
              const key =
                handle === GridHandle.Width
                  ? "cellWidth"
                  : handle === GridHandle.Height
                    ? "cellHeight"
                    : handle === GridHandle.SpacingX
                      ? "spacingX"
                      : "spacingY";
              onSettingsChange({
                [key]: Math.max(key.startsWith("cell") ? 1 : 0, Math.round(value)),
              });
            }
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer === event.pointerId) {
              endDrag();
            }
            event.stopPropagation();
          }}
          onPointerCancel={() => endDrag(true)}
          onLostPointerCapture={() => endDrag(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && drag.current) {
              endDrag(true);
              event.stopPropagation();
              return;
            }
            const delta =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
            if (!delta) return;
            event.preventDefault();
            event.stopPropagation();
            const key =
              handle === GridHandle.Move
                ? event.key === "ArrowLeft" || event.key === "ArrowRight"
                  ? "offsetX"
                  : "offsetY"
                : handle === GridHandle.Width
                  ? "cellWidth"
                  : handle === GridHandle.Height
                    ? "cellHeight"
                    : handle === GridHandle.SpacingX
                      ? "spacingX"
                      : handle === GridHandle.SpacingY
                        ? "spacingY"
                        : event.key === "ArrowLeft" || event.key === "ArrowRight"
                          ? "cellWidth"
                          : "cellHeight";
            onSettingsChange({
              [key]: Math.max(key.startsWith("cell") ? 1 : 0, settings[key] + delta),
            });
          }}
        />
      ))}
      {activeHandle && (
        <div className={styles.handleHint}>
          <Text
            variant={TextVariant.Control}
            viewport={UNIT_VIEWPORT}
            bounds={{ x: 0, y: 0, width: size.width - 16, height: 24 }}
            text={translate(HANDLE_LABELS[activeHandle.handle])}
          />
        </div>
      )}
    </div>
  );
}
