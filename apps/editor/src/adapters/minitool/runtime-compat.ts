import "$/adapters/platform/structured-clone-compat";
import { installResizeObserverFallback, scrollSize } from "@xprite/ui/utils";

/** Only APIs used by the editor; the container's prohibited APIs are never polyfilled. */
if (typeof globalThis === "undefined")
  Object.defineProperty(window, "globalThis", { value: window });
if (!Object.fromEntries)
  Object.defineProperty(Object, "fromEntries", {
    value(entries: Iterable<readonly [PropertyKey, unknown]>) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of entries)
        Object.defineProperty(result, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      return result;
    },
    configurable: true,
    writable: true,
  });
if (!("hasOwn" in Object))
  Object.defineProperty(Object, "hasOwn", {
    value: (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key),
    configurable: true,
    writable: true,
  });
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
if (!("at" in Array.prototype))
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
