import { installResizeObserverFallback, scrollSize } from "@xprite/ui/utils";

/** Only APIs used by the editor; the container's prohibited APIs are never polyfilled. */
if (typeof globalThis === "undefined")
  Object.defineProperty(window, "globalThis", { value: window });
if (!Object.fromEntries)
  Object.fromEntries = (entries) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of entries)
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    return result;
  };
if (!Object.hasOwn)
  Object.hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
if (!String.prototype.replaceAll)
  Object.defineProperty(String.prototype, "replaceAll", {
    value(this: string, search: string | RegExp, replacement: string) {
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError("replaceAll requires a global regular expression");
        return this.replace(search, replacement);
      }
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return this.replace(new RegExp(escaped, "g"), replacement);
    },
  });
if (!Array.prototype.at)
  Object.defineProperty(Array.prototype, "at", {
    value(this: unknown[], index: number) {
      const offset = Math.trunc(index) || 0;
      return this[offset < 0 ? this.length + offset : offset];
    },
  });
if (!Array.prototype.flatMap)
  Object.defineProperty(Array.prototype, "flatMap", {
    value(
      this: unknown[],
      callback: (value: unknown, index: number, array: unknown[]) => unknown,
      context?: unknown,
    ) {
      const result: unknown[] = [];
      this.forEach((value, index, array) => {
        const next = callback.call(context, value, index, array);
        if (Array.isArray(next)) next.forEach((entry) => result.push(entry));
        else result.push(next);
      });
      return result;
    },
  });
if (!Array.prototype.flat)
  Object.defineProperty(Array.prototype, "flat", {
    value(this: unknown[], depth = 1) {
      const result: unknown[] = [];
      const append = (values: unknown[], levels: number): void =>
        values.forEach((value) => {
          if (Array.isArray(value) && levels > 0) append(value, levels - 1);
          else result.push(value);
        });
      append(this, Math.max(0, Math.trunc(depth) || 0));
      return result;
    },
  });
if (!Promise.prototype.finally)
  Object.defineProperty(Promise.prototype, "finally", {
    value(this: Promise<unknown>, done: () => unknown) {
      return this.then(
        (value) => Promise.resolve(done()).then(() => value),
        (error) =>
          Promise.resolve(done()).then(() => {
            throw error;
          }),
      );
    },
  });
if (typeof globalThis.queueMicrotask !== "function")
  globalThis.queueMicrotask = (callback) => {
    void Promise.resolve()
      .then(callback)
      .catch((error) => {
        setTimeout(() => {
          throw error;
        }, 0);
      });
  };
if (!Blob.prototype.arrayBuffer)
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
if (!Blob.prototype.text)
  Blob.prototype.text = async function () {
    return new TextDecoder().decode(await this.arrayBuffer());
  };

function clone<T>(value: T, seen = new Map<object, unknown>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (value instanceof ArrayBuffer) {
    const result = value.slice(0);
    seen.set(value, result);
    return result as T;
  }
  if (ArrayBuffer.isView(value)) {
    const buffer = clone(value.buffer, seen);
    const result = (
      value instanceof DataView
        ? new DataView(buffer, value.byteOffset, value.byteLength)
        : new (value.constructor as typeof Uint8Array)(
            buffer,
            value.byteOffset,
            (value as unknown as Uint8Array).length,
          )
    ) as T;
    seen.set(value, result);
    return result;
  }
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof Map) {
    const result = new Map();
    seen.set(value, result);
    for (const [key, entry] of value) result.set(clone(key, seen), clone(entry, seen));
    return result as T;
  }
  if (value instanceof Set) {
    const result = new Set();
    seen.set(value, result);
    for (const entry of value) result.add(clone(entry, seen));
    return result as T;
  }
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const key of Object.keys(value))
    Object.defineProperty(result, key, {
      value: clone((value as Record<string, unknown>)[key], seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return result as T;
}
if (typeof globalThis.structuredClone !== "function") globalThis.structuredClone = clone;

installResizeObserverFallback();

const gapProbe = document.createElement("div");
Object.assign(gapProbe.style, {
  display: "flex",
  flexDirection: "column",
  rowGap: "1px",
  position: "absolute",
  visibility: "hidden",
});
gapProbe.appendChild(document.createElement("div"));
gapProbe.appendChild(document.createElement("div"));
document.body.appendChild(gapProbe);
document.documentElement.classList.toggle(
  "minitool-no-flex-gap",
  scrollSize(gapProbe).height !== 1,
);
gapProbe.remove();

function synchronizeContainerStyles(): void {
  document.documentElement.classList.toggle(
    "minitool-compact",
    Boolean(document.querySelector('[data-ui-compact="true"]')),
  );
  for (const element of document.querySelectorAll(".xse-status[data-scroll-area]"))
    element.classList.toggle(
      "minitool-has-scrollbar",
      Array.from(element.children).some((child) => child.getAttribute("role") === "scrollbar"),
    );
}
new MutationObserver(synchronizeContainerStyles).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["data-ui-compact", "role"],
});
synchronizeContainerStyles();
