import { lazy, type ComponentType } from "react";

/** Time the browser may defer an idle prefetch before running it anyway. */
const IDLE_PRELOAD_TIMEOUT_MS = 2_000;
/** Fallback delay where requestIdleCallback is unavailable (Safari). */
const IDLE_PRELOAD_FALLBACK_MS = 1_500;

export interface PreloadableComponent<P extends object> {
  Component: ComponentType<P>;
  preload(): Promise<ComponentType<P>>;
}

/**
 * React.lazy that can be fetched ahead of use. Once preloaded it renders synchronously, so a
 * dialog opens with its body instead of suspending for a frame on a blank surface.
 */
export function preloadableLazy<P extends object>(
  load: () => Promise<ComponentType<P>>,
): PreloadableComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        pending = null;
        throw error;
      },
    ));
  const Lazy = lazy(() =>
    preload().then((component) => ({ default: component })),
  ) as unknown as ComponentType<P>;
  function Component(props: P) {
    const Ready = loaded;
    return Ready ? <Ready {...props} /> : <Lazy {...props} />;
  }
  return { Component, preload };
}

interface IdleWindow {
  requestIdleCallback?(callback: () => void, options?: { timeout: number }): number;
  cancelIdleCallback?(handle: number): void;
}

/** Fetch rarely-first-used chunks once the editor is idle; failures retry on real use. */
export function preloadWhenIdle(preloads: readonly (() => Promise<unknown>)[]): () => void {
  const host = window as Window & IdleWindow;
  const run = () => {
    for (const preload of preloads) preload().catch(() => undefined);
  };
  if (host.requestIdleCallback) {
    const handle = host.requestIdleCallback(run, { timeout: IDLE_PRELOAD_TIMEOUT_MS });
    return () => host.cancelIdleCallback?.(handle);
  }
  const timer = window.setTimeout(run, IDLE_PRELOAD_FALLBACK_MS);
  return () => window.clearTimeout(timer);
}
