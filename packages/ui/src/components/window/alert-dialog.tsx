import { useEffect, useRef, useState } from "react";

import { Label, centerThemePixel, measureThemeText } from "$/base/components/theme-controls";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { Button } from "$/components/button";
import { type SurfaceBounds } from "$/components/canvas-surface";
import { Dialog } from "$/components/window/dialog";
import { isDialogPopupTarget } from "$/components/window/focus";

import styles from "$/components/window/alert.module.css";

const ALERT_LAYOUT = {
  buttonMinimumWidth: 120,
  buttonHorizontalPadding: 20,
  messageWidthPadding: 4,
  contentInset: 2,
  messageTop: 8,
  messageHeight: 18,
  messageGap: 8,
  buttonGap: 8,
  buttonTopGap: 24,
  buttonHeight: 34,
  frameWidthPadding: 24,
  titlebarHeight: 34,
  bottomPadding: 12,
};

export enum AlertDialogActionVariant {
  Normal = "normal",
  Primary = "primary",
}

export interface AlertDialogAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  mnemonicIndex?: number;
  variant?: AlertDialogActionVariant;
}

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  messageLines: readonly string[];
  actions: readonly AlertDialogAction[];
  defaultActionIndex?: number;
  cancelActionIndex?: number;
  clientBounds?: SurfaceBounds;
  sceneBounds?: SurfaceBounds;
}

/** Modal themed message with generic default, cancel, mnemonic and focus behavior. */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  messageLines,
  actions,
  defaultActionIndex = 0,
  cancelActionIndex = actions.length - 1,
  clientBounds: suppliedClientBounds,
  sceneBounds,
}: AlertDialogProps) {
  const scene = sceneBounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const clientBounds = suppliedClientBounds ?? scene;
  const host = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const latest = useRef({ actions, onOpenChange, defaultActionIndex, cancelActionIndex });
  latest.current = { actions, onOpenChange, defaultActionIndex, cancelActionIndex };
  const dismiss = () => {
    const current = latest.current;
    const action = current.actions[current.cancelActionIndex];
    if (action && !action.disabled) action.onClick();
    else current.onOpenChange(false);
  };

  const labelsHeight = messageLines.length
    ? messageLines.length * ALERT_LAYOUT.messageHeight +
      (messageLines.length - 1) * ALERT_LAYOUT.messageGap
    : 0;
  const minimumButton = Math.max(
    ALERT_LAYOUT.buttonMinimumWidth,
    ...actions.map(
      (action) => measureThemeText(action.label) + ALERT_LAYOUT.buttonHorizontalPadding,
    ),
  );
  const width = Math.max(
    ALERT_LAYOUT.frameWidthPadding +
      Math.max(
        0,
        ...messageLines.map((text) => measureThemeText(text) + ALERT_LAYOUT.messageWidthPadding),
      ),
    ALERT_LAYOUT.frameWidthPadding +
      actions.length * minimumButton +
      Math.max(0, actions.length - 1) * ALERT_LAYOUT.buttonGap,
  );
  const height =
    ALERT_LAYOUT.titlebarHeight +
    ALERT_LAYOUT.messageTop +
    labelsHeight +
    ALERT_LAYOUT.buttonTopGap +
    ALERT_LAYOUT.buttonHeight +
    ALERT_LAYOUT.bottomPadding;
  const bounds = {
    x: position?.x ?? centerThemePixel(clientBounds.x, clientBounds.width, width),
    y: position?.y ?? centerThemePixel(clientBounds.y, clientBounds.height, height),
    width,
    height,
  };

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDefault = () => {
      const current = latest.current;
      const preferred = buttons.current[current.defaultActionIndex];
      (preferred && !preferred.disabled
        ? preferred
        : buttons.current.find((button) => button && !button.disabled)
      )?.focus({ preventScroll: true });
    };
    focusDefault();
    const focus = (event: FocusEvent) => {
      if (isDialogPopupTarget(host.current, event.target)) return;
      if (!host.current?.contains(event.target as Node)) focusDefault();
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (isDialogPopupTarget(host.current, event.target)) return;
      const current = latest.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const action = current.actions.find(
          (candidate) =>
            !candidate.disabled &&
            candidate.mnemonicIndex !== undefined &&
            candidate.label[candidate.mnemonicIndex]?.toLowerCase() === event.key.toLowerCase(),
        );
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          action.onClick();
          return;
        }
      }
      if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
        const action = current.actions[current.defaultActionIndex];
        if (action && !action.disabled) {
          event.preventDefault();
          event.stopPropagation();
          action.onClick();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(host.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []),
      ];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        nodes.length &&
        (index < 0 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === nodes.length - 1))
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
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={host}
      className={styles.backdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Dialog
        open
        title={title}
        description={messageLines.join(" ")}
        onOpenChange={(value) => {
          if (!value) dismiss();
        }}
        bounds={bounds}
        sceneBounds={sceneBounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        resizable={false}
        modal
        autoFocus={false}
        constrainToViewport
      >
        {({ clientBounds: client }) => (
          <>
            {messageLines.map((message, index) => (
              <Label
                key={index}
                bounds={{
                  x: client.x + ALERT_LAYOUT.contentInset,
                  y:
                    client.y +
                    ALERT_LAYOUT.messageTop +
                    index * (ALERT_LAYOUT.messageHeight + ALERT_LAYOUT.messageGap),
                  width: client.width - ALERT_LAYOUT.contentInset * 2,
                  height: ALERT_LAYOUT.messageHeight,
                }}
                relativeTo={client}
                text={message}
              />
            ))}
            {actions.map((action, index) => {
              const buttonWidth =
                2 *
                Math.floor(
                  (client.width - Math.max(0, actions.length - 1) * ALERT_LAYOUT.buttonGap) /
                    Math.max(1, actions.length) /
                    2,
                );
              const x = client.x + index * (buttonWidth + ALERT_LAYOUT.buttonGap);
              return (
                <Button
                  key={`${action.label}-${index}`}
                  buttonRef={(node) => {
                    buttons.current[index] = node;
                  }}
                  bounds={{
                    x,
                    y:
                      client.y + ALERT_LAYOUT.messageTop + labelsHeight + ALERT_LAYOUT.buttonTopGap,
                    width: index === actions.length - 1 ? client.x + client.width - x : buttonWidth,
                    height: ALERT_LAYOUT.buttonHeight,
                  }}
                  relativeTo={client}
                  text={action.label}
                  font="default"
                  part={
                    action.variant === AlertDialogActionVariant.Primary
                      ? "button_selected"
                      : "button_normal"
                  }
                  hotPart="button_hot"
                  focusedPart={
                    action.variant === AlertDialogActionVariant.Primary
                      ? "button_selected"
                      : "button_focused"
                  }
                  pushedPart="button_selected"
                  mnemonicIndex={action.mnemonicIndex}
                  disabled={action.disabled}
                  onClick={action.onClick}
                />
              );
            })}
          </>
        )}
      </Dialog>
    </div>
  );
}
