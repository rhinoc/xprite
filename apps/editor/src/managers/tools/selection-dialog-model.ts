import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { selectionDialogMatchesOwner } from "$/managers/selection/selection-dialog-owner";
import { parseEditorColor } from "$/managers/tools/color-control";
import { SelectionMode, type SelectionModifier, type Rgba } from "@xprite/editor-core";

const DEFAULT_SELECTION_FOREGROUND = parseEditorColor("#000000");

export type SelectionDialogCommand = SelectionModifier | "color-range";
interface SelectionModifyRequest {
  operation: SelectionModifier;
  quantity: number;
  brush: "circle" | "square";
}
interface SelectionColorRangeRequest {
  color: Rgba;
  tolerance: number;
  mode: SelectionMode;
  preview: boolean;
}

export interface SelectionDialogModel {
  visible: boolean;
  kind: SelectionDialogCommand | null;
  foreground: Rgba;
  selectionMode: SelectionMode;
  close(): void;
  openColorRange(): void;
  openModifySelection(operation: SelectionModifier): void;
  modifySelection(request: SelectionModifyRequest): void;
  selectColorRange(request: SelectionColorRangeRequest): void;
  previewColorRange(request: SelectionColorRangeRequest | null): void;
}

/** Owns selection dialog lifetime and editor commands without exposing RasterEditor. */
export function useSelectionDialogModel(enabled: boolean): SelectionDialogModel {
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const [kind, setKind] = useState<SelectionDialogCommand | null>(null);
  const [documentId, setDocumentId] = useState<number | string | null>(null);
  const openedCore = useRef<typeof core>(null);
  const close = useCallback(() => {
    openedCore.current?.selection.previewColorRange(null);
    openedCore.current = null;
    setKind(null);
    setDocumentId(null);
  }, []);
  const open = useCallback(
    (next: SelectionDialogCommand) => {
      if (!enabled || !core) return;
      const doc = core.getSnapshot().document;
      if (!doc || (next === "color-range" ? !core.selection.canColorRange() : !doc.selection))
        return;
      core.timeline.setPlaying(false);
      core.cancelGesture();
      openedCore.current = core;
      setDocumentId(doc.id ?? doc.name);
      setKind(next);
    },
    [core, enabled],
  );
  const openColorRange = useCallback(() => open("color-range"), [open]);
  const openModifySelection = useCallback(
    (operation: SelectionModifier) => open(operation),
    [open],
  );
  const identity = snapshot?.document?.id ?? snapshot?.document?.name ?? null;
  const ownsDialog = selectionDialogMatchesOwner(openedCore.current, core, documentId);
  useEffect(() => {
    if (kind && (!enabled || !ownsDialog)) close();
  }, [core, enabled, kind, identity, documentId, ownsDialog, close]);
  useEffect(() => () => core?.selection.previewColorRange(null), [core]);
  const isOwner = useCallback(
    () => selectionDialogMatchesOwner(openedCore.current, core, documentId),
    [core, documentId],
  );
  const modifySelection = useCallback(
    ({ operation, quantity, brush }: SelectionModifyRequest) => {
      if (isOwner()) core?.selection.modify(operation, quantity, brush);
    },
    [core, isOwner],
  );
  const selectColorRange = useCallback(
    ({ color, tolerance, mode }: SelectionColorRangeRequest) => {
      if (isOwner()) core?.selection.selectColorRange(color, tolerance, mode);
    },
    [core, isOwner],
  );
  const previewColorRange = useCallback(
    (request: SelectionColorRangeRequest | null) => {
      if (request === null) openedCore.current?.selection.previewColorRange(null);
      else if (isOwner()) core?.selection.previewColorRange(request);
    },
    [core, isOwner],
  );
  return {
    visible: Boolean(core && snapshot?.document && enabled && kind && ownsDialog),
    kind: ownsDialog ? kind : null,
    foreground: snapshot?.settings.foreground ?? DEFAULT_SELECTION_FOREGROUND,
    selectionMode: snapshot?.settings.selectionMode ?? SelectionMode.Replace,
    close,
    openColorRange,
    openModifySelection,
    modifySelection,
    selectColorRange,
    previewColorRange,
  };
}
