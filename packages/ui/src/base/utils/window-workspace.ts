import {
  clientPoint,
  clientRect,
  clientDeltaToLocal,
  clientScale,
  computedStyle,
  viewportSize,
} from "$/base/utils/dom-geometry";
import { PointerDragActivation } from "$/base/utils/pointer-drag-activation";

const SURFACE_SELECTOR = "[data-ui-desktop-window]";
const LAYER_SELECTOR = "[data-ui-desktop-layer]";
const HEADER_SELECTOR = "[data-slot='panel-header'], [data-slot='note-header'], summary";
const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [contenteditable]";
const WORKSPACE_ATTRIBUTE = "data-ui-desktop-workspace";
const FIRST_ACTIVE_RANK = 10;
const VISIBLE_TITLE_WIDTH = 48;
const DEFAULT_MENU_HEIGHT = 20;

/** Window presentation geometry, independent of the open file and editor history. */
export function connectWindowWorkspace(
  root: HTMLElement,
  { staticWindowShade = false }: { staticWindowShade?: boolean } = {},
): () => void {
  const priorWorkspace = root.getAttribute(WORKSPACE_ATTRIBUTE);
  const priorIsolation = root.style.isolation;
  root.setAttribute(WORKSPACE_ATTRIBUTE, "true");
  root.style.isolation = "isolate";
  let rank = FIRST_ACTIVE_RANK;
  const prior = new Map<HTMLElement, { zIndex: string; position: string; translate: string }>();
  const priorActive = new Map<HTMLElement, string | null>();
  let activeSurface: HTMLElement | undefined;
  const setActive = (surface: HTMLElement) => {
    for (const window of root.querySelectorAll<HTMLElement>(SURFACE_SELECTOR)) {
      if (window.closest(`[${WORKSPACE_ATTRIBUTE}]`) !== root || window === surface) continue;
      if (!priorActive.has(window))
        priorActive.set(window, window.getAttribute("data-ui-window-active"));
      window.setAttribute("data-ui-window-active", "false");
    }
    if (!priorActive.has(surface))
      priorActive.set(surface, surface.getAttribute("data-ui-window-active"));
    activeSurface?.setAttribute("data-ui-window-active", "false");
    surface.setAttribute("data-ui-window-active", "true");
    activeSurface = surface;
  };
  const positions = new Map<HTMLElement, { x: number; y: number }>();
  let drag:
    | {
        pointer: number;
        surface: HTMLElement;
        header: HTMLElement;
        activation: PointerDragActivation;
        start: { x: number; y: number };
        original: { x: number; y: number };
        headerRect: DOMRect;
        moved: boolean;
      }
    | undefined;
  const remember = (element: HTMLElement) => {
    if (!prior.has(element))
      prior.set(element, {
        zIndex: element.style.zIndex,
        position: element.style.position,
        translate: element.style.translate,
      });
  };
  const raise = (element: HTMLElement) => {
    remember(element);
    if (computedStyle(element).position === "static") element.style.position = "relative";
    element.style.zIndex = String(rank);
  };
  const surfaceFor = (target: EventTarget | null) => {
    const surface = (target as Element | null)?.closest<HTMLElement>(SURFACE_SELECTOR);
    return surface && root.contains(surface) && surface.closest(`[${WORKSPACE_ATTRIBUTE}]`) === root
      ? surface
      : undefined;
  };
  const activate = (event: Event) => {
    const surface = surfaceFor(event.target);
    if (!surface) return;
    setActive(surface);
    rank += 1;
    raise(surface);
    for (
      let parent = surface.parentElement;
      parent && parent !== root;
      parent = parent.parentElement
    )
      if (parent.matches(`${LAYER_SELECTOR}, ${SURFACE_SELECTOR}`)) raise(parent);
  };
  const pointerDown = (event: PointerEvent) => {
    activate(event);
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    const surface = surfaceFor(target);
    const header = target.closest<HTMLElement>(HEADER_SELECTOR);
    if (!surface || !header || header.parentElement !== surface) return;
    remember(surface);
    drag = {
      pointer: event.pointerId,
      surface,
      header,
      activation: new PointerDragActivation(event),
      start: clientPoint(event),
      original: positions.get(surface) ?? { x: 0, y: 0 },
      headerRect: clientRect(header),
      moved: false,
    };
    header.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    const gesture = drag;
    if (!gesture || gesture.pointer !== event.pointerId || !gesture.activation.update(event))
      return;
    event.preventDefault();
    const point = clientPoint(event);
    const viewport = viewportSize(root.ownerDocument.defaultView ?? undefined);
    const menuHeight =
      (Number.parseFloat(
        computedStyle(gesture.surface).getPropertyValue("--ui-menu-navigation-height"),
      ) || DEFAULT_MENU_HEIGHT) * clientScale(root).y;
    const desiredLeft = gesture.headerRect.left + point.x - gesture.start.x;
    const desiredTop = gesture.headerRect.top + point.y - gesture.start.y;
    const left = Math.max(
      VISIBLE_TITLE_WIDTH - gesture.headerRect.width,
      Math.min(viewport.width - VISIBLE_TITLE_WIDTH, desiredLeft),
    );
    const top = Math.max(
      menuHeight,
      Math.min(viewport.height - gesture.headerRect.height, desiredTop),
    );
    const delta = clientDeltaToLocal(gesture.surface, {
      x: left - gesture.headerRect.left,
      y: top - gesture.headerRect.top,
    });
    const next = {
      x: Math.round(gesture.original.x + delta.x),
      y: Math.round(gesture.original.y + delta.y),
    };
    positions.set(gesture.surface, next);
    gesture.surface.style.translate = `${next.x}px ${next.y}px`;
    gesture.surface.setAttribute("data-ui-window-dragging", "true");
    gesture.moved = true;
  };
  const finish = (event?: PointerEvent, cancel = false) => {
    const gesture = drag;
    if (!gesture || (event && gesture.pointer !== event.pointerId)) return;
    if (cancel && gesture.moved) {
      positions.set(gesture.surface, gesture.original);
      gesture.surface.style.translate = `${gesture.original.x}px ${gesture.original.y}px`;
    }
    gesture.surface.removeAttribute("data-ui-window-dragging");
    if (gesture.header.hasPointerCapture(gesture.pointer))
      gesture.header.releasePointerCapture(gesture.pointer);
    drag = undefined;
  };
  const pointerUp = (event: PointerEvent) => finish(event);
  const pointerCancel = (event: PointerEvent) => finish(event, true);
  const shadeWindow = (target: EventTarget | null) => {
    if (!staticWindowShade || !(target instanceof Element) || target.closest(INTERACTIVE_SELECTOR))
      return;
    const surface = surfaceFor(target);
    const header = target.closest<HTMLElement>(HEADER_SELECTOR);
    return surface instanceof HTMLDetailsElement && header?.parentElement === surface
      ? surface
      : undefined;
  };
  const click = (event: MouseEvent) => {
    if (shadeWindow(event.target)) event.preventDefault();
  };
  const doubleClick = (event: MouseEvent) => {
    const surface = shadeWindow(event.target);
    if (!surface) return;
    event.preventDefault();
    surface.open = !surface.open;
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      finish(undefined, true);
      return;
    }
    const surface = shadeWindow(event.target);
    if (surface && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      surface.open = !surface.open;
    }
  };
  root.addEventListener("pointerdown", pointerDown, true);
  root.addEventListener("pointermove", pointerMove, { capture: true, passive: false });
  root.addEventListener("pointerup", pointerUp, true);
  root.addEventListener("pointercancel", pointerCancel, true);
  root.addEventListener("focusin", activate, true);
  root.addEventListener("click", click, true);
  root.addEventListener("dblclick", doubleClick, true);
  root.addEventListener("keydown", keyDown, true);
  const initial =
    root.querySelector<HTMLElement>(`${SURFACE_SELECTOR}[data-ui-window-priority="primary"]`) ??
    root.querySelector<HTMLElement>(SURFACE_SELECTOR);
  if (initial) setActive(initial);
  return () => {
    finish(undefined, true);
    root.removeEventListener("pointerdown", pointerDown, true);
    root.removeEventListener("pointermove", pointerMove, true);
    root.removeEventListener("pointerup", pointerUp, true);
    root.removeEventListener("pointercancel", pointerCancel, true);
    root.removeEventListener("focusin", activate, true);
    root.removeEventListener("click", click, true);
    root.removeEventListener("dblclick", doubleClick, true);
    root.removeEventListener("keydown", keyDown, true);
    if (priorWorkspace === null) root.removeAttribute(WORKSPACE_ATTRIBUTE);
    else root.setAttribute(WORKSPACE_ATTRIBUTE, priorWorkspace);
    root.style.isolation = priorIsolation;
    for (const [element, style] of prior) Object.assign(element.style, style);
    for (const [element, active] of priorActive) {
      if (active === null) element.removeAttribute("data-ui-window-active");
      else element.setAttribute("data-ui-window-active", active);
    }
  };
}
