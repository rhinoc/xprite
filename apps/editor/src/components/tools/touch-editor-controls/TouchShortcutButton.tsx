import { forwardRef, useCallback, useEffect, useRef } from "react";

import { Button, type ButtonProps } from "@xprite/ui";
import { clientPoint } from "@xprite/ui/utils";

const TOUCH_SHORTCUT_REPEAT_INTERVAL = 80;
const TOUCH_SHORTCUT_REPEAT_MOVE_TOLERANCE = 12;

type TouchShortcutButtonProps = ButtonProps & {
  /** Repeat only after a deliberate hold; ordinary clicks retain button semantics. */
  onRepeat: () => void;
  repeatEnabled: boolean;
  repeatDelay: number;
};

/** Touch editor shortcuts compose the shared button with their hold-to-repeat behavior. */
export const TouchShortcutButton = forwardRef<HTMLButtonElement, TouchShortcutButtonProps>(
  function TouchShortcutButton(
    {
      onRepeat,
      repeatEnabled,
      repeatDelay,
      onClick,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onLostPointerCapture,
      onBlur,
      disabled,
      ...props
    },
    ref,
  ) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hold = useRef<{ pointerId: number; x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
    const repeat = useRef(onRepeat);
    const canRepeat = useRef(false);
    repeat.current = onRepeat;
    canRepeat.current = !disabled && repeatEnabled;
    const stop = useCallback(() => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      hold.current = null;
    }, []);
    const cancel = useCallback(() => {
      if (hold.current) suppressClick.current = true;
      stop();
    }, [stop]);

    useEffect(() => {
      if (disabled || !repeatEnabled) cancel();
    }, [cancel, disabled, repeatEnabled]);
    useEffect(() => {
      const visibility = () => {
        if (document.hidden) cancel();
      };
      window.addEventListener("blur", cancel);
      document.addEventListener("visibilitychange", visibility);
      return () => {
        stop();
        window.removeEventListener("blur", cancel);
        document.removeEventListener("visibilitychange", visibility);
      };
    }, [cancel, stop]);

    return (
      <Button
        {...props}
        ref={ref}
        disabled={disabled}
        onClick={(event) => {
          if (event.detail !== 0 && suppressClick.current) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        onPointerDown={(event) => {
          // A second finger must not replace the pointer that owns the hold.
          // Suppression stays until a new primary press, covering both releases.
          if (hold.current || !event.isPrimary) {
            cancel();
            event.preventDefault();
            onPointerDown?.(event);
            return;
          }
          stop();
          suppressClick.current = false;
          onPointerDown?.(event);
          if (event.defaultPrevented || disabled || !repeatEnabled || event.button !== 0) return;
          hold.current = {
            pointerId: event.pointerId,
            x: clientPoint(event).x,
            y: clientPoint(event).y,
          };
          const tick = () => {
            if (!hold.current || !canRepeat.current) return;
            suppressClick.current = true;
            repeat.current();
            if (!hold.current || !canRepeat.current) return;
            timer.current = setTimeout(tick, TOUCH_SHORTCUT_REPEAT_INTERVAL);
          };
          timer.current = setTimeout(tick, Math.max(0, repeatDelay));
        }}
        onPointerMove={(event) => {
          const start = hold.current;
          if (
            start &&
            start.pointerId === event.pointerId &&
            Math.hypot(clientPoint(event).x - start.x, clientPoint(event).y - start.y) >
              TOUCH_SHORTCUT_REPEAT_MOVE_TOLERANCE
          )
            cancel();
          onPointerMove?.(event);
        }}
        onPointerUp={(event) => {
          if (hold.current?.pointerId === event.pointerId) stop();
          onPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          if (hold.current?.pointerId === event.pointerId) cancel();
          onPointerCancel?.(event);
        }}
        onPointerLeave={(event) => {
          if (hold.current?.pointerId === event.pointerId) cancel();
          onPointerLeave?.(event);
        }}
        onLostPointerCapture={(event) => {
          if (hold.current?.pointerId === event.pointerId) cancel();
          onLostPointerCapture?.(event);
        }}
        onBlur={(event) => {
          cancel();
          onBlur?.(event);
        }}
      />
    );
  },
);
