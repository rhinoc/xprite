import type { ReactNode } from "react";

import { useEditorActions } from "$/components/shell/editor-actions";
import { DocumentTabs, type DocumentTab } from "$/components/workspace/document-tabs";
import { useEditor } from "$/managers/editor/editor-state-manager";
import type { EditorTab } from "$/managers/editor/editor-ui-store";
import type { TabDragPoint } from "@xprite/ui";

export function EditorDocumentTabs({
  filename,
  modified = false,
  documentTabs,
  activeDocumentId,
  onDocumentTabSelect,
  onDocumentTabClose,
  onDocumentTabDuplicate,
  onDocumentTabReorder,
  onNewDocument,
  paneId,
  visibleDocumentIds,
  leadingContent,
  showGlobalTabs = true,
  showWorkspaceControls = true,
  showWorkspaceLayoutButton = true,
  workspaceLayoutOpen = false,
  workspaceLayoutDisabled = false,
  onWorkspaceLayoutToggle,
  onTabDragMove,
  onTabDragEnd,
}: {
  filename: string;
  modified?: boolean;
  documentTabs?: readonly DocumentTab[];
  activeDocumentId?: string;
  onDocumentTabSelect?: (id: string) => void;
  onDocumentTabClose?: (id: string) => void;
  onDocumentTabDuplicate?: (id: string) => void;
  onDocumentTabReorder?: (id: string, targetId: string, paneId?: string) => void;
  onNewDocument?: () => void;
  paneId?: string;
  visibleDocumentIds?: readonly string[];
  leadingContent?: ReactNode;
  showGlobalTabs?: boolean;
  showWorkspaceControls?: boolean;
  showWorkspaceLayoutButton?: boolean;
  workspaceLayoutOpen?: boolean;
  workspaceLayoutDisabled?: boolean;
  onWorkspaceLayoutToggle?: () => void;
  onTabDragMove?: (id: string, point: TabDragPoint) => void;
  onTabDragEnd?: (id: string, point: TabDragPoint, cancelled: boolean) => void;
}) {
  const editor = useEditor();
  const actions = useEditorActions();
  const guardedEditor = actions
    ? {
        ...editor,
        openTab: (tab: EditorTab) => {
          actions.leaveRecovery?.();
          editor.openTab(tab);
        },
        closeTab: (tab: EditorTab) => {
          if (tab === "document") actions.closeDocument();
          else {
            editor.closeTab(tab);
            if (actions.recoveryOpen) editor.setTab("home");
          }
        },
      }
    : editor;
  return (
    <DocumentTabs
      editor={guardedEditor}
      recoveryTabOpen={showGlobalTabs && actions?.recoveryTabOpen}
      recoverySelected={showGlobalTabs && actions?.recoveryOpen}
      onRecoverySelect={actions?.selectRecovery}
      onRecoveryClose={actions?.closeRecovery}
      filename={filename}
      modified={modified}
      documentTabs={documentTabs ?? actions?.documentTabs}
      activeDocumentId={activeDocumentId ?? actions?.activeDocumentId}
      onDocumentTabSelect={onDocumentTabSelect ?? actions?.selectDocumentTab}
      onDocumentTabClose={onDocumentTabClose ?? actions?.closeDocumentTab}
      onDocumentTabDuplicate={onDocumentTabDuplicate ?? actions?.duplicateDocumentView}
      onDocumentTabReorder={onDocumentTabReorder ?? actions?.reorderDocumentTab}
      onNewDocument={onNewDocument ?? actions?.new}
      paneId={paneId}
      visibleDocumentIds={visibleDocumentIds}
      leadingContent={leadingContent}
      showGlobalTabs={showGlobalTabs}
      showWorkspaceControls={showWorkspaceControls}
      showWorkspaceLayoutButton={showWorkspaceLayoutButton}
      workspaceLayoutOpen={workspaceLayoutOpen}
      workspaceLayoutDisabled={workspaceLayoutDisabled}
      onWorkspaceLayoutToggle={onWorkspaceLayoutToggle}
      onDragMove={onTabDragMove}
      onDragEnd={onTabDragEnd}
    />
  );
}
