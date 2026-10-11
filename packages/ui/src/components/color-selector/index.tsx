import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
  type RefObject,
  type PointerEvent,
} from "react";

import { ThemePart } from "$/base/theme/theme-part";
import { cn } from "$/base/utils/cn";
import { clientPoint, clientToSurface } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { CanvasSurface, surfaceLayout, type SurfaceBounds } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { Icon } from "$/components/icon";
import { useUi } from "$/components/theme";

import styles from "$/components/color-selector/color-selector.module.css";

export enum ColorSelectorPart {
  Main = "main",
  Bottom = "bottom",
  Alpha = "alpha",
}
export enum ColorSelectorInput {
  Mouse = "mouse",
  Touch = "touch",
  Pen = "pen",
  Keyboard = "keyboard",
}
export enum ColorSelectorButton {
  Primary = 0,
  Secondary = 2,
}
export type ColorSelectorRgba = readonly [number, number, number, number];
export interface ColorSelectorPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ColorSelectorInteraction {
  input: ColorSelectorInput;
  button: ColorSelectorButton | null;
  captured: boolean;
  paint: boolean;
}
export interface ColorSelectorMark {
  x: number;
  y: number;
  light: boolean;
}
export interface ColorSelectorHandle {
  readColor(point: { x: number; y: number }): ColorSelectorRgba | null;
  isDragging(): boolean;
}
interface ColorSelectorProps<Sample extends { color: ColorSelectorRgba }> {
  bounds: SurfaceBounds;
  sample(
    part: ColorSelectorPart,
    point: ColorSelectorPosition,
    interaction: ColorSelectorInteraction,
  ): Sample | null;
  displayColor(color: ColorSelectorRgba): string;
  indicators(part: ColorSelectorPart, width: number, height: number): readonly ColorSelectorMark[];
  onChange(sample: Sample, interaction: ColorSelectorInteraction): void;
  onHover(sample: Sample | null): void;
  onKeyStep(part: ColorSelectorPart, horizontal: number, vertical: number): void;
  labels: Record<ColorSelectorPart, string>;
  valueText: Record<ColorSelectorPart, string>;
  valueNow: Record<ColorSelectorPart, number>;
  gestureOwner: object;
  elementRef?: RefObject<HTMLDivElement>;
  controlRef?: Ref<ColorSelectorHandle>;
  className?: string;
  style?: CSSProperties;
}
const INSET = 3 * RASTER_SCALE;
const BAR_HEIGHT = 8 * RASTER_SCALE;
const INDICATOR_HALF_SIZE = 2 * RASTER_SCALE;
const KEY_STEP = 0.01;
const LARGE_KEY_STEP = 0.1;
const CHECKER_SIZE = 8;
const CHECKER_ROW_HEIGHT = 4;
const CHECKER_DARK = "#808080";
const CHECKER_LIGHT = "#c0c0c0";
const PAINT_INTERACTION: ColorSelectorInteraction = {
  input: ColorSelectorInput.Mouse,
  button: null,
  captured: false,
  paint: true,
};
const READ_INTERACTION: ColorSelectorInteraction = { ...PAINT_INTERACTION, paint: false };

