import { useCallback, useRef, useSyncExternalStore } from "react";

import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import { isSelectionToolMode, isTwoPointToolShape } from "$/managers/tools/tool-options";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { executeEditorCommand } from "@xprite/editor-core";

type TouchEditorCommand =
  | "undo"
  | "redo"
  | "finish-edit"
  | "discard-edit"
  | "fit-screen"
  | "zoom-in"
  | "zoom-out";

export interface TouchEditorSnapshotModel {
  canUndo: boolean;
  canRedo: boolean;
  hasDocument: boolean;
  hasSelection: boolean;
  floatingPaste: boolean;
  inlineText: boolean;
  selectionTransform: boolean;
  stagedDrawing: boolean;
  canFinish: boolean;
  canNudge: boolean;
  grid: boolean;
  symmetryEnabled: boolean;
  symmetryMode: number;
  tool: string | null;
}

export interface TouchEditorCommands {
  run(command: TouchEditorCommand): void;
  toggleGrid(): void;
  setSymmetryEnabled(enabled: boolean): void;
  setSymmetryMode(mode: number): void;
  clearSelectionPixels(): void;
  deselect(): void;
  nudge(dx: number, dy: number): void;
}

const emptySubscribe = () => () => {};

export function useTouchEditorSnapshotModel(): TouchEditorSnapshotModel {
  const { core } = useEditorManagerContext();
  const editor = useEditorFields(["tab"]);
  const cache = useRef<TouchEditorSnapshotModel | null>(null);
  const get = useCallback(() => {
    const snapshot = core?.getSnapshot();
    const hasDocument = editor.tab === "document" && Boolean(snapshot?.document);
    const stagedDrawing = Boolean(
      hasDocument &&
      snapshot?.preview &&
      ["curve", "polygon", "polygonal_lasso"].includes(snapshot.preview.tool),
    );
    const next: TouchEditorSnapshotModel = {
      canUndo: hasDocument && (snapshot?.canUndo ?? false),
      canRedo: hasDocument && (snapshot?.canRedo ?? false),
      hasDocument,
      hasSelection: hasDocument && Boolean(snapshot?.document?.selection),
      floatingPaste: hasDocument && Boolean(snapshot?.floatingPaste),
      inlineText: hasDocument && Boolean(snapshot?.inlineText),
      selectionTransform: hasDocument && Boolean(snapshot?.selectionTransform),
      stagedDrawing,
      canFinish:
        hasDocument &&
        (Boolean(snapshot?.inlineText || snapshot?.floatingPaste) ||
          Boolean(core?.drawing.runtime.gestures.canFinishStagedGesture())),
      canNudge:
        hasDocument &&
        Boolean(snapshot?.document?.selection) &&
        Boolean(snapshot?.document?.layer.visible) &&
        !snapshot?.document?.layer.locked &&
        !snapshot?.inlineText &&
        !stagedDrawing,
      grid: Boolean(snapshot?.view.grid),
      symmetryEnabled: Boolean(snapshot?.settings.symmetryEnabled),
      symmetryMode: snapshot?.view.symmetryMode ?? 0,
      tool: snapshot?.settings.tool ?? null,
    };
    const old = cache.current;
    if (
      old &&
      (Object.keys(next) as (keyof TouchEditorSnapshotModel)[]).every(
        (key) => old[key] === next[key],
      )
    )
      return old;
    cache.current = next;
    return next;
  }, [core, editor.tab]);
  return useSyncExternalStore(core?.subscribe ?? emptySubscribe, get, get);
}

export function useTouchEditorCommands(): TouchEditorCommands {
  const editor = useEditorFields(["tab", "timelineVisible"]);
  const { core } = useEditorManagerContext();
  return {
    run: (type) => {
      if (!core) return;
      executeEditorCommand(
        core,
        { type },
        {
          scene: editorSceneForTab(editor.tab),
          viewport: measuredEditorViewport(core, editor.timelineVisible),
        },
      );
    },
    toggleGrid: () => {
      if (core) core.canvas.setView({ grid: !core.getSnapshot().view.grid });
    },
    setSymmetryEnabled: (enabled) =>
      core?.drawing.settings.setSettings({ symmetryEnabled: enabled }),
    setSymmetryMode: (mode) => core?.canvas.setSymmetryMode(mode),
    clearSelectionPixels: () => {
      if (core)
        core.selection.clearSelectionPixels(
          core.getSnapshot().settings.selectionKeepAfterClear ?? false,
        );
    },
    deselect: () => core?.selection.deselect(),
    nudge: (dx, dy) => {
      if (core)
        executeEditorCommand(
          core,
          { type: "nudge-selection", dx, dy },
          {
            scene: editorSceneForTab(editor.tab),
            viewport: measuredEditorViewport(core, editor.timelineVisible),
          },
        );
    },
  };
}

export function touchToolCanConstrain(tool: string | null): boolean {
  return Boolean(tool && (isTwoPointToolShape(tool) || isSelectionToolMode(tool)));
}

export function touchToolCanStartFromCenter(tool: string | null): boolean {
  return Boolean(tool && isTwoPointToolShape(tool));
}
