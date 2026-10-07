const MEASUREMENT_POLL_MS = 150;
const CSS_PROPERTIES = [
  "width",
  "height",
  "box-sizing",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "border-left-width",
  "border-right-width",
  "border-top-width",
  "border-bottom-width",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "display",
  "visibility",
  "position",
  "z-index",
  "zoom",
  "transform",
  "pointer-events",
  "overflow-x",
  "overflow-y",
  "color",
  "background-color",
];

export class NativeLayoutPendingError extends Error {
  constructor() {
    super("Native layout must be measured before synchronous geometry is read.");
  }
}

/** Geometry snapshots contain native measurements, never invented placeholder sizes. */
export function installWechatGeometryBridge(host) {
  const document = host.document;
  const snapshots = new WeakMap();
  const watched = new Map();
  const observers = new Set();
  const listeners = new Set();
  const prototype = host.Element.prototype;
  const previousRect = Object.getOwnPropertyDescriptor(prototype, "getBoundingClientRect");
  const previousStyle = Object.getOwnPropertyDescriptor(host, "getComputedStyle");
  let pending = Promise.resolve();
  let retired = false;

  class NativeDOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      Object.assign(this, {
        x,
        y,
        width,
        height,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
      });
    }
    static fromRect({ x = 0, y = 0, width = 0, height = 0 } = {}) {
      return new NativeDOMRect(x, y, width, height);
    }
    toJSON() {
      return { ...this };
    }
  }

  function snapshot(element) {
    const value = snapshots.get(element);
    if (!value) throw new NativeLayoutPendingError();
    return value;
  }

  function styleSnapshot(properties) {
    const value = { ...properties };
    for (const [property, content] of Object.entries(properties))
      value[property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = content;
    value.getPropertyValue = (property) => properties[property] ?? "";
    return value;
  }

  async function measure(element) {
    if (!document.body.contains(element)) return;
    const [rect, properties] = await Promise.all([
      element.tagName === "BODY"
        ? new Promise((resolve, reject) => {
            host
              .$$createSelectorQuery()
              .select(".miniprogram-root")
              .boundingClientRect((value) =>
                value ? resolve(value) : reject(new Error("Native root is not ready")),
              )
              .exec();
          })
        : element.$$getBoundingClientRect(),
      host.$$getComputedStyle(element, CSS_PROPERTIES),
    ]);
    if (retired || !document.body.contains(element)) return;
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite))
      throw new Error("Native geometry query did not return a valid rectangle.");
    snapshots.set(element, {
      rect: new NativeDOMRect(rect.left, rect.top, rect.width, rect.height),
      style: styleSnapshot(properties),
    });
  }

  function flush(elements = Array.from(document.querySelectorAll("*"))) {
    const targets = elements.filter(
      (element) =>
        element !== document.documentElement &&
        typeof element.$$getBoundingClientRect === "function",
    );
    const next = pending.then(() => {
      if (!retired) return Promise.all(targets.map(measure));
    });
    pending = next.catch(() => {});
    return next.then(() => {
      if (!retired) deliver();
    });
  }

  function deliver() {
    for (const observer of observers) {
      const entries = [];
      for (const [element, previous] of observer.elements) {
        const current = snapshots.get(element);
        if (!current) continue;
        const width = Number.parseFloat(current.style.width),
          height = Number.parseFloat(current.style.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
        if (previous?.width === width && previous?.height === height) continue;
        observer.elements.set(element, { width, height });
        entries.push({
          target: element,
          contentRect: new NativeDOMRect(0, 0, width, height),
          contentBoxSize: [{ inlineSize: width, blockSize: height }],
        });
      }
      if (entries.length) observer.callback(entries, observer);
    }
    for (const listener of listeners) listener();
  }

  class NativeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Map();
      observers.add(this);
    }
    observe(element) {
      observers.add(this);
      this.elements.set(element, null);
      watched.set(element, (watched.get(element) ?? 0) + 1);
      void flush([element]);
    }
    unobserve(element) {
      if (!this.elements.delete(element)) return;
      const count = (watched.get(element) ?? 1) - 1;
      if (count) watched.set(element, count);
      else watched.delete(element);
    }
    disconnect() {
      for (const element of this.elements.keys()) this.unobserve(element);
      observers.delete(this);
    }
  }

  Object.defineProperty(prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return snapshot(this).rect;
    },
  });
  Object.defineProperty(host, "getComputedStyle", {
    configurable: true,
    value: (element) => snapshot(element).style,
  });
  Object.defineProperties(host, {
    DOMRect: { configurable: true, value: NativeDOMRect },
    ResizeObserver: { configurable: true, value: NativeResizeObserver },
  });
  const timer = setInterval(() => {
    if (watched.size) void flush(Array.from(watched.keys()));
  }, MEASUREMENT_POLL_MS);
  function dispose() {
    retired = true;
    clearInterval(timer);
    for (const observer of observers) observer.disconnect();
    if (previousRect) Object.defineProperty(prototype, "getBoundingClientRect", previousRect);
    if (previousStyle) Object.defineProperty(host, "getComputedStyle", previousStyle);
    else delete host.getComputedStyle;
    host.removeEventListener("beforeunload", dispose);
  }
  host.addEventListener("beforeunload", dispose);
  function layoutSize(element) {
    const style = snapshot(element).style;
    const x = Number.parseFloat(style.width),
      y = Number.parseFloat(style.height);
    const border = (name) => Number.parseFloat(style[name]) || 0;
    return style.boxSizing === "border-box"
      ? {
          width: x - border("borderLeftWidth") - border("borderRightWidth"),
          height: y - border("borderTopWidth") - border("borderBottomWidth"),
        }
      : {
          width: x + border("paddingLeft") + border("paddingRight"),
          height: y + border("paddingTop") + border("paddingBottom"),
        };
  }
  return {
    flush,
    dispose,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    provider: {
      clientRect: (element) => snapshot(element).rect,
      computedStyle: (element) => snapshot(element).style,
      layoutSize,
    },
  };
}
