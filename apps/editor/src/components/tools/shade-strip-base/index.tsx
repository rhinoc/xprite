import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { tUi } from "$/i18n";
import { TOOL_COLOR_CHANNEL_MAX as UINT8_MAX } from "$/managers/tools/color-control";
import { CanvasSurface, type SurfaceViewport, Menu, useUi, Tooltip } from "@xprite/ui";
import {
  centerUiPixel,
  measureUiText,
  paintUiIcon,
  paintUiPart,
  paintUiText,
  uiFontHeight,
  useUiAssets,
} from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import {
  computedStyle,
  clientPoint,
  clientToSurface,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

import styles from "$/components/tools/shade-strip-base/shade-strip-base.module.css";

export type ShadeColor = readonly [number, number, number, number];
interface ShadeStripBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
type ShadeStripViewport = SurfaceViewport;
export interface ShadeStripProps<TColor extends ShadeColor = ShadeColor> {
  colors: readonly TColor[];
  savedShades?: readonly (readonly TColor[])[];
  presetsReady?: boolean;
  onSaveShade?: () => void;
  onRemoveShade?: (index: number) => void;
  onColorsChange: (colors: TColor[]) => void;
  origin: { x: number; y: number };
  height?: number;
  relativeTo?: { x: number; y: number };
  viewport?: ShadeStripViewport;
  label?: string;
  /** Convert working-space color values to their display-space RGB values. */
  toDisplayColor?: (color: TColor) => ShadeColor;
}

const PROMPT = "Select colors in the palette";
const ARROW_WIDTH = 22;
const CHECKER_SIZE = 12;
const CHECKER_LIGHT_FALLBACK = "#c0c0c0";
const CHECKER_DARK_FALLBACK = "#808080";

export function shadeStripWidth(colors: readonly ShadeColor[], emptyPrompt = PROMPT) {
  return (
    ARROW_WIDTH + (colors.length < 2 ? 56 + measureUiText(emptyPrompt) : 12 + colors.length * 24)
  );
}

type ShadeStripStyle = CSSProperties & {
  "--ui-shade-arrow-width": string;
  "--ui-shade-strip-width": string;
  "--ui-shade-strip-height": string;
};

/** Reorderable Aseprite-style color strip. Color profile conversion stays injectable. */
export function ShadeStrip<TColor extends ShadeColor = ShadeColor>({
  colors,
  savedShades,
  presetsReady = true,
  onSaveShade,
  onRemoveShade,
  onColorsChange,
  origin,
  height = 36,
  relativeTo = { x: 0, y: 0 },
  viewport = DEFAULT_SURFACE_VIEWPORT,
  label = "Shades",
  toDisplayColor = (color) => color,
}: ShadeStripProps<TColor>) {
  const assets = useUiAssets();
  const { translateSource } = useUi();
  const emptyPrompt = translateSource(PROMPT);
  const [localSaved, setSaved] = useState<TColor[][]>([]);
  const saved = savedShades ?? localSaved;
  const [hot, setHot] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const [arrowHot, setArrowHot] = useState(false);
  const [arrowPressed, setArrowPressed] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    index: number;
    hot: number;
    colors: TColor[];
  } | null>(null);
  const bounds: ShadeStripBounds = {
    ...origin,
    width: shadeStripWidth(colors, emptyPrompt),
    height,
  };
  const layout = surfaceLayout(bounds, viewport);
  const sx = viewport.width / viewport.sceneWidth;
  const stripWidth = bounds.width - ARROW_WIDTH;
  const style: ShadeStripStyle = {
    left: layout.left - Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
    top: layout.top - Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
    width: layout.width,
    height: layout.height,
    "--ui-shade-arrow-width": `${ARROW_WIDTH * sx}px`,
    "--ui-shade-strip-width": `${stripWidth * sx}px`,
    "--ui-shade-strip-height": `${layout.height}px`,
  };
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!assets) return;
      const { x, y } = origin;
      ctx.fillStyle = arrowPressed
        ? assets.style.colors.menuitem_highlight_face
        : arrowHot
          ? assets.style.colors.check_hot_face
          : assets.style.colors.status_bar_face;
      ctx.fillRect(x, y, ARROW_WIDTH, height);
      paintUiIcon(ctx, assets, "icon_arrow_down", x + 4, centerUiPixel(y, height, 8), {
        color: arrowPressed
          ? assets.style.colors.button_selected_text
          : assets.style.colors.button_normal_text,
      });
      const left = x + ARROW_WIDTH;
      paintUiPart(ctx, assets, "editor_normal", left, y, stripWidth, height);
      const active = drag.current;
      const entries = active?.colors ?? colors;
      if (entries.length < 2) {
        ctx.fillStyle = assets.style.colors.editor_face;
        ctx.fillRect(left + 6, y + 6, stripWidth - 12, height - 12);
        paintUiText(
          ctx,
          assets,
          emptyPrompt,
          centerUiPixel(left + 6, stripWidth - 12, measureUiText(emptyPrompt)),
          centerUiPixel(y + 6, height - 12, uiFontHeight()),
          { color: assets.style.colors.face },
        );
        return;
      }
      const displayed = [...entries];
      if (active) {
        const [color] = displayed.splice(active.index, 1);
        if (hot >= 0) displayed.splice(hot, 0, color);
        else displayed.push([0, 0, 0, 0] as unknown as TColor);
      }
      const width = Math.floor((stripWidth - 12) / entries.length);
      const checkers = strip.current ? computedStyle(strip.current) : null;
      const checkerLight =
        checkers?.getPropertyValue("--ui-shade-checker-light").trim() || CHECKER_LIGHT_FALLBACK;
      const checkerDark =
        checkers?.getPropertyValue("--ui-shade-checker-dark").trim() || CHECKER_DARK_FALLBACK;
      displayed.forEach((color, index) => {
        const bx = left + 6 + index * width;
        const bw = index === entries.length - 1 ? stripWidth - 12 - index * width : width;
        if (color[3] < UINT8_MAX) {
          const tileWidth = Math.max(1, Math.floor(bw / (bw === 24 ? 2 : 4)));
          for (let cy = 0; cy < height - 12; cy += CHECKER_SIZE)
            for (let cx = 0; cx < bw; cx += tileWidth) {
              ctx.fillStyle =
                (Math.floor(cx / tileWidth) + cy / CHECKER_SIZE) % 2 ? checkerDark : checkerLight;
              ctx.fillRect(
                bx + cx,
                y + 6 + cy,
                Math.min(tileWidth, bw - cx),
                Math.min(CHECKER_SIZE, height - 12 - cy),
              );
            }
        }
        const displayedColor = toDisplayColor(color);
        ctx.fillStyle = `rgba(${displayedColor[0]},${displayedColor[1]},${displayedColor[2]},${color[3] / UINT8_MAX})`;
        ctx.fillRect(bx, y + 6, bw, height - 12);
      });
      if (hot >= 0 && hot < entries.length)
        paintUiPart(
          ctx,
          assets,
          "colorbar_selection_hot",
          left + hot * width,
          y,
          width + 12,
          height,
        );
    },
    [
      assets,
      origin.x,
      origin.y,
      stripWidth,
      height,
      colors,
      hot,
      arrowHot,
      arrowPressed,
      toDisplayColor,
      translateSource,
      emptyPrompt,
    ],
  );
  const hit = (event: PointerEvent<HTMLDivElement>) => {
    const { x, y } = clientToSurface(event.currentTarget, clientPoint(event), {
      width: stripWidth,
      height,
    });
    if (x < 6 || x >= stripWidth - 6 || y < 6 || y >= height - 6) return -1;
    const count = Math.max(1, drag.current?.colors.length ?? colors.length);
    return Math.min(
      count - 1,
      Math.floor((x - 6) / Math.max(1, Math.floor((stripWidth - 12) / count))),
    );
  };
  const cancel = useCallback(() => {
    const pointerId = drag.current?.pointerId;
    drag.current = null;
    setDragging(false);
    setHot(-1);
    if (pointerId !== undefined && strip.current?.hasPointerCapture(pointerId))
      strip.current.releasePointerCapture(pointerId);
  }, []);
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [cancel]);

  return (
    <div
      className={styles.shadeStrip}
      style={style}
      role="group"
      aria-label={translateSource(label)}
    >
      <CanvasSurface
        className={styles.surface}
        bounds={bounds}
        viewport={viewport}
        paint={paint}
        aria-hidden="true"
      />
      <Menu
        label="Shade options"
        items={[
          {
            label: "Reverse Shade",
            disabled: colors.length < 2,
            onSelect: () => onColorsChange([...colors].reverse()),
          },
          {
            label: "Save Shade",
            disabled: colors.length < 2 || !presetsReady,
            onSelect: () =>
              onSaveShade ? onSaveShade() : setSaved((current) => [...current, [...colors]]),
          },
          ...saved.flatMap((shade, index) => [
            {
              label: tUi("ui.shade.colors.2", { value1: index + 1, value2: shade.length }),
              separator: index === 0,
              onSelect: () => onColorsChange([...shade]),
            },
            {
              label: tUi("ui.remove.shade", { value1: index + 1 }),
              onSelect: () =>
                onRemoveShade
                  ? onRemoveShade(index)
                  : setSaved((current) => current.filter((_, i) => i !== index)),
            },
          ]),
        ]}
        renderTrigger={({ buttonRef, ...props }) => (
          <Tooltip text="Shades" placement="bottom" disabled={!!props["aria-expanded"]}>
            <button
              {...props}
              ref={buttonRef}
              className={styles.menuTrigger}
              onPointerEnter={() => setArrowHot(true)}
              onPointerLeave={() => {
                setArrowHot(false);
                setArrowPressed(false);
              }}
              onPointerDown={() => setArrowPressed(true)}
              onPointerUp={() => setArrowPressed(false)}
              onPointerCancel={() => setArrowPressed(false)}
              onBlur={() => setArrowPressed(false)}
            />
          </Tooltip>
        )}
      />
      <div
        ref={strip}
        className={styles.colorList}
        role="listbox"
        aria-label={translateSource("Shade colors")}
        tabIndex={0}
        data-dragging={dragging || undefined}
        onPointerMove={(event) => {
          const next = hit(event);
          if (drag.current) drag.current.hot = next;
          setHot(next);
        }}
        onPointerLeave={() => {
          if (!drag.current) setHot(-1);
        }}
        {...stylusPointerInputProps()}
        onPointerDown={(event) => {
          const index = hit(event);
          if (index < 0 || index >= colors.length || colors.length < 2) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          drag.current = {
            pointerId: event.pointerId,
            index,
            hot: index,
            colors: [...colors],
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setHot(index);
          setDragging(true);
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          const next = [...active.colors];
          const [color] = next.splice(active.index, 1);
          const target = hit(event);
          if (target >= 0) next.splice(target, 0, color);
          cancel();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          onColorsChange(next);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && drag.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
      >
        {colors.map((color, index) => (
          <span
            key={index}
            className={styles.option}
            role="option"
            aria-label={translateSource(
              tUi("ui.shade.color.rgba", { value1: index + 1, value2: color.join(", ") }),
            )}
            aria-selected={hot === index}
          />
        ))}
      </div>
    </div>
  );
}
