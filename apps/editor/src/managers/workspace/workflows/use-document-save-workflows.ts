import { useEffect, useState } from "react";

import {
  TelemetryFeature,
  TelemetryFeatureAction,
  TelemetryOperationAction,
  TelemetryOperationOutcome,
  TelemetryOperationTarget,
} from "$/managers/ports/telemetry";
import type { PwaManager } from "$/managers/pwa/pwa-manager";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import type {
  DocumentWorkspace,
  DocumentWorkspaceSnapshot,
} from "$/managers/workspace/document-workspace";
import { SaveTarget, shouldOpenSaveAsDialog } from "$/managers/workspace/save-target";
import {
  canCloseSavedDocument,
  saveWorkspaceDocument,
} from "$/managers/workspace/workflows/save-file-and-checkpoint";
import { canPickSaveFile } from "@xprite/bedrock/browser/file-system";
import type { RasterEditor } from "@xprite/editor-core";
import {
  SessionOperation,
  SessionOutcome,
  SessionSaveIntent,
  type EditorSession,
  type SessionReplacement,
} from "@xprite/editor-core/session";

export function telemetryOutcomeForSessionOutcome(
  outcome: SessionOutcome,
): TelemetryOperationOutcome {
  if (outcome === SessionOutcome.Created) return TelemetryOperationOutcome.Success;
  if (outcome === SessionOutcome.Cancelled) return TelemetryOperationOutcome.Cancelled;
  if (outcome === SessionOutcome.Error) return TelemetryOperationOutcome.Failed;
  return TelemetryOperationOutcome.Ignored;
}

export interface DocumentSaveWorkflowOptions {
  core: RasterEditor;
  session: EditorSession<string>;
  workspace: DocumentWorkspace;
  workspaceSnapshot: DocumentWorkspaceSnapshot;
  pwa: PwaManager | null;
  telemetry: TelemetryManager;
  replacement: SessionReplacement | null;
  canStartInteraction(): boolean;
  canDispatchEditorInput(): boolean;
  canExecuteSave(): boolean;
  flushPendingLayerProperties(): void;
}

