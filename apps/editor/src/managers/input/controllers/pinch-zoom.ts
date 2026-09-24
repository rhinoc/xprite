import { PinchZoomMode } from "$/managers/preferences/touch-input-preferences";
import {
  clampCanvasPan,
  clampZoom,
  documentToScreen,
  screenToDocument,
  stepAsepriteZoom,
  type Point,
  type ViewSettings,
} from "@xprite/editor-core";

type PinchView = Pick<ViewSettings, "zoom" | "pan" | "tiledMode">;
type Viewport = { width: number; height: number };
type PinchViewPatch = Pick<ViewSettings, "zoom" | "pan">;
const MIN_PINCH_DISTANCE = 1;
const PINCH_ZOOM_DISTANCE_SLOP = 12;

interface PinchZoomStart {
  center: Point;
  screenCenter: Point;
  distance: number;
  viewport: Viewport;
  document: Viewport;
  view: PinchView;
  mode: PinchZoomMode;
}

/** Anchored touch navigation using the same discrete ladder as desktop wheel zoom. */
export class CanvasPinchZoomController {
  readonly startCenter: Point;
  readonly startDistance: number;
  private readonly anchor: Point;
  private lastCenter: Point;
  private pinched = false;

  constructor(private readonly start: PinchZoomStart) {
    this.startCenter = { ...start.center };
    this.startDistance = Math.max(MIN_PINCH_DISTANCE, start.distance);
    this.anchor = screenToDocument(start.screenCenter, start.viewport, start.document, start.view);
    this.lastCenter = { ...start.screenCenter };
  }

  update(center: Point, distance: number, viewport: Viewport): PinchViewPatch {
    this.lastCenter = { ...center };
    if (Math.abs(distance - this.startDistance) > PINCH_ZOOM_DISTANCE_SLOP) this.pinched = true;
    // Finger-distance jitter during a pan must not turn it into a zoom or cause release snapping.
    const continuousZoom = this.pinched
      ? clampZoom((this.start.view.zoom * distance) / this.startDistance, this.start.view.zoom)
      : this.start.view.zoom;
    const zoom =
      this.pinched && this.start.mode === PinchZoomMode.Stepped
        ? this.snapZoom(continuousZoom)
        : continuousZoom;
    return this.anchoredView(zoom, center, this.anchor, viewport);
  }

  finish(viewport: Viewport, view: PinchView): PinchViewPatch | null {
    if (!this.pinched || this.start.mode !== PinchZoomMode.SnapOnRelease) return null;
    const zoom = this.snapZoom(view.zoom);
    if (zoom === view.zoom) return null;
    // Use the actual bounded view so snapping keeps the pixel currently beneath the fingers.
    const anchor = screenToDocument(this.lastCenter, viewport, this.start.document, view);
    return this.anchoredView(zoom, this.lastCenter, anchor, viewport);
  }

  private snapZoom(zoom: number) {
    return stepAsepriteZoom(zoom * 100, 0) / 100;
  }

  private anchoredView(
    zoom: number,
    center: Point,
    anchor: Point,
    viewport: Viewport,
  ): PinchViewPatch {
    const origin = documentToScreen(anchor, viewport, this.start.document, {
      zoom,
      pan: { x: 0, y: 0 },
      tiledMode: this.start.view.tiledMode,
    });
    return {
      zoom,
      pan: clampCanvasPan(
        { x: center.x - origin.x, y: center.y - origin.y },
        viewport,
        this.start.document,
        zoom,
        this.start.view.tiledMode,
      ),
    };
  }
}
