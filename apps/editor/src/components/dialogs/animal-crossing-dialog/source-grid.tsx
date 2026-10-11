import { useRef, useState } from "react";

import { EditorPanSurface } from "$/components/canvas/pan-surface";
import { tUiSource } from "$/i18n";
import { CanvasPinchZoomController, CanvasToolId } from "$/managers/canvas/canvas-manager";
import { documentToScreen } from "$/managers/canvas/canvas-presentation";
import type {
  AnimalCrossingExportSource,
  AnimalCrossingGrid,
  AnimalCrossingSettings,
} from "$/managers/files/animal-crossing-export";
import { EditorWheelAction, wheelZoomSteps } from "$/managers/input/use-wheel-input";
import { useTouchInputPreferences } from "$/managers/preferences/use-touch-input-preferences";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import { stepZoom } from "$/managers/timeline/timeline-presentation";
import { AnimalCrossingGridOverlay } from "@xprite/editor-ui/animal-crossing";
import { Button, CanvasSurface } from "@xprite/ui";

import styles from "$/components/dialogs/animal-crossing-dialog/animal-crossing-dialog.module.css";

const UNIT_VIEWPORT = { sceneWidth: 1, sceneHeight: 1, width: 1, height: 1 };
const CHECKER = { cellSize: 4, light: [192, 192, 192] as const, dark: [128, 128, 128] as const };
const FIT_PADDING = 80;
const MAX_FIT_ZOOM = 4;
const MIN_ZOOM = 0.125;
const MAX_ZOOM = 64;
interface View {
  zoom: number;
  pan: { x: number; y: number };
}
export function AnimalCrossingSourceGrid({
  source,
  settings,
  grid,
  selected,
  bounds,
  disabled,
  onSettingsChange,
  onSelect,
  onBeginEdit,
  onEndEdit,
}: {
  source: AnimalCrossingExportSource;
  settings: AnimalCrossingSettings;
  grid: AnimalCrossingGrid | null;
  selected: number;
  bounds: { x: number; y: number; width: number; height: number };
  disabled: boolean;
  onSettingsChange(patch: Partial<AnimalCrossingSettings>): void;
  onSelect(index: number): void;
  onBeginEdit(): void;
  onEndEdit(cancel?: boolean): void;
}) {
  const shortcuts = useShortcutManager();
  const touch = useTouchInputPreferences();
  const handKey = useRef<string | null>(null);
  const [hand, setHand] = useState(false);
  const [editingGrid, setEditingGrid] = useState(false);
  const [pinching, setPinching] = useState(false);
  const fit = (): View => {
    const zoom = Math.min(
      MAX_FIT_ZOOM,
      (bounds.width - FIT_PADDING) / source.pixels.width,
      (bounds.height - FIT_PADDING) / source.pixels.height,
    );
    return {
      zoom,
      pan: {
        x: (bounds.width - source.pixels.width * zoom) / 2,
        y: (bounds.height - source.pixels.height * zoom) / 2,
      },
    };
  };
  const [view, setView] = useState<View>(fit);
  const viewRef = useRef(view);
  viewRef.current = view;
  const viewport = { width: bounds.width, height: bounds.height };
  const document = { width: source.pixels.width, height: source.pixels.height };
  const centeredOrigin = (zoom: number) =>
    documentToScreen({ x: 0, y: 0 }, viewport, document, { zoom, pan: { x: 0, y: 0 } });
  const toCanvasView = (view: View) => {
    const origin = centeredOrigin(view.zoom);
    return { zoom: view.zoom, pan: { x: view.pan.x - origin.x, y: view.pan.y - origin.y } };
  };
  const fromCanvasView = (view: View): View => {
    const origin = centeredOrigin(view.zoom);
    return { zoom: view.zoom, pan: { x: view.pan.x + origin.x, y: view.pan.y + origin.y } };
  };
  const zoomAt = (zoom: number, anchor: { x: number; y: number }) => {
    setView((old) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
      const ratio = next / old.zoom;
      return {
        zoom: next,
        pan: {
          x: anchor.x - (anchor.x - old.pan.x) * ratio,
          y: anchor.y - (anchor.y - old.pan.y) * ratio,
        },
      };
    });
  };
  const pinch = useRef<CanvasPinchZoomController | null>(null);
  return (
    <div
      className={styles.grid}
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
    >
      <EditorPanSurface
        className={styles.gridSurface}
        enabled={!editingGrid}
        aria-label={tUiSource("Source image and grid")}
        pan={view.pan}
        onPan={(pan) => setView((old) => ({ ...old, pan }))}
        handTool={hand}
        touchPan
        onKeyDown={(event) => {
          const tool = shortcuts?.resolveQuickTool({
            key: event.key,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            meta: event.metaKey,
            shift: event.shiftKey,
            space: event.code === "Space",
          });
          if (tool === CanvasToolId.Hand) {
            handKey.current = event.code;
            setHand(true);
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyUp={(event) => {
          if (event.code === handKey.current) {
            handKey.current = null;
            setHand(false);
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHand(false);
        }}
        onWheelAction={(decision, delta, anchor) => {
          if (editingGrid) return;
          if (decision.action === EditorWheelAction.Zoom)
            zoomAt(stepZoom(view.zoom, wheelZoomSteps(decision, delta)), anchor);
          else if (
            decision.action === EditorWheelAction.Horizontal ||
            decision.action === EditorWheelAction.Vertical
          )
            setView((old) => ({ ...old, pan: { x: old.pan.x - delta.x, y: old.pan.y - delta.y } }));
        }}
        onPinchStart={(gesture) => {
          setPinching(true);
          pinch.current = new CanvasPinchZoomController({
            center: gesture.center,
            screenCenter: gesture.center,
            distance: gesture.distance,
            viewport,
            document,
            view: toCanvasView(viewRef.current),
            mode: touch.pinchZoomMode,
          });
        }}
        onPinch={(gesture) => {
          const next = pinch.current?.update(gesture.center, gesture.distance, viewport);
          if (next) setView(fromCanvasView(next));
        }}
        onPinchEnd={() => {
          const finished = pinch.current?.finish(viewport, toCanvasView(viewRef.current));
          pinch.current = null;
          setPinching(false);
          if (finished) {
            const next = fromCanvasView(finished);
            setView(next);
            return next.pan;
          }
          return viewRef.current.pan;
        }}
      >
        <div
          className={styles.sourceImage}
          style={{ transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})` }}
        >
          <CanvasSurface
            pixels={source.pixels}
            bounds={{ x: 0, y: 0, width: source.pixels.width, height: source.pixels.height }}
            viewport={UNIT_VIEWPORT}
            checker={CHECKER}
            aria-hidden
          />
        </div>
        <AnimalCrossingGridOverlay
          source={source.pixels}
          settings={settings}
          grid={grid}
          selected={selected}
          view={{ zoom: view.zoom, origin: view.pan }}
          size={bounds}
          disabled={disabled}
          editable
          navigating={hand || pinching}
          translate={tUiSource}
          onSettingsChange={onSettingsChange}
          onSelect={onSelect}
          onBeginEdit={() => {
            setEditingGrid(true);
            onBeginEdit();
          }}
          onEndEdit={(cancel) => {
            setEditingGrid(false);
            onEndEdit(cancel);
          }}
        />
      </EditorPanSurface>
      <Button
        className={styles.fitButton}
        bounds={{ x: bounds.width - 116, y: -28, width: 112, height: 26 }}
        viewport={UNIT_VIEWPORT}
        text={tUiSource("Fit to View")}
        onClick={() => setView(fit())}
      />
    </div>
  );
}
