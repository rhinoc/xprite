import { useEffect, useRef } from "react";

import { tUi } from "$/i18n";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import {
  automaticViewTransition,
  EditorViewChangeReason,
  userViewTransition,
} from "$/managers/editor/editor-view-transition";
import { HelpDocumentTab } from "$/managers/shell/help";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import {
  adjacentWorkspaceTab,
  WorkspaceTabKind,
} from "$/managers/workspace/adjacent-workspace-tab";
import type { DockEdge } from "$/managers/workspace/dock-edge";
import type {
  DocumentWorkspace,
  DocumentWorkspaceSnapshot,
} from "$/managers/workspace/document-workspace";
import type { EditorSnapshot } from "@xprite/editor-core";
import type { EditorSession, EditorSessionSnapshot } from "@xprite/editor-core/session";

export interface DocumentNavigationWorkflowOptions {
  workspace: DocumentWorkspace;
  session: EditorSession<string>;
  editor: ReturnType<typeof useEditor>;
  telemetry: TelemetryManager;
  workspaceSnapshot: DocumentWorkspaceSnapshot;
  workflow: EditorSessionSnapshot;
  editorError: EditorSnapshot["error"];
  recoveryOpen: boolean;
  recoveryTabOpen: boolean;
  recoveryBusy: boolean;
  setRecoveryOpen: ReturnType<typeof useEditor>["setRecoveryOpen"];
  selectRecovery(): void;
  closeRecovery(): void;
  setDialog(dialog: "text" | "color" | null): void;
  setNewDialog(open: boolean): void;
  setExitNotice(open: boolean): void;
  canStartInteraction(): boolean;
  flushPendingLayerProperties(): void;
}

