import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  ShortcutDefinition,
  ShortcutOverrides,
  ShortcutDragVector,
} from "$/managers/shortcuts/shortcut-manager";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

/** Owns the dialog transaction; Apply creates the baseline retained by Cancel. */
export function useShortcutEditor(open: boolean) {
  const { workspace } = useEditorRuntimeManagerContext();
  const manager = workspace.shortcuts;
  useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const [draft, setDraft] = useState<ShortcutOverrides>(() => manager.beginDraft());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);
  const fileActionVersion = useRef(0);
  useEffect(() => {
    fileActionVersion.current += 1;
    setBusy(false);
    if (open && !opened.current) {
      setDraft(manager.beginDraft());
      setError("");
    }
    opened.current = open;
    return () => {
      fileActionVersion.current += 1;
    };
  }, [open, manager]);
  const runFileAction = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    if (busy) return;
    const version = fileActionVersion.current;
    const isCurrent = () => fileActionVersion.current === version;
    setBusy(true);
    setError("");
    try {
      await action(isCurrent);
    } catch (error) {
      if (isCurrent())
        setError(error instanceof Error ? error.message : "Unable to read keyboard shortcuts.");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return {
    manager,
    draft,
    error,
    busy,
    apply: () => manager.apply(draft),
    assign: (definition: ShortcutDefinition, shortcut: string, replacing?: string) =>
      setDraft((current) => manager.assign(current, definition, shortcut, replacing)),
    remove: (definition: ShortcutDefinition, shortcut: string) =>
      setDraft((current) =>
        manager.update(
          current,
          definition.key,
          manager.bindings(definition, current).filter((binding) => binding !== shortcut),
        ),
      ),
    updateDragVector: (definition: ShortcutDefinition, vector: ShortcutDragVector) =>
      setDraft((current) => manager.updateDragVector(current, definition, vector)),
    reset: (definitionKey?: string) => setDraft((current) => manager.reset(current, definitionKey)),
    importFile: () =>
      runFileAction(async (isCurrent) => {
        const imported = await manager.importDraft(draft);
        if (imported && isCurrent()) setDraft(imported);
      }),
    exportFile: () => runFileAction(() => manager.exportDraft(draft)),
  };
}
