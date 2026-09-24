const RESIZE_POLL_MS = 150;
const ZOOM_PROBE_SCALE = 2;
const ZOOM_PROBE_SIZE = 4;
const ZOOM_PROBE_EPSILON = 0.001;
const unscaledClientRects = new WeakMap<Document, boolean>();

function needsZoomCorrection(document: Document) {
  const known = unscaledClientRects.get(document);
  if (known !== undefined) return known;
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    width: `${ZOOM_PROBE_SIZE}px`,
    height: `${ZOOM_PROBE_SIZE}px`,
    visibility: "hidden",
    pointerEvents: "none",
    zoom: "1",
  });
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.style.zoom = String(ZOOM_PROBE_SCALE);
  const zoomedWidth = probe.getBoundingClientRect().width;
  probe.remove();
  const missing = zoomedWidth < width * ZOOM_PROBE_SCALE - ZOOM_PROBE_EPSILON;
  unscaledClientRects.set(document, missing);
  return missing;
}

/** Older WebKit reports client rectangles before CSS zoom, unlike pointer coordinates. */
export function clientRect(element: Element): DOMRect;
export function clientRect(element: Element | null | undefined): DOMRect | undefined;
export function clientRect(element: Element | null | undefined): DOMRect | undefined {
  if (!element) return undefined;
  const rect = element.getBoundingClientRect();
  const document = element.ownerDocument;
  const host = document?.defaultView;
  if (!document?.body || !host || !needsZoomCorrection(document)) return rect;
  let zoom = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const scale = Number.parseFloat(host.getComputedStyle(node).zoom);
    if (Number.isFinite(scale) && scale > 0) zoom *= scale;
  }
  return DOMRect.fromRect({
    x: rect.x * zoom,
    y: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  });
}

/** Client pixels per layout CSS pixel, including ancestor zoom and transforms. */
export function clientScale(element: HTMLElement) {
  const rect = clientRect(element);
  const size = borderSize(element);
  return {
    x: size.width > 0 && rect.width > 0 ? rect.width / size.width : 1,
    y: size.height > 0 && rect.height > 0 ? rect.height / size.height : 1,
  };
}

export interface GeometryPoint {
  x: number;
  y: number;
}
export interface GeometrySize {
  width: number;
  height: number;
}

/** Local CSS pixels inside the element's borders, before presentation scaling. */
export function layoutSize(element: Element): GeometrySize;
export function layoutSize(element: Element | null | undefined): GeometrySize | undefined;
export function layoutSize(element: Element | null | undefined): GeometrySize | undefined {
  return element ? { width: element.clientWidth, height: element.clientHeight } : undefined;
}

export function layoutBorder(element: Element) {
  return { x: element.clientLeft, y: element.clientTop };
}

export function positionedParent(element: HTMLElement) {
  return element.offsetParent instanceof HTMLElement ? element.offsetParent : element.parentElement;
}

/** Border-box CSS pixels. Preserve fractional authored sizes when available. */
export function borderSize(element: HTMLElement) {
  const style = computedStyle(element);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  const extraWidth =
    style.boxSizing === "border-box"
      ? 0
      : (Number.parseFloat(style.paddingLeft) || 0) +
        (Number.parseFloat(style.paddingRight) || 0) +
        (Number.parseFloat(style.borderLeftWidth) || 0) +
        (Number.parseFloat(style.borderRightWidth) || 0);
  const extraHeight =
    style.boxSizing === "border-box"
      ? 0
      : (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0) +
        (Number.parseFloat(style.borderTopWidth) || 0) +
        (Number.parseFloat(style.borderBottomWidth) || 0);
  return {
    width: Number.isFinite(width) ? width + extraWidth : element.offsetWidth,
    height: Number.isFinite(height) ? height + extraHeight : element.offsetHeight,
  };
}

