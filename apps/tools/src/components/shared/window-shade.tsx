import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  CRAMPED_SCREEN_QUERY,
  PHONE_SCREEN_QUERY,
  initialWindowShade,
  readWindowShade,
  writeWindowShade,
} from "$/managers/window-shade/window-shade";

const PHONE_QUERY = "(max-width: 700px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Window-shade memory is per tool; the tool is the page's `/tools/<slug>/` route. */
function currentTool(): string | undefined {
  return /\/tools\/[^/]+\//.exec(globalThis.location?.pathname ?? "")?.[0];
}

/**
 * Props for a tool window that rolls up to its title bar (double-click, double-tap or
 * Enter/Space on the title bar). The state is remembered per tool for the session.
 */
export function useToolWindowShade(
  name: string,
  {
    defaultCollapsed = false,
    collapseWhenCramped = false,
    collapseWhenReady = false,
    ready = false,
  }: {
    defaultCollapsed?: boolean;
    collapseWhenCramped?: boolean;
    /** On phones, roll up once the tool has a preview/result so work stays visible. */
    collapseWhenReady?: boolean;
    ready?: boolean;
  } = {},
) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const wasReady = useRef(false);
  useEffect(() => {
    const tool = currentTool();
    if (!tool) return;
    const phone = globalThis.matchMedia?.(PHONE_SCREEN_QUERY).matches ?? false;
    setCollapsed(
      initialWindowShade({
        stored: readWindowShade(sessionStore(), tool)[name],
        defaultCollapsed,
        collapseWhenCramped,
        collapseWhenReady: collapseWhenReady && phone,
        cramped: globalThis.matchMedia?.(CRAMPED_SCREEN_QUERY).matches ?? false,
        ready,
      }),
    );
  }, [name, defaultCollapsed, collapseWhenCramped, collapseWhenReady, ready]);
  // Empty → ready on a phone: collapse the note even if it was expanded for the empty state.
  useEffect(() => {
    if (!collapseWhenReady || !ready || wasReady.current) {
      wasReady.current = ready;
      return;
    }
    wasReady.current = true;
    if (!(globalThis.matchMedia?.(PHONE_SCREEN_QUERY).matches ?? false)) return;
    const tool = currentTool();
    if (tool) writeWindowShade(sessionStore(), tool, name, true);
    setCollapsed(true);
  }, [collapseWhenReady, ready, name]);
  const onCollapsedChange = (next: boolean) => {
    const tool = currentTool();
    if (tool) writeWindowShade(sessionStore(), tool, name, next);
    const animate =
      typeof document.startViewTransition === "function" &&
      globalThis.matchMedia(PHONE_QUERY).matches &&
      !globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
    if (animate) document.startViewTransition(() => flushSync(() => setCollapsed(next)));
    else setCollapsed(next);
  };
  return { collapsible: true, collapsed, onCollapsedChange } as const;
}
