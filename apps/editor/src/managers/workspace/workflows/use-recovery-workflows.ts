import { useState, useSyncExternalStore } from "react";

import type { useEditor } from "$/managers/editor/editor-state-manager";
import {
  automaticViewTransition,
  EditorViewChangeReason,
  userViewTransition,
} from "$/managers/editor/editor-view-transition";
import { HelpDocumentTab } from "$/managers/shell/help";
import type {
  DocumentWorkspace,
  DocumentWorkspaceSnapshot,
} from "$/managers/workspace/document-workspace";
import {
  presentRecoveryEntry,
  type RecoveryItem,
} from "$/managers/workspace/recovery-presentation";
import { presentRecoveryProblem } from "$/managers/workspace/workflows/present-recovery-problem";
import { SessionOperation, type EditorSession } from "@xprite/editor-core/session";

export interface RecoveryWorkflowOptions {
  workspace: DocumentWorkspace;
  session: EditorSession<string>;
  editor: ReturnType<typeof useEditor>;
  workspaceSnapshot: DocumentWorkspaceSnapshot;
  canStartInteraction(): boolean;
}

/** Owns recovery view state, checkpoint retry/delete flows, and browser-copy management. */
export function useRecoveryWorkflows(options: RecoveryWorkflowOptions) {
  const { workspace, session, editor, workspaceSnapshot, canStartInteraction } = options;
  const { recoveryOpen, setRecoveryOpen } = editor;
  const [recoveryTabOpen, setRecoveryTabOpen] = useState(false);
  const [recoverySelectedIds, setRecoverySelectedIds] = useState<readonly string[]>([]);
  const [recoveryItems, setRecoveryItems] = useState<RecoveryItem[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [deleteRecoveryIds, setDeleteRecoveryIds] = useState<readonly string[] | null>(null);
  const [deleteBrowserCopyItem, setDeleteBrowserCopyItem] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteBrowserCopyBusy, setDeleteBrowserCopyBusy] = useState(false);
  const [downloadRecentBusy, setDownloadRecentBusy] = useState(false);

  const recoveryState = useSyncExternalStore(
    workspace.recovery.subscribe,
    workspace.recovery.getSnapshot,
    workspace.recovery.getSnapshot,
  );
  // Background failures must not prevent drawing, Save As or switching documents.
  // The persistent status indicator remains until storage acknowledges a retry.
  const recoveryFailure =
    recoveryState.error ?? Object.values(recoveryState.documents).find((item) => item.error)?.error;

  const retryRecovery = () => {
    void workspace.retryRecovery().catch(() => {
      // Recovery state retains the failure and the latest unsaved revision.
    });
  };

  const refreshRecovery = async () => {
    if (recoveryLoading) return;
    setRecoveryLoading(true);
    setRecoverySelectedIds([]);
    try {
      const entries = await workspace.recovery.listRecoveryEntries();
      setRecoveryItems(entries.map(presentRecoveryEntry));
      const failure = entries.find((entry) => entry.readError)?.readError;
      if (failure) session.reportError(failure);
    } catch (reason) {
      session.reportError(reason);
    } finally {
      setRecoveryLoading(false);
    }
  };

  const showRecovery = () => {
    if (!canStartInteraction()) return;
    setRecoveryTabOpen(true);
    setRecoveryOpen(true);
    editor.setTab("home", userViewTransition(EditorViewChangeReason.RecoveryOpened));
    void refreshRecovery();
  };

  const selectRecovery = () => {
    if (!canStartInteraction()) return;
    setRecoveryOpen(true);
    editor.setTab("home", userViewTransition(EditorViewChangeReason.RecoveryOpened));
  };

  const closeRecovery = () => {
    if (!canStartInteraction()) return;
    setRecoveryTabOpen(false);
    setRecoverySelectedIds([]);
    if (recoveryOpen) {
      setRecoveryOpen(false);
      if (
        !editor.openTabs.includes("home") &&
        workspaceSnapshot.tabs.length > 0 &&
        editor.openTabs.includes("document")
      )
        editor.setTab("document", userViewTransition(EditorViewChangeReason.RecoveryClosed));
      else if (!editor.openTabs.includes("home") && editor.openTabs.includes(HelpDocumentTab.Guide))
        editor.setTab(
          HelpDocumentTab.Guide,
          userViewTransition(EditorViewChangeReason.RecoveryClosed),
        );
      else editor.openTab("home", userViewTransition(EditorViewChangeReason.RecoveryClosed));
    }
  };

  const recoverProjects = async (ids: readonly string[]) => {
    if (!canStartInteraction()) return;
    setRecoveryBusy(true);
    try {
      for (const id of ids) await workspace.recoverProject(id);
      const transition = automaticViewTransition(EditorViewChangeReason.DocumentRecovered);
      setRecoveryOpen(false, transition);
      editor.openTab("document", transition);
    } catch (reason) {
      session.reportError(reason);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const deleteRecovery = async () => {
    if (!deleteRecoveryIds || recoveryBusy) return;
    const ids = deleteRecoveryIds;
    setDeleteRecoveryIds(null);
    setRecoveryBusy(true);
    try {
      for (const id of ids) await workspace.recovery.deleteRecoveryEntry(id);
      await refreshRecovery();
    } catch (reason) {
      session.reportError(reason);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const deleteBrowserCopy = async () => {
    if (!deleteBrowserCopyItem || deleteBrowserCopyBusy) return;
    setDeleteBrowserCopyBusy(true);
    try {
      await workspace.deleteBrowserCopy(deleteBrowserCopyItem.id);
      if (recoveryOpen) await refreshRecovery();
    } catch (reason) {
      session.reportError(reason, SessionOperation.Recent);
    } finally {
      setDeleteBrowserCopyBusy(false);
      setDeleteBrowserCopyItem(null);
    }
  };

  const requestDeleteBrowserCopy = (id: string) => {
    if (!canStartInteraction() || downloadRecentBusy) return;
    const file = workspace.getRecentFiles().find((item) => item.id === id);
    if (file && !file.isOpen) setDeleteBrowserCopyItem({ id: file.id, name: file.name });
  };

  const downloadRecent = (id: string) => {
    if (!canStartInteraction() || downloadRecentBusy) return;
    setDownloadRecentBusy(true);
    void workspace
      .downloadRecentFile(id)
      .catch((reason) => session.reportError(reason, SessionOperation.Recent))
      .finally(() => setDownloadRecentBusy(false));
  };

  const updateRecoverySettings = (
    settings: Parameters<typeof workspace.recovery.setRecoverySettings>[0],
  ) => {
    void workspace.recovery
      .setRecoverySettings(settings)
      .catch((reason) => session.reportError(reason));
  };

  const recoveryProblem = presentRecoveryProblem({
    outputProblem: workspace.getFileOutputRecoveryProblem(workspaceSnapshot.activeId),
    failure: recoveryFailure,
    workspacePending: workspace.recovery.hasUnpersistedWorkspaceChanges(),
    documentPending: workspace.recovery.isSlotCheckpointUnpersisted(workspace.active.documentId),
  });

  const backupActive =
    recoveryState.backingUp ||
    Object.values(recoveryState.documents).some((item) => item.status === "saving");

  return {
    recoveryState,
    recoveryOpen,
    setRecoveryOpen,
    recoveryTabOpen,
    recoverySelectedIds,
    setRecoverySelectedIds,
    recoveryItems,
    setRecoveryItems,
    recoveryLoading,
    setRecoveryLoading,
    recoveryBusy,
    setRecoveryBusy,
    deleteRecoveryIds,
    setDeleteRecoveryIds,
    deleteBrowserCopyItem,
    deleteBrowserCopyBusy,
    closeDeleteBrowserCopy: () => {
      if (!deleteBrowserCopyBusy) setDeleteBrowserCopyItem(null);
    },
    downloadRecentBusy,
    recoveryProblem,
    backupActive,
    retryRecovery,
    refreshRecovery,
    showRecovery,
    selectRecovery,
    closeRecovery,
    recoverProjects,
    deleteRecovery,
    deleteBrowserCopy,
    requestDeleteBrowserCopy,
    downloadRecent,
    updateRecoverySettings,
  };
}
