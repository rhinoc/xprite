import {
  hasMiniToolContainer,
  readMiniToolWindowInfo,
  type MiniToolWindowInfo,
} from "$/adapters/xhs-bridge";

/** Set on the root inside the container; the stylesheet falls back to the safe area + 48px. */
const CONTAINER_CLASS = "minitool-container";
/** Set once the inset comes from getWindowInfo rather than the stylesheet's estimate. */
const MEASURED_CLASS = "minitool-measured";
const TOP_INSET = "--minitool-top-inset";
/** Breathing room between the native buttons and the tool's menu bar. */
const BUTTON_GAP = 4;

/**
 * The page height the container covers at the top: the status bar / safe area and every visible
 * native button (back, me, share). Null buttons are hidden and need no room.
 */
export function windowTopInset(info: MiniToolWindowInfo): number | null {
  const edges: number[] = [];
  const top = info.safeArea?.top ?? info.statusBarHeight;
  if (Number.isFinite(top)) edges.push(top!);
  const buttons = info.menuButtons ?? {};
  for (const rect of [buttons.back, buttons.me, buttons.share])
    if (rect && Number.isFinite(rect.top) && Number.isFinite(rect.height))
      edges.push(rect.top + rect.height + BUTTON_GAP);
  return edges.length ? Math.max(0, Math.ceil(Math.max(...edges))) : null;
}

/**
 * Keep the tool below the container's native top bar. getWindowInfo (client 9.49+) gives the exact
 * rects and is re-read after the window changes; older clients use the stylesheet fallback, and a
 * normal browser (no `window.xhs.miniTool`) gets no inset at all.
 */
export function installWindowInsets(): Promise<void> {
  if (!hasMiniToolContainer()) return Promise.resolve();
  const root = document.documentElement;
  root.classList.add(CONTAINER_CLASS);
  let request = 0;
  const update = async () => {
    const current = ++request;
    const info = await readMiniToolWindowInfo();
    const inset = info && windowTopInset(info);
    if (current !== request || inset === null || inset === undefined) return;
    root.style.setProperty(TOP_INSET, `${inset}px`);
    root.classList.add(MEASURED_CLASS);
  };
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void update(), 100);
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  return update();
}
