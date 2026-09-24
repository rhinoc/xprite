import "$/components/canvas/editor-viewport/editor-viewport.module.css";
import { useLayoutEffect, useRef, useState } from "react";

import { EditorCanvas } from "$/components/canvas/editor-canvas";
import { EditorFrame, asepriteEditorFrameBounds } from "$/components/canvas/editor-frame";
import { EditorPanSurface } from "$/components/canvas/pan-surface";
import { useEditorLayoutSettings } from "$/components/shared/editor-layout-context";
import { tUi, useUiLanguage } from "$/i18n";
import { useCanvasManager, stepAsepriteZoom } from "$/managers/canvas/canvas-manager";
import {
  tiledCanvasLayout,
  clampCanvasPan,
  documentToScreen,
  keepDocumentOrigin,
  timelineWheelFrameIndex,
} from "$/managers/canvas/canvas-presentation";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import {
  EditorWheelAction as WheelAction,
  brushSizeAfterWheel,
  wheelScalarDelta,
  wheelZoomSteps,
} from "$/managers/input/use-wheel-input";
import { useEditorPreferences } from "$/managers/preferences/use-editor-preferences";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { UI_SCALE_X, UI_SCALE_Y, surfaceLayout } from "@xprite/ui/canvas";
import { layoutSize, observeResize } from "@xprite/ui/utils";

