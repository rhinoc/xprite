/**
 * The generated page shows the tool's buttons well before React attaches events to them; a press
 * in that time would do nothing at all. An inline script remembers the last enabled button
 * pressed, and the application presses it again once it is interactive.
 */
const STARTUP_CLICK = "toolStartupClick";

interface HeldClick {
  button: HTMLButtonElement | null;
  stop(): void;
}
type StartupRoot = HTMLElement & { [STARTUP_CLICK]?: HeldClick };

/** Inline script placed right after the generated root, before any module code runs. */
export function startupClickScript(rootId: string): string {
  return `{const root=document.getElementById(${JSON.stringify(rootId)});const hold=(event)=>{const button=event.target&&event.target.closest&&event.target.closest("button");const held=root.${STARTUP_CLICK};if(held&&button&&!button.disabled)held.button=button};root.${STARTUP_CLICK}={button:null,stop(){root.removeEventListener("click",hold,true)}};root.addEventListener("click",hold,true)}`;
}

/**
 * Stop remembering presses (call just before hydrating: React replays presses made while it
 * hydrates) and return a function that presses the remembered button, once, if it is still on
 * the page and enabled. Call that after hydration has committed.
 */
export function takeStartupClick(root: HTMLElement): () => void {
  const held = (root as StartupRoot)[STARTUP_CLICK];
  delete (root as StartupRoot)[STARTUP_CLICK];
  held?.stop();
  let button = held?.button ?? null;
  return () => {
    const pressed = button;
    button = null;
    if (pressed?.isConnected && !pressed.disabled) pressed.click();
  };
}