export function scrollSize(element: Element) {
  return { width: element.scrollWidth, height: element.scrollHeight };
}
export function scrollPosition(element: Element): GeometryPoint;
export function scrollPosition(element: Element | null | undefined): GeometryPoint | undefined;
export function scrollPosition(element: Element | null | undefined): GeometryPoint | undefined {
  return element ? { x: element.scrollLeft, y: element.scrollTop } : undefined;
}
export function setScrollPosition(element: Element, point: Partial<GeometryPoint>) {
  if (point.x !== undefined) element.scrollLeft = point.x;
  if (point.y !== undefined) element.scrollTop = point.y;
}
export function scrollBy(element: Element, delta: Partial<GeometryPoint>) {
  setScrollPosition(element, {
    x: delta.x === undefined ? undefined : element.scrollLeft + delta.x,
    y: delta.y === undefined ? undefined : element.scrollTop + delta.y,
  });
}

/** Pointer positions remain viewport CSS pixels; do not apply device pixel ratio. */
export function clientPoint(input: { clientX: number; clientY: number }): GeometryPoint {
  return { x: input.clientX, y: input.clientY };
}
export function clientToLocal(element: HTMLElement, point: GeometryPoint): GeometryPoint {
  const rect = clientRect(element);
  const scale = clientScale(element);
  return { x: (point.x - rect.left) / scale.x, y: (point.y - rect.top) / scale.y };
}
export function clientDeltaToLocal(element: HTMLElement, delta: GeometryPoint): GeometryPoint {
  const scale = clientScale(element);
  return { x: delta.x / scale.x, y: delta.y / scale.y };
}

/** Map a client point into an authored surface, retaining its local origin. */
export function clientToSurface(
  element: Element,
  point: GeometryPoint,
  bounds: GeometrySize & Partial<GeometryPoint>,
): GeometryPoint {
  const rect = clientRect(element);
  return {
    x: (bounds.x ?? 0) + (rect.width > 0 ? ((point.x - rect.left) * bounds.width) / rect.width : 0),
    y:
      (bounds.y ?? 0) +
      (rect.height > 0 ? ((point.y - rect.top) * bounds.height) / rect.height : 0),
  };
}

export function clientDeltaToSurface(element: Element, delta: GeometryPoint, size: GeometrySize) {
  const rect = clientRect(element);
  return {
    x: rect.width > 0 ? (delta.x * size.width) / rect.width : 0,
    y: rect.height > 0 ? (delta.y * size.height) / rect.height : 0,
  };
}

export function scrollWindowTo(host: Window, point: Partial<GeometryPoint>) {
  host.scrollTo({ left: point.x ?? host.scrollX, top: point.y ?? host.scrollY });
}

export function scrollElementIntoView(
  element: Element | null | undefined,
  options: ScrollIntoViewOptions,
) {
  element?.scrollIntoView(options);
}

export function computedStyle(element: Element) {
  const host = element.ownerDocument?.defaultView;
  return host ? host.getComputedStyle(element) : getComputedStyle(element);
}
export function viewportSize(host: Window = window): GeometrySize {
  return { width: host.innerWidth, height: host.innerHeight };
}
export function displayPixelRatio(host: Window = window) {
  return host.devicePixelRatio || 1;
}
export function getVisualViewport(host: Window = window) {
  return host.visualViewport;
}
export function screenMetrics(host: Window = window) {
  const screen = host.screen;
  return {
    width: screen.width,
    height: screen.height,
    availableWidth: screen.availWidth,
    availableHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    orientation: screen.orientation?.type ?? null,
  };
}
export function visualViewportRect(viewport: VisualViewport) {
  return {
    x: viewport.offsetLeft,
    y: viewport.offsetTop,
    width: viewport.width,
    height: viewport.height,
    scale: viewport.scale,
  };
}
export function hitElement(point: GeometryPoint, documentHost: Document = document) {
  return documentHost.elementFromPoint(point.x, point.y);
}
export function hitElements(point: GeometryPoint, documentHost: Document = document) {
  return documentHost.elementsFromPoint(point.x, point.y);
}

