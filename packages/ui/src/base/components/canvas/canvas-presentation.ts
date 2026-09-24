import { clientRect } from "$/base/utils/dom-geometry";

type Presentation = (rect: DOMRect) => void;
const pending = new WeakMap<Window, Map<HTMLCanvasElement, Presentation>>();

/** Read all surface geometry before canvas backing-store writes invalidate layout. */
export function queueCanvasPresentation(canvas: HTMLCanvasElement, present: Presentation) {
  const host = canvas.ownerDocument.defaultView;
  if (!host) return;
  let batch = pending.get(host);
  if (!batch) {
    batch = new Map();
    pending.set(host, batch);
    const current = batch;
    host.queueMicrotask(() => {
      const measured = [...current].map(([target, callback]) => ({
        callback,
        rect: clientRect(target),
      }));
      pending.delete(host);
      for (const { callback, rect } of measured) callback(rect);
    });
  }
  batch.set(canvas, present);
}

export function cancelCanvasPresentation(canvas: HTMLCanvasElement, present: Presentation) {
  const host = canvas.ownerDocument.defaultView;
  const batch = host ? pending.get(host) : undefined;
  if (batch?.get(canvas) === present) batch.delete(canvas);
}
