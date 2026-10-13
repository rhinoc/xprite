import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type MutableRefObject,
} from "react";

import { isUnclaimedKey, triggersDefaultAction } from "$/base/utils/field-key";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";

export enum OverlayDismissReason {
  OutsidePointer = "outside-pointer",
  Escape = "escape",
  Enter = "enter",
  Resize = "resize",
  WindowBlur = "window-blur",
}

export interface OverlayInteractionOptions {
  open: boolean;
  rootRef: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  onDismiss(reason: OverlayDismissReason, event: Event): void;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  closeOnEscape?: boolean;
  closeOnEnter?: boolean;
  closeOnOutsidePointer?: boolean;
  closeOnResize?: boolean;
  closeOnWindowBlur?: boolean;
  escapeWithinRoot?: boolean;
  ignoreOutside?(event: PointerEvent): boolean;
  ignoreEscape?(event: KeyboardEvent): boolean;
}

export interface OverlayOwner {
  parent: OverlayOwner | null;
  rootRef: RefObject<HTMLElement | null>;
}

interface OverlayEntry {
  owner: OverlayOwner;
  options: MutableRefObject<OverlayInteractionOptions>;
  restoreFocus: boolean;
}

interface OverlayRegistry {
  entries: OverlayEntry[];
  dispose(): void;
}

const ownerContext = createContext<OverlayOwner | null>(null);
const registries = new WeakMap<Document, OverlayRegistry>();

/** Resolve portaled descendants through their interaction owner or trigger. */
export function isOwnedOverlayTarget(root: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const registry = registries.get(root.ownerDocument);
  return !!registry?.entries.some((entry) => {
    const node = entry.owner.rootRef.current;
    if (!node?.contains(target)) return false;
    if (
      entry.options.current.triggerRef?.current &&
      root.contains(entry.options.current.triggerRef.current)
    )
      return true;
    for (let parent = entry.owner.parent; parent; parent = parent.parent) {
      if (parent.rootRef.current && root.contains(parent.rootRef.current)) return true;
    }
    return node !== root && root.contains(node) && node.hasAttribute("data-popup");
  });
}

/** A portaled menu or popup opened from a control inside this overlay. */
function floatingSurfaceOpenedInside(root: HTMLElement, target: EventTarget | null): boolean {
  if (isOwnedOverlayTarget(root, target)) return true;
  if (!(target instanceof Element)) return false;
  const ownerId = target.closest("[data-popup-for]")?.getAttribute("data-popup-for");
  if (!ownerId) return false;
  const anchor = root.ownerDocument.getElementById(ownerId);
  return !!anchor && root.contains(anchor);
}

/** React ownership survives portals; DOM containment also covers anchored wrappers. */
function owns(parent: OverlayOwner, child: OverlayOwner): boolean {
  for (let owner = child.parent; owner; owner = owner.parent) {
    if (owner === parent) return true;
  }
  const root = parent.rootRef.current;
  const childRoot = child.rootRef.current;
  return !!root && !!childRoot && root !== childRoot && root.contains(childRoot);
}

function topEntry(registry: OverlayRegistry): OverlayEntry | undefined {
  return [...registry.entries]
    .reverse()
    .find(
      (entry) =>
        entry.options.current.open &&
        entry.owner.rootRef.current?.isConnected &&
        !registry.entries.some(
          (child) =>
            child !== entry &&
            child.options.current.open &&
            child.owner.rootRef.current?.isConnected &&
            owns(entry.owner, child.owner),
        ),
    );
}

function contains(entry: OverlayEntry, target: EventTarget | null): boolean {
  return (
    target instanceof Node &&
    (!!entry.owner.rootRef.current?.contains(target) ||
      !!entry.options.current.triggerRef?.current?.contains(target))
  );
}

function dismiss(entry: OverlayEntry, reason: OverlayDismissReason, event: Event) {
  if (reason !== OverlayDismissReason.Escape && reason !== OverlayDismissReason.Enter) {
    entry.restoreFocus = false;
    const document = entry.owner.rootRef.current?.ownerDocument;
    const registry = document ? registries.get(document) : undefined;
    for (const child of registry?.entries ?? []) {
      if (owns(entry.owner, child.owner)) child.restoreFocus = false;
    }
  }
  entry.options.current.onDismiss(reason, event);
}

/** Aseprite's magnet button: the window's default action, fired by Enter from any control. */
const DEFAULT_ACTION_ATTRIBUTE = "data-ui-default-action";
/** Spread on the OK button of a dialog: `<Button {...defaultActionProps()} />`. */
export function defaultActionProps(enabled = true): Record<string, string> {
  return enabled ? { [DEFAULT_ACTION_ATTRIBUTE]: "" } : {};
}
const DEFAULT_ACTION_SELECTOR = `[${DEFAULT_ACTION_ATTRIBUTE}]:not(:disabled)`;
function defaultAction(root: HTMLElement | null, event: KeyboardEvent): HTMLElement | null {
  if (!root) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (!triggersDefaultAction(event, target)) return null;
  return root.querySelector<HTMLElement>(DEFAULT_ACTION_SELECTOR);
}

