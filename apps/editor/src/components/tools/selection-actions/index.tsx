import {
  lazy,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SelectionDialogKind } from "$/components/dialogs/selection-dialogs";
import {
  useSelectionDialogModel,
  type SelectionDialogCommand,
} from "$/managers/tools/selection-dialog-model";
const SelectionDialogs = lazy(() =>
  import("$/components/dialogs/selection-dialogs").then((module) => ({
    default: module.SelectionDialogs,
  })),
);

export interface SelectionActions {
  openColorRange: () => void;
  openModifySelection: (operation: Exclude<SelectionDialogCommand, "color-range">) => void;
}
interface Registry {
  actions: SelectionActions | null;
  register: (actions: SelectionActions) => () => void;
}
const Context = createContext<Registry | null>(null);
export function SelectionActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<SelectionActions | null>(null);
  const register = useCallback((next: SelectionActions) => {
    setActions(next);
    return () => setActions((current) => (current === next ? null : current));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSelectionActions() {
  return useContext(Context)?.actions ?? null;
}
/** Scene-level controller owns document identity, preview cancellation, and the
 * Aseprite modal lifecycle. Gallery/mockups only mount this host and provider. */
export function SelectionDialogsHost({ enabled = true }: { enabled?: boolean }) {
  const registry = useContext(Context);
  const editor = useSelectionDialogModel(enabled);
  useEffect(
    () =>
      registry?.register({
        openColorRange: editor.openColorRange,
        openModifySelection: editor.openModifySelection,
      }),
    [registry?.register, editor.openColorRange, editor.openModifySelection],
  );
  if (!editor.visible || !editor.kind) return null;
  return (
    <Suspense fallback={null}>
      <SelectionDialogs
        kind={editor.kind as SelectionDialogKind}
        foreground={editor.foreground}
        selectionMode={editor.selectionMode}
        onClose={editor.close}
        onModify={editor.modifySelection}
        onColorRange={editor.selectColorRange}
        onPreview={editor.previewColorRange}
      />
    </Suspense>
  );
}
