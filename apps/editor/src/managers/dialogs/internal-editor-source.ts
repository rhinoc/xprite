import { useMemo } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import type { DocumentExportPreferences } from "$/managers/files/export-preferences";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

type DialogDocumentKey = number | string;

export interface DialogEditorTarget {
  owner: object;
  documentKey: DialogDocumentKey;
}

/** Internal manager hook: component-facing hooks must project a narrower model. */
export function useDialogEditorSource(documentSlotId?: string) {
  const manager = useEditorManagerContext();
  const runtime = useEditorRuntimeManagerContext();
  const slot = documentSlotId ? runtime.workspace.getSlot(documentSlotId) : undefined;
  const core = documentSlotId ? (slot?.core ?? null) : manager.core;
  const snapshot = useEditorSnapshot(core);
  const owner = useMemo(() => ({}), [core]);
  const document = snapshot?.document ?? null;
  const documentKey = document ? (document.id ?? document.name) : null;
  const target = documentKey === null ? null : { owner, documentKey };
  const isCurrentTarget = (candidate: DialogEditorTarget | null | undefined) => {
    if (!candidate || candidate.owner !== owner || !core) return false;
    const current = core.getSnapshot().document;
    return (current?.id ?? current?.name ?? null) === candidate.documentKey;
  };
  const exportPreferences: DocumentExportPreferences = document
    ? runtime.workspace.getExportPreferences(documentSlotId ?? runtime.active.id)
    : {};
  return {
    core,
    snapshot,
    owner,
    document,
    documentKey,
    target,
    isCurrentTarget,
    exportPreferences,
  };
}
