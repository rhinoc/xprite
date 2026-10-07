/** Aseprite GUI-pixel rectangles. Placement names describe the arrow's edge,
 * so a `top` arrow puts the tooltip below its target (ui/tooltips.cpp). */
export interface TooltipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type TooltipPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "left-top"
  | "left-bottom"
  | "right-top"
  | "right-bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";
export type TooltipPlacementOption = TooltipPlacement | "auto";
const LEFT = 0x00040000,
  RIGHT = 0x00100000,
  TOP = 0x00200000,
  BOTTOM = 0x00800000;
const flags: Record<TooltipPlacement, number> = {
  top: TOP,
  bottom: BOTTOM,
  left: LEFT,
  right: RIGHT,
  "left-top": TOP | LEFT,
  "left-bottom": BOTTOM | LEFT,
  "right-top": TOP | RIGHT,
  "right-bottom": BOTTOM | RIGHT,
  "top-left": TOP | LEFT,
  "top-right": TOP | RIGHT,
  "bottom-left": BOTTOM | LEFT,
  "bottom-right": BOTTOM | RIGHT,
};
const half = (value: number) => Math.trunc(value / 2);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const intersects = (a: TooltipRect, b: TooltipRect) =>
  a.width > 0 &&
  a.height > 0 &&
  b.width > 0 &&
  b.height > 0 &&
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

/** Choose the side with enough room for the tooltip; center below when neither side fits. */
export function autoTooltipPlacement(
  target: TooltipRect,
  size: Pick<TooltipRect, "width" | "height">,
  workArea: TooltipRect,
): TooltipPlacement {
  const leftSpace = target.x - workArea.x;
  const rightSpace = workArea.x + workArea.width - (target.x + target.width);
  const fitsLeft = leftSpace >= size.width;
  const fitsRight = rightSpace >= size.width;
  if (fitsRight && (!fitsLeft || rightSpace >= leftSpace)) return "top-left";
  if (fitsLeft) return "top-right";
  return "top";
}

/** Port of Aseprite TipWindow::pointAt. Inputs are integer GUI pixels in one coordinate
 * space. Clamping precedes intersection testing; failure tries opposite,
 * rotated, then opposite-of-rotated alignment, not a generic best-fit search. */
export function tooltipPosition(
  target: TooltipRect,
  size: { width: number; height: number },
  workArea: TooltipRect,
  preferred: TooltipPlacement,
): { bounds: TooltipRect; placement: TooltipPlacement } | null {
  let align = flags[preferred];
  const { width, height } = size;
  for (let attempt = 0; attempt < 4; attempt++) {
    let x = target.x,
      y = target.y;
    if (align & LEFT) x += target.width;
    else if (align & RIGHT) x -= width;
    else x += half(target.width) - half(width);
    if (align & TOP) y += target.height;
    else if (align & BOTTOM) y -= height;
    else y += half(target.height) - half(height);
    const preferredX = x;
    const preferredY = y;
    x = clamp(x, workArea.x, Math.max(workArea.x, workArea.x + workArea.width - width));
    y = clamp(y, workArea.y, Math.max(workArea.y, workArea.y + workArea.height - height));
    const bounds = { x, y, width, height };
    if (!intersects(target, bounds)) {
      // A corner arrow cannot keep pointing at the target after edge clamping.
      // Use the middle of the appropriate edge while retaining the fitted bounds.
      let arrowAlign = align;
      if (x !== preferredX && align & (TOP | BOTTOM)) arrowAlign &= ~(LEFT | RIGHT);
      else if (y !== preferredY && align & (LEFT | RIGHT)) arrowAlign &= ~(TOP | BOTTOM);
      const lateralCorner = preferred.startsWith("left-") || preferred.startsWith("right-");
      const placement =
        (Object.keys(flags) as TooltipPlacement[]).find(
          (key) =>
            flags[key] === arrowAlign &&
            (key.startsWith("left-") || key.startsWith("right-")) === lateralCorner,
        ) ?? (Object.keys(flags) as TooltipPlacement[]).find((key) => flags[key] === arrowAlign)!;
      return { bounds, placement };
    }
    if (attempt === 0 || attempt === 2) {
      if (align & (TOP | BOTTOM)) align ^= TOP | BOTTOM;
      if (align & (LEFT | RIGHT)) align ^= LEFT | RIGHT;
    } else if (attempt === 1) {
      if (align & (TOP | LEFT)) align ^= TOP | LEFT;
      if (align & (BOTTOM | RIGHT)) align ^= BOTTOM | RIGHT;
    }
  }
  return null;
}

/** Theme::paintTooltip arrow geometry at GUI scale 2. `atlas` is the destination
 * rectangle for the entire 32×32 tooltip_arrow part, clipped by `clip`.
 * Target and bounds must use the same coordinate system. */
export function tooltipArrow(
  bounds: TooltipRect,
  target: TooltipRect,
  placement: TooltipPlacement,
): { clip: TooltipRect; atlas: TooltipRect } {
  const align = flags[placement];
  const clip = { x: 0, y: 0, width: 0, height: 0 };
  const atlas = { x: 0, y: 0, width: 32, height: 32 };
  if (align & LEFT) {
    clip.width = 10;
    clip.x = bounds.x;
    atlas.x = bounds.x;
  } else if (align & RIGHT) {
    clip.width = 10;
    clip.x = bounds.x + bounds.width - clip.width;
    atlas.x = bounds.x + bounds.width - atlas.width;
  } else {
    clip.width = 12;
    clip.x = target.x + half(target.width) - half(clip.width);
    atlas.x = clip.x - 10;
  }
  if (align & TOP) {
    clip.height = 10;
    clip.y = bounds.y;
    atlas.y = bounds.y;
  } else if (align & BOTTOM) {
    clip.height = 12;
    clip.y = bounds.y + bounds.height - clip.height;
    atlas.y = bounds.y + bounds.height - atlas.height;
  } else {
    clip.height = 10;
    clip.y = target.y + half(target.height) - half(clip.height);
    atlas.y = clip.y - 10;
  }
  return { clip, atlas };
}
