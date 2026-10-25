import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function fullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  return document.fullscreenElement;
}

/** Editor root preferred; falls back to the document element for viewport fill. */
function browserFullscreenTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".xse-root") ?? document.documentElement;
}

function isBrowserFullscreen(): boolean {
  return fullscreenElement() != null;
}

function subscribeBrowserFullscreen(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof document !== "undefined" && listeners.size === 1) {
    document.addEventListener("fullscreenchange", notify);
  }
  return () => {
    listeners.delete(listener);
    if (typeof document !== "undefined" && listeners.size === 0) {
      document.removeEventListener("fullscreenchange", notify);
    }
  };
}

async function enterBrowserFullscreen(): Promise<void> {
  if (typeof document === "undefined" || fullscreenElement()) return;
  const target = browserFullscreenTarget();
  if (!target?.requestFullscreen) return;
  try {
    await target.requestFullscreen();
  } catch {
    // User gesture / permissions / unsupported — leave state unchanged.
  }
}

async function exitBrowserFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !fullscreenElement()) return;
  if (!document.exitFullscreen) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Ignore exit failures (already left fullscreen, etc.).
  }
}

export async function toggleBrowserFullscreen(): Promise<void> {
  if (isBrowserFullscreen()) await exitBrowserFullscreen();
  else await enterBrowserFullscreen();
}

export function useBrowserFullscreen(): boolean {
  return useSyncExternalStore(subscribeBrowserFullscreen, isBrowserFullscreen, () => false);
}
