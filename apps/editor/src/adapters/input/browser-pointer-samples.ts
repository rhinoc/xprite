import type { CanvasPointerSample } from "$/managers/ports/platform";
import { clientPoint } from "@xprite/ui/utils";

function sample(event: PointerEvent): CanvasPointerSample {
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: clientPoint(event).x,
    clientY: clientPoint(event).y,
    button: event.button,
    buttons: event.buttons,
    pressure: event.pressure,
    timeStamp: event.timeStamp,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  };
}

/** Real samples only: predicted input must never reach document history. */
export function browserPointerSamples(event: PointerEvent): readonly CanvasPointerSample[] {
  if (event.pointerType !== "pen" || event.type !== "pointermove") return [sample(event)];
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const actual = coalesced.filter(
    (point) => point.pointerId === event.pointerId && point.pointerType === "pen",
  );
  if (!actual.length) return [sample(event)];
  const samples = actual.map(sample);
  const last = samples[samples.length - 1];
  if (
    last.timeStamp !== event.timeStamp ||
    clientPoint(last).x !== clientPoint(event).x ||
    clientPoint(last).y !== clientPoint(event).y ||
    last.pressure !== event.pressure
  )
    samples.push(sample(event));
  return samples;
}