export function EditorViewport({
  src,
  previewSrc: _previewSrc,
  alt,
}: {
  src: string;
  previewSrc?: string;
  alt: string;
}) {
  useUiLanguage();
  const editor = useEditorFields([
    "frameCount",
    "openTab",
    "setBrushSize",
    "setFrame",
    "setZoom",
    "stepPaletteColor",
    "tab",
    "timelineVisible",
    "tool",
    "visible",
    "zoom",
  ]);
  const chromePreferences = useEditorChromePreferences();
  const canvasManager = useCanvasManager(false);
  const { colorbarDeltaScene } = useEditorLayoutSettings();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const extraHeight = editor.timelineVisible ? 0 : 234;
  if (canvasManager.active)
    return <FunctionalViewport showScrollbars={chromePreferences.showCanvasScrollbars} />;
  // EditorView::KeepOrigin compensates scroll when layout padding changes.
  const documentShift = 0;
  return (
    <>
      <EditorPanSurface
        className="xse-viewport"
        pan={pan}
        onPan={setPan}
        coordinateScale={{ x: UI_SCALE_X, y: UI_SCALE_Y }}
        handTool={editor.tool === "hand"}
        onWheelAction={(decision, delta, anchor) => {
          const { action } = decision;
          if (action === WheelAction.Horizontal || action === WheelAction.Vertical) {
            setPan((current) => ({
              x: current.x - delta.x,
              y: current.y - delta.y,
            }));
          } else if (action === WheelAction.Zoom) {
            const steps = wheelZoomSteps(decision, delta);
            if (!steps) return;
            const next = stepAsepriteZoom(editor.zoom, steps);
            const ratio = next / editor.zoom;
            // Anchor the document-space point under the pointer while zooming.
            const center = {
              x: 404 + 1224 / 2 - 76.8 / UI_SCALE_X,
              y: 84 + documentShift + 708 / 2 - 76 / UI_SCALE_Y,
            };
            setPan((current) => ({
              x: anchor.x - center.x - (anchor.x - center.x - current.x) * ratio,
              y: anchor.y - center.y - (anchor.y - center.y - current.y) * ratio,
            }));
            editor.setZoom(next);
          } else if (action === WheelAction.Brush) {
            editor.setBrushSize((current) => brushSizeAfterWheel(current, decision, delta));
          } else if (action === WheelAction.Frame) {
            editor.setFrame(
              (current) =>
                timelineWheelFrameIndex(
                  current - 1,
                  editor.frameCount,
                  wheelScalarDelta(decision, delta),
                  decision.precise,
                ) + 1,
            );
          } else if (action === WheelAction.Foreground || action === WheelAction.Background) {
            editor.stepPaletteColor(action, Math.trunc(wheelScalarDelta(decision, delta)));
          }
        }}
        enabled={editor.tab === "document"}
        aria-label="Document viewport"
      >
        {editor.tab === "document" ? (
          <div
            className="xse-checker"
            style={{
              top: -15 + documentShift * UI_SCALE_Y,
              transform:
                editor.zoom === 100 && !pan.x && !pan.y
                  ? undefined
                  : `translate(${pan.x * UI_SCALE_X}px,${pan.y * UI_SCALE_Y}px) scale(${editor.zoom / 100})`,
            }}
          >
            <img
              src={src}
              alt={alt}
              style={editor.visible ? undefined : { visibility: "hidden" }}
            />
          </div>
        ) : (
          <div className="xse-home">
            <h2>Xprite</h2>
            <p>{tUi("ui.recent.files")}</p>
            <button
              type="button"
              className="xse-open-document"
              onClick={() => editor.openTab("document")}
            >
              {tUi("ui.open.document")}
            </button>
          </div>
        )}
      </EditorPanSurface>
      <EditorFrame
        frameBounds={{
          ...asepriteEditorFrameBounds,
          x: asepriteEditorFrameBounds.x + colorbarDeltaScene,
          width: Math.max(30, asepriteEditorFrameBounds.width - colorbarDeltaScene),
        }}
        extraHeight={extraHeight}
        documentBounds={{
          x: 404,
          y: 84 + documentShift,
          width: 1224,
          height: 708,
        }}
        relativeTo={{ x: 0, y: 76 / UI_SCALE_Y }}
        pan={pan}
        onPan={setPan}
        zoom={editor.zoom / 100}
        showDocumentOutline={editor.tab === "document"}
        showScrollbars={chromePreferences.showCanvasScrollbars}
        style={{ zIndex: 2 }}
      />
    </>
  );
}
function FunctionalViewport({ showScrollbars }: { showScrollbars: boolean }) {
  useUiLanguage();
  const { uiElementScale } = useEditorChromePreferences();
  const editor = useEditorFields([
    "frameCount",
    "openTab",
    "setBrushSize",
    "setFrame",
    "setZoom",
    "stepPaletteColor",
    "tab",
    "timelineVisible",
    "tool",
    "visible",
    "zoom",
  ]);
  const preferences = useEditorPreferences();
  const canvasManager = useCanvasManager();
  const state = canvasManager.snapshot;
  const commands = canvasManager.commands;
  if (!state || !commands) throw new Error("FunctionalViewport requires an editor manager");
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => {
      const next = {
        width: Math.max(0, Math.round(layoutSize(node).width)),
        height: Math.max(0, Math.round(layoutSize(node).height)),
      };
      setViewportSize((current) =>
        current?.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    const observer = observeResize([node], measure);

    return () => observer();
  }, []);
  const previousViewport = useRef<{
    editorIdentity: number;
    documentId: number | undefined;
    width: number;
    height: number;
  } | null>(null);
  const uiSurfaceBounds = canvasManager.editorCanvasBounds(
    viewportSize ?? { width: 0, height: 0 },
    showScrollbars,
  );
  // The drawing plane retains screen pixel size while its surrounding chrome scales.
  const surfaceBounds = {
    x: uiSurfaceBounds.x * uiElementScale,
    y: uiSurfaceBounds.y * uiElementScale,
    width: Math.round(uiSurfaceBounds.width * uiElementScale),
    height: Math.round(uiSurfaceBounds.height * uiElementScale),
  };
  useLayoutEffect(() => {
    if (editor.tab !== "document") return;
    if (!viewportSize || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const initialized = canvasManager.measureViewport(surfaceBounds);
    const snapshot = canvasManager.getSnapshot();
    if (!snapshot) return;
    const next = { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 };
    const previous = previousViewport.current;
    const editorIdentity = canvasManager.identity;
    if (editorIdentity === null) return;
    previousViewport.current = { editorIdentity, documentId: snapshot.document?.id, ...next };
    if (snapshot.document) {
      const requested =
        !initialized &&
        previous?.editorIdentity === editorIdentity &&
        previous.documentId === snapshot.document.id
          ? keepDocumentOrigin(previous, next, snapshot.view.pan)
          : snapshot.view.pan;
      const pan = clampCanvasPan(
        requested,
        next,
        snapshot.document,
        snapshot.view.zoom,
        snapshot.view.tiledMode,
      );
      if (pan.x !== snapshot.view.pan.x || pan.y !== snapshot.view.pan.y) commands.setView({ pan });
    }
  }, [
    canvasManager.measureViewport,
    canvasManager.getSnapshot,
    canvasManager.identity,
    commands,
    editor.tab,
    state.document?.id,
    viewportSize,
    surfaceBounds,
  ]);
  const doc = state.document;
  const documentOrigin = documentToScreen(
    { x: 0, y: 0 },
    { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 },
    tiledCanvasLayout(doc?.width ?? 0, doc?.height ?? 0, state.view.tiledMode ?? 0),
    { zoom: 1, pan: { x: 0, y: 0 } },
  );
  const canvasLayout = surfaceLayout(surfaceBounds);
  return (
    <>
      <div ref={viewportRef} className="xse-viewport">
        {!viewportSize ? null : editor.tab === "document" ? (
          <div
            style={{
              position: "absolute",
              left: canvasLayout.left / uiElementScale,
              top: canvasLayout.top / uiElementScale,
              width: canvasLayout.width,
              height: canvasLayout.height,
              transform: `scale(${1 / uiElementScale})`,
              transformOrigin: "top left",
            }}
          >
            <EditorCanvas
              autoScroll={preferences.autoScroll}
              zoomFromCenterWithWheel={preferences.zoomFromCenterWithWheel}
              surfaceBounds={surfaceBounds}
              cursor={canvasManager.input?.cursors.editorCursor(state.settings.tool)}
            />
          </div>
        ) : (
          <div className="xse-home">
            <h2>Xprite</h2>
            <button className="xse-open-document" onClick={() => editor.openTab("document")}>
              {tUi("ui.open.document")}
            </button>
            <p>{tUi("ui.drop.an.image.to.import.or.press.ctrl.cmd.o")}</p>
          </div>
        )}
        {viewportSize && (
          <EditorFrame
            frameBounds={{
              x: 0,
              y: 0,
              width: viewportSize.width,
              height: viewportSize.height,
            }}
            documentBounds={{
              x: (surfaceBounds.x + documentOrigin.x * 2) / uiElementScale,
              y: (surfaceBounds.y + documentOrigin.y * 2) / uiElementScale,
              width:
                (tiledCanvasLayout(doc?.width ?? 0, doc?.height ?? 0, state.view.tiledMode ?? 0)
                  .width *
                  2) /
                uiElementScale,
              height:
                (tiledCanvasLayout(doc?.width ?? 0, doc?.height ?? 0, state.view.tiledMode ?? 0)
                  .height *
                  2) /
                uiElementScale,
            }}
            pan={{
              x: (state.view.pan.x * 2) / uiElementScale,
              y: (state.view.pan.y * 2) / uiElementScale,
            }}
            onPan={(p) => {
              const snapshot = canvasManager.getSnapshot();
              if (!snapshot) return;
              const pan = { x: (p.x * uiElementScale) / 2, y: (p.y * uiElementScale) / 2 };
              commands.setView({
                pan: snapshot.document
                  ? clampCanvasPan(
                      pan,
                      { width: surfaceBounds.width / 2, height: surfaceBounds.height / 2 },
                      snapshot.document,
                      snapshot.view.zoom,
                      snapshot.view.tiledMode,
                    )
                  : pan,
              });
            }}
            zoom={state.view.zoom}
            showDocumentOutline={false}
            showScrollbars={showScrollbars}
            style={{ zIndex: 2 }}
          />
        )}
      </div>
    </>
  );
}
