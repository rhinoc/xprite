import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
  type KeyboardEvent,
} from "react";

import { usesNativeTextEditing } from "$/base/utils/native-text-input";
import { PointerClickSequence } from "$/components/menu/pointer-gestures";

export enum InputTouchActivation {
  Native = "native",
  DoubleTap = "double-tap",
}

const DOUBLE_TAP_COUNT = 2;
const ASSISTIVE_CLICK_DETAIL = 0;
const PRIMARY_POINTER_BUTTON = 0;

/** Toolbar fields reserve the first tap for a control action, without opening
 * the keyboard. Editing starts on a completed double tap or keyboard input.
 * Keep the input readonly until activation, including programmatic focus.
 */
export function useInputTouchActivation(
  mode: InputTouchActivation,
  readOnly: boolean,
  onTap?: () => void,
) {
  const taps = useRef(new PointerClickSequence());
  const contact = useRef<number | null>(null);
  const active = useRef(false);
  const nativeTap = useRef(false);
  const node = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const guarded = mode === InputTouchActivation.DoubleTap && !readOnly;
  useEffect(() => {
    const input = node.current;
    if (!guarded || !editing || !input) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!event.composedPath().includes(input)) input.blur();
    };
    input.ownerDocument.addEventListener("pointerdown", outside, true);
    return () => input.ownerDocument.removeEventListener("pointerdown", outside, true);
  }, [guarded, editing]);
  const activate = (input: HTMLInputElement) => {
    node.current = input;
    active.current = true;
    setEditing(true);
    // Change this synchronously inside the trusted gesture before focusing.
    input.readOnly = false;
    input.focus({ preventScroll: true });
    if (input.type !== "number") input.select();
  };
  return {
    readOnly: readOnly || (guarded && !editing),
    onPointerDown(event: PointerEvent<HTMLInputElement>) {
      if (!guarded || active.current) return;
      if (!usesNativeTextEditing(event)) {
        nativeTap.current = false;
        if (event.button === PRIMARY_POINTER_BUTTON) activate(event.currentTarget);
        return;
      }
      nativeTap.current = true;
      event.preventDefault();
      if (contact.current !== null) {
        taps.current.reset();
        contact.current = null;
        return;
      }
      contact.current = event.pointerId;
      taps.current.press(event, event.currentTarget);
    },
    onPointerMove(event: PointerEvent<HTMLInputElement>) {
      if (contact.current === event.pointerId) taps.current.move(event);
    },
    onPointerUp(event: PointerEvent<HTMLInputElement>) {
      if (contact.current !== event.pointerId) return;
      contact.current = null;
      const count = taps.current.release(event);
      if (count === DOUBLE_TAP_COUNT) activate(event.currentTarget);
      else if (count) onTap?.();
    },
    onPointerCancel(event: PointerEvent<HTMLInputElement>) {
      if (contact.current !== event.pointerId) return;
      contact.current = null;
      taps.current.reset();
    },
    onClick(event: MouseEvent<HTMLInputElement>) {
      if (!guarded || active.current) return;
      event.preventDefault();
      const assistive = event.detail === ASSISTIVE_CLICK_DETAIL && !nativeTap.current;
      nativeTap.current = false;
      if (assistive) activate(event.currentTarget);
      else event.currentTarget.blur();
    },
    onKeyDown(event: KeyboardEvent<HTMLInputElement>): boolean {
      if (!guarded || active.current || event.ctrlKey || event.metaKey || event.altKey)
        return false;
      if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")
        activate(event.currentTarget);
      if (event.key !== "Enter") return false;
      event.preventDefault();
      activate(event.currentTarget);
      return true;
    },
    onBlur() {
      if (active.current) {
        taps.current.reset();
        nativeTap.current = false;
      }
      active.current = false;
      node.current = null;
      contact.current = null;
      setEditing(false);
    },
  };
}
