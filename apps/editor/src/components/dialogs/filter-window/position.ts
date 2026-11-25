export interface FilterWindowPosition {
  x: number;
  y: number;
}

export interface FilterWindowSize {
  width: number;
  height: number;
}

/** Clamp a restored filter dialog origin into the available scene viewport. */
export function clampFilterWindowPosition(
  position: FilterWindowPosition,
  size: FilterWindowSize,
  viewport: FilterWindowSize,
): FilterWindowPosition {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.round(Math.max(0, Math.min(maxX, position.x))),
    y: Math.round(Math.max(0, Math.min(maxY, position.y))),
  };
}
