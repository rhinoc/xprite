import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import { useText } from "$/tools/normalmap/components/context";
import {
  View,
  type NormalToolEditor,
  type NormalToolSnapshot,
} from "$/tools/normalmap/managers/editor";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  clientPoint,
  clientRect,
  displayPixelRatio,
  layoutSize,
} from "@xprite/ui/base/utils/dom-geometry";
import { useElementSize } from "@xprite/ui/base/utils/use-element-size";

import styles from "$/tools/normalmap/components/normalmap.module.css";

const LIGHT_RADIUS = 14;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;

const canvases = new WeakMap<PixelBuffer, HTMLCanvasElement>();

function canvasOf(pixels: PixelBuffer): HTMLCanvasElement {
  let element = canvases.get(pixels);
  if (!element) {
    element = document.createElement("canvas");
    element.width = pixels.width;
    element.height = pixels.height;
    element
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    canvases.set(pixels, element);
  }
  return element;
}

interface ViewTransform {
  /** CSS px of one image px. */
  zoom: number;
  /** Image px at the view's left/top edge. */
  x: number;
  y: number;
}

type Gesture =
  | { kind: "light"; historyPushed: boolean }
  | {
      kind: "pinch";
      /** Pinch centre at the gesture's start (client px). */
      center: { x: number; y: number };
      startDistance: number;
      startZoom: number;
      /** Image px under the centre at the gesture's start. */
      anchor: { x: number; y: number };
    }
  | { kind: "pan"; last: { x: number; y: number } };

function fitTransform(box: { width: number; height: number }, image: PixelBuffer): ViewTransform {
  const zoom = Math.min(box.width / image.width, box.height / image.height);
  return {
    zoom,
    x: (image.width - box.width / zoom) / 2,
    y: (image.height - box.height / zoom) / 2,
  };
}

/**
 * The preview card: the current view's pixels, pinch/drag zoomed and panned, with a draggable
 * light dot while the lit view shows. One finger pans, two fingers pinch; a tap on the lit view
 * also moves the light.
 */
