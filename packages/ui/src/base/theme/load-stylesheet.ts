const loadedStylesheets = new Map<string, Promise<void>>();

/** Append a stylesheet link once; resolves when it is applied (or immediately if already present). */
export function loadStylesheet(href: string): Promise<void> {
  const existing = loadedStylesheets.get(href);
  if (existing) return existing;
  if (typeof document === "undefined") {
    const skipped = Promise.resolve();
    loadedStylesheets.set(href, skipped);
    return skipped;
  }
  const pending = new Promise<void>((resolve, reject) => {
    const prior = document.head.querySelector<HTMLLinkElement>(`link[data-xprite-href="${href}"]`);
    if (prior) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.xpriteHref = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Cannot load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
  loadedStylesheets.set(href, pending);
  void pending.catch(() => {
    if (loadedStylesheets.get(href) === pending) loadedStylesheets.delete(href);
  });
  return pending;
}
