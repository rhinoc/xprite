export interface ScrollbarGeometry {
  length: number;
  position: number;
  travel: number;
  maximum: number;
}

/** Integer scrollbar geometry with a host-supplied minimum thumb size. */
export function scrollbarGeometry(
  barSize: number,
  contentSize: number,
  visibleSize: number,
  value: number,
  minimumThumbSize = 0,
  fixedThumbSize?: number,
): ScrollbarGeometry {
  const size = Math.max(0, Math.trunc(barSize));
  const content = Math.max(0, Math.trunc(contentSize));
  const visible = Math.max(0, Math.trunc(visibleSize));
  const maximum = Math.max(0, content - visible);
  const minimum = Math.max(0, Math.trunc(minimumThumbSize));
  const length =
    maximum === 0
      ? size
      : fixedThumbSize !== undefined
        ? Math.min(size, Math.max(0, Math.trunc(fixedThumbSize)))
        : Math.min(size, Math.max(Math.min(minimum, size), Math.trunc((size * visible) / content)));
  const travel = size - length;
  const position =
    maximum === 0 ? 0 : Math.max(0, Math.min(travel, Math.trunc((travel * value) / maximum)));
  return { length, position, travel, maximum };
}
