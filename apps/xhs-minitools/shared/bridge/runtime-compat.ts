import { installResizeObserverFallback, scrollSize } from "@xprite/ui/utils";

/**
 * Small fallbacks for the oldest supported container web view (Chrome 61), limited to what this
 * bundle calls; prohibited container APIs such as Workers are never polyfilled.
 */
function define(target: object, name: string, value: unknown) {
  if (!(name in target))
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

define(window, "globalThis", window);
define(Object, "fromEntries", (entries: Iterable<readonly [PropertyKey, unknown]>) => {
  const result: Record<PropertyKey, unknown> = {};
  for (const [key, value] of entries) result[key] = value;
  return result;
});
define(
  Array.prototype,
  "flatMap",
  function (
    this: unknown[],
    callback: (value: unknown, index: number, array: unknown[]) => unknown,
    context?: unknown,
  ) {
    return this.reduce<unknown[]>(
      (result, value, index, array) => result.concat(callback.call(context, value, index, array)),
      [],
    );
  },
);
define(Promise.prototype, "finally", function (this: Promise<unknown>, done: () => unknown) {
  return this.then(
    (value) => Promise.resolve(done()).then(() => value),
    (reason: unknown) => Promise.resolve(done()).then(() => Promise.reject(reason)),
  );
});
define(window, "queueMicrotask", (callback: () => void) =>
  Promise.resolve()
    .then(callback)
    .catch((error: unknown) =>
      setTimeout(() => {
        throw error;
      }),
    ),
);
define(
  String.prototype,
  "replaceAll",
  function (this: string, search: string | RegExp, replacement: string) {
    if (search instanceof RegExp) return this.replace(search, replacement);
    return this.split(search).join(replacement);
  },
);
define(String.prototype, "trimStart", String.prototype.trimLeft);
define(String.prototype, "trimEnd", String.prototype.trimRight);
installResizeObserverFallback();

/** Flex `gap` arrived in Chrome 84; older web views get child margins from the minitool CSS. */
export function detectFlexGap() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
  probe.appendChild(document.createElement("div"));
  probe.appendChild(document.createElement("div"));
  document.body.appendChild(probe);
  const supported = scrollSize(probe).height === 1;
  document.body.removeChild(probe);
  document.documentElement.classList.toggle("minitool-no-flex-gap", !supported);
}
