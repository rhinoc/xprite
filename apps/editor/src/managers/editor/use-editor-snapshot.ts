import { useCallback, useRef, useSyncExternalStore } from "react";

import type { RasterEditor } from "@xprite/editor-core";
import type { EditorSnapshot, ViewSettings } from "@xprite/editor-core";

type EditorSource = Pick<RasterEditor, "subscribe" | "getSnapshot">;
const emptySubscribe = () => () => {};

export enum EditorSnapshotScope {
  Full = "full",
  Chrome = "chrome",
}

function sameChromeTimeline(a: EditorSnapshot, b: EditorSnapshot) {
  const old = a.document?.timeline,
    next = b.document?.timeline;
  return (
    old === next ||
    (old?.activeFrame === next?.activeFrame &&
      old?.activeLayer === next?.activeLayer &&
      old?.frames.length === next?.frames.length &&
      old?.layers.length === next?.layers.length)
  );
}

function sameView(a: ViewSettings, b: ViewSettings, includePan: boolean) {
  return Object.keys(a).every((key) =>
    key === "pan"
      ? !includePan || (a.pan.x === b.pan.x && a.pan.y === b.pan.y)
      : a[key as keyof ViewSettings] === b[key as keyof ViewSettings],
  );
}

/** Subscribe to the editor's render-facing snapshot while ignoring pointer-only changes. */
export function useEditorSnapshot(
  core: EditorSource | null,
  includePan = false,
  scope = EditorSnapshotScope.Full,
) {
  const cache = useRef<{ core: EditorSource; value: EditorSnapshot } | null>(null);
  const get = useCallback(() => {
    if (!core) return null;
    const next = core.getSnapshot();
    const old = cache.current?.core === core ? cache.current.value : null;
    if (
      old &&
      old.playing === next.playing &&
      old.document?.id === next.document?.id &&
      (scope === EditorSnapshotScope.Chrome
        ? sameChromeTimeline(old, next)
        : old.document?.timeline === next.document?.timeline) &&
      old.settings === next.settings &&
      old.defaultDocumentView === next.defaultDocumentView &&
      sameView(old.view, next.view, includePan) &&
      old.palette === next.palette &&
      old.canUndo === next.canUndo &&
      old.canRedo === next.canRedo &&
      old.dirty === next.dirty &&
      old.error === next.error &&
      Boolean(old.floatingPaste) === Boolean(next.floatingPaste) &&
      old.document?.selection === next.document?.selection &&
      old.document?.name === next.document?.name &&
      old.document?.width === next.document?.width &&
      old.document?.height === next.document?.height &&
      old.document?.layer.visible === next.document?.layer.visible &&
      old.document?.layer.locked === next.document?.layer.locked
    )
      return old;
    cache.current = { core, value: next };
    return next;
  }, [core, includePan, scope]);
  return useSyncExternalStore(core?.subscribe ?? emptySubscribe, get, get);
}
