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

import { Alert } from "$/components/dialogs/alert";
import { SizeDialogShell } from "$/components/dialogs/size-dialogs";
import {
  useGridSettingsManager,
  type GridSettingsView,
} from "$/managers/dialogs/grid-settings-manager";
import { evaluateDialogNumber, type DialogRect } from "$/managers/dialogs/input-values";
import { Button, Input, Text, TextVariant, Divider } from "@xprite/ui";

interface GridSettingsProps {
  bounds: DialogRect;
  onAccept: (bounds: DialogRect) => boolean | void;
  onClose: () => void;
  suspended?: boolean;
}
/** grid_settings.xml remapped dialogSize176x86 GUI pixels. */
function GridSettings({ bounds, onAccept, onClose, suspended }: GridSettingsProps) {
  const [values, setValues] = useState({
    x: String(bounds.x),
    y: String(bounds.y),
    width: String(bounds.width),
    height: String(bounds.height),
  });
  const valid = Object.values(values).every((v) => evaluateDialogNumber(v) !== null);
  const accept = () => {
    if (!valid || suspended) return;
    const value = {
      x: Math.trunc(evaluateDialogNumber(values.x)!),
      y: Math.trunc(evaluateDialogNumber(values.y)!),
      width: Math.max(1, Math.trunc(evaluateDialogNumber(values.width)!)),
      height: Math.max(1, Math.trunc(evaluateDialogNumber(values.height)!)),
    };
    if (onAccept(value) !== false) onClose();
  };
  return (
    <SizeDialogShell
      title="Grid Settings"
      width={352}
      height={172}
      help={false}
      suspended={suspended}
      onClose={onClose}
      onAccept={accept}
    >
      {(client) => (
        <>
          {(["x", "y", "width", "height"] as const).map((key, i) => {
            const right = i % 2 !== 0,
              y = i < 2 ? 0 : 38,
              x = right ? 166 : 0;
            return (
              <span key={key}>
                <Text
                  variant={TextVariant.Control}
                  text={{ x: "X:", y: "Y:", width: "Width:", height: "Height:" }[key]}
                  bounds={{
                    x: client.x + x + 2,
                    y: client.y + y,
                    width: right ? 56 : 52,
                    height: 30,
                  }}
                  relativeTo={client}
                />
                <Input
                  aria-label={
                    { x: "Grid X", y: "Grid Y", width: "Grid Width", height: "Grid Height" }[key]
                  }
                  value={values[key]}
                  onValueChange={(value) => setValues((old) => ({ ...old, [key]: value }))}
                  onCommit={(text) => {
                    const value = evaluateDialogNumber(text);
                    if (value !== null)
                      setValues((old) => ({
                        ...old,
                        [key]: String(
                          key === "width" || key === "height"
                            ? Math.max(1, Math.trunc(value))
                            : Math.trunc(value),
                        ),
                      }));
                  }}
                  bounds={{
                    x: client.x + (right ? 232 : 62),
                    y: client.y + y,
                    width: 96,
                    height: 30,
                  }}
                  relativeTo={client}
                />
              </span>
            );
          })}
          <Divider
            bounds={{ x: client.x, y: client.y + 76, width: 328, height: 8 }}
            relativeTo={client}
          />
          <Button
            text="OK"
            font="default"
            mnemonicIndex={0}
            disabled={!valid}
            bounds={{ x: client.x + 80, y: client.y + 92, width: 120, height: 34 }}
            relativeTo={client}
            part="button_normal"
            hotPart="button_hot"
            pushedPart="button_selected"
            focusedPart="button_focused"
            onClick={accept}
          />
          <Button
            text="Cancel"
            font="default"
            mnemonicIndex={0}
            bounds={{ x: client.x + 208, y: client.y + 92, width: 120, height: 34 }}
            relativeTo={client}
            part="button_normal"
            hotPart="button_hot"
            pushedPart="button_selected"
            focusedPart="button_focused"
            onClick={onClose}
          />
        </>
      )}
    </SizeDialogShell>
  );
}
const GridContext = createContext<{
  openGridSettings: (() => void) | null;
  register: (fn: () => void) => () => void;
} | null>(null);
export function GridActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(() => void) | null>(null),
    register = useCallback((fn: () => void) => {
      setOpen(() => fn);
      return () => setOpen((old) => (old === fn ? null : old));
    }, []),
    value = useMemo(() => ({ openGridSettings: open, register }), [open, register]);
  return <GridContext.Provider value={value}>{children}</GridContext.Provider>;
}
export const useGridActions = () => useContext(GridContext);
export function GridSettingsHost({ enabled = true }: { enabled?: boolean }) {
  const registry = useContext(GridContext);
  const manager = useGridSettingsManager();
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const [target, setTarget] = useState<GridSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentlyEnabled = useRef(enabled);
  currentlyEnabled.current = enabled;
  const close = useCallback(() => {
    setTarget(null);
    setError(null);
  }, []);
  useEffect(
    () =>
      registry?.register(() => {
        const current = managerRef.current.current;
        if (!currentlyEnabled.current || !current) return;
        setTarget(current);
      }),
    [registry?.register],
  );
  const valid = enabled && manager.isCurrentTarget(target?.target);
  useEffect(() => {
    if (target && !valid) close();
  }, [target, valid, close]);
  return (
    <>
      {target && valid && (
        <GridSettings
          bounds={target.bounds}
          onClose={close}
          suspended={!!error}
          onAccept={(bounds) => {
            if (!currentlyEnabled.current || !manager.isCurrentTarget(target.target)) return false;
            try {
              return manager.setGridBounds(target.target, bounds);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to update grid");
              return false;
            }
          }}
        />
      )}
      <Alert
        open={valid && !!error}
        title="Error"
        messageLines={error ? [error] : []}
        onOpenChange={(open) => {
          if (!open) setError(null);
        }}
        actions={[{ label: "OK", mnemonicIndex: 0, onClick: () => setError(null) }]}
      />
    </>
  );
}
