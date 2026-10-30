import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { EditorPanSurface } from "$/components/canvas/pan-surface";
import {
  clampSplit,
  originalClipRight,
  resultClipLeft,
  splitFromKey,
  splitFromPointer,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_START,
} from "$/components/dialogs/pixelation-dialog/compare-split";
import { tUi } from "$/i18n";
import { CanvasPinchZoomController } from "$/managers/canvas/canvas-manager";
import { clampCanvasPan, documentToScreen, stepZoom } from "$/managers/canvas/canvas-presentation";
import { EditorWheelAction, wheelZoomSteps } from "$/managers/input/use-wheel-input";
import { useTouchInputPreferences } from "$/managers/preferences/use-touch-input-preferences";
import { Combobox, ScrollbarStyle, ScrollbarThumb, type CanvasPixelSource } from "@xprite/ui";
import { clientPoint, clientRect } from "@xprite/ui/utils";

import styles from "$/components/dialogs/pixelation-dialog/import-compare.module.css";

const MAX_FIT_ZOOM = 8;
const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 64;
const FIT_ZOOM = 0;
const PRESET_ZOOMS = [1, 2, 4];
const ZOOM_WIDTH = 72;
const PERCENT = 100;
const PAN_BUTTONS = [0, 1];
/** Native keywords — themed `url()` cursors vanish under the editor's CSS `zoom` on this stage. */
const NATIVE_PAN_CURSOR = { hand: "grab", dragging: "grabbing" } as const;

interface View {
  zoom: number;
  pan: { x: number; y: number };
  fit: boolean;
}

function PixelCanvas({
  pixels,
  className,
  style,
}: {
  pixels: CanvasPixelSource;
  className: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0,
    );
  }, [pixels]);
  return <canvas ref={ref} className={className} style={style} />;
}

function fitView(
  viewport: { width: number; height: number },
  document: { width: number; height: number },
): View {
  const available = Math.min(
    MAX_FIT_ZOOM,
    Math.max(MIN_ZOOM, viewport.width / Math.max(1, document.width)),
    Math.max(MIN_ZOOM, viewport.height / Math.max(1, document.height)),
    MAX_ZOOM,
  );
  const zoom =
    available >= 1 ? Math.floor(available) : 1 / Math.ceil(1 / Math.max(MIN_ZOOM, available));
  return { zoom, pan: { x: 0, y: 0 }, fit: true };
}

function limitZoom(zoom: number, document: { width: number; height: number }) {
  const max = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 2048 / document.width, 2048 / document.height));
  return Math.max(MIN_ZOOM, Math.min(max, zoom));
}

function applyZoom(
  view: View,
  zoom: number,
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  document: { width: number; height: number },
): View {
  const next = limitZoom(zoom, document);
  const currentOrigin = documentToScreen({ x: 0, y: 0 }, viewport, document, view);
  const documentPoint = {
    x: (anchor.x - currentOrigin.x) / view.zoom,
    y: (anchor.y - currentOrigin.y) / view.zoom,
  };
  const origin = documentToScreen(documentPoint, viewport, document, {
    zoom: next,
    pan: { x: 0, y: 0 },
  });
  const pan = clampCanvasPan(
    { x: anchor.x - origin.x, y: anchor.y - origin.y },
    viewport,
    document,
    next,
  );
  return { zoom: next, pan, fit: false };
}

