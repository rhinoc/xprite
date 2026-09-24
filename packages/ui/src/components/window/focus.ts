const DIALOG_SELECTOR = '[role="dialog"]';
const POPUP_SELECTOR = '[data-popup],[role="menu"]';
export const DIALOG_EDITABLE_SELECTOR =
  'input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';

/** Keep modal focus without reopening an editable control's software keyboard. */
export function focusDialogContainer(root: HTMLElement | null) {
  const dialog = root?.matches(DIALOG_SELECTOR)
    ? root
    : root?.querySelector<HTMLElement>(DIALOG_SELECTOR);
  dialog?.focus({ preventScroll: true });
}

/** Portaled control popups handle their own focus and keyboard dismissal. */
export function isDialogPopupTarget(root: HTMLElement | null, target: EventTarget | null) {
  if (!root || !(target instanceof Node)) return false;
  const element = target instanceof Element ? target : target.parentElement;
  if (element?.closest(POPUP_SELECTOR)) return true;
  return [...root.querySelectorAll<HTMLElement>("[aria-controls]")].some((trigger) => {
    const popup = root.ownerDocument.getElementById(trigger.getAttribute("aria-controls") ?? "");
    return !!popup && (popup.contains(target) || trigger.contains(target));
  });
}
