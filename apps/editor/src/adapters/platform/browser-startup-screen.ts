import type { StartupScreenPort } from "$/managers/ports/platform";

const STARTUP_SCREEN_ID = "xse-startup";

/** Keep the original HTML screen and its animated canvas alive through React startup. */
export function createBrowserStartupScreen(): StartupScreenPort {
  const screen = document.getElementById(STARTUP_SCREEN_ID);
  let consumers = 0;
  let generation = 0;
  return {
    get available() {
      return Boolean(screen?.isConnected);
    },
    retain() {
      consumers++;
      generation++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        consumers--;
        const releaseGeneration = ++generation;
        // StrictMode immediately reattaches effects; only a final release ends the screen.
        queueMicrotask(() => {
          if (consumers === 0 && generation === releaseGeneration) screen?.remove();
        });
      };
    },
  };
}

export function dismissBrowserStartupScreen(): void {
  document.getElementById(STARTUP_SCREEN_ID)?.remove();
}
