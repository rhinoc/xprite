import { useEffect, useRef, useState } from "react";

import { EditorPanSurface } from "$/components/canvas/pan-surface";
import { NormalMapError } from "$/components/normal-maps/normal-map-error";
import { tUi } from "$/i18n";
import { CanvasPinchZoomController } from "$/managers/canvas/canvas-manager";
import { clampCanvasPan, documentToScreen, stepZoom } from "$/managers/canvas/canvas-presentation";
import {
  fitImagePreview,
  limitImagePreviewZoom,
  zoomImagePreviewAt,
  IMAGE_PREVIEW_FIT_ZOOM,
  IMAGE_PREVIEW_ZOOMS,
  type ImagePreviewView,
} from "$/managers/canvas/image-preview-view";
import { EditorWheelAction, wheelZoomSteps } from "$/managers/input/use-wheel-input";
import type { NormalPreviewPixels } from "$/managers/normal-maps/normal-map-manager";
import {
  useNormalMapLightSurface,
  type NormalLightingScene,
} from "$/managers/normal-maps/use-normal-map-light-surface";
import { useTouchInputPreferences } from "$/managers/preferences/use-touch-input-preferences";
import { CanvasSurface, Combobox, ProgressBar, usePresentationMetrics } from "@xprite/ui";
import { clientToLocal, clientPoint, useElementSize } from "@xprite/ui/utils";

import styles from "$/components/normal-maps/normal-maps.module.css";

