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
