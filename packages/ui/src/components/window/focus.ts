import { useEffect, useRef, type RefObject } from "react";

import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { keyboardEventKey } from "$/base/utils/keyboard-event-key";
import { isOwnedOverlayTarget } from "$/components/window/interaction";

const DIALOG_SELECTOR = '[role="dialog"]';
const DIALOG_EDITABLE_SELECTOR =
  'input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';

interface ModalFocusScopeEntry {
  root: HTMLElement;
  focusFallback?(root: HTMLElement): void;
}

const modalScopes = new WeakMap<Document, ModalFocusScopeEntry[]>();

/** Register before initial focus so an existing modal cannot pull focus back. */
export function createModalFocusScope(
  root: HTMLElement,
  focusFallback?: (root: HTMLElement) => void,
) {
  const document = root.ownerDocument;
  const scopes = modalScopes.get(document) ?? [];
  const scope: ModalFocusScopeEntry = { root, focusFallback };
  modalScopes.set(document, scopes);
  // React mounts child effects first. Insert a containing modal below its
  // children without superseding a newer, unrelated modal.
  const child = scopes.findIndex((candidate) => root.contains(candidate.root));
  if (child < 0) scopes.push(scope);
  else scopes.splice(child, 0, scope);
  const isActive = () => scopes[scopes.length - 1] === scope;
  return {
    isActive,
    /** Only the active modal may restore focus when it closes. */
    dispose() {
      const restore = isActive();
      const index = scopes.indexOf(scope);
      if (index >= 0) scopes.splice(index, 1);
      if (!scopes.length) modalScopes.delete(document);
      return restore;
    },
  };
}

/**
 * Return focus to the element that opened a closed modal. The opener can be disabled while
 * a parent modal is busy, so focus falls back to the parent modal instead of the page.
 */
export function restoreModalFocus(document: Document, previous: HTMLElement | null) {
  if (previous?.isConnected) previous.focus({ preventScroll: true });
  const scopes = modalScopes.get(document);
  const parent = scopes?.[scopes.length - 1];
  if (
    parent &&
    !parent.root.contains(document.activeElement) &&
    !isDialogPopupTarget(parent.root, document.activeElement)
  ) {
    if (parent.focusFallback) parent.focusFallback(parent.root);
    else focusDialogContainer(parent.root);
  }
}

/** Documents whose focus is being moved to a dialog container right now. */
const containerFocusing = new WeakSet<Document>();

function withContainerFocusGuard(document: Document, focus: () => void) {
  if (containerFocusing.has(document)) return;
  containerFocusing.add(document);
  try {
    focus();
  } finally {
    containerFocusing.delete(document);
  }
}

function reclaimModalFocus(root: HTMLElement, custom?: (root: HTMLElement) => void) {
  if (!custom) {
    focusDialogContainer(root);
    return;
  }
  withContainerFocusGuard(root.ownerDocument, () => custom(root));
}

/**
 * Keep modal focus without reopening an editable control's software keyboard. A trap that
 * reacts to this focus change cannot move focus again during it, so two traps that disagree
 * about the owner stop after one move instead of recursing until the stack overflows.
 */
export function focusDialogContainer(root: HTMLElement | null) {
  const dialog = root?.matches(DIALOG_SELECTOR)
    ? root
    : root?.querySelector<HTMLElement>(DIALOG_SELECTOR);
  if (!dialog) return;
  withContainerFocusGuard(dialog.ownerDocument, () => dialog.focus({ preventScroll: true }));
}

/** Portaled control popups handle their own focus and keyboard dismissal. */
export function isDialogPopupTarget(root: HTMLElement | null, target: EventTarget | null) {
  if (!root || !(target instanceof Node)) return false;
  if (isOwnedOverlayTarget(root, target)) return true;
  if (target instanceof Element) {
    const ownerId = target.closest("[data-popup-for]")?.getAttribute("data-popup-for");
    const owner = ownerId ? root.ownerDocument.getElementById(ownerId) : null;
    if (owner && root.contains(owner)) return true;
  }
  return [...root.querySelectorAll<HTMLElement>("[aria-controls]")].some((trigger) => {
    const popup = root.ownerDocument.getElementById(trigger.getAttribute("aria-controls") ?? "");
    return !!popup && (popup.contains(target) || trigger.contains(target));
  });
}

const DEFAULT_FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

