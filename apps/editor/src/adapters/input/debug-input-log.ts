import { readLocalStorage } from "@xprite/bedrock/browser/localstorage";
import { clientPoint } from "@xprite/ui/utils";

const DEBUG_INPUT_ENDPOINT = "/__debug/input";
const DEBUG_INPUT_STORAGE_KEY = "xse.debug.input-log.v1";
const MAX_INPUT_HISTORY = 2000;
const MAX_PENDING_INPUT_EVENTS = 2000;
const INPUT_BATCH_SIZE = 20;
const INPUT_FLUSH_DELAY_MS = 1000;
const INPUT_RETRY_DELAY_MS = 5000;
const MOVE_SAMPLE_INTERVAL_MS = 50;
const INPUT_TRACE_STARTED_AT = Date.now();

export interface DebugInputEvent {
  at: number;
  kind: string;
  sequence?: number;
  traceStartedAt?: number;
  timeOrigin?: number;
  elapsedMs?: number;
  eventTimeStamp?: number;
  pointerType?: string;
  pointerId?: number;
  x?: number;
  y?: number;
  button?: number;
  buttons?: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  coalescedCount?: number;
  state?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

declare global {
  interface Window {
    __asepriteDebugLog?: DebugInputEvent[];
    __asepriteDebugFlush?: () => Promise<void>;
  }
}

const enabled = () => {
  if (import.meta.env.DEV) return true;
  const params = new URLSearchParams(window.location.search);
  return params.has("debugInput") || readLocalStorage(DEBUG_INPUT_STORAGE_KEY) === "1";
};

let pending: DebugInputEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let sequence = 0;
const lastMoves = new Map<string, number>();

function scheduleFlush(delay = INPUT_FLUSH_DELAY_MS) {
  if (!import.meta.env.DEV || timer !== null || !pending.length) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

function flush(): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  // The input endpoint exists on the development server only.
  if (!import.meta.env.DEV || typeof window === "undefined") return Promise.resolve();
  if (inFlight) return inFlight;
  if (!pending.length) return Promise.resolve();
  const queued = pending.splice(0, pending.length);
  let failed = false;
  inFlight = Promise.resolve()
    .then(async () => {
      while (queued.length) {
        const batch = queued.slice(0, INPUT_BATCH_SIZE);
        try {
          const response = await fetch(DEBUG_INPUT_ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: location.href, timeOrigin: performance.timeOrigin, batch }),
            keepalive: true,
          });
          if (!response.ok) throw new Error("Input log transport failed");
          queued.splice(0, batch.length);
        } catch {
          failed = true;
          pending = [...queued, ...pending].slice(-MAX_PENDING_INPUT_EVENTS);
          break;
        }
      }
    })
    .finally(() => {
      inFlight = null;
      scheduleFlush(failed ? INPUT_RETRY_DELAY_MS : INPUT_FLUSH_DELAY_MS);
    });
  return inFlight;
}

/** Low-volume development trace; movement is sampled, contact boundaries are retained. */
export function debugInput(
  kind: string,
  event?: PointerEvent | KeyboardEvent,
  details: Partial<DebugInputEvent> = {},
  options: { forceInDevelopment?: boolean; flush?: boolean } = {},
) {
  try {
    if (typeof window === "undefined" || !enabled()) return;
    const elapsedMs = performance.now();
    if (event && "pointerId" in event) {
      const moveKey = `${kind}:${event.pointerId}`;
      if (kind === "pointermove" || kind === "raw-pointermove") {
        const previous = lastMoves.get(moveKey);
        if (previous !== undefined && elapsedMs - previous < MOVE_SAMPLE_INTERVAL_MS) return;
        lastMoves.set(moveKey, elapsedMs);
      } else {
        lastMoves.delete(`pointermove:${event.pointerId}`);
        lastMoves.delete(`raw-pointermove:${event.pointerId}`);
      }
    }
    const point = event && "pointerId" in event ? clientPoint(event) : null;
    const item: DebugInputEvent = {
      at: Date.now(),
      kind,
      sequence: ++sequence,
      traceStartedAt: INPUT_TRACE_STARTED_AT,
      timeOrigin: performance.timeOrigin,
      elapsedMs,
      eventTimeStamp: event?.timeStamp,
      ...(event && "pointerId" in event
        ? {
            pointerType: event.pointerType,
            pointerId: event.pointerId,
            x: point!.x,
            y: point!.y,
            button: event.button,
            buttons: event.buttons,
            pressure: event.pressure,
            tiltX: event.tiltX,
            tiltY: event.tiltY,
            twist: event.twist,
            coalescedCount: event.getCoalescedEvents?.().length ?? 0,
          }
        : {}),
      ...details,
    };
    const history = window.__asepriteDebugLog ?? (window.__asepriteDebugLog = []);
    history.push(item);
    if (history.length > MAX_INPUT_HISTORY) history.splice(0, history.length - MAX_INPUT_HISTORY);
    if (import.meta.env.DEV) {
      pending.push(item);
      if (pending.length > MAX_PENDING_INPUT_EVENTS)
        pending.splice(0, pending.length - MAX_PENDING_INPUT_EVENTS);
      if (options.flush) void flush();
      else scheduleFlush();
    }
    window.__asepriteDebugFlush = flush;
  } catch {
    // Instrumentation must never interrupt a stroke.
  }
}

export function getDebugInputHistory(): readonly DebugInputEvent[] {
  return typeof window === "undefined" ? [] : [...(window.__asepriteDebugLog ?? [])];
}

if (typeof window !== "undefined") {
  const pointerEvents = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
  const touchEvents = ["touchstart", "touchend", "touchcancel"] as const;
  const targetDetails = (target: EventTarget | null) =>
    target instanceof Element
      ? { tag: target.tagName, id: target.id, slot: target.getAttribute("data-slot") }
      : null;
  const rawPointer = (event: PointerEvent) => {
    if (!enabled()) return;
    if (event.pointerType !== "pen" && event.pointerType !== "touch") return;
    if (event.type === "pointermove" && !event.buttons) return;
    debugInput(`raw-${event.type}`, event, {
      extra: {
        target: targetDetails(event.target),
        path: event.composedPath().map(targetDetails).filter(Boolean),
        trusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented,
        cancelable: event.cancelable,
      },
    });
  };
  const rawTouch = (event: TouchEvent) => {
    if (!enabled()) return;
    debugInput(`raw-${event.type}`, undefined, {
      eventTimeStamp: event.timeStamp,
      extra: {
        target: targetDetails(event.target),
        activeTouchCount: event.touches.length,
        changedTouches: Array.from(event.changedTouches, (touch) => ({
          identifier: touch.identifier,
          touchType: (touch as Touch & { touchType?: string }).touchType,
          force: touch.force,
          point: clientPoint(touch),
          target: targetDetails(touch.target),
        })),
      },
    });
  };
  const hide = () => void flush();
  const visibilityChanged = () => {
    if (document.hidden) void flush();
  };
  for (const name of pointerEvents)
    window.addEventListener(name, rawPointer, { capture: true, passive: true });
  for (const name of touchEvents)
    window.addEventListener(name, rawTouch, { capture: true, passive: true });
  window.addEventListener("pagehide", hide);
  document.addEventListener("visibilitychange", visibilityChanged);
  import.meta.hot?.dispose(() => {
    for (const name of pointerEvents) window.removeEventListener(name, rawPointer, true);
    for (const name of touchEvents) window.removeEventListener(name, rawTouch, true);
    window.removeEventListener("pagehide", hide);
    document.removeEventListener("visibilitychange", visibilityChanged);
    void flush();
  });
}
