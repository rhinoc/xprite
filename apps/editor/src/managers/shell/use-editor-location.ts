import { useEffect, useRef } from "react";

import type { EditorTab } from "$/managers/editor/editor-ui-store";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { EditorPageRoute } from "$/managers/ports/platform";

export function useEditorLocation(tab: EditorTab, openTab: (tab: EditorTab) => void): void {
  const location = useEditorPlatformPorts()?.navigation.location;
  const previousTab = useRef(tab);
  const skipNextHistoryEntry = useRef(false);
  useEffect(() => {
    if (!location) return;
    const path = location.read().replace(/\/+$/, "");
    const target = tab === "home" ? EditorPageRoute.Home : EditorPageRoute.Document;
    const changed = previousTab.current !== tab;
    previousTab.current = tab;
    if (skipNextHistoryEntry.current) {
      skipNextHistoryEntry.current = false;
      return;
    }
    if (path !== target) location.write(target, changed);
  }, [location, tab]);
  useEffect(() => {
    if (!location) return;
    return location.subscribe(() => {
      const path = location.read().replace(/\/+$/, "");
      const nextTab = path === EditorPageRoute.Home ? "home" : "document";
      if (nextTab !== tab) {
        skipNextHistoryEntry.current = true;
        openTab(nextTab);
      }
    });
  }, [location, tab, openTab]);
}