export function PreviewCanvas({
  editor,
  state,
  status,
}: {
  editor: NormalToolEditor;
  state: NormalToolSnapshot;
  status: string | null;
}) {
  const t = useText();
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stageSize = useElementSize(stage);
  const [view, setView] = useState<ViewTransform | null>(null);
  const [fitted, setFitted] = useState(true);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const shown =
    state.view === View.Albedo
      ? editor.source
      : state.view === View.Normal
        ? editor.normalPixels
        : editor.litPixels;

  useLayoutEffect(() => {
    const element = canvas.current;
    const box = stage.current;
    if (!element || !box || !shown) return;
    const draw = () => {
      const ratio = displayPixelRatio();
      const cssWidth = layoutSize(box)?.width ?? 0;
      const cssHeight = layoutSize(box)?.height ?? 0;
      if (cssWidth <= 0 || cssHeight <= 0) return;
      const transform = fitted
        ? fitTransform({ width: cssWidth, height: cssHeight }, shown)
        : (view ?? fitTransform({ width: cssWidth, height: cssHeight }, shown));
      if (!transform) return;
      const pixelWidth = Math.max(1, Math.round(cssWidth * ratio));
      const pixelHeight = Math.max(1, Math.round(cssHeight * ratio));
      if (element.width !== pixelWidth) element.width = pixelWidth;
      if (element.height !== pixelHeight) element.height = pixelHeight;
      const context = element.getContext("2d")!;
      context.imageSmoothingEnabled = false;
      context.fillStyle = "#1f1d22";
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      // Draw the image at transform.zoom CSS px per image px, offset by -transform.x/y.
      context.setTransform(
        transform.zoom * ratio,
        0,
        0,
        transform.zoom * ratio,
        -transform.x * transform.zoom * ratio,
        -transform.y * transform.zoom * ratio,
      );
      context.drawImage(canvasOf(shown), 0, 0, shown.width, shown.height);
      context.setTransform(1, 0, 0, 1, 0, 0);
      setView((current) =>
        current &&
        current.zoom === transform.zoom &&
        current.x === transform.x &&
        current.y === transform.y
          ? current
          : transform,
      );
    };
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [shown, view, fitted, state.view, stageSize.width, stageSize.height]);

  /** The image pixel under a client point, using the current transform. */
  const imageAt = (clientX: number, clientY: number) => {
    const rect = clientRect(canvas.current);
    const box = stage.current;
    if (!rect || !box || !shown) return null;
    const boxSize = layoutSize(box)!;
    const transform = fitted
      ? fitTransform({ width: boxSize.width, height: boxSize.height }, shown)
      : (view ?? fitTransform({ width: boxSize.width, height: boxSize.height }, shown));
    return {
      x: transform.x + (clientX - rect.left) / transform.zoom,
      y: transform.y + (clientY - rect.top) / transform.zoom,
    };
  };

  const moveLight = (clientX: number, clientY: number, first: boolean) => {
    const point = imageAt(clientX, clientY);
    if (!point || !shown) return;
    const position = {
      x: Math.min(shown.width, Math.max(0, Math.round(point.x))),
      y: Math.min(shown.height, Math.max(0, Math.round(point.y))),
    };
    if (first) editor.changeLight({ position });
    else editor.trackLight({ position });
  };

  const pointerPos = (event: PointerEvent) => clientPoint(event);

  const onDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary && pointers.current.size > 0) {
      // Second finger: pinch. Works alongside a light drag so zooming stays available there.
      pointers.current.set(event.pointerId, pointerPos(event));
      const [a, b] = [...pointers.current.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const anchor = imageAt(center.x, center.y);
      if (!anchor) return;
      gesture.current = {
        kind: "pinch",
        center,
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
        startZoom: view?.zoom ?? 1,
        anchor,
      };
      return;
    }
    if (!event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, pointerPos(event));
    if (state.view === View.Lit) {
      gesture.current = { kind: "light", historyPushed: false };
      moveLight(clientPoint(event).x, clientPoint(event).y, true);
      gesture.current.historyPushed = true;
    } else {
      gesture.current = { kind: "pan", last: pointerPos(event) };
    }
  };

  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId)!;
    const next = pointerPos(event);
    pointers.current.set(event.pointerId, next);
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, current.startZoom * (distance / Math.max(1, current.startDistance))),
      );
      const rect = clientRect(canvas.current)!;
      const cx = center.x - rect.left;
      const cy = center.y - rect.top;
      setView({
        zoom,
        x: current.anchor.x - cx / zoom,
        y: current.anchor.y - cy / zoom,
      });
      setFitted(false);
      return;
    }
    if (current.kind === "light" && event.isPrimary && pointers.current.size === 1) {
      moveLight(clientPoint(event).x, clientPoint(event).y, !current.historyPushed);
      current.historyPushed = true;
      return;
    }
    if (current.kind === "pan" && event.isPrimary) {
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const rect = clientRect(canvas.current)!;
      setView((existing) => {
        const base = existing ?? fitTransform({ width: rect.width, height: rect.height }, shown!);
        return { ...base, x: base.x - dx / base.zoom, y: base.y - dy / base.zoom };
      });
      setFitted(false);
    }
  };

  const onUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  const light =
    state.view === View.Lit && shown && view
      ? {
          x: (state.light.position.x - view.x) * view.zoom,
          y: (state.light.position.y - view.y) * view.zoom,
        }
      : null;

  return (
    <div ref={stage} className={styles.stage}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        role="img"
        aria-label={t("canvas.preview")}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {light && (
        <div
          className={styles.lightDot}
          aria-hidden="true"
          style={{ left: light.x, top: light.y, width: LIGHT_RADIUS * 2, height: LIGHT_RADIUS * 2 }}
        />
      )}
      <button
        type="button"
        className={styles.fitButton}
        aria-pressed={fitted}
        onClick={() => {
          const box = stage.current;
          if (fitted && box && shown) {
            // Switch to 1:1 centred on the current view's middle.
            const boxSize = layoutSize(box)!;
            const cssWidth = boxSize.width;
            const cssHeight = boxSize.height;
            const zoom = Math.min(1, ZOOM_MAX);
            setView({
              zoom,
              x: (shown.width - cssWidth / zoom) / 2,
              y: (shown.height - cssHeight / zoom) / 2,
            });
            setFitted(false);
          } else {
            setFitted(true);
            setView(null);
          }
        }}
      >
        {fitted ? "1:1" : "适应"}
      </button>
      {status && (
        <div className={styles.status} role="status">
          {status}
        </div>
      )}
    </div>
  );
}
