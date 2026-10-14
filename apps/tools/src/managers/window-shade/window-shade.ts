/** Session-only memory of which tool windows are rolled up (classic Mac OS WindowShade). */
export const WINDOW_SHADE_STORAGE_PREFIX = "xprite.tools.window-shade.v1:";
/** Phones short enough that the help note starts rolled up so the work windows get the room. */
export const CRAMPED_SCREEN_QUERY = "(max-width: 700px) and (max-height: 700px)";

type WindowShadeStorage = Pick<Storage, "getItem" | "setItem">;
export type WindowShadeState = Readonly<Record<string, boolean>>;

export function readWindowShade(
  storage: WindowShadeStorage | undefined,
  tool: string,
): WindowShadeState {
  try {
    const parsed: unknown = JSON.parse(
      storage?.getItem(WINDOW_SHADE_STORAGE_PREFIX + tool) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function writeWindowShade(
  storage: WindowShadeStorage | undefined,
  tool: string,
  window: string,
  collapsed: boolean,
): void {
  if (!storage) return;
  const next = { ...readWindowShade(storage, tool), [window]: collapsed };
  try {
    storage.setItem(WINDOW_SHADE_STORAGE_PREFIX + tool, JSON.stringify(next));
  } catch {
    // Storage can be full or disabled; the window still toggles for this page view.
  }
}

/** The user's choice in this session wins; otherwise cramped phones roll up optional windows. */
export function initialWindowShade({
  stored,
  defaultCollapsed,
  collapseWhenCramped,
  cramped,
}: {
  stored: boolean | undefined;
  defaultCollapsed: boolean;
  collapseWhenCramped: boolean;
  cramped: boolean;
}): boolean {
  if (stored !== undefined) return stored;
  return defaultCollapsed || (collapseWhenCramped && cramped);
}