/** Owns Save, Save As, replacement confirmation, error Save As, and beforeunload guards. */
export function useDocumentSaveWorkflows(options: DocumentSaveWorkflowOptions) {
  const {
    core,
    session,
    workspace,
    workspaceSnapshot,
    pwa,
    telemetry,
    replacement,
    canStartInteraction,
    canDispatchEditorInput,
    canExecuteSave,
    flushPendingLayerProperties,
  } = options;
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [closingSaveBusy, setClosingSaveBusy] = useState(false);

  useEffect(() => {
    if (
      !replacement ||
      closingSaveBusy ||
      (replacement.kind !== "close" && replacement.kind !== "exit")
    )
      return;
    if (canCloseSavedDocument(workspace, workspaceSnapshot.activeId))
      void session.confirmReplacement();
  }, [replacement, closingSaveBusy, workspaceSnapshot, workspace, session]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      flushPendingLayerProperties();
      if (workspace.needsBeforeUnloadWarning()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [workspace, flushPendingLayerProperties]);

  const currentSaveTarget = () => workspace.getSaveTarget();

  const saveWithTelemetry = (
    intent: SessionSaveIntent,
    target: SaveTarget,
    saving: () => Promise<SessionOutcome>,
  ): Promise<SessionOutcome> => {
    const finish = telemetry.beginSave(
      intent === SessionSaveIntent.SaveAs
        ? TelemetryOperationAction.SaveAs
        : TelemetryOperationAction.Save,
      target === SaveTarget.Browser
        ? TelemetryOperationTarget.Browser
        : TelemetryOperationTarget.FileSystem,
      workspaceSnapshot.activeId,
    );
    try {
      // Invoke synchronously so a native picker retains the user's activation.
      return saving().then(
        (outcome) => {
          finish(telemetryOutcomeForSessionOutcome(outcome));
          return outcome;
        },
        (reason) => {
          finish(TelemetryOperationOutcome.Failed);
          throw reason;
        },
      );
    } catch (reason) {
      finish(TelemetryOperationOutcome.Failed);
      throw reason;
    }
  };

  const saveCurrentDocument = async (
    intent: SessionSaveIntent,
    target: SaveTarget,
    requestedName?: string,
  ): Promise<SessionOutcome> => {
    if (!session.canSave()) return SessionOutcome.Ignored;
    return saveWithTelemetry(intent, target, async () => {
      const suggestedName =
        target === SaveTarget.FileSystem
          ? requestedName?.trim() ||
            workspace.suggestedSaveName(core.getSnapshot().document?.name ?? "Untitled")
          : undefined;
      const outcome = await saveWorkspaceDocument(
        session,
        workspace,
        workspaceSnapshot.activeId,
        intent,
        target,
        suggestedName,
      );
      if (outcome === SessionOutcome.Created) pwa?.markSuccessfulSave();
      return outcome;
    });
  };

  const saveThenClose = (target: SaveTarget) => {
    setClosingSaveBusy(true);
    void saveCurrentDocument(SessionSaveIntent.Save, target)
      .then((outcome) => {
        if (
          outcome === SessionOutcome.Created &&
          canCloseSavedDocument(workspace, workspaceSnapshot.activeId)
        )
          return session.confirmReplacement();
      })
      .catch((reason) => session.reportError(reason, SessionOperation.Save))
      .finally(() => setClosingSaveBusy(false));
  };

  const performDocumentSave = (intent: SessionSaveIntent, target = currentSaveTarget()) => {
    const dialogIntent = intent === SessionSaveIntent.SaveAs ? "save-as" : "save";
    if (
      shouldOpenSaveAsDialog(dialogIntent, workspace.getConfiguredSaveTarget(), canPickSaveFile())
    ) {
      telemetry.featureUsed(TelemetryFeature.SaveAs, TelemetryFeatureAction.Open);
      setSaveAsOpen(true);
      return;
    }
    void saveCurrentDocument(intent, target).catch((reason) =>
      session.reportError(reason, SessionOperation.Save),
    );
  };

  const saveProjectAs = (name: string, format: "png" | "aseprite", target: SaveTarget) => {
    workspace.setSaveTarget(target);
    setSaveAsBusy(true);
    void (async () => {
      if (target === SaveTarget.Browser) {
        return saveWithTelemetry(SessionSaveIntent.SaveAs, target, async () => {
          await workspace.saveAsInBrowser(workspaceSnapshot.activeId, name, format);
          pwa?.markSuccessfulSave();
          return SessionOutcome.Created;
        });
      }
      return saveCurrentDocument(SessionSaveIntent.SaveAs, target, name);
    })()
      .then((outcome) => {
        if (outcome === SessionOutcome.Created) setSaveAsOpen(false);
      })
      .catch((reason) => session.reportError(reason, SessionOperation.Save))
      .finally(() => setSaveAsBusy(false));
  };

  const cancelReplacement = () => {
    workspace.cancelCloseAll();
    session.cancelReplacement();
  };

  const dismissError = () => {
    session.clearError();
    if (!core.getSnapshot().document) workspace.discardEmptyImport();
  };

  return {
    saveAsOpen,
    saveAsBusy,
    closingSaveBusy,
    setClosingSaveBusy,
    saveAsTarget: SaveTarget.FileSystem,
    closeSaveAs: () => {
      if (saveAsOpen && !saveAsBusy)
        telemetry.featureUsed(TelemetryFeature.SaveAs, TelemetryFeatureAction.Cancel);
      setSaveAsOpen(false);
    },
    saveProjectAs,
    performDocumentSave,
    saveAction: () => {
      if (!canDispatchEditorInput()) return;
      flushPendingLayerProperties();
      if (canExecuteSave() && session.canSave()) performDocumentSave(SessionSaveIntent.Save);
    },
    saveAsAction: () => {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      if (session.canSave()) performDocumentSave(SessionSaveIntent.SaveAs);
    },
    cancelReplacement,
    saveReplacement: () => saveThenClose(currentSaveTarget()),
    discardReplacement: () => {
      if (!workspace.discardLocalChanges(workspaceSnapshot.activeId)) return;
      void session.confirmReplacement();
    },
    dismissError,
    saveErrorAs: () => {
      dismissError();
      cancelReplacement();
      performDocumentSave(SessionSaveIntent.SaveAs, SaveTarget.FileSystem);
    },
  };
}
