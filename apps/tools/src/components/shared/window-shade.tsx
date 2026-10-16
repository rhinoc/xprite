import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  CRAMPED_SCREEN_QUERY,
  PHONE_SCREEN_QUERY,
  initialWindowShade,
  readWindowShade,
  writeWindowShade,
} from "$/managers/window-shade/window-shade";

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
    collapseOnPhone = false,
    collapseWhenReady = false,
    collapseWhenFilesOpen = false,
    ready = false,
    filesOpen = false,
  }: {
    defaultCollapsed?: boolean;
    collapseWhenCramped?: boolean;
    /** Start rolled up on phones (<= 700px wide) and open on larger screens. */
    collapseOnPhone?: boolean;
    /** On phones, roll up once the tool has a preview/result so work stays visible. */
    collapseWhenReady?: boolean;
    /** On phones, roll up while the Files Finder is open so its title bar stays usable. */
    collapseWhenFilesOpen?: boolean;
    ready?: boolean;
    filesOpen?: boolean;
  } = {},
) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const wasReady = useRef(false);
  const wasFilesOpen = useRef(false);
  useEffect(() => {
    const tool = currentTool();
    if (!tool) return;
    const phone = globalThis.matchMedia?.(PHONE_SCREEN_QUERY).matches ?? false;
    setCollapsed(
      initialWindowShade({
        stored: readWindowShade(sessionStore(), tool)[name],
        defaultCollapsed,
        collapseWhenCramped: collapseWhenCramped || collapseOnPhone,
        collapseWhenReady: collapseWhenReady && phone,
        ready,
        cramped:
          globalThis.matchMedia?.(collapseOnPhone ? PHONE_SCREEN_QUERY : CRAMPED_SCREEN_QUERY)
            .matches ?? false,
      }),
    );
  }, [name, defaultCollapsed, collapseWhenCramped, collapseOnPhone, collapseWhenReady, ready]);
  // Empty → ready on a phone: collapse the note even if it was expanded for the empty state.
  useEffect(() => {
    if (!collapseWhenReady) return;
    if (!ready) {
      // Ready → empty again (top-bar "New"): reopen the note like a fresh import step.
      const reset = wasReady.current;
      wasReady.current = false;
      if (!reset || !(globalThis.matchMedia?.(PHONE_SCREEN_QUERY).matches ?? false)) return;
      const tool = currentTool();
      if (tool) writeWindowShade(sessionStore(), tool, name, false);
      setCollapsed(false);
      return;
    }
    if (wasReady.current) return;
    wasReady.current = true;
    if (!(globalThis.matchMedia?.(PHONE_SCREEN_QUERY).matches ?? false)) return;
    const tool = currentTool();
    if (tool) writeWindowShade(sessionStore(), tool, name, true);
    setCollapsed(true);
  }, [collapseWhenReady, ready, name]);
  useEffect(() => {
    if (!collapseWhenFilesOpen) return;
    const phone = globalThis.matchMedia?.(PHONE_SCREEN_QUERY).matches ?? false;
    if (!phone) return;
    if (!filesOpen) {
      const hadFiles = wasFilesOpen.current;
      wasFilesOpen.current = false;
      if (!hadFiles || ready) return;
      const tool = currentTool();
      if (tool) writeWindowShade(sessionStore(), tool, name, false);
      setCollapsed(false);
      return;
    }
    if (wasFilesOpen.current) return;
    wasFilesOpen.current = true;
    const tool = currentTool();
    if (tool) writeWindowShade(sessionStore(), tool, name, true);
    setCollapsed(true);
  }, [collapseWhenFilesOpen, filesOpen, ready, name]);
  const onCollapsedChange = (next: boolean) => {
    const tool = currentTool();
    if (tool) writeWindowShade(sessionStore(), tool, name, next);
    const animate =
      typeof document.startViewTransition === "function" &&
      globalThis.matchMedia(PHONE_SCREEN_QUERY).matches &&
      !globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
    if (animate) document.startViewTransition(() => flushSync(() => setCollapsed(next)));
    else setCollapsed(next);
  };
  return { collapsible: true, collapsed, onCollapsedChange } as const;
}
