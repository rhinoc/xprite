import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { EffectDialogs } from "$/components/dialogs/effect-dialogs";
import {
  useEffectDialogManager,
  type DialogEffectKind,
} from "$/managers/dialogs/effect-dialog-manager";
import type { DialogEditorTarget } from "$/managers/dialogs/internal-editor-source";

export interface EffectActions {
  openEffect: (kind: DialogEffectKind) => void;
}
interface Registry {
  actions: EffectActions | null;
  register: (actions: EffectActions) => () => void;
}
const Context = createContext<Registry | null>(null);
export function EffectActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<EffectActions | null>(null);
  const register = useCallback((next: EffectActions) => {
    setActions(next);
    return () => setActions((old) => (old === next ? null : old));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useEffectActions = () => useContext(Context)?.actions ?? null;

/** Scene host binds effect UI to the active editor manager without exposing it. */
export function EffectDialogsHost({ enabled = true }: { enabled?: boolean }) {
  const registry = useContext(Context);
  const manager = useEffectDialogManager();
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [kind, setKind] = useState<DialogEffectKind | null>(null);
  const openedTargetRef = useRef<DialogEditorTarget | null>(null);
  const [openedTarget, setOpenedTarget] = useState<DialogEditorTarget | null>(null);
  const owns = () =>
    !!openedTargetRef.current &&
    enabledRef.current &&
    managerRef.current.isCurrentTarget(openedTargetRef.current);
  const close = useCallback(() => {
    managerRef.current.clearPreview(openedTargetRef.current);
    openedTargetRef.current = null;
    setOpenedTarget(null);
    setKind(null);
  }, []);
  const open = useCallback((next: DialogEffectKind) => {
    if (!enabledRef.current) return;
    const target = managerRef.current.open(next);
    if (!target) return;
    openedTargetRef.current = target;
    setOpenedTarget(target);
    setKind(next);
  }, []);
  useEffect(() => registry?.register({ openEffect: open }), [registry?.register, open]);
  const valid = !!openedTarget && enabled && manager.isCurrentTarget(openedTarget);
  const view = manager.current;
  useEffect(() => {
    if (kind && (!valid || !view)) close();
  }, [kind, valid, !!view, close]);
  if (!kind || !valid || !view) return null;
  return (
    <EffectDialogs
      key={`${kind}:${openedTarget.documentKey}`}
      kind={kind}
      depth={view.depth}
      foreground={view.foreground}
      background={view.background}
      foregroundIndex={view.foregroundIndex}
      backgroundIndex={view.backgroundIndex}
      outlineBackgroundIndex={view.outlineBackgroundIndex}
      backgroundLayer={view.backgroundLayer}
      backgroundPixel={view.backgroundPixel}
      tiledMode={view.tiledMode}
      onClose={close}
      onPreview={(spec) => {
        const target = openedTargetRef.current;
        if (!target) return;
        if (spec === null) managerRef.current.clearPreview(target);
        else if (owns()) managerRef.current.preview(target, spec);
      }}
      onApply={(spec, target) => {
        const opened = openedTargetRef.current;
        if (!opened || !owns()) return;
        managerRef.current.apply(opened, spec, target);
        if (!managerRef.current.canOpenCurrent()) close();
      }}
    />
  );
}
