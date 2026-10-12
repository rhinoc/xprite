/** Fixed-position box of a tool group's option popup, in client pixels. */
export interface ToolGroupPopupPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Remember the tool last chosen in a group.
 * Returns `previous` when nothing changes so React state keeps its identity even
 * when React replays this updater during a later render.
 */
export function rememberToolChoice(
  previous: Readonly<Record<string, string>>,
  groupId: string,
  toolValue: string,
): Readonly<Record<string, string>> {
  return previous[groupId] === toolValue ? previous : { ...previous, [groupId]: toolValue };
}

/**
 * Keep the current popup placement when the box is unchanged.
 * A fresh object from every measurement would force another synchronous layout pass.
 */
export function nextToolGroupPopupPlacement(
  previous: ToolGroupPopupPlacement | null,
  next: ToolGroupPopupPlacement | null,
): ToolGroupPopupPlacement | null {
  if (previous === next || !previous || !next) return next;
  return previous.left === next.left &&
    previous.top === next.top &&
    previous.width === next.width &&
    previous.height === next.height
    ? previous
    : next;
}
