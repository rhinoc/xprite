import type { ToolWheelInput } from "$/managers/ports/preview";
import {
  clampCanvasPan,
  documentToScreen,
  screenToDocument,
  stepZoom,
} from "@xprite/editor-core/canvas";

export interface ToolPoint {
  x: number;
  y: number;
}
export interface ToolSize {
  width: number;
  height: number;
}
export interface ToolView {
  zoom: number;
  fit: boolean;
  pan: ToolPoint;
  origin: ToolPoint;
}
const MAX_FIT_ZOOM = 8;
const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 64;
const MAX_DISPLAY_DIMENSION = 2048;
const MAX_DISPLAY_PIXELS = 2_097_152;
const WHEEL_ZOOM_RATE = 0.01;
const MIN_PINCH_DISTANCE = 1;

/** Tool preview navigation only; no document, preference or editing state is changed. */
export class ToolViewport {
  private size: ToolSize = { width: 1, height: 1 };
  private document: ToolSize = { width: 1, height: 1 };
  private identity = -1;
  private view: ToolView = { zoom: 1, fit: true, pan: { x: 0, y: 0 }, origin: { x: 0, y: 0 } };
  private readonly listeners = new Set<() => void>();
  private pinch: {
    distance: number;
    zoom: number;
    anchor: ToolPoint;
    center: ToolPoint;
  } | null = null;
  constructor(private readonly readWheel: (event: WheelEvent) => ToolWheelInput) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private maxZoom() {
    return Math.max(
      MIN_ZOOM,
      Math.min(
        MAX_ZOOM,
        MAX_DISPLAY_DIMENSION / this.document.width,
        MAX_DISPLAY_DIMENSION / this.document.height,
        Math.sqrt(MAX_DISPLAY_PIXELS / (this.document.width * this.document.height)),
      ),
    );
  }
  private limitZoom(zoom: number) {
    return Math.max(MIN_ZOOM, Math.min(this.maxZoom(), zoom));
  }
  canZoom = (zoom: number) => zoom <= this.maxZoom();
  private update(zoom: number, pan: ToolPoint, fit = false) {
    zoom = this.limitZoom(zoom);
    const bounded = clampCanvasPan(pan, this.size, this.document, zoom);
    this.view = {
      zoom,
      pan: bounded,
      fit,
      origin: documentToScreen({ x: 0, y: 0 }, this.size, this.document, { zoom, pan: bounded }),
    };
    for (const listener of this.listeners) listener();
  }
  setDocument(identity: number, size: ToolSize) {
    if (
      identity === this.identity &&
      size.width === this.document.width &&
      size.height === this.document.height
    )
      return;
    this.identity = identity;
    this.document = size;
    this.pinch = null;
    this.fit();
  }
  setSize(size: ToolSize) {
    // A rolled-up window has no viewport; keep its pan and zoom until it is restored.
    if (size.width <= 0 || size.height <= 0) return;
    if (size.width === this.size.width && size.height === this.size.height) return;
    this.size = size;
    if (this.view.fit) this.fit();
    else this.update(this.view.zoom, this.view.pan);
  }
  fit = () => {
    const available = Math.min(
      MAX_FIT_ZOOM,
      this.size.width / this.document.width,
      this.size.height / this.document.height,
      this.maxZoom(),
    );
    const zoom =
      available >= 1 ? Math.floor(available) : 1 / Math.ceil(1 / Math.max(MIN_ZOOM, available));
    this.update(zoom, { x: 0, y: 0 }, true);
  };
  pan = (pan: ToolPoint) => this.update(this.view.zoom, pan);
  private anchored(zoom: number, anchor: ToolPoint, center: ToolPoint) {
    zoom = this.limitZoom(zoom);
    const origin = documentToScreen(anchor, this.size, this.document, {
      zoom,
      pan: { x: 0, y: 0 },
    });
    this.update(zoom, { x: center.x - origin.x, y: center.y - origin.y });
  }
  setZoom = (
    zoom: number,
    center: ToolPoint = { x: this.size.width / 2, y: this.size.height / 2 },
  ) => {
    const anchor = screenToDocument(center, this.size, this.document, this.view);
    this.anchored(zoom, anchor, center);
  };
  wheel(event: WheelEvent, delta: ToolPoint, center: ToolPoint) {
    const input = this.readWheel(event);
    if (input.zoom || input.magnify) {
      this.setZoom(
        this.view.zoom * Math.exp(-(delta.y || delta.x) * input.unit * WHEEL_ZOOM_RATE),
        center,
      );
    } else if (!input.precise && !input.shift && !delta.x) {
      this.setZoom(stepZoom(this.view.zoom, -Math.sign(delta.y)), center);
    } else {
      const x = input.shift ? delta.x || delta.y : delta.x;
      const y = input.shift ? 0 : delta.y;
      this.pan({ x: this.view.pan.x - x * input.unit, y: this.view.pan.y - y * input.unit });
    }
  }
  startPinch = ({ center, distance }: { center: ToolPoint; distance: number }) => {
    this.pinch = {
      center,
      distance: Math.max(MIN_PINCH_DISTANCE, distance),
      zoom: this.view.zoom,
      anchor: screenToDocument(center, this.size, this.document, this.view),
    };
  };
  movePinch = ({ center, distance }: { center: ToolPoint; distance: number }) => {
    if (!this.pinch) return;
    this.pinch.center = center;
    this.anchored((this.pinch.zoom * distance) / this.pinch.distance, this.pinch.anchor, center);
  };
  finishPinch = () => {
    if (!this.pinch) return;
    const center = this.pinch.center;
    this.pinch = null;
    this.setZoom(stepZoom(this.view.zoom, 0), center);
    return this.view.pan;
  };
}
