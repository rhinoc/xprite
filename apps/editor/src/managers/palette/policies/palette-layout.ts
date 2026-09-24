/** PaletteView::onResize/onSizeHint, reference viewport 136x660, scale 2.
 * The mini vertical bar consumes 12 scene pixels when content overflows.
 */
export function asepritePaletteLayout(
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
