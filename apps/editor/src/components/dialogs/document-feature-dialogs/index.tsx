import {
  lazy,
  Suspense,
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
import { useDocumentFeatureManager } from "$/managers/dialogs/document-feature-manager";
import type { DialogEditorTarget } from "$/managers/dialogs/internal-editor-source";
const DocumentSizeDialogs = lazy(() =>
  import("$/components/dialogs/size-dialogs").then((module) => ({
    default: module.DocumentSizeDialogs,
  })),
);
import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { tUi } from "$/i18n";
import { Text, TextVariant, type SurfaceBounds } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";

export interface DocumentFeatureActions {
  openSpriteSize: () => void;
  openCanvasSize: () => void;
}
interface ActionRegistry {
  actions: DocumentFeatureActions | null;
  register: (actions: DocumentFeatureActions) => () => void;
}
const DocumentFeatureActionsContext = createContext<ActionRegistry | null>(null);
export function DocumentFeatureActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<DocumentFeatureActions | null>(null);
  const register = useCallback((next: DocumentFeatureActions) => {
    setActions(next);
    return () => setActions((current) => (current === next ? null : current));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return (
    <DocumentFeatureActionsContext.Provider value={value}>
      {children}
    </DocumentFeatureActionsContext.Provider>
  );
}
export function useDocumentFeatureActions() {
  return useContext(DocumentFeatureActionsContext)?.actions ?? null;
}
export interface DocumentFeatureDialogsProps {
  /** Disable on Home/recovery; changing this closes any uncommitted dialog. */
  enabled?: boolean;
  editorBounds?: SurfaceBounds;
  canvasViewportBounds?: SurfaceBounds;
}
/** Scene-root host. Geometry may be supplied explicitly; otherwise it reads
 * this scene's canvas-authored Aseprite bounds, so mockups need no layout code.
 * Observers run only while a dialog is open and track dock/viewport resizing. */
export function DocumentFeatureDialogs({
  enabled = true,
  editorBounds,
  canvasViewportBounds,
}: DocumentFeatureDialogsProps) {
  const registry = useContext(DocumentFeatureActionsContext);
  const assets = useUiAssets(),
    sceneBounds = useSceneBounds();
  const manager = useDocumentFeatureManager();
  const snapshot = manager.current;
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [kind, setKind] = useState<"sprite" | "canvas" | null>(null);
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const openedTarget = useRef<DialogEditorTarget | null>(null);
  const currentlyEnabled = useRef(enabled);
  currentlyEnabled.current = enabled;
  const marker = useRef<HTMLSpanElement>(null);
  const [measuredCanvas, setMeasuredCanvas] = useState<SurfaceBounds | null>(null);
  const close = useCallback(() => {
    setKind(null);
    openedTarget.current = null;
    setSizeError(null);
    setMeasuredCanvas(null);
  }, []);
  const open = useCallback(
    (next: "sprite" | "canvas") => {
      const current = managerRef.current.current;
      if (!enabled || !current) return;
      managerRef.current.pausePlayback();
      openedTarget.current = current.target;
      setKind(next);
    },
    [enabled],
  );
  useEffect(
    () =>
      registry?.register({
        openSpriteSize: () => open("sprite"),
        openCanvasSize: () => open("canvas"),
      }),
    [registry?.register, open],
  );
  const targetCurrent = manager.isCurrentTarget(openedTarget.current);
  useEffect(() => {
    if (!enabled || !snapshot?.document || (kind && !targetCurrent)) close();
  }, [enabled, snapshot?.document, kind, targetCurrent, close]);
  useEffect(() => {
    if (!kind || !targetCurrent || canvasViewportBounds) return;
    const scene = marker.current?.closest("[data-ui-scene]");
    if (!scene) return;
    const read = () => {
      const canvas = scene.querySelector<HTMLElement>(
        "canvas[data-ui-x][data-ui-y][data-ui-width][data-ui-height]",
      );
      if (!canvas) {
        setMeasuredCanvas(null);
        return;
      }
      const bounds = {
        x: Number(canvas.dataset.uiX),
        y: Number(canvas.dataset.uiY),
        width: Number(canvas.dataset.uiWidth),
        height: Number(canvas.dataset.uiHeight),
      };
      if (!Object.values(bounds).every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)
        return;
      setMeasuredCanvas((old) =>
        old &&
        old.x === bounds.x &&
        old.y === bounds.y &&
        old.width === bounds.width &&
        old.height === bounds.height
          ? old
          : bounds,
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(scene, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-ui-x", "data-ui-y", "data-ui-width", "data-ui-height"],
    });
    return () => observer.disconnect();
  }, [kind, targetCurrent, canvasViewportBounds]);
  const canvas = canvasViewportBounds ?? measuredCanvas ?? undefined;
  // View's client starts three GUI pixels inside its top/left; right/bottom
  // additionally contain the Aseprite nine-GUI-pixel scrollbars.
  const editor =
    editorBounds ??
    (canvas
      ? { x: canvas.x - 6, y: canvas.y - 6, width: canvas.width + 24, height: canvas.height + 24 }
      : undefined);
  const doc = snapshot?.document;
  const contextBounds = editor
    ? { x: editor.x, y: editor.y - 36, width: sceneBounds.width - editor.x, height: 36 }
    : null;
  const apply = (operation: () => boolean) => {
    // Reject a queued callback even before React's document-change effect runs.
    const target = openedTarget.current;
    if (!currentlyEnabled.current || !manager.isCurrentTarget(target)) return false;
    try {
      return operation();
    } catch (error) {
      setSizeError(
        error instanceof Error ? error.message : "Unable to allocate the resized sprite.",
      );
      return false;
    }
  };
  return (
    <>
      <span hidden ref={marker} data-document-feature-dialog-host="" />
      {kind === "canvas" && targetCurrent && enabled && contextBounds && assets && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            ...surfaceLayout(contextBounds),
            pointerEvents: "none",
            zIndex: 1998,
            background: assets.style.colors.workspace,
          }}
        >
          <Text
            variant={TextVariant.PositionedPixel}
            text={tUi("ui.select.new.canvas.size")}
            x={4}
            y={8}
            color={assets.style.colors.text}
          />
        </div>
      )}
      {kind && doc && enabled && targetCurrent && (
        <Suspense fallback={null}>
          <DocumentSizeDialogs
            suspended={!!sizeError}
            kind={kind}
            documentWidth={doc.width}
            documentHeight={doc.height}
            editorBounds={editor}
            canvasViewportBounds={canvas}
            view={snapshot.view}
            onClose={close}
            onSpriteSize={(width, height, method) =>
              apply(() =>
                managerRef.current.resizeSprite(openedTarget.current!, width, height, method),
              )
            }
            onCanvasSize={(bounds, trim) =>
              apply(() => managerRef.current.resizeCanvas(openedTarget.current!, bounds, trim))
            }
          />
        </Suspense>
      )}
      <Alert
        open={targetCurrent && !!sizeError}
        onOpenChange={(open) => {
          if (!open) setSizeError(null);
        }}
        title="Error"
        messageLines={
          sizeError ? [sizeError, "Change the size or interpolation method and try again."] : []
        }
        actions={[{ label: "OK", mnemonicIndex: 0, onClick: () => setSizeError(null) }]}
      />
    </>
  );
}
