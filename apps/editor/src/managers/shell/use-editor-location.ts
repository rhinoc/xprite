import { useEffect, useRef } from "react";

import type { EditorTab, EditorUiState } from "$/managers/editor/editor-ui-store";
import {
  EditorViewChangeTrigger,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { EditorPageRoute } from "$/managers/ports/platform";
import { HelpDocumentTab } from "$/managers/shell/help";

export type EditorRouteTab = "home" | "document";

export function normalizeEditorPath(path: string): string {
  return path.replace(/\/+$/, "") || EditorPageRoute.Home;
}

export function resolveEditorRouteTab(
  tab: EditorTab,
  hasDocuments: boolean,
): EditorRouteTab | null {
  if (tab === HelpDocumentTab.Guide) return null;
  return tab === "document" && hasDocuments ? "document" : "home";
}

export function resolveEditorLocationWrite(
  currentPath: string,
  routeTab: EditorRouteTab,
  previousRouteTab: EditorRouteTab,
  hasDocuments: boolean,
): { target: EditorPageRoute; appendHistory: boolean } | null {
  const path = normalizeEditorPath(currentPath);
  const target = routeTab === "home" ? EditorPageRoute.Home : EditorPageRoute.Document;
  if (path === target) return null;
  const changed = previousRouteTab !== routeTab;
  const appendHistory = changed && (routeTab === "document" || hasDocuments);
  return { target, appendHistory };
}

export function resolveEditorHistoryNavigation(
  currentPath: string,
  currentTab: EditorTab,
  hasDocuments: boolean,
): { nextTab: EditorRouteTab | null; replaceRoute: EditorPageRoute | null } {
  const path = normalizeEditorPath(currentPath);
  if (path !== EditorPageRoute.Home && !hasDocuments) {
    return {
      nextTab: currentTab === "home" ? null : "home",
      replaceRoute: EditorPageRoute.Home,
    };
  }
  const targetTab: EditorRouteTab = path === EditorPageRoute.Home ? "home" : "document";
  return {
    nextTab: targetTab === currentTab ? null : targetTab,
    replaceRoute: null,
  };
}

export function useEditorLocation(
  tab: EditorTab,
  openTab: EditorUiState["openTab"],
  hasDocuments: boolean,
): void {
  const location = useEditorPlatformPorts()?.navigation.location;
  const routeTab = resolveEditorRouteTab(tab, hasDocuments);
  const previousRouteTab = useRef<EditorRouteTab>(routeTab ?? "home");
  const skipNextHistoryEntry = useRef(false);
  useEffect(() => {
    if (!location || routeTab === null) return;
    const previous = previousRouteTab.current;
    previousRouteTab.current = routeTab;
    if (skipNextHistoryEntry.current) {
      skipNextHistoryEntry.current = false;
      return;
    }
    const write = resolveEditorLocationWrite(location.read(), routeTab, previous, hasDocuments);
    if (write) location.write(write.target, write.appendHistory);
  }, [location, routeTab, hasDocuments]);
  useEffect(() => {
    if (!location) return;
    return location.subscribe(() => {
      const navigation = resolveEditorHistoryNavigation(location.read(), tab, hasDocuments);
      if (navigation.replaceRoute) location.write(navigation.replaceRoute, false);
      if (navigation.nextTab) {
        skipNextHistoryEntry.current = true;
        openTab(navigation.nextTab, {
          trigger: EditorViewChangeTrigger.Navigation,
          reason: EditorViewChangeReason.HistoryNavigation,
        });
      }
    });
  }, [location, tab, openTab, hasDocuments]);
}
