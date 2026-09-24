const TOOLTIP_FOCUS_NAVIGATION_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

interface FocusNavigationSubscription {
  subscribers: number;
  navigating: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: () => void;
}

const subscriptions = new WeakMap<Window, FocusNavigationSubscription>();

/** Focus restoration and pointer clicks must not reopen dismissed tooltips. */
export function isTooltipFocusNavigation(host: Window): boolean {
  return subscriptions.get(host)?.navigating ?? false;
}

/** Share input tracking across mounted triggers, including those with no pending tooltip. */
export function subscribeTooltipFocusNavigation(host: Window): () => void {
  let subscription = subscriptions.get(host);
  if (!subscription) {
    const current: FocusNavigationSubscription = {
      subscribers: 0,
      navigating: false,
      timer: undefined,
      onKeyDown: (event) => {
        current.onPointerDown();
        current.navigating =
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          TOOLTIP_FOCUS_NAVIGATION_KEYS.has(event.key);
        if (current.navigating) current.timer = setTimeout(current.onPointerDown, 0);
      },
      onPointerDown: () => {
        clearTimeout(current.timer);
        current.timer = undefined;
        current.navigating = false;
      },
    };
    subscription = current;
    subscriptions.set(host, current);
    host.addEventListener("keydown", current.onKeyDown, true);
    host.addEventListener("pointerdown", current.onPointerDown, true);
    host.addEventListener("blur", current.onPointerDown);
  }
  const current = subscription;
  current.subscribers++;
  return () => {
    if (--current.subscribers) return;
    current.onPointerDown();
    host.removeEventListener("keydown", current.onKeyDown, true);
    host.removeEventListener("pointerdown", current.onPointerDown, true);
    host.removeEventListener("blur", current.onPointerDown);
    subscriptions.delete(host);
  };
}