/** One canvas, two layers: the original on one side of a draggable bar, the result on the other. */
export function ImportCompare({
  original,
  result,
  width,
  height,
  labels,
  comparing = true,
  updating = false,
  picking = false,
  onPick,
}: {
  original: CanvasPixelSource;
  result: CanvasPixelSource | null;
  width: number;
  height: number;
  /** A new result is being computed: the previous one stays, dimmed, under a status tag. */
  updating?: boolean;
  /** False shows only the original: no result layer, divider or handle. */
  comparing?: boolean;
  /** Eyedropper: next primary click samples a document pixel instead of panning. */
  picking?: boolean;
  onPick?: (x: number, y: number) => void;
  labels: {
    original: string;
    result: string;
    preparing: string;
    slider: string;
  };
}) {
  const touch = useTouchInputPreferences();
  const [split, setSplit] = useState(SPLIT_START);
  const [hot, setHot] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const pinch = useRef<CanvasPinchZoomController | null>(null);
  const viewport = { width, height };
  const documentSize = { width: original.width, height: original.height };
  const [view, setView] = useState<View>(() => fitView(viewport, documentSize));
  const viewRef = useRef(view);
  viewRef.current = view;
  // Refit when the dialog preview box or source image size changes.
  useEffect(() => {
    setView(fitView(viewport, documentSize));
  }, [width, height, original.width, original.height]);

  const origin = documentToScreen({ x: 0, y: 0 }, viewport, documentSize, view);
  const layer = {
    left: origin.x,
    top: origin.y,
    width: original.width * view.zoom,
    height: original.height * view.zoom,
  };
  const moveSplit = (event: ReactPointerEvent) => {
    const rect = clientRect(box.current);
    const next = rect ? splitFromPointer(clientPoint(event).x, rect) : null;
    if (next !== null) setSplit(next);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = splitFromKey(split, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setSplit(next);
  };
  // Keep the previous result on screen (dimmed) while the next one is computed, so changing an
  // option never blanks the preview and the user can see that something is happening.
  const lastResult = useRef<CanvasPixelSource | null>(null);
  if (result) lastResult.current = result;
  const left = original;
  const right = result ?? (updating ? lastResult.current : null);
  const stale = !result && updating && !!right;
  const zoomValue = view.fit ? FIT_ZOOM : view.zoom;
  const zoomChoices = [FIT_ZOOM, ...PRESET_ZOOMS];
  if (!zoomChoices.includes(zoomValue)) zoomChoices.push(zoomValue);
  const maxZoom = limitZoom(Number.POSITIVE_INFINITY, documentSize);
  const canZoom = (zoom: number) => zoom === FIT_ZOOM || zoom <= maxZoom;

  return (
    <div className={styles.frame} style={{ width, height }}>
      <div className={styles.zoom}>
        <Combobox
          pixelWidth={ZOOM_WIDTH}
          value={String(zoomValue)}
          aria-label={tUi("import.dialog.zoom.preview")}
          onValueChange={(next) => {
            const value = Number(next);
            if (value === FIT_ZOOM) setView(fitView(viewport, documentSize));
            else
              setView(
                applyZoom(
                  viewRef.current,
                  value,
                  { x: width / 2, y: height / 2 },
                  viewport,
                  documentSize,
                ),
              );
          }}
          options={zoomChoices.map((zoom) => ({
            value: String(zoom),
            label:
              zoom === FIT_ZOOM ? tUi("import.dialog.zoom.fit") : `${Math.round(zoom * PERCENT)}%`,
            disabled: zoom !== FIT_ZOOM && !canZoom(zoom),
          }))}
        />
      </div>
      <EditorPanSurface
        className={styles.stage}
        style={{
          width,
          height,
          cursor: picking ? "crosshair" : comparing ? undefined : "default",
        }}
        enabled
        handTool={!picking}
        cursor={picking ? undefined : NATIVE_PAN_CURSOR}
        preserveChildFocus
        panButtons={picking ? [] : PAN_BUTTONS}
        pan={view.pan}
        onPan={(pan) =>
          setView((old) => ({
            ...old,
            fit: false,
            pan: clampCanvasPan(pan, viewport, documentSize, old.zoom),
          }))
        }
        onDoubleClick={() => setView(fitView(viewport, documentSize))}
        onWheelAction={(decision, delta, anchor) => {
          if (decision.action === EditorWheelAction.Zoom) {
            const steps = wheelZoomSteps(decision, delta);
            if (!steps) return;
            setView((old) =>
              applyZoom(old, stepZoom(old.zoom, steps), anchor, viewport, documentSize),
            );
          } else if (
            decision.action === EditorWheelAction.Horizontal ||
            decision.action === EditorWheelAction.Vertical
          ) {
            setView((old) => ({
              ...old,
              fit: false,
              pan: clampCanvasPan(
                { x: old.pan.x - delta.x, y: old.pan.y - delta.y },
                viewport,
                documentSize,
                old.zoom,
              ),
            }));
          }
        }}
        onPinchStart={(gesture) => {
          pinch.current = new CanvasPinchZoomController({
            center: gesture.center,
            screenCenter: gesture.center,
            distance: gesture.distance,
            viewport,
            document: documentSize,
            view: { zoom: viewRef.current.zoom, pan: viewRef.current.pan, tiledMode: undefined },
            mode: touch.pinchZoomMode,
          });
        }}
        onPinch={(gesture) => {
          const next = pinch.current?.update(gesture.center, gesture.distance, viewport);
          if (next)
            setView({
              zoom: next.zoom,
              pan: clampCanvasPan(next.pan, viewport, documentSize, next.zoom),
              fit: false,
            });
        }}
        onPinchEnd={() => {
          const finished = pinch.current?.finish(viewport, {
            zoom: viewRef.current.zoom,
            pan: viewRef.current.pan,
            tiledMode: undefined,
          });
          pinch.current = null;
          if (finished) {
            const next = {
              zoom: finished.zoom,
              pan: clampCanvasPan(finished.pan, viewport, documentSize, finished.zoom),
              fit: false,
            };
            setView(next);
            return next.pan;
          }
          return viewRef.current.pan;
        }}
        aria-label={tUi("import.dialog.zoom.preview")}
      >
        <div
          ref={box}
          className={styles.layers}
          onPointerDown={(event) => {
            if (!picking || !onPick || !event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = clientRect(box.current);
            if (!rect) return;
            const point = clientPoint(event);
            const docX = (point.x - rect.left - origin.x) / view.zoom;
            const docY = (point.y - rect.top - origin.y) / view.zoom;
            onPick(docX, docY);
          }}
        >
          {left ? (
            <PixelCanvas
              pixels={left}
              className={styles.layer}
              style={{
                left: layer.left,
                top: layer.top,
                width: layer.width,
                height: layer.height,
                ...(comparing
                  ? { clipPath: `inset(0 ${originalClipRight(split, width, layer)}px 0 0)` }
                  : {}),
              }}
            />
          ) : (
            <div className={styles.waiting}>{labels.preparing}</div>
          )}
          {comparing && right && (
            <PixelCanvas
              pixels={right}
              className={styles.layer}
              style={{
                left: layer.left,
                top: layer.top,
                width: layer.width,
                height: layer.height,
                clipPath: `inset(0 0 0 ${resultClipLeft(split, width, layer)}px)`,
                ...(stale ? { opacity: 0.45 } : {}),
              }}
            />
          )}
          {comparing && updating && (
            <div className={styles.progress} role="progressbar" aria-label={labels.preparing} />
          )}
          {comparing && (
            <div
              ref={bar}
              className={styles.bar}
              style={{ left: `${clampSplit(split)}%` }}
              role="slider"
              tabIndex={0}
              aria-label={tUi("import.dialog.zoom.preview")}
              aria-valuemin={SPLIT_MIN}
              aria-valuemax={SPLIT_MAX}
              aria-valuenow={Math.round(split)}
              onKeyDown={onKey}
              onPointerEnter={() => setHot(true)}
              onPointerLeave={() => setHot(false)}
              onFocus={() => setHot(true)}
              onBlur={() => setHot(false)}
              onPointerDown={(event) => {
                if (!event.isPrimary || (event.button !== 0 && event.pointerType === "mouse"))
                  return;
                // Handled here: the pan surface ignores a pointer-down that is already used.
                event.preventDefault();
                bar.current?.focus({ preventScroll: true });
                event.currentTarget.setPointerCapture(event.pointerId);
                dragging.current = event.pointerId;
                moveSplit(event);
              }}
              onPointerMove={(event) => {
                if (dragging.current === event.pointerId) moveSplit(event);
              }}
              onPointerUp={(event) => {
                if (dragging.current === event.pointerId) dragging.current = null;
              }}
              onPointerCancel={() => {
                dragging.current = null;
              }}
              onLostPointerCapture={() => {
                dragging.current = null;
              }}
            >
              <ScrollbarThumb
                scrollbarStyle={ScrollbarStyle.Classic}
                className={styles.grip}
                hovered={hot}
              />
            </div>
          )}
        </div>
      </EditorPanSurface>
      {/* Anchored to the frame so labels stay readable above the zoom control. */}
      {comparing && <span className={`${styles.tag} ${styles.tagLeft}`}>{labels.original}</span>}
      {comparing && (
        <span className={`${styles.tag} ${styles.tagRight}`} role={updating ? "status" : undefined}>
          {updating ? labels.preparing : labels.result}
        </span>
      )}
    </div>
  );
}