/** Owns tab/pane navigation, document activation transitions, recent-file opening, and session notices. */
export function useDocumentNavigationWorkflows(options: DocumentNavigationWorkflowOptions) {
  const {
    workspace,
    session,
    editor,
    telemetry,
    workspaceSnapshot,
    workflow,
    editorError,
    recoveryOpen,
    recoveryTabOpen,
    recoveryBusy,
    setRecoveryOpen,
    selectRecovery,
    closeRecovery,
    setDialog,
    setNewDialog,
    setExitNotice,
    canStartInteraction,
    flushPendingLayerProperties,
  } = options;

  useEffect(() => {
    if (editor.tab === "home") void session.restoreRecent();
  }, [editor.tab, session]);

  useEffect(() => {
    if (editorError)
      session.reportError(
        editorError.operation === "document"
          ? Object.defineProperty(new Error(tUi("ui.sprite.memory.limit.preserved")), "cause", {
              value: editorError,
              writable: true,
              configurable: true,
            })
          : editorError,
      );
  }, [editorError, session]);

  const activation = useRef({
    tabId: workspaceSnapshot.activeId,
    value: workflow.documentActivation,
  });

  useEffect(() => {
    if (activation.current.tabId !== workspaceSnapshot.activeId) {
      const transition = automaticViewTransition(
        workspaceSnapshot.tabs.length
          ? recoveryBusy
            ? EditorViewChangeReason.DocumentRecovered
            : EditorViewChangeReason.DocumentActivated
          : EditorViewChangeReason.LastDocumentClosed,
      );
      setRecoveryOpen(false, transition);
      activation.current = {
        tabId: workspaceSnapshot.activeId,
        value: workflow.documentActivation,
      };
      editor.openTab(workspaceSnapshot.tabs.length ? "document" : "home", transition);
      return;
    }
    if (activation.current.value === workflow.documentActivation) return;
    activation.current.value = workflow.documentActivation;
    if (workflow.documentActivationKind === "replace") {
      editor.setPaletteSelection([]);
      editor.setPaletteIndex(null);
      editor.setBackgroundIndex(null);
    }
    if (workflow.documentActivationKind === "close") {
      const closingId = workspaceSnapshot.activeId;
      workspace.close(closingId);
      const empty = workspace.getSnapshot().tabs.length === 0;
      editor.openTab(
        empty ? "home" : "document",
        automaticViewTransition(
          empty ? EditorViewChangeReason.LastDocumentClosed : EditorViewChangeReason.DocumentClosed,
        ),
      );
    } else
      editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentOpened));
    setDialog(null);
    setNewDialog(false);
  }, [
    workflow.documentActivation,
    editor,
    workspace,
    workspaceSnapshot.activeId,
    workspaceSnapshot.tabs.length,
    recoveryBusy,
  ]);

  const exitCount = useRef(workspaceSnapshot.exitRequests);
  useEffect(() => {
    if (exitCount.current !== workspaceSnapshot.exitRequests) {
      exitCount.current = workspaceSnapshot.exitRequests;
      setExitNotice(true);
    }
  }, [workspaceSnapshot.exitRequests]);

  useEffect(() => {
    if (!workflow.notice) return;
    editor.setNotice(workflow.notice);
    session.clearNotice();
  }, [workflow.notice, editor, session]);

  useEffect(() => {
    if (!editor.notice) return;
    const timer = setTimeout(() => editor.setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [editor.notice, editor.setNotice]);

  const adjacentTab = (direction: -1 | 1) =>
    adjacentWorkspaceTab(
      workspace.getSnapshot(),
      workspace.getRootPaneId(),
      editor.tab,
      editor.openTabs.includes("home"),
      recoveryTabOpen,
      recoveryOpen,
      direction,
      editor.openTabs.includes(HelpDocumentTab.Guide),
    );

  const selectAdjacentTab = (direction: -1 | 1) => {
    if (!canStartInteraction()) return;
    const target = adjacentTab(direction);
    if (!target) return;
    flushPendingLayerProperties();
    if (target.kind === WorkspaceTabKind.Recovery) selectRecovery();
    else {
      setRecoveryOpen(false);
      if (target.kind === WorkspaceTabKind.Home) editor.openTab("home");
      else if (target.kind === WorkspaceTabKind.Guide) editor.openTab(HelpDocumentTab.Guide);
      else {
        workspace.selectPaneTab(target.paneId, target.id);
        editor.openTab("document");
      }
    }
  };

  const recentFiles = workspace.getRecentFiles();

  return {
    activation,
    exitCount,
    recentFiles,
    canClearRecentFiles: recentFiles.length > 0,
    hasAdjacentTab: () => !!adjacentTab(1),
    nextDocumentTab: () => selectAdjacentTab(1),
    previousDocumentTab: () => selectAdjacentTab(-1),
    userGuide: () => {
      flushPendingLayerProperties();
      setRecoveryOpen(false);
      editor.openTab(HelpDocumentTab.Guide);
    },
    closeAllDocuments: () => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      workspace.closeAll();
    },
    closeDocument: () => {
      if (!canStartInteraction()) return;
      if (editor.tab === HelpDocumentTab.Guide) {
        editor.closeTab(HelpDocumentTab.Guide);
        if (workspaceSnapshot.tabs.length === 0) {
          if (editor.openTabs.includes("home"))
            editor.openTab("home", userViewTransition(EditorViewChangeReason.TabClosed));
          else if (recoveryTabOpen) selectRecovery();
          else editor.openTab("home", userViewTransition(EditorViewChangeReason.TabClosed));
        }
        return;
      }
      if (recoveryOpen) {
        closeRecovery();
        return;
      }
      flushPendingLayerProperties();
      workspace.requestClose();
    },
    exit: () => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      workspace.closeAll(true);
    },
    loadRecentFiles: () => {
      void session.restoreRecent();
    },
    clearRecentFiles: () => {
      if (!canStartInteraction()) return;
      void workspace.clearRecentFiles();
    },
    reopenClosedFile: () => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      void (async () => {
        if (await workspace.reopenClosedFile()) {
          const transition = automaticViewTransition(EditorViewChangeReason.DocumentOpened);
          setRecoveryOpen(false, transition);
          editor.openTab("document", transition);
        }
      })().catch((error) => session.reportError(error));
    },
    openRecent: (id: string) => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      telemetry.recentOpenRequested(id);
      void workspace.openRecent(id).then((opened) => {
        if (opened) {
          const transition = automaticViewTransition(EditorViewChangeReason.DocumentOpened);
          setRecoveryOpen(false, transition);
          editor.openTab("document", transition);
        }
      });
    },
    pinRecent: (id: string, pinned: boolean) => workspace.setRecentFilePinned(id, pinned),
    selectDocumentTab: (id: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      flushPendingLayerProperties();
      workspace.select(id);
      editor.openTab("document");
    },
    duplicateDocumentView: (id: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      flushPendingLayerProperties();
      if (workspace.duplicateView(id)) editor.openTab("document");
    },
    selectPaneTab: (paneId: string, id: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      flushPendingLayerProperties();
      workspace.selectPaneTab(paneId, id);
      editor.openTab("document");
    },
    activateWorkspacePane: (paneId: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      workspace.activatePane(paneId);
      editor.openTab("document");
    },
    reorderDocumentTab: (id: string, targetId: string, paneId?: string) =>
      paneId ? workspace.reorderInPane(paneId, id, targetId) : workspace.reorder(id, targetId),
    moveDocumentTab: (id: string, paneId: string, targetId?: string, before?: boolean) => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      setRecoveryOpen(false);
      workspace.moveTabToPane(id, paneId, targetId, before);
      editor.openTab("document");
    },
    splitDocumentTab: (id: string, paneId: string, edge: DockEdge) => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      setRecoveryOpen(false);
      workspace.splitTab(id, paneId, edge);
      editor.openTab("document");
    },
    resizeWorkspaceSplit: (splitId: string, ratio: number) => workspace.resizeSplit(splitId, ratio),
    closeDocumentTab: (id: string) => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      workspace.requestClose(id);
    },
  };
}
