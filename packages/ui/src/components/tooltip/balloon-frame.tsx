import type { UiTooltipPointerArtwork } from "$/base/theme/theme-types";
import type { TooltipRect, TooltipPlacement } from "$/components/tooltip/geometry";
import type { PositionedTooltipLayout } from "$/components/tooltip/types";

import styles from "$/components/tooltip/tooltip.module.css";

const BALLOON_RADIUS = 5;
const POINTER_HALF_WIDTH = 7;
const BALLOON_STROKE = 1;
const POINTER_JOIN = 1;
const CORNER_POINTER_OUTER = 18;
const CORNER_POINTER_INNER = 10;
const BALLOON_SHADOW = 1;

export function balloonBody(
  bounds: TooltipRect,
  placement: TooltipPlacement,
  pointerSize: number,
  suppliedInsets?: { left: number; top: number; right: number; bottom: number },
) {
  const left = suppliedInsets?.left ?? (placement === "left" ? pointerSize : 0);
  const top = suppliedInsets?.top ?? (placement.includes("top") ? pointerSize : 0);
  const right = bounds.width - (suppliedInsets?.right ?? (placement === "right" ? pointerSize : 0));
  const bottom =
    bounds.height - (suppliedInsets?.bottom ?? (placement.includes("bottom") ? pointerSize : 0));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** The pointer and hard shadow are included in the measured popup, without resampling. */
export function BalloonFrame({
  layout,
  face,
  ink,
  pointerSize,
  pointerArtwork,
}: {
  layout: PositionedTooltipLayout;
  face: string;
  ink: string;
  pointerSize: number;
  pointerArtwork?: UiTooltipPointerArtwork;
}) {
  const { bounds, target, placement } = layout;
  const { left, top, right, bottom, width, height } = balloonBody(
    bounds,
    placement,
    pointerSize,
    pointerArtwork?.bodyInsets,
  );
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const cx = clamp(
    target.x + target.width / 2 - bounds.x,
    left + POINTER_HALF_WIDTH,
    right - POINTER_HALF_WIDTH,
  );
  const cy = clamp(
    target.y + target.height / 2 - bounds.y,
    top + POINTER_HALF_WIDTH,
    bottom - POINTER_HALF_WIDTH,
  );
  const pointers = {
    "top-left": `M ${left + CORNER_POINTER_OUTER} ${top + POINTER_JOIN} L 1 1 L ${left + CORNER_POINTER_INNER} ${top + POINTER_JOIN}`,
    "top-right": `M ${right - CORNER_POINTER_OUTER} ${top + POINTER_JOIN} L ${bounds.width - 1} 1 L ${right - CORNER_POINTER_INNER} ${top + POINTER_JOIN}`,
    "bottom-left": `M ${left + CORNER_POINTER_INNER} ${bottom - POINTER_JOIN} L 1 ${bounds.height - 1} L ${left + CORNER_POINTER_OUTER} ${bottom - POINTER_JOIN}`,
    "bottom-right": `M ${right - CORNER_POINTER_INNER} ${bottom - POINTER_JOIN} L ${bounds.width - 1} ${bounds.height - 1} L ${right - CORNER_POINTER_OUTER} ${bottom - POINTER_JOIN}`,
    top: `M ${cx - POINTER_HALF_WIDTH} ${top + POINTER_JOIN} L ${cx} 1 L ${cx + POINTER_HALF_WIDTH} ${top + POINTER_JOIN}`,
    bottom: `M ${cx - POINTER_HALF_WIDTH} ${bottom - POINTER_JOIN} L ${cx} ${bounds.height - 1} L ${cx + POINTER_HALF_WIDTH} ${bottom - POINTER_JOIN}`,
    left: `M ${left + POINTER_JOIN} ${cy - POINTER_HALF_WIDTH} L 1 ${cy} L ${left + POINTER_JOIN} ${cy + POINTER_HALF_WIDTH}`,
    right: `M ${right - POINTER_JOIN} ${cy - POINTER_HALF_WIDTH} L ${bounds.width - 1} ${cy} L ${right - POINTER_JOIN} ${cy + POINTER_HALF_WIDTH}`,
  };
  if (pointerArtwork) {
    const {
      inkPath,
      facePath,
      width: pw,
      height: ph,
      horizontal,
      horizontalInset,
      vertical,
      verticalInset,
    } = pointerArtwork;
    const x =
      placement === "top" || placement === "bottom"
        ? cx - pw / 2
        : horizontal === "left"
          ? horizontalInset
          : bounds.width - pw - horizontalInset;
    const y =
      placement === "left" || placement === "right"
        ? cy - ph / 2
        : vertical === "top"
          ? verticalInset
          : bounds.height - ph - verticalInset;
    return (
      <>
        <span className={styles.balloonBody} style={{ left, top, width, height }} />
        <svg
          aria-hidden="true"
          className={styles.balloonPointer}
          width={bounds.width}
          height={bounds.height}
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          shapeRendering="crispEdges"
        >
          <g transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
            <path d={inkPath} fill={ink} fillRule="evenodd" />
            <path d={facePath} fill={face} fillRule="evenodd" />
          </g>
        </svg>
      </>
    );
  }
  return (
    <svg
      width={bounds.width}
      height={bounds.height}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
    >
      <rect
        x={left + BALLOON_SHADOW}
        y={top + BALLOON_SHADOW}
        width={width}
        height={height}
        rx={BALLOON_RADIUS}
        fill={ink}
      />
      <rect
        x={left + BALLOON_STROKE / 2}
        y={top + BALLOON_STROKE / 2}
        width={width - BALLOON_STROKE}
        height={height - BALLOON_STROKE}
        rx={BALLOON_RADIUS}
        fill={face}
        stroke={ink}
        strokeWidth={BALLOON_STROKE}
      />
      <path
        d={
          pointers[placement as keyof typeof pointers] ??
          pointers[placement.startsWith("left") ? "left" : "right"]
        }
        fill={face}
        stroke={ink}
        strokeWidth={BALLOON_STROKE}
        strokeLinejoin="miter"
      />
    </svg>
  );
}