/** Skin, sampling, captured pointer drags, keyboard input, and indicators for a color plane and two channels. */
export function ColorSelector<Sample extends { color: ColorSelectorRgba }>({
  bounds,
  sample,
  displayColor,
  indicators,
  onChange,
  onHover,
  onKeyStep,
  labels,
  valueText,
  valueNow,
  gestureOwner,
  elementRef,
  controlRef,
  className,
  style,
}: ColorSelectorProps<Sample>) {
  const { style: theme } = useUi();
  const internalRoot = useRef<HTMLDivElement>(null);
  const root = elementRef ?? internalRoot;
  const dragging = useRef<{
    pointer: number;
    interaction: ColorSelectorInteraction;
    owner: object;
  } | null>(null);
  const surfaces = useRef(new Map<ColorSelectorPart, HTMLButtonElement>());
  useEffect(() => {
    const cancel = () => {
      const pointer = dragging.current?.pointer;
      dragging.current = null;
      if (pointer !== undefined)
        for (const surface of surfaces.current.values())
          if (surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer);
    };
    cancel();
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [gestureOwner]);
  const innerHeight = Math.max(0, bounds.height - INSET * 2);
  const bottomHeight = innerHeight > BAR_HEIGHT * 2 ? BAR_HEIGHT : 0;
  const alphaHeight = innerHeight > BAR_HEIGHT * 3 ? BAR_HEIGHT : 0;
  const mainHeight = Math.max(
    0,
    RASTER_SCALE * Math.floor((innerHeight - bottomHeight - alphaHeight) / RASTER_SCALE),
  );
  const contentWidth = Math.max(RASTER_SCALE, bounds.width - INSET * 2);
  const parts = [
    { part: ColorSelectorPart.Main, y: INSET, height: mainHeight },
    { part: ColorSelectorPart.Bottom, y: INSET + mainHeight, height: bottomHeight },
    { part: ColorSelectorPart.Alpha, y: INSET + mainHeight + bottomHeight, height: alphaHeight },
  ].filter((area) => area.height > 0);
  const dimensions = (height: number) => ({
    width: Math.max(1, Math.floor(contentWidth / RASTER_SCALE)),
    height: Math.max(1, Math.floor(height / RASTER_SCALE)),
  });
  const pointAt = (
    element: HTMLElement,
    point: { x: number; y: number },
    height: number,
  ): ColorSelectorPosition => {
    const size = dimensions(height);
    const position = clientToSurface(element, point, size);
    return { ...size, x: Math.floor(position.x), y: Math.floor(position.y) };
  };
  useImperativeHandle(controlRef, () => ({
    isDragging: () => dragging.current !== null,
    readColor: (point) => {
      for (const area of parts) {
        const node = surfaces.current.get(area.part);
        if (!node) continue;
        const position = pointAt(node, point, area.height);
        if (
          position.x >= 0 &&
          position.y >= 0 &&
          position.x < position.width &&
          position.y < position.height
        )
          return sample(area.part, position, READ_INTERACTION)?.color ?? null;
      }
      return null;
    },
  }));
  const paint = useCallback(
    (context: CanvasRenderingContext2D) => {
      context.fillStyle = theme.colors.workspace;
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      for (const area of parts) {
        const size = dimensions(area.height);
        context.fillStyle = theme.colors.editor_face;
        context.fillRect(bounds.x + INSET, bounds.y + area.y, contentWidth, area.height);
        for (let y = 0; y < size.height; y++)
          for (let x = 0; x < size.width; x++) {
            const color = sample(area.part, { ...size, x, y }, PAINT_INTERACTION)?.color;
            const px = bounds.x + INSET + x * RASTER_SCALE;
            const py = bounds.y + area.y + y * RASTER_SCALE;
            if (area.part === ColorSelectorPart.Alpha) {
              context.fillStyle =
                (Math.floor(x / CHECKER_SIZE) + Math.floor(y / CHECKER_ROW_HEIGHT)) % 2
                  ? CHECKER_LIGHT
                  : CHECKER_DARK;
              context.fillRect(px, py, RASTER_SCALE, RASTER_SCALE);
            }
            if (color) {
              context.fillStyle = displayColor(color);
              context.fillRect(px, py, RASTER_SCALE, RASTER_SCALE);
            }
          }
      }
    },
    [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      parts,
      sample,
      displayColor,
      theme.colors.workspace,
      theme.colors.editor_face,
    ],
  );
  const pick = (
    area: (typeof parts)[number],
    event: PointerEvent<HTMLButtonElement>,
    interaction: ColorSelectorInteraction,
    apply: boolean,
  ) => {
    const result = sample(
      area.part,
      pointAt(event.currentTarget, clientPoint(event), area.height),
      interaction,
    );
    onHover(result);
    if (result && apply) onChange(result, interaction);
  };
  const layout = surfaceLayout(bounds);
  return (
    <div
      ref={root}
      className={cn(styles.root, className)}
      style={{ width: layout.width, height: layout.height, ...style }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dragging.current = null;
      }}
    >
      <CanvasSurface
        bounds={bounds}
        paint={paint}
        aria-hidden="true"
        className={styles.background}
      />
      <ThemePart
        part="editor_normal"
        scale={RASTER_SCALE}
        drawCenter={false}
        aria-hidden="true"
        className={styles.frame}
      />
      {parts.map((area) => {
        const size = dimensions(area.height);
        const placement = surfaceLayout({
          x: INSET,
          y: area.y,
          width: contentWidth,
          height: area.height,
        });
        return (
          <div key={area.part} className={styles.area} style={placement}>
            <div className={styles.indicators} aria-hidden="true">
              {indicators(area.part, size.width, size.height).map((mark, index) => (
                <Icon
                  key={index}
                  kind="color_wheel_indicator"
                  scale={RASTER_SCALE}
                  x={Math.trunc(mark.x) * RASTER_SCALE - INDICATOR_HALF_SIZE}
                  y={Math.trunc(mark.y) * RASTER_SCALE - INDICATOR_HALF_SIZE}
                  color={mark.light ? "#fff" : "#000"}
                />
              ))}
            </div>
            <button
              type="button"
              role="slider"
              className={styles.input}
              ref={(node) => {
                if (node) surfaces.current.set(area.part, node);
                else surfaces.current.delete(area.part);
              }}
              aria-label={labels[area.part]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={valueNow[area.part]}
              aria-valuetext={valueText[area.part]}
              {...stylusPointerInputProps()}
              onContextMenu={(event) => event.preventDefault()}
              onPointerEnter={(event) => pick(area, event, READ_INTERACTION, false)}
              onPointerLeave={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) onHover(null);
              }}
              onPointerDown={(event) => {
                if (
                  !event.isPrimary ||
                  dragging.current ||
                  (event.button !== ColorSelectorButton.Primary &&
                    event.button !== ColorSelectorButton.Secondary)
                )
                  return;
                event.preventDefault();
                const interaction = {
                  input:
                    event.pointerType === ColorSelectorInput.Touch
                      ? ColorSelectorInput.Touch
                      : event.pointerType === ColorSelectorInput.Pen
                        ? ColorSelectorInput.Pen
                        : ColorSelectorInput.Mouse,
                  button: event.button,
                  captured: true,
                  paint: false,
                };
                dragging.current = { pointer: event.pointerId, interaction, owner: gestureOwner };
                event.currentTarget.focus({ preventScroll: true });
                event.currentTarget.setPointerCapture(event.pointerId);
                pick(area, event, interaction, true);
              }}
              onPointerMove={(event) => {
                const drag = dragging.current;
                const captured =
                  drag?.pointer === event.pointerId &&
                  drag.owner === gestureOwner &&
                  event.currentTarget.hasPointerCapture(event.pointerId);
                pick(area, event, captured && drag ? drag.interaction : READ_INTERACTION, captured);
              }}
              onPointerUp={(event) => {
                if (dragging.current?.pointer === event.pointerId) dragging.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                dragging.current = null;
                onHover(null);
              }}
              onLostPointerCapture={() => {
                dragging.current = null;
              }}
              onKeyDown={(event) => {
                if (
                  area.part !== ColorSelectorPart.Main &&
                  (event.key === "Home" || event.key === "End")
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  onKeyStep(area.part, event.key === "Home" ? -1 : 1, 0);
                  return;
                }
                const direction =
                  event.key === "ArrowRight"
                    ? [1, 0]
                    : event.key === "ArrowLeft"
                      ? [-1, 0]
                      : event.key === "ArrowDown"
                        ? [0, 1]
                        : event.key === "ArrowUp"
                          ? [0, -1]
                          : null;
                if (!direction) return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey ? LARGE_KEY_STEP : KEY_STEP;
                onKeyStep(area.part, direction[0]! * step, direction[1]! * step);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
