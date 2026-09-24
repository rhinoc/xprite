import type { EditorTab } from "$/managers/editor/editor-ui-store";
import { HelpDocumentTab } from "$/managers/shell/help";
import type { DocumentWorkspaceSnapshot } from "$/managers/workspace/document-workspace";

export enum WorkspaceTabKind {
  Home = "home",
  Recovery = "recovery",
  Document = "document",
  Guide = "guide",
}

export interface WorkspaceTabTarget {
  kind: WorkspaceTabKind;
  paneId: string;
  id: string;
}

/** Global tabs belong to the root pane; other panes cycle only their own views. */
export function adjacentWorkspaceTab(
  workspace: DocumentWorkspaceSnapshot,
  rootPaneId: string,
  scene: EditorTab,
  homeOpen: boolean,
  recoveryOpen: boolean,
  recoverySelected: boolean,
  direction: -1 | 1,
  guideOpen = false,
): WorkspaceTabTarget | null {
  const paneId = scene !== "document" || recoverySelected ? rootPaneId : workspace.activePaneId;
  const pane = workspace.panes.find((candidate) => candidate.id === paneId);
  if (!pane) return null;
  const tabs: WorkspaceTabTarget[] = [
    ...(paneId === rootPaneId && homeOpen
      ? [{ kind: WorkspaceTabKind.Home, paneId, id: WorkspaceTabKind.Home }]
      : []),
    ...(paneId === rootPaneId && recoveryOpen
      ? [{ kind: WorkspaceTabKind.Recovery, paneId, id: WorkspaceTabKind.Recovery }]
      : []),
    ...(paneId === rootPaneId && guideOpen
      ? [{ kind: WorkspaceTabKind.Guide, paneId, id: HelpDocumentTab.Guide }]
      : []),
    ...pane.tabs.map((id) => ({ kind: WorkspaceTabKind.Document, paneId, id })),
  ];
  if (tabs.length < 2) return null;
  const currentId = recoverySelected
    ? WorkspaceTabKind.Recovery
    : scene !== "document"
      ? scene
      : pane.activeId;
  const currentIndex = tabs.findIndex((tab) => tab.id === currentId);
  return tabs[(Math.max(0, currentIndex) + direction + tabs.length) % tabs.length] ?? null;
}
