export enum PopoverSide {
  Bottom = "bottom",
  Left = "left",
}

export interface PopoverPlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** All inputs use the same coordinate system; the caller chooses scene or client units. */
export function placeAnchoredPopover(
  anchor: PopoverPlacementRect,
  size: Pick<PopoverPlacementRect, "width" | "height">,
  available: Pick<PopoverPlacementRect, "width" | "height">,
  {
    side = PopoverSide.Bottom,
    gap = 0,
    fallbackGap = gap,
    inset = 0,
    fitHeight = false,
  }: {
    side?: PopoverSide;
    gap?: number;
    fallbackGap?: number;
    inset?: number;
    fitHeight?: boolean;
  } = {},
): PopoverPlacementRect {
  const maximumX = available.width - inset;
  const maximumY = available.height - inset;
  const below = Math.max(0, maximumY - anchor.y - anchor.height - gap);
  const above = Math.max(0, anchor.y - fallbackGap - inset);
  const width = fitHeight
    ? Math.min(size.width, Math.max(0, available.width - inset * 2))
    : size.width;
  const height = fitHeight
    ? Math.min(size.height, Math.max(above, below) || available.height)
    : size.height;
  let x = anchor.x;
  let y = anchor.y;
  if (side === PopoverSide.Left) {
    x =
      anchor.x - width - gap >= inset
        ? anchor.x - width - gap
        : anchor.x + anchor.width + fallbackGap;
  } else {
    y =
      below >= size.height || (fitHeight && below >= above)
        ? anchor.y + anchor.height + gap
        : anchor.y - fallbackGap - height;
  }
  return {
    x: Math.max(inset, Math.min(maximumX - width, x)),
    y: Math.max(inset, Math.min(maximumY - height, y)),
    width,
    height,
  };
}
