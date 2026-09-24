import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  defaultTimelineInteractionPreferences,
  type TimelineInteractionPreferences,
} from "$/managers/preferences/timeline-interaction-preferences";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";
import {
  visibleTimelineLayers,
  type SpriteTimeline,
  type TimelineRange,
} from "$/managers/timeline/timeline-presentation";
import {
  hitTimelineRangeOutline,
  TimelineLayerDropPosition,
  type TimelineDropGeometryInput,
  type TimelineRangeGeometry,
  type TimelineRangeViewport,
} from "$/managers/timeline/timeline-range-geometry";
import { TOUCH_LONG_PRESS_DELAY_MS, TOUCH_MOVE_THRESHOLD } from "@xprite/ui";
import {
  clientPoint,
  clientToLocal,
  scrollPosition,
  setScrollPosition,
  scrollBy,
  clientRect,
  clientScale,
  stylusPointerInputProps,
} from "@xprite/ui/utils";
const sequence = (a: number, b: number) =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);
const TIMELINE_RANGE_EDGE_HIT_SIZE = 6;
const TIMELINE_FRAME_HEADER_HEIGHT = 24;
const DRAG_MOVEMENT_THRESHOLD = 3;
const EDITOR_CANVAS_SELECTOR = "[data-editor-canvas]";
export enum TimelineRangeCursor {
  Move = "move",
  Copy = "copy",
  Scroll = "scroll",
}
type PointerState = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};
type Hit = { kind: TimelineRange["kind"]; frame: number; layer: number };
type TouchGesture = {
  id: number;
  node: HTMLElement;
  x: number;
  y: number;
  hit: Hit;
  left: number;
  top: number;
  mode: "pending" | "scroll" | "reorder";
  timer: number | null;
};
export function useTimelineInteractions(
  t: SpriteTimeline,
  host: RefObject<HTMLElement>,
  pane: RefObject<HTMLDivElement>,
  scale: number,
  scaleY = scale,
  frameWidth = 24,
  layerHeight = 24,
  preferences: TimelineInteractionPreferences = defaultTimelineInteractionPreferences,
  geometryOptions?: { range: TimelineRangeGeometry | null; viewport: TimelineRangeViewport },
) {
  const timelineManager = useTimelineManager();
  const { commands, dismissCopiedRange } = timelineManager;
  const getSnapshot = timelineManager.getSnapshot;
  const rows = visibleTimelineLayers(t);
  const [drop, setDrop] = useState<TimelineDropGeometryInput | null>(null);
  const [rangeFeedback, setRangeFeedback] = useState<{
    hot: boolean;
    cursor: TimelineRangeCursor | null;
  }>({ hot: false, cursor: null });
  const latestGeometry = useRef(geometryOptions);
  latestGeometry.current = geometryOptions;
  const lastPointer = useRef<PointerState | null>(null);
  const updateDropAt = useRef<((event: PointerState) => void) | null>(null);
  const updateFeedbackAt = useRef<((event: PointerState) => void) | null>(null);
  const space = useRef(false),
    anchor = useRef<Hit | null>(null);
  const touch = useRef<TouchGesture | null>(null);
  const gesture = useRef<{
    id: number;
    node: HTMLElement;
    x: number;
    y: number;
    hit: Hit | null;
    range: TimelineRange;
    before?: TimelineRange;
    activeFrame: number;
    activeLayer: number;
    mode: "pan" | "select" | "move";
    left: number;
    top: number;
    df: number;
    dl: number;
    moved: boolean;
    copy: boolean;
    touch: boolean;
    target?: number;
    intoGroup?: boolean;
    frameInsertion?: number;
    layerPosition?: TimelineLayerDropPosition;
  } | null>(null);
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    setDrop(null);
    setRangeFeedback({ hot: false, cursor: null });
    if (g) {
      commands.selectLayer(g.activeLayer);
      commands.selectFrame(g.activeFrame);
      commands.setTimelineRange(g.before);
      if (g.node.hasPointerCapture(g.id)) g.node.releasePointerCapture(g.id);
    }
  };
  const cancelTouch = () => {
    const current = touch.current;
    touch.current = null;
    if (current?.timer !== null && current?.timer !== undefined) window.clearTimeout(current.timer);
    if (current?.node.hasPointerCapture(current.id)) current.node.releasePointerCapture(current.id);
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,[role=dialog],[role=menu]")) return;
      if (e.code === "Space") space.current = true;
      if (lastPointer.current) {
        const point = {
          ...lastPointer.current,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        };
        lastPointer.current = point;
        if (gesture.current?.mode === "move" && gesture.current.moved)
          updateDropAt.current?.(point);
        updateFeedbackAt.current?.(point);
      }
      if (e.key === "Escape" && gesture.current) {
        dismissCopiedRange();
        cancel();
        cancelTouch();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
      if (lastPointer.current) {
        const point = {
          ...lastPointer.current,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        };
        lastPointer.current = point;
        if (gesture.current?.mode === "move" && gesture.current.moved)
          updateDropAt.current?.(point);
        updateFeedbackAt.current?.(point);
      }
    };
    const blur = () => {
      space.current = false;
      lastPointer.current = null;
      cancelTouch();
      cancel();
    };
    const interrupt = (event: PointerEvent) => {
      const active = touch.current ?? gesture.current;
      if (active && event.pointerId !== active.id) {
        cancelTouch();
        cancel();
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") blur();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointerdown", interrupt, true);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerdown", interrupt, true);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      cancelTouch();
      cancel();
      anchor.current = null;
    };
  }, [commands, dismissCopiedRange]);
  useEffect(() => {
    if (preferences.keepSelection) return;
    const clearOutsideSelection = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[role="menu"]')) return;
      if (target instanceof Element && target.closest(EDITOR_CANVAS_SELECTOR)) return;
      if (target instanceof Node && host.current?.contains(target)) return;
      anchor.current = null;
      commands.setTimelineRange(undefined);
    };
    window.addEventListener("pointerdown", clearOutsideSelection, true);
    return () => window.removeEventListener("pointerdown", clearOutsideSelection, true);
  }, [commands, host, preferences.keepSelection]);
  const clearTimelineRange = () => {
    anchor.current = null;
    commands.setTimelineRange(undefined);
  };
  const readHit = (node: Element | null): Hit | null => {
    const el = node?.closest<HTMLElement>("[data-timeline-kind]");
    return el
      ? {
          kind: el.dataset.timelineKind as Hit["kind"],
          frame: Number(el.dataset.frame ?? t.activeFrame),
          layer: Number(el.dataset.layer ?? t.activeLayer),
        }
      : null;
  };
  const rangeFor = (a: Hit, b: Hit): TimelineRange => ({
    kind: a.kind,
    frames: a.kind === "layers" ? t.frames.map((_, i) => i) : sequence(a.frame, b.frame),
    layers:
      a.kind === "frames"
        ? t.layers.map((_, i) => i)
        : rows.slice(
            Math.min(rows.indexOf(a.layer), rows.indexOf(b.layer)),
            Math.max(rows.indexOf(a.layer), rows.indexOf(b.layer)) + 1,
          ),
  });
  const select = (h: Hit) => {
    commands.selectLayer(h.layer);
    commands.selectFrame(h.frame);
  };
  const contains = (r: TimelineRange, h: Hit) =>
    r.kind === h.kind && r.frames.includes(h.frame) && r.layers.includes(h.layer);
  const hitsRangeEdge = (range: TimelineRange, hit: Hit, event: ReactPointerEvent<HTMLElement>) => {
    if (latestGeometry.current)
      return hitTimelineRangeOutline(
        latestGeometry.current.range,
        scenePoint(event),
        event.altKey || event.ctrlKey || event.metaKey,
      );
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const cell = target.closest<HTMLElement>("[data-timeline-kind]");
    if (!cell) return false;
    const bounds = clientRect(cell);
    const displayScale = clientScale(cell);
    const frames = range.frames;
    const layers = range.layers;
    const onFrameEdge = hit.frame === Math.min(...frames) || hit.frame === Math.max(...frames);
    const onLayerEdge = hit.layer === Math.min(...layers) || hit.layer === Math.max(...layers);
    const nearHorizontalEdge =
      (clientPoint(event).x - bounds.left) / displayScale.x <= TIMELINE_RANGE_EDGE_HIT_SIZE ||
      (bounds.right - clientPoint(event).x) / displayScale.x <= TIMELINE_RANGE_EDGE_HIT_SIZE;
    const nearVerticalEdge =
      (clientPoint(event).y - bounds.top) / displayScale.y <= TIMELINE_RANGE_EDGE_HIT_SIZE ||
      (bounds.bottom - clientPoint(event).y) / displayScale.y <= TIMELINE_RANGE_EDGE_HIT_SIZE;
    if (range.kind === "frames") return onFrameEdge && nearHorizontalEdge;
    if (range.kind === "layers") return onLayerEdge && nearVerticalEdge;
    return (onFrameEdge && nearHorizontalEdge) || (onLayerEdge && nearVerticalEdge);
  };
  const scenePoint = (event: { clientX: number; clientY: number }) => {
    const node = host.current!;
    const point = clientToLocal(node, clientPoint(event));
    return {
      x: point.x / scale,
      y: point.y / scaleY,
    };
  };
  const pointerCanMoveRange = (target: EventTarget | null, includeSeparator = false) =>
    !(
      target instanceof Element &&
      target.closest(
        'input,textarea,button:not([data-timeline-kind]),[role="scrollbar"],[data-tag-index]',
      )
    ) &&
    (includeSeparator ||
      !(target instanceof Element && target.closest("[data-timeline-separator]")));
  const contentPoint = (event: { clientX: number; clientY: number }) => {
    const p = pane.current!;
    const viewport = latestGeometry.current?.viewport;
    if (viewport) {
      const point = scenePoint(event);
      return {
        x: point.x - viewport.frameLeft + scrollPosition(p).x / scale,
        y: point.y - viewport.rowTop + scrollPosition(p).y / scaleY,
      };
    }
    const point = clientToLocal(p, clientPoint(event));
    const scroll = scrollPosition(p);
    return {
      x: (point.x + scroll.x) / scale,
      y: (point.y + scroll.y) / scaleY - TIMELINE_FRAME_HEADER_HEIGHT,
    };
  };
  const coordinateHit = (e: { clientX: number; clientY: number }, start: Hit): Hit => {
    const point = contentPoint(e);
    return {
      kind: start.kind,
      frame: Math.max(0, Math.min(t.frames.length - 1, Math.floor(point.x / frameWidth))),
      layer:
        rows[Math.max(0, Math.min(rows.length - 1, Math.floor(point.y / layerHeight)))] ??
        t.activeLayer,
    };
  };
  const updateRangeFeedback = (event: PointerState) => {
    const active = gesture.current;
    const copying = active?.touch ? active.copy : event.altKey || event.ctrlKey || event.metaKey;
    const hot =
      (copying || preferences.dragAndDropFromEdges) &&
      pointerCanMoveRange(event.target, true) &&
      !!latestGeometry.current &&
      hitTimelineRangeOutline(latestGeometry.current.range, scenePoint(event), copying);
    const cursor =
      active?.mode === "pan"
        ? TimelineRangeCursor.Scroll
        : active?.mode === "move" || hot
          ? copying
            ? TimelineRangeCursor.Copy
            : TimelineRangeCursor.Move
          : null;
    setRangeFeedback((current) =>
      current.hot === hot && current.cursor === cursor ? current : { hot, cursor },
    );
  };
  updateFeedbackAt.current = updateRangeFeedback;
  const updateDrop = (event: PointerState) => {
    const g = gesture.current,
      p = pane.current;
    if (!g || g.mode !== "move" || !p || !g.hit) return;
    const point = contentPoint(event);
    const h = coordinateHit(event, g.hit);
    g.copy = !g.touch && (event.altKey || event.ctrlKey || event.metaKey);
    g.df = g.range.kind === "layers" ? 0 : h.frame - g.hit.frame;
    g.dl = g.range.kind === "frames" ? 0 : h.layer - g.hit.layer;
    if (g.range.kind === "frames") {
      const x = point.x / frameWidth;
      const insert = Math.max(0, Math.min(t.frames.length, Math.floor(x) + (x % 1 >= 0.5 ? 1 : 0)));
      g.frameInsertion = insert;
      g.df =
        insert -
        (g.copy ? 0 : g.range.frames.filter((f) => f < insert).length) -
        Math.min(...g.range.frames);
    } else if (g.range.kind === "layers") {
      const y = point.y / layerHeight;
      const target = rows[Math.max(0, Math.min(rows.length - 1, Math.floor(y)))];
      const fraction = y - Math.floor(y);
      g.target = target;
      g.intoGroup =
        y >= 0 &&
        y < rows.length &&
        t.layers[target]?.kind === "group" &&
        !(t.layers[target].flags & 32) &&
        fraction >= 0.5;
      g.layerPosition = g.intoGroup
        ? TimelineLayerDropPosition.Inside
        : y < 0 || (y < rows.length && fraction < 0.5)
          ? TimelineLayerDropPosition.Above
          : TimelineLayerDropPosition.Below;
    }
    setDrop({
      range: g.range,
      df: g.df,
      dl: g.dl,
      frameInsertion: g.frameInsertion,
      layerTarget: g.target,
      layerPosition: g.layerPosition,
    });
  };
  updateDropAt.current = updateDrop;
  useEffect(() => {
    if (lastPointer.current && !gesture.current) updateFeedbackAt.current?.(lastPointer.current);
  }, [geometryOptions?.range, preferences.dragAndDropFromEdges]);
  return {
    drop,
    rangeHot: rangeFeedback.hot,
    rangeCursor: rangeFeedback.cursor,
    canOpenTouchMenu: () => !gesture.current?.moved && touch.current?.mode !== "scroll",
    contextTarget: (target: Element) => {
      const h = readHit(target);
      if (!h) return null;
      if (!t.range || !contains(t.range, h)) {
        select(h);
        const range = rangeFor(h, h);
        commands.setTimelineRange(range);
        return range;
      }
      return t.range;
    },
    handlers: {
      ...stylusPointerInputProps(),
      onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => {
        if (!timelineManager.active || !pane.current) return;
        const read = readHit(e.target as Element),
          pan = e.button === 1 || (e.button === 0 && space.current);
        const copying = e.altKey || e.ctrlKey || e.metaKey;
        const rangeHit =
          e.pointerType !== "touch" &&
          e.button === 0 &&
          !!t.range &&
          pointerCanMoveRange(e.target, true) &&
          (copying || preferences.dragAndDropFromEdges) &&
          (latestGeometry.current
            ? hitTimelineRangeOutline(latestGeometry.current.range, scenePoint(e), copying)
            : !!read && contains(t.range, read) && hitsRangeEdge(t.range, read, e));
        if (!rangeHit && !pointerCanMoveRange(e.target)) return;
        let h = read;
        if (rangeHit && t.range) {
          const pointHit = coordinateHit(e, {
            kind: t.range.kind,
            frame: t.activeFrame,
            layer: t.activeLayer,
          });
          const selectedRows = t.range.layers
            .map((layer) => rows.indexOf(layer))
            .filter((row) => row >= 0);
          const row = rows.indexOf(pointHit.layer);
          h = {
            kind: t.range.kind,
            frame: Math.max(
              Math.min(...t.range.frames),
              Math.min(Math.max(...t.range.frames), pointHit.frame),
            ),
            layer:
              rows[Math.max(Math.min(...selectedRows), Math.min(Math.max(...selectedRows), row))] ??
              t.activeLayer,
          };
        }
        lastPointer.current = e;
        if (e.pointerType === "touch") {
          if (!e.isPrimary) {
            cancelTouch();
            cancel();
            return;
          }
          if (!h || touch.current) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const contact: TouchGesture = {
            id: e.pointerId,
            node: e.currentTarget,
            x: clientPoint(e).x,
            y: clientPoint(e).y,
            hit: h,
            left: scrollPosition(pane.current).x,
            top: scrollPosition(pane.current).y,
            mode: "pending",
            timer: null,
          };
          contact.timer = window.setTimeout(() => {
            if (touch.current !== contact || contact.mode !== "pending") return;
            contact.mode = "reorder";
            contact.timer = null;
            const before = getSnapshot()?.document?.timeline?.range ?? t.range;
            const range = before && contains(before, h) ? before : rangeFor(h, h);
            gesture.current = {
              id: contact.id,
              node: contact.node,
              x: contact.x,
              y: contact.y,
              hit: h,
              range,
              before,
              activeFrame: t.activeFrame,
              activeLayer: t.activeLayer,
              mode: "move",
              left: contact.left,
              top: contact.top,
              df: 0,
              dl: 0,
              moved: false,
              copy: false,
              touch: true,
            };
          }, TOUCH_LONG_PRESS_DELAY_MS);
          touch.current = contact;
          return;
        }
        if (!pan && (e.button !== 0 || !h)) return;
        if (
          !pan &&
          h &&
          !rangeHit &&
          (e.shiftKey ? !preferences.selectOnClickWithKey : !preferences.selectOnClick)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const before = t.range,
          base = h ?? { kind: "cels" as const, frame: t.activeFrame, layer: t.activeLayer };
        let range = rangeFor(base, base),
          mode: "pan" | "select" | "move" = pan ? "pan" : "select";
        if (!pan) {
          if (rangeHit && before) {
            range = before;
            mode = "move";
          } else if (e.shiftKey) {
            const start =
              anchor.current?.kind === base.kind
                ? anchor.current
                : { ...base, frame: t.activeFrame, layer: t.activeLayer };
            range = rangeFor(start, base);
          } else if (
            (e.ctrlKey || e.metaKey) &&
            before?.kind === base.kind &&
            !contains(before, base)
          ) {
            range = {
              kind: base.kind,
              frames:
                base.kind === "layers"
                  ? before.frames
                  : [...new Set([...before.frames, base.frame])],
              layers:
                base.kind === "frames"
                  ? before.layers
                  : [...new Set([...before.layers, base.layer])],
            };
          } else if (
            before &&
            contains(before, base) &&
            preferences.dragAndDropFromEdges &&
            hitsRangeEdge(before, base, e)
          ) {
            range = before;
            mode = "move";
          } else {
            anchor.current = base;
          }
          select(base);
          commands.setTimelineRange(range);
        }
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = {
          id: e.pointerId,
          node: e.currentTarget,
          x: clientPoint(e).x,
          y: clientPoint(e).y,
          hit: h,
          range,
          before,
          activeFrame: t.activeFrame,
          activeLayer: t.activeLayer,
          mode,
          left: scrollPosition(pane.current).x,
          top: scrollPosition(pane.current).y,
          df: 0,
          dl: 0,
          moved: false,
          copy: e.altKey || e.ctrlKey || e.metaKey,
          touch: false,
        };
        updateRangeFeedback(e);
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        lastPointer.current = e;
        updateRangeFeedback(e);
        const contact = touch.current;
        if (contact?.id === e.pointerId) {
          if (
            contact.mode === "pending" &&
            Math.hypot(clientPoint(e).x - contact.x, clientPoint(e).y - contact.y) >=
              TOUCH_MOVE_THRESHOLD
          ) {
            if (contact.timer !== null) window.clearTimeout(contact.timer);
            contact.timer = null;
            contact.mode = "scroll";
          }
          if (contact.mode === "scroll") {
            const p = pane.current;
            if (p) {
              e.preventDefault();
              const displayScale = clientScale(p);
              setScrollPosition(p, {
                x: contact.left - (clientPoint(e).x - contact.x) / displayScale.x,
              });
              setScrollPosition(p, {
                y: contact.top - (clientPoint(e).y - contact.y) / displayScale.y,
              });
            }
            return;
          }
          if (contact.mode === "pending") return;
        }
        const g = gesture.current,
          p = pane.current;
        if (!g || g.id !== e.pointerId || !p) return;
        if (
          Math.hypot(clientPoint(e).x - g.x, clientPoint(e).y - g.y) < DRAG_MOVEMENT_THRESHOLD &&
          !g.moved
        )
          return;
        if (g.mode === "select" && !preferences.selectOnDrag) return;
        if (!g.moved && g.touch && g.hit) {
          select(g.hit);
          commands.setTimelineRange(g.range);
        }
        g.moved = true;
        e.preventDefault();
        if (g.mode === "pan") {
          const displayScale = clientScale(p);
          setScrollPosition(p, { x: g.left - (clientPoint(e).x - g.x) / displayScale.x });
          setScrollPosition(p, { y: g.top - (clientPoint(e).y - g.y) / displayScale.y });
          return;
        }
        const rect = clientRect(p);
        if (clientPoint(e).x < rect.left + 8) scrollBy(p, { x: -(frameWidth * scale) });
        if (clientPoint(e).x > rect.right - 8) scrollBy(p, { x: frameWidth * scale });
        if (clientPoint(e).y < rect.top + 8) scrollBy(p, { y: -(layerHeight * scaleY) });
        if (clientPoint(e).y > rect.bottom - 8) scrollBy(p, { y: layerHeight * scaleY });
        const h = coordinateHit(e, g.hit!);
        if (g.mode === "select" && preferences.selectOnDrag) {
          const range = rangeFor(g.hit!, h);
          g.range = range;
          commands.setTimelineRange(range);
        } else updateDrop(e);
      },
      onPointerLeave: () => {
        if (gesture.current) return;
        lastPointer.current = null;
        setRangeFeedback({ hot: false, cursor: null });
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        const contact = touch.current;
        if (contact?.id === e.pointerId) {
          if (contact.mode === "reorder") touch.current = null;
          else cancelTouch();
          if (contact.mode === "scroll") return;
          if (contact.mode === "pending") {
            const h = contact.hit;
            select(h);
            if (preferences.selectOnClick) {
              anchor.current = h;
              commands.setTimelineRange(rangeFor(h, h));
            }
            return;
          }
        }
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        if (g.moved && g.mode === "move") updateDrop(e);
        gesture.current = null;
        setDrop(null);
        if (g.node.hasPointerCapture(g.id)) g.node.releasePointerCapture(g.id);
        if (g.moved && g.mode === "move") {
          const copy = g.touch ? g.copy : e.altKey || e.ctrlKey || e.metaKey;
          if (
            g.range.kind === "layers" &&
            g.target !== undefined &&
            g.layerPosition !== undefined
          ) {
            commands.dropTimelineLayers(g.range, g.target, g.layerPosition, copy);
          } else commands.transferTimelineRange(g.range, g.df, g.dl, copy);
        }
        updateRangeFeedback(e);
      },
      onPointerCancel: () => {
        cancelTouch();
        cancel();
      },
      onBlur: (event: import("react").FocusEvent<HTMLElement>) => {
        const target = event.relatedTarget;
        if (
          !preferences.keepSelection &&
          !(target instanceof Element && target.closest('[role="menu"]')) &&
          !(target instanceof Element && target.closest(EDITOR_CANVAS_SELECTOR)) &&
          !(target instanceof Node && event.currentTarget.contains(target))
        )
          clearTimelineRange();
      },
      onLostPointerCapture: () => {
        if (touch.current) cancelTouch();
        if (gesture.current) cancel();
      },
      onKeyDown: (e: import("react").KeyboardEvent<HTMLElement>) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Escape") {
          dismissCopiedRange();
          if (gesture.current) cancel();
          else commands.setTimelineRange(undefined);
          e.preventDefault();
          e.stopPropagation();
        }
        if ((e.key === "Delete" || e.key === "Backspace") && t.range) {
          commands.clearTimelineRange(t.range);
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}
