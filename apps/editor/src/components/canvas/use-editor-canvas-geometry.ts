import { useEffect, useRef, useState } from "react";

import type { SurfaceBounds } from "@xprite/ui";
import { clientPointsToLocal, clientRect, observeResize } from "@xprite/ui/utils";

const PANE_SELECTOR = "[data-workspace-pane-id]";
const ACTIVE_PANE_SELECTOR = `${PANE_SELECTOR}[data-active="true"]`;
const CANVAS_SELECTOR = "canvas[data-editor-canvas]";
const CONTEXT_BAR_SELECTOR = ".xse-workspace-panel-content .xse-context-bar";

export interface EditorCanvasGeometry {
  /** Raster coordinates authored by EditorCanvas, independent of where it is docked. */
  surface: SurfaceBounds;
  /** The canvas placement in CSS coordinates inside the editor scene. */
  scene: SurfaceBounds;
}

type OverlayGeometry = {
  viewport: EditorCanvasGeometry | null;
  contextBounds: SurfaceBounds | null;
};

const EMPTY_GEOMETRY: OverlayGeometry = { viewport: null, contextBounds: null };

function sameBounds(a: SurfaceBounds | null, b: SurfaceBounds | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
  );
}

function boundsInScene(scene: HTMLElement, rect: DOMRect | undefined): SurfaceBounds | null {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const [start, end] = clientPointsToLocal(scene, [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.bottom },
  ]);
  return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
}

export function readActiveEditorCanvas(root: HTMLElement | null) {
  if (!root) return null;
  const pane = root.querySelector(ACTIVE_PANE_SELECTOR);
  const scope = pane ?? (root.querySelector(PANE_SELECTOR) ? null : root);
  const canvas = scope?.querySelector<HTMLCanvasElement>(CANVAS_SELECTOR);
  if (!canvas) return null;
  const surface = {
    x: Number(canvas.dataset.uiX),
    y: Number(canvas.dataset.uiY),
    width: Number(canvas.dataset.uiWidth),
    height: Number(canvas.dataset.uiHeight),
  };
  const valid =
    Object.values(surface).every(Number.isFinite) && surface.width > 0 && surface.height > 0;
  return { canvas, surface: valid ? surface : null, rect: clientRect(canvas) };
}

/** Place scene-level overlays over the current editing pane even when a dialog owns focus. */
export function useEditorCanvasGeometry(enabled: boolean) {
  const marker = useRef<HTMLSpanElement>(null);
  const [geometry, setGeometry] = useState(EMPTY_GEOMETRY);

  useEffect(() => {
    if (!enabled) {
      setGeometry(EMPTY_GEOMETRY);
      return;
    }
    const scene = marker.current?.closest<HTMLElement>("[data-ui-scene]");
    if (!scene) return;

    let observedCanvas: HTMLCanvasElement | null = null;
    let observedContextBar: Element | null = null;
    let stopResize: (() => void) | undefined;
    const read = () => {
      const active = readActiveEditorCanvas(scene);
      const canvas = active?.canvas ?? null;
      const contextBar = scene.querySelector(CONTEXT_BAR_SELECTOR);
      if (!stopResize || observedCanvas !== canvas || observedContextBar !== contextBar) {
        stopResize?.();
        observedCanvas = canvas;
        observedContextBar = contextBar;
        const elements: Element[] = [scene];
        if (canvas) elements.push(canvas);
        if (contextBar) elements.push(contextBar);
        stopResize = observeResize(elements, read);
      }
      const placement = boundsInScene(scene, active?.rect);
      const viewport =
        active?.surface && placement ? { surface: active.surface, scene: placement } : null;
      const contextBounds = boundsInScene(scene, clientRect(contextBar));
      setGeometry((old) =>
        sameBounds(old.viewport?.surface ?? null, viewport?.surface ?? null) &&
        sameBounds(old.viewport?.scene ?? null, viewport?.scene ?? null) &&
        sameBounds(old.contextBounds, contextBounds)
          ? old
          : { viewport, contextBounds },
      );
    };

    read();
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          ({ target, attributeName }) =>
            attributeName !== "style" ||
            (target !== observedCanvas && target.contains(observedCanvas)) ||
            target.contains(observedContextBar),
        )
      )
        read();
    });
    observer.observe(scene, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-active",
        "data-ui-element-scale",
        "data-ui-x",
        "data-ui-y",
        "data-ui-width",
        "data-ui-height",
        "style",
      ],
    });
    scene.addEventListener("scroll", read, true);
    return () => {
      scene.removeEventListener("scroll", read, true);
      observer.disconnect();
      stopResize?.();
    };
  }, [enabled]);

  return { marker, ...(enabled ? geometry : EMPTY_GEOMETRY) };
}
