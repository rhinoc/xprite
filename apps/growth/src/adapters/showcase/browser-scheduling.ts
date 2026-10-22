/** Do not start scene downloads while its host is offscreen or the page is hidden. */
export function whenBrowserVisible(element: HTMLElement, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let inView = false;
    const cleanup = () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", changed);
      signal.removeEventListener("abort", cancel);
    };
    const changed = () => {
      if (!inView || document.visibilityState !== "visible") return;
      cleanup();
      resolve();
    };
    const cancel = () => {
      cleanup();
      reject(signal.reason);
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      changed();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", changed);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/** Yield through a paint opportunity before starting another expensive scene task. */
export function afterBrowserPaint(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancel, { once: true });
    frame = requestAnimationFrame(() => {
      frame = undefined;
      timer = setTimeout(() => {
        timer = undefined;
        signal.removeEventListener("abort", cancel);
        resolve();
      });
    });
  });
}

// Any of these means someone is using the page, so the scene is worth its download and GPU work.
const PAGE_INTERACTIONS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;
// With Save-Data or little memory, only a deliberate press on the scene itself loads it.
const STAGE_ACTIVATIONS = ["pointerdown", "keydown"] as const;
const LOW_DEVICE_MEMORY_GB = 2;

interface ConstrainedNavigator {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/** Save-Data is on, or the device reports 2 GB of memory or less. */
export function prefersLightweightPage(): boolean {
  const browser = navigator as Navigator & ConstrainedNavigator;
  return (
    browser.connection?.saveData === true ||
    (typeof browser.deviceMemory === "number" && browser.deviceMemory <= LOW_DEVICE_MEMORY_GB)
  );
}

/**
 * Wait for the first sign that someone is using the page. When the page should stay light,
 * wait instead for a press or key inside the scene's own stage.
 */
export function whenBrowserInteraction(
  stage: HTMLElement,
  lightweight: boolean,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const target: EventTarget = lightweight ? stage : window;
  const events: readonly string[] = lightweight ? STAGE_ACTIVATIONS : PAGE_INTERACTIONS;
  return new Promise((resolve, reject) => {
    const options = { capture: true, passive: true } as const;
    const cleanup = () => {
      for (const type of events) target.removeEventListener(type, interacted, options);
      signal.removeEventListener("abort", cancel);
    };
    const interacted = () => {
      cleanup();
      resolve();
    };
    const cancel = () => {
      cleanup();
      reject(signal.reason);
    };
    for (const type of events) target.addEventListener(type, interacted, options);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