/** Returns whether the window consumed the key. */
function handleKey(registry: OverlayRegistry, event: KeyboardEvent): boolean {
  if (!isUnclaimedKey(event) || isImeKeyboardEvent(event)) return false;
  const entry = topEntry(registry);
  if (!entry) return false;
  const options = entry.options.current;
  if (options.escapeWithinRoot && !contains(entry, event.target)) return false;
  const escape =
    event.key === "Escape" && options.closeOnEscape !== false && !options.ignoreEscape?.(event);
  const enter = event.key === "Enter" && options.closeOnEnter;
  if (!escape && !enter) {
    const action = defaultAction(entry.owner.rootRef.current, event);
    if (!action) return false;
    event.preventDefault();
    event.stopPropagation();
    // Let the focused field's commit render first, so the action reads the committed value.
    queueMicrotask(() => {
      if (action.isConnected) action.click();
    });
    return true;
  }
  event.preventDefault();
  event.stopPropagation();
  dismiss(entry, escape ? OverlayDismissReason.Escape : OverlayDismissReason.Enter, event);
  return true;
}

function createRegistry(document: Document): OverlayRegistry {
  const registry: OverlayRegistry = { entries: [], dispose };
  const pointer = (event: PointerEvent) => {
    const top = topEntry(registry);
    if (!top) return;
    const owners = [
      top,
      ...[...registry.entries].reverse().filter((entry) => owns(entry.owner, top.owner)),
    ];
    if (
      contains(top, event.target) ||
      owners.some(
        (entry) =>
          event.target instanceof Node &&
          !!entry.options.current.triggerRef?.current?.contains(event.target),
      )
    )
      return;
    if (
      owners.some((entry) => {
        const root = entry.owner.rootRef.current;
        return !!root && floatingSurfaceOpenedInside(root, event.target);
      })
    )
      return;
    for (const entry of owners) {
      const options = entry.options.current;
      if (options.ignoreOutside?.(event)) return;
      if (options.closeOnOutsidePointer) {
        dismiss(entry, OverlayDismissReason.OutsidePointer, event);
        return;
      }
    }
  };
  const key = (event: KeyboardEvent) => handleKey(registry, event);
  const focus = (event: FocusEvent) => {
    if (!(event.target instanceof Node)) return;
    const target = event.target;
    const focused = [...registry.entries]
      .reverse()
      .find(
        (entry) =>
          entry.owner.rootRef.current?.contains(target) &&
          !registry.entries.some(
            (child) =>
              child !== entry &&
              owns(entry.owner, child.owner) &&
              child.owner.rootRef.current?.contains(target),
          ),
      );
    if (focused) {
      registry.entries = [...registry.entries.filter((entry) => entry !== focused), focused];
    }
  };
  const resize = (event: Event) => {
    for (const entry of registry.entries) {
      if (entry.options.current.open && entry.options.current.closeOnResize) {
        dismiss(entry, OverlayDismissReason.Resize, event);
      }
    }
  };
  const blur = (event: Event) => {
    for (const entry of registry.entries) {
      if (entry.options.current.open && entry.options.current.closeOnWindowBlur) {
        dismiss(entry, OverlayDismissReason.WindowBlur, event);
      }
    }
  };
  const host = document.defaultView;
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("keydown", key);
  document.addEventListener("focusin", focus);
  host?.addEventListener("resize", resize);
  host?.addEventListener("blur", blur);
  function dispose() {
    document.removeEventListener("pointerdown", pointer, true);
    document.removeEventListener("keydown", key);
    document.removeEventListener("focusin", focus);
    host?.removeEventListener("resize", resize);
    host?.removeEventListener("blur", blur);
    registries.delete(document);
  }
  return registry;
}

/** Open/close and focus behavior independent of frame artwork and placement. */
export function useOverlayInteraction(options: OverlayInteractionOptions) {
  const parent = useContext(ownerContext);
  const owner = useMemo(() => ({ parent, rootRef: options.rootRef }), [parent, options.rootRef]);
  const currentOptions = useRef(options);
  currentOptions.current = options;
  const entryRef = useRef<OverlayEntry | null>(null);
  useEffect(() => {
    if (!options.open) return;
    const root = owner.rootRef.current;
    const document = root?.ownerDocument;
    if (!root || !document) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry: OverlayEntry = {
      owner,
      options: currentOptions,
      restoreFocus: true,
    };
    const registry = registries.get(document) ?? createRegistry(document);
    registries.set(document, registry);
    registry.entries.push(entry);
    entryRef.current = entry;
    return () => {
      registry.entries = registry.entries.filter((registered) => registered !== entry);
      entryRef.current = null;
      if (!registry.entries.length) registry.dispose();
      if (currentOptions.current.restoreFocus && entry.restoreFocus && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [options.open, owner]);
  useEffect(() => {
    const root = owner.rootRef.current;
    const registry = root ? registries.get(root.ownerDocument) : undefined;
    if (options.open && options.autoFocus && registry && topEntry(registry) === entryRef.current) {
      root?.focus({ preventScroll: true });
    }
  }, [options.open, options.autoFocus, owner]);

  return {
    owner,
    onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
      const document = event.currentTarget.ownerDocument;
      const registry = registries.get(document);
      const handled = !!registry && handleKey(registry, event.nativeEvent);
      // A field's own commit/revert key keeps bubbling to the dialog's handlers.
      if (handled || !isUnclaimedKey(event.nativeEvent)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}

export function OverlayInteractionScope({
  owner,
  children,
}: {
  owner: OverlayOwner;
  children?: ReactNode;
}) {
  return <ownerContext.Provider value={owner}>{children}</ownerContext.Provider>;
}
