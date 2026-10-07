/** Browser-facing objects backed by current WeChat window and device information. */
export function installWechatEnvironment(host, nativeApi) {
  Object.defineProperty(host, "queueMicrotask", {
    configurable: true,
    value: (callback) => {
      void Promise.resolve()
        .then(callback)
        .catch((error) =>
          setTimeout(() => {
            throw error;
          }, 0),
        );
    },
  });
  const queries = new Set();
  const OriginalEvent = host.Event;
  class StandardEvent extends OriginalEvent {
    constructor(name, options = {}) {
      super({ name, ...options });
    }
  }
  Object.defineProperty(host, "Event", { configurable: true, value: StandardEvent });
  Object.defineProperty(host.HTMLElement, Symbol.hasInstance, {
    configurable: true,
    value: (value) => value instanceof host.Element,
  });
  // Kbone's native inputs expose focus attributes; other shared controls still
  // need DOM focus ownership and bubbling focus events for dialogs and menus.
  const document = host.document;
  let focused = null;
  const focusDescriptors = [];
  const activeDescriptor = Object.getOwnPropertyDescriptor(document, "activeElement");
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    get: () => focused ?? document.body,
  });
  function emitFocus(node, type, relatedTarget, bubbles) {
    const event = new StandardEvent(type, { bubbles });
    Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
    node.dispatchEvent(event);
  }
  function moveFocus(next) {
    if (next === focused) return;
    const previous = focused;
    focused = next;
    if (previous) {
      emitFocus(previous, "blur", next, false);
      emitFocus(previous, "focusout", next, true);
    }
    if (next) {
      emitFocus(next, "focus", previous, false);
      emitFocus(next, "focusin", previous, true);
    }
  }
  const prototypes = new Set([
    host.Element.prototype,
    Object.getPrototypeOf(document.createElement("input")),
    Object.getPrototypeOf(document.createElement("textarea")),
  ]);
  for (const prototype of prototypes) {
    for (const name of ["focus", "blur"]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const nativeMethod = descriptor?.value;
      focusDescriptors.push([prototype, name, descriptor]);
      Object.defineProperty(prototype, name, {
        configurable: true,
        value() {
          if (name === "focus") {
            if (this.disabled || !this.parentNode) return;
            nativeMethod?.call(this);
            moveFocus(this);
          } else {
            nativeMethod?.call(this);
            if (focused === this) moveFocus(null);
          }
        },
      });
    }
  }
  const nativeFocused = (event) => moveFocus(event.target);
  const nativeBlurred = (event) => {
    if (focused === event.target) moveFocus(null);
  };
  document.addEventListener("focus", nativeFocused, true);
  document.addEventListener("blur", nativeBlurred, true);

  function matches(query) {
    const info = nativeApi.getWindowInfo();
    const parts = query.split(/\s+and\s+/i);
    return parts.every((part) => {
      let match = /^\((min|max)-width:\s*([\d.]+)px\)$/.exec(part.trim());
      if (match)
        return match[1] === "min"
          ? info.windowWidth >= Number(match[2])
          : info.windowWidth <= Number(match[2]);
      match = /^\(resolution:\s*([\d.]+)dppx\)$/.exec(part.trim());
      if (match) return info.pixelRatio === Number(match[1]);
      if (part.trim() === "(orientation: landscape)") return info.windowWidth > info.windowHeight;
      if (part.trim() === "(orientation: portrait)") return info.windowWidth <= info.windowHeight;
      if (part.trim() === "(pointer: coarse)")
        return /ios|android|ohos/i.test(nativeApi.getDeviceInfo().platform);
      return false;
    });
  }

  Object.defineProperty(host, "matchMedia", {
    configurable: true,
    value(query) {
      const listeners = new Set();
      const entry = {
        media: query,
        matches: matches(query),
        onchange: null,
        addEventListener(type, listener) {
          if (type === "change") listeners.add(listener);
        },
        removeEventListener(type, listener) {
          if (type === "change") listeners.delete(listener);
        },
        refresh() {
          const next = matches(query);
          if (next === entry.matches) return;
          entry.matches = next;
          const event = { matches: next, media: query };
          for (const listener of listeners) listener(event);
          entry.onchange?.(event);
        },
      };
      queries.add(entry);
      return entry;
    },
  });
  const resized = () => {
    for (const query of queries) query.refresh();
  };
  host.addEventListener("resize", resized);
  return {
    dispose() {
      document.removeEventListener("focus", nativeFocused, true);
      document.removeEventListener("blur", nativeBlurred, true);
      for (const [prototype, name, descriptor] of focusDescriptors.reverse()) {
        if (descriptor) Object.defineProperty(prototype, name, descriptor);
        else delete prototype[name];
      }
      if (activeDescriptor) Object.defineProperty(document, "activeElement", activeDescriptor);
      else delete document.activeElement;
      host.removeEventListener("resize", resized);
      queries.clear();
    },
  };
}
