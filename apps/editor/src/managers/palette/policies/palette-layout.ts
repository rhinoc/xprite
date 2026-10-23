/** Palette grid layout for reference viewport 136×660 at scale 2.
 * Mini vertical bar uses 12 scene px when content overflows.
 */
export function paletteLayout(
  count: number,
  boxSize = 11,
  initialColumns?: number,
  viewportHeight = 660,
  viewportWidth = 134,
) {
  const cellSize = Math.floor(Math.max(4, Math.min(32, boxSize)) * 2);
  const pitch = cellSize + 2;
  let columns = initialColumns ?? Math.max(1, Math.floor(viewportWidth / pitch));
  columns = Math.max(1, Math.floor(columns));
  let contentHeight = 2 + (Math.ceil(count / columns) + 1) * pitch;
  const showScrollbar = contentHeight > viewportHeight;
  if (showScrollbar && initialColumns === undefined) {
    columns = Math.max(1, Math.floor((viewportWidth - 12) / pitch));
    contentHeight = 2 + (Math.ceil(count / columns) + 1) * pitch;
  }
  return {
    cellSize,
    pitch,
    columns,
    contentHeight,
    showScrollbar,
    maxScroll: Math.max(0, contentHeight - viewportHeight),
  };
}
