/** Computes the minimum horizontal scroll offset needed to keep a tab visible between pinned edges. */
export function scrollOffsetForTab(
  tabLeft: number,
  tabWidth: number,
  scrollLeft: number,
  viewportWidth: number,
  leadingInset: number,
  trailingInset: number,
): number {
  const visibleStart = scrollLeft + leadingInset;
  const visibleEnd = scrollLeft + viewportWidth - trailingInset;
  const visibleWidth = visibleEnd - visibleStart;
  if (visibleWidth <= 0) return scrollLeft;
  const tabRight = tabLeft + tabWidth;
  if (tabLeft < visibleStart) return Math.max(0, tabLeft - leadingInset);
  if (tabRight > visibleEnd) {
    if (tabWidth > visibleWidth) return Math.max(0, tabLeft - leadingInset);
    return Math.max(0, tabRight - (viewportWidth - trailingInset));
  }
  return scrollLeft;
}
