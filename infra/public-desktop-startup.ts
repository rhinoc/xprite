import { readFileSync } from "node:fs";

import { desktopStartupScript } from "../packages/site-shell/src/startup.ts";

const PATTERN_CATALOG = new URL(
  "../packages/ui/assets/patterns/macintosh/catalog.json",
  import.meta.url,
);

/** Read generated assets afresh; Node's external JSON cache must not freeze dev first paint. */
export function publicDesktopStartupScript(fallbackKey?: string): string {
  return desktopStartupScript(fallbackKey, JSON.parse(readFileSync(PATTERN_CATALOG, "utf8")));
}