const ZOOM_WIDTH = 72;
const PERCENT = 100;
const PAN_BUTTONS = [0, 1];
const MIDDLE_POINTER_BUTTON_MASK = 4;
const NATIVE_PAN_CURSOR = { hand: "grab", dragging: "grabbing" } as const;
interface Point {
  x: number;
  y: number;
}
export function NormalMapImage({
  pixels,
  lighting = null,
  processing = false,
  fill = false,
  followLight = false,
  lightPosition,
  onLightPosition,
  label,
}: {
  pixels: NormalPreviewPixels | null;
  lighting?: NormalLightingScene | null;
  processing?: boolean;
  fill?: boolean;
  followLight?: boolean;
  lightPosition?: Point;
  onLightPosition?: (point: Point) => void;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const size = useElementSize(root);
  const touch = useTouchInputPreferences();
  const { scale: presentationScale, pixelRatio } = usePresentationMetrics();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const viewport = { width: size.width, height: size.height };
  const documentSize = { width: pixels?.width ?? 1, height: pixels?.height ?? 1 };
  const [view, setView] = useState<ImagePreviewView>(() => fitImagePreview(viewport, documentSize));
  const viewRef = useRef(view);
  viewRef.current = view;
  const pinch = useRef<CanvasPinchZoomController | null>(null);
  const lightDrag = useRef<number | null>(null);
  useEffect(() => {
    setView(fitImagePreview(viewport, documentSize));
  }, [size.width, size.height, documentSize.width, documentSize.height]);
  const origin = documentToScreen({ x: 0, y: 0 }, viewport, documentSize, view);
  const width = documentSize.width * view.zoom;
  const height = documentSize.height * view.zoom;
  const zoomValue = view.fit ? IMAGE_PREVIEW_FIT_ZOOM : view.zoom;
  const zoomChoices = [IMAGE_PREVIEW_FIT_ZOOM, ...IMAGE_PREVIEW_ZOOMS];
  if (!zoomChoices.includes(zoomValue)) zoomChoices.push(zoomValue);
  const maxZoom = limitImagePreviewZoom(Number.POSITIVE_INFINITY, documentSize);
  const lightSurface = useNormalMapLightSurface(
    canvas,
    lighting,
    { viewport, origin, zoom: view.zoom, pixelRatio: presentationScale * pixelRatio },
    marker,
  );
  const hasLight = !!lighting || !!onLightPosition;
  const displayPixels = lighting ? (lightSurface.pixels ?? pixels) : pixels;
  const lightPoint = lighting?.options.position ?? lightPosition;
  const lightAt = (point: Point) => {
    if (!pixels) return;
    const value = { x: (point.x - origin.x) / view.zoom, y: (point.y - origin.y) / view.zoom };
    if (lighting) lightSurface.setPosition(value);
    else onLightPosition?.(value);
  };
  return (
    <div ref={root} className={`${styles.imagePanel} ${fill ? styles.fill : ""}`}>
      <EditorPanSurface
        className={styles.imageViewport}
        enabled
        preserveChildFocus
        handTool={!hasLight}
        touchPan
        panButtons={PAN_BUTTONS}
        cursor={NATIVE_PAN_CURSOR}
        style={{ cursor: hasLight ? "crosshair" : undefined }}
        pan={view.pan}
        onPan={(pan) =>
          setView((current) => ({
            ...current,
            fit: false,
            pan: clampCanvasPan(pan, viewport, documentSize, current.zoom),
          }))
        }
        onDoubleClick={() => setView(fitImagePreview(viewport, documentSize))}
        onWheelAction={(decision, delta, anchor) => {
          if (decision.action === EditorWheelAction.Zoom) {
            const steps = wheelZoomSteps(decision, delta);
            if (steps)
              setView((current) =>
                zoomImagePreviewAt(
                  current,
                  stepZoom(current.zoom, steps),
                  anchor,
                  viewport,
                  documentSize,
                ),
              );
          } else if (
            decision.action === EditorWheelAction.Horizontal ||
            decision.action === EditorWheelAction.Vertical
          )
            setView((current) => ({
              ...current,
              fit: false,
              pan: clampCanvasPan(
                { x: current.pan.x - delta.x, y: current.pan.y - delta.y },
                viewport,
                documentSize,
                current.zoom,
              ),
            }));
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
        aria-label={label}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (!hasLight || event.button !== 0 || event.pointerType === "touch" || !event.isPrimary)
            return;
          event.preventDefault();
          event.stopPropagation();
          lightDrag.current = event.pointerId;
          lightAt(clientToLocal(event.currentTarget, clientPoint(event)));
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (
            event.pointerType === "touch" ||
            pinch.current ||
            (event.buttons & MIDDLE_POINTER_BUTTON_MASK) !== 0
          )
            return;
          if (followLight || lightDrag.current === event.pointerId)
            lightAt(clientToLocal(event.currentTarget, clientPoint(event)));
        }}
        onPointerUp={(event) => {
          if (lightDrag.current !== event.pointerId) return;
          lightDrag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          lightDrag.current = null;
        }}
        onLostPointerCapture={() => {
          lightDrag.current = null;
        }}
      >
        {lighting && (
          <canvas
            ref={setCanvas}
            className={styles.lightCanvas}
            data-renderer={lightSurface.fallback ? "cpu" : "webgl"}
            aria-label={label}
          />
        )}
        {displayPixels && size.ready && (!lighting || lightSurface.fallback) && (
          <CanvasSurface
            bounds={{ x: 0, y: 0, width: displayPixels.width, height: displayPixels.height }}
            viewport={{
              sceneWidth: displayPixels.width,
              sceneHeight: displayPixels.height,
              width,
              height,
            }}
            pixels={displayPixels}
            aria-label={label}
            style={{
              position: "absolute",
              left: origin.x,
              top: origin.y,
              width,
              height,
              pointerEvents: "none",
            }}
          />
        )}
        {pixels && lightPoint && (
          <span
            aria-hidden
            ref={marker}
            className={styles.lightPosition}
            style={{
              left: origin.x + lightPoint.x * view.zoom,
              top: origin.y + lightPoint.y * view.zoom,
            }}
          />
        )}
      </EditorPanSurface>
      {(processing || lightSurface.preparing) && (
        <ProgressBar className={styles.progress} label={tUi("normal.processing")} />
      )}
      <NormalMapError error={lightSurface.error} />
      <div className={styles.zoom}>
        <Combobox
          pixelWidth={ZOOM_WIDTH}
          value={String(zoomValue)}
          aria-label={tUi("import.dialog.zoom.preview")}
          onValueChange={(next) => {
            const zoom = Number(next);
            if (zoom === IMAGE_PREVIEW_FIT_ZOOM) setView(fitImagePreview(viewport, documentSize));
            else
              setView(
                zoomImagePreviewAt(
                  viewRef.current,
                  zoom,
                  { x: size.width / 2, y: size.height / 2 },
                  viewport,
                  documentSize,
                ),
              );
          }}
          options={zoomChoices.map((zoom) => ({
            value: String(zoom),
            label:
              zoom === IMAGE_PREVIEW_FIT_ZOOM
                ? tUi("import.dialog.zoom.fit")
                : `${Math.round(zoom * PERCENT)}%`,
            disabled: zoom !== IMAGE_PREVIEW_FIT_ZOOM && zoom > maxZoom,
          }))}
        />
      </div>
    </div>
  );
}