export interface ModalFocusOptions {
  open: boolean;
  /** Disable modal focus containment for non-modal dialogs. Defaults to true. */
  modal?: boolean;
  rootRef: RefObject<HTMLElement | null>;
  initialFocus?(root: HTMLElement): void;
  /** Reclaim focus when it leaves the modal and its popups. Defaults to `focusDialogContainer`. */
  reclaimFocus?(root: HTMLElement): void;
  /** Whether closing the active modal restores focus to its opener. Defaults to true. */
  restoreFocus?: boolean;
  focusableSelector?: string;
  /** Exclude hidden or zero-sized elements from Tab cycling. */
  filterFocusable?(element: HTMLElement): boolean;
  /** Child modals temporarily own focus without restarting this modal's lifecycle. */
  isSuspended?(): boolean;
  /** Escape handler invoked when `onKeyDown` did not already prevent default. */
  onEscape?(event: KeyboardEvent): void;
  /** Business shortcuts run before `onEscape` and the shared Tab handling. */
  onKeyDown?(event: KeyboardEvent): void;
}

/** Focus containment and restoration independent of modal artwork and form submission. */
export function useModalFocus({
  open,
  modal = true,
  rootRef,
  initialFocus,
  reclaimFocus,
  restoreFocus = true,
  focusableSelector = DEFAULT_FOCUSABLE_SELECTOR,
  filterFocusable,
  isSuspended,
  onEscape,
  onKeyDown,
}: ModalFocusOptions) {
  const callbacks = useRef({
    initialFocus,
    reclaimFocus,
    restoreFocus,
    filterFocusable,
    isSuspended,
    onEscape,
    onKeyDown,
  });
  callbacks.current = {
    initialFocus,
    reclaimFocus,
    restoreFocus,
    filterFocusable,
    isSuspended,
    onEscape,
    onKeyDown,
  };
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !modal || !root) return;
    const document = root.ownerDocument;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scope = createModalFocusScope(root, (node) =>
      reclaimModalFocus(node, callbacks.current.reclaimFocus),
    );
    if (scope.isActive() && !callbacks.current.isSuspended?.()) {
      if (callbacks.current.initialFocus) callbacks.current.initialFocus(root);
      else focusDialogContainer(root);
    }
    const focus = (event: FocusEvent) => {
      if (!scope.isActive() || callbacks.current.isSuspended?.()) return;
      if (!root.contains(event.target as Node) && !isDialogPopupTarget(root, event.target)) {
        reclaimModalFocus(root, callbacks.current.reclaimFocus);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (
        !scope.isActive() ||
        callbacks.current.isSuspended?.() ||
        event.defaultPrevented ||
        isImeKeyboardEvent(event) ||
        isDialogPopupTarget(root, event.target)
      )
        return;
      const eventKey = keyboardEventKey(event);
      callbacks.current.onKeyDown?.(event);
      if (event.defaultPrevented || callbacks.current.isSuspended?.()) return;
      if (eventKey === "Escape" && callbacks.current.onEscape) {
        event.preventDefault();
        event.stopPropagation();
        callbacks.current.onEscape(event);
        return;
      }
      if (eventKey !== "Tab") return;
      const candidates = [...root.querySelectorAll<HTMLElement>(focusableSelector)];
      const filter = callbacks.current.filterFocusable;
      const nodes = filter ? candidates.filter(filter) : candidates;
      if (!nodes.length) {
        event.preventDefault();
        reclaimModalFocus(root, callbacks.current.reclaimFocus);
        return;
      }
      const current = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        current < 0 ||
        (event.shiftKey && current === 0) ||
        (!event.shiftKey && current === nodes.length - 1)
      ) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
      if (scope.dispose() && callbacks.current.restoreFocus) {
        restoreModalFocus(document, previous);
      }
    };
  }, [open, modal, rootRef, focusableSelector]);
}

/** Clicking modal chrome dismisses the editable control's software keyboard. */
export function useModalInputDismiss(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  modal: boolean,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !modal || !root) return;
    const document = root.ownerDocument;
    const dismissInput = (event: PointerEvent) => {
      const active = document.activeElement;
      if (
        event.button === 0 &&
        event.isPrimary &&
        active instanceof HTMLElement &&
        root.contains(active) &&
        active.matches(DIALOG_EDITABLE_SELECTOR) &&
        event.target instanceof Element &&
        !event.target.closest(DIALOG_EDITABLE_SELECTOR) &&
        !isDialogPopupTarget(root, event.target)
      ) {
        focusDialogContainer(root);
      }
    };
    document.addEventListener("pointerdown", dismissInput, true);
    return () => document.removeEventListener("pointerdown", dismissInput, true);
  }, [rootRef, open, modal]);
}
