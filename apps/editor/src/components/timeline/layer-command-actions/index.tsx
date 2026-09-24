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

import { readReferenceImage } from "$/managers/files/read-reference-image";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";
export interface LayerCommandActions {
  openReferenceLayer: () => void;
}
interface Registry {
  actions: LayerCommandActions | null;
  register: (value: LayerCommandActions) => () => void;
}
const Context = createContext<Registry | null>(null);
export function LayerCommandActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<LayerCommandActions | null>(null);
  const register = useCallback((value: LayerCommandActions) => {
    setActions(value);
    return () => setActions((current) => (current === value ? null : current));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLayerCommandActions = () => useContext(Context)?.actions ?? null;
/** Browser file selection stays in the shared feature adapter; the scene only
 * composes it. Decode is checked against the originating document before edit. */
export function LayerCommandHost({
  enabled = true,
  onError,
}: {
  enabled?: boolean;
  onError?: (message: string) => void;
}) {
  const registry = useContext(Context);
  const timelineManager = useTimelineManager();
  const { identity, getSnapshot, commands } = timelineManager;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const picker = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => picker.current?.remove(), []);
  useEffect(
    () =>
      registry?.register({
        openReferenceLayer: () => {
          const snapshot = getSnapshot();
          if (!enabled || !snapshot?.document) return;
          picker.current?.remove();
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.hidden = true;
          input.setAttribute("aria-label", "Open reference layer image");
          document.body.append(input);
          picker.current = input;
          const ownerIdentity = identity,
            id = snapshot.document.id;
          input.addEventListener("cancel", () => input.remove(), { once: true });
          input.addEventListener(
            "change",
            async () => {
              const file = input.files?.[0];
              input.remove();
              if (!file || id === undefined) return;
              try {
                const pixels = await readReferenceImage(file);
                const currentSnapshot = getSnapshot();
                if (
                  currentIdentity.current !== ownerIdentity ||
                  currentSnapshot?.document?.id !== id
                )
                  return;
                commands.addReferenceLayer(pixels);
              } catch (error) {
                onError?.(error instanceof Error ? error.message : String(error));
              }
            },
            { once: true },
          );
          input.click();
        },
      }),
    [registry?.register, getSnapshot, identity, commands, enabled, onError],
  );
  return null;
}
