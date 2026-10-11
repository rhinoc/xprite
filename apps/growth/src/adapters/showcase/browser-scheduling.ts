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
