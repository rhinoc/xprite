import { useEffect, useRef } from "react";

import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { focusDialogContainer, isDialogPopupTarget } from "$/components/window/focus";

const FOCUSABLE =
  'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
/** Keep focus inside a modal while allowing its portaled control popups. */
export function useModalFocus(open: boolean, onClose: () => void) {
  const root = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const document = root.current?.ownerDocument;
    if (!document) return;
    const previous = document.activeElement;
    focusDialogContainer(root.current);
    const focus = (event: FocusEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !isDialogPopupTarget(root.current, event.target)
      )
        focusDialogContainer(root.current);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event) || isDialogPopupTarget(root.current, event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const nodes = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (!nodes.length) {
        event.preventDefault();
        focusDialogContainer(root.current);
      } else if (
        index < 0 ||
        (event.shiftKey && index === 0) ||
        (!event.shiftKey && index === nodes.length - 1)
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
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [open]);
  return (node: HTMLDivElement | null) => {
    root.current = node;
  };
}
