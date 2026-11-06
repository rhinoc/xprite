import { clampCanvasPan, documentToScreen } from "$/managers/canvas/canvas-presentation";

const MAX_FIT_ZOOM = 8;
const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 64;
const MAX_PREVIEW_EXTENT = 2048;
export const IMAGE_PREVIEW_FIT_ZOOM = 0;
export const IMAGE_PREVIEW_ZOOMS = [1, 2, 4] as const;
export interface ImagePreviewView {
  zoom: number;
  pan: { x: number; y: number };
  fit: boolean;
}

export function fitImagePreview(
  viewport: { width: number; height: number },
  document: { width: number; height: number },
): ImagePreviewView {
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

export function limitImagePreviewZoom(zoom: number, document: { width: number; height: number }) {
  const max = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, MAX_PREVIEW_EXTENT / document.width, MAX_PREVIEW_EXTENT / document.height),
  );
  return Math.max(MIN_ZOOM, Math.min(max, zoom));
}

export function zoomImagePreviewAt(
  view: ImagePreviewView,
  zoom: number,
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  document: { width: number; height: number },
): ImagePreviewView {
  const next = limitImagePreviewZoom(zoom, document);
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
