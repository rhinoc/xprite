import { borderSize, computedStyle, observeResize } from "$/base/utils/dom-geometry";

const WINDOW_SELECTOR = "[data-ui-desktop-window]";
const WORKSPACE_SELECTOR = "[data-ui-desktop-workspace]";
const COLLAPSED_NOTE_ATTRIBUTE = "data-ui-panel-collapsed";
enum FootprintCaptureEvent {
  PointerDown = "pointerdown",
  Click = "click",
  DoubleClick = "dblclick",
  KeyDown = "keydown",
}

interface WindowFootprint {
  expandedHeight?: number;
  expandedMargin: number;
  inlineMargin: string;
  reserved: boolean;
  stopResize(): void;
}

/** WindowShade changes the visible frame while retaining its place in the desktop layout. */
export function preserveWindowFootprints(root: HTMLElement): () => void {
  const footprints = new Map<HTMLElement, WindowFootprint>();
  const restore = (window: HTMLElement, footprint: WindowFootprint) => {
    if (!footprint.reserved) return;
    window.style.marginBlockEnd = footprint.inlineMargin;
    footprint.reserved = false;
  };
  const measure = (window: HTMLElement, footprint: WindowFootprint) => {
    const collapsed =
      (window instanceof HTMLDetailsElement && !window.open) ||
      window.hasAttribute(COLLAPSED_NOTE_ATTRIBUTE);
    if (!collapsed) {
      restore(window, footprint);
      const height = borderSize(window).height;
      if (height <= 0) return;
      footprint.expandedHeight = height;
      footprint.inlineMargin = window.style.marginBlockEnd;
      footprint.expandedMargin = Number.parseFloat(computedStyle(window).marginBlockEnd) || 0;
    } else if (footprint.expandedHeight !== undefined) {
      const space = Math.max(0, footprint.expandedHeight - borderSize(window).height);
      window.style.marginBlockEnd = `${footprint.expandedMargin + space}px`;
      footprint.reserved = true;
    }
  };
  const synchronize = () => {
    for (const [window, footprint] of footprints) {
      if (root.contains(window) && window.closest(WORKSPACE_SELECTOR) === root) continue;
      footprint.stopResize();
      restore(window, footprint);
      footprints.delete(window);
    }
    for (const window of root.querySelectorAll<HTMLElement>(WINDOW_SELECTOR)) {
      if (window.closest(WORKSPACE_SELECTOR) !== root) continue;
      let footprint = footprints.get(window);
      if (!footprint) {
        const next: WindowFootprint = {
          expandedMargin: 0,
          inlineMargin: window.style.marginBlockEnd,
          reserved: false,
          stopResize: () => {},
        };
        next.stopResize = observeResize([window], () => measure(window, next));
        footprints.set(window, next);
        footprint = next;
      }
      measure(window, footprint);
    }
  };
  synchronize();
  const captureFootprint = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const window = event.target.closest<HTMLElement>(WINDOW_SELECTOR);
    const footprint = window && footprints.get(window);
    if (window && footprint) measure(window, footprint);
  };
  for (const event of Object.values(FootprintCaptureEvent))
    root.addEventListener(event, captureFootprint, true);
  const observer = new MutationObserver((records) => {
    const windowsChanged = records.some(
      (record) =>
        record.type === "attributes" ||
        [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches(WINDOW_SELECTOR) || node.querySelector(WINDOW_SELECTOR)),
        ),
    );
    if (windowsChanged) synchronize();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", COLLAPSED_NOTE_ATTRIBUTE],
  });
  return () => {
    observer.disconnect();
    for (const event of Object.values(FootprintCaptureEvent))
      root.removeEventListener(event, captureFootprint, true);
    for (const [window, footprint] of footprints) {
      footprint.stopResize();
      restore(window, footprint);
    }
  };
}