/** Text ranges and their container must share the browser's native rectangle space. */
export function rangeRect(container: HTMLElement, range: Range) {
  const host = container.getBoundingClientRect();
  const rect = range.getBoundingClientRect();
  const size = borderSize(container);
  const sx = size.width > 0 && host.width > 0 ? host.width / size.width : 1;
  const sy = size.height > 0 && host.height > 0 ? host.height / size.height : 1;
  return {
    left: (rect.left - host.left) / sx,
    right: (rect.right - host.left) / sx,
    top: (rect.top - host.top) / sy,
    bottom: (rect.bottom - host.top) / sy,
    width: rect.width / sx,
    height: rect.height / sy,
  };
}

export function layoutOffset(element: HTMLElement) {
  return { x: element.offsetLeft, y: element.offsetTop };
}

/** Install polling resize delivery for browser hosts without a native observer. */
export function installResizeObserverFallback(): void {
  if (typeof ResizeObserver !== "undefined") return;
  class PollingResizeObserver {
    private elements = new Map<Element, { width: number; height: number }>();
    private timer: ReturnType<typeof setInterval> | null = null;
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element): void {
      this.elements.set(element, { width: -1, height: -1 });
      if (this.timer === null) this.timer = setInterval(() => this.deliver(), RESIZE_POLL_MS);
      setTimeout(() => this.deliver(), 0);
    }
    unobserve(element: Element): void {
      this.elements.delete(element);
      if (!this.elements.size) this.disconnect();
    }
    disconnect(): void {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.elements.clear();
    }
    private deliver(): void {
      const entries: ResizeObserverEntry[] = [];
      for (const [element, previous] of this.elements) {
        const size = layoutSize(element);
        const style = computedStyle(element);
        const width = Math.max(
          0,
          size.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0),
        );
        const height = Math.max(
          0,
          size.height -
            (parseFloat(style.paddingTop) || 0) -
            (parseFloat(style.paddingBottom) || 0),
        );
        if (width === previous.width && height === previous.height) continue;
        this.elements.set(element, { width, height });
        entries.push({
          target: element,
          contentRect: { x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height },
        } as ResizeObserverEntry);
      }
      if (entries.length) this.callback(entries, this as unknown as ResizeObserver);
    }
  }
  globalThis.ResizeObserver = PollingResizeObserver as unknown as typeof ResizeObserver;
}

/** Geometry invalidation without exposing native ResizeObserver entries. */
export function observeResize(elements: readonly Element[], changed: () => void): () => void {
  const observer = new ResizeObserver(changed);
  for (const element of elements) observer.observe(element);
  return () => observer.disconnect();
}

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

type SizeListener = (size: ElementSize) => void;
interface SizeObservers {
  observer: ResizeObserver;
  listeners: Map<Element, Set<SizeListener>>;
}

const observers = new WeakMap<Document, SizeObservers>();

/** Share resize delivery across controls, keeping sizes in their local coordinate space. */
export function observeElementSize(element: Element, listener: SizeListener): () => void {
  const document = element.ownerDocument;
  let scope = observers.get(document);
  if (!scope) {
    const listeners = new Map<Element, Set<SizeListener>>();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const size = { width: entry.contentRect.width, height: entry.contentRect.height };
        for (const notify of listeners.get(entry.target) ?? []) notify(size);
      }
    });
    scope = { observer, listeners };
    observers.set(document, scope);
  }
  const current = scope;
  let listeners = current.listeners.get(element);
  if (!listeners) {
    listeners = new Set();
    current.listeners.set(element, listeners);
    current.observer.observe(element);
  }
  listeners.add(listener);
  return () => {
    const listeners = current.listeners.get(element);
    if (!listeners) return;
    listeners.delete(listener);
    if (!listeners.size) {
      current.listeners.delete(element);
      current.observer.unobserve(element);
    }
    if (!current.listeners.size) {
      current.observer.disconnect();
      observers.delete(document);
    }
  };
}
