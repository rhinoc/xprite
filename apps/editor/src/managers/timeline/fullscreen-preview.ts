/** What a key does in the fullscreen preview. */
export enum FullscreenPreviewKeyAction {
  FirstFrame = "first-frame",
  PreviousFrame = "previous-frame",
  NextFrame = "next-frame",
  LastFrame = "last-frame",
  Close = "close",
}

const FRAME_KEYS: Readonly<Record<string, FullscreenPreviewKeyAction>> = {
  Home: FullscreenPreviewKeyAction.FirstFrame,
  ArrowLeft: FullscreenPreviewKeyAction.PreviousFrame,
  ArrowRight: FullscreenPreviewKeyAction.NextFrame,
  End: FullscreenPreviewKeyAction.LastFrame,
};

/** Aseprite keeps the preview open only for the Goto*Frame commands; any other key closes it. */
export function fullscreenPreviewKeyAction(key: string): FullscreenPreviewKeyAction {
  return FRAME_KEYS[key] ?? FullscreenPreviewKeyAction.Close;
}

/** The frame a navigation action selects, wrapping like GotoPrevious/NextFrame. */
export function fullscreenPreviewFrame(
  action: FullscreenPreviewKeyAction,
  current: number,
  count: number,
): number {
  if (count <= 0) return 0;
  switch (action) {
    case FullscreenPreviewKeyAction.FirstFrame:
      return 0;
    case FullscreenPreviewKeyAction.LastFrame:
      return count - 1;
    case FullscreenPreviewKeyAction.PreviousFrame:
      return (current - 1 + count) % count;
    case FullscreenPreviewKeyAction.NextFrame:
      return (current + 1) % count;
    default:
      return current;
  }
}
