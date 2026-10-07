import { useLayoutEffect, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useTheme } from "$/base/theme/theme-context";
import { ThemeScope } from "$/base/theme/theme-scope";
import { DEFAULT_SURFACE_VIEWPORT } from "$/components/canvas-surface";
import {
  measurePopoverAnchor,
  useAnchoredPopover,
  anchoredPopoverStyle,
} from "$/components/popover/anchored";
import { TooltipGroup } from "$/components/tooltip";

import styles from "$/components/popover/button-strip-popover.module.css";

export enum ButtonStripAnchor {
  Side = "side",
  Below = "below",
}

const BUTTON_BORDER_OVERLAP = 2;
const ANCHOR_GAP = 1;
const VIEWPORT_MARGIN = 4;

function stripWidth(
  anchor: ReturnType<typeof measurePopoverAnchor>,
  count: number,
  placement: ButtonStripAnchor,
) {
  const sx = anchor.viewport.width / anchor.viewport.sceneWidth;
  const right =
    anchor.availableWidth -
    anchor.bounds.x -
    anchor.bounds.width -
    (ANCHOR_GAP + VIEWPORT_MARGIN) / sx;
  const left = anchor.bounds.x - (ANCHOR_GAP + VIEWPORT_MARGIN) / sx;
  const available =
    placement === ButtonStripAnchor.Side
      ? Math.max(left, right)
      : anchor.availableWidth - (VIEWPORT_MARGIN * 2) / sx;
  return Math.max(
    0,
    Math.min(available, anchor.bounds.width * count - (BUTTON_BORDER_OVERLAP * (count - 1)) / sx),
  );
}

/** Anchored toolbar expansion without heading or window controls. */
export function ButtonStripPopover({
  open,
  onOpenChange,
  anchorRef,
  placement = ButtonStripAnchor.Below,
  count,
  label,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: ButtonStripAnchor;
  count: number;
  label: string;
  children: ReactNode;
}) {
  const { definition: theme } = useTheme();
  const controller = useAnchoredPopover<HTMLElement, HTMLDivElement>(DEFAULT_SURFACE_VIEWPORT, {
    onDismiss: () => onOpenChange(false),
    keepOpenOnOtherOverlays: false,
  });
  const { open: show, close } = controller;

  useLayoutEffect(() => {
    const trigger = anchorRef.current;
    if (!open || !trigger || !count) {
      close();
      return;
    }
    const anchor = measurePopoverAnchor(trigger);
    const sx = anchor.viewport.width / anchor.viewport.sceneWidth;
    const sy = anchor.viewport.height / anchor.viewport.sceneHeight;
    const width = stripWidth(anchor, count, placement);
    const height = anchor.bounds.height;
    let x = anchor.bounds.x;
    let y = anchor.bottom + ANCHOR_GAP / sy;
    if (placement === ButtonStripAnchor.Side) {
      const right = anchor.availableWidth - anchor.bounds.x - anchor.bounds.width;
      x =
        right >= anchor.bounds.x
          ? anchor.bounds.x + anchor.bounds.width + ANCHOR_GAP / sx
          : anchor.bounds.x - width - ANCHOR_GAP / sx;
      y = anchor.top;
    } else if (y + height > anchor.availableHeight - VIEWPORT_MARGIN / sy) {
      y = anchor.top - height - ANCHOR_GAP / sy;
    }
    x = Math.max(
      VIEWPORT_MARGIN / sx,
      Math.min(anchor.availableWidth - width - VIEWPORT_MARGIN / sx, x),
    );
    y = Math.max(
      VIEWPORT_MARGIN / sy,
      Math.min(anchor.availableHeight - height - VIEWPORT_MARGIN / sy, y),
    );
    show({ width, height, offsetX: x - anchor.bounds.x, offsetY: y - anchor.bottom }, trigger);
  }, [open, count, anchorRef, placement, show, close]);

  const popover = controller.popover;
  if (!open || !popover || !anchorRef.current) return null;
  const anchor = measurePopoverAnchor(anchorRef.current);
  const sx = popover.viewport.width / popover.viewport.sceneWidth;
  const sy = popover.viewport.height / popover.viewport.sceneHeight;
  const width = stripWidth(anchor, count, placement);
  const height = anchor.bounds.height;
  const bounds = { x: popover.x, y: popover.y, width, height };

  return createPortal(
    <ThemeScope>
      <div
        ref={controller.panelRef}
        className={styles.popup}
        role="toolbar"
        aria-label={label}
        aria-orientation="horizontal"
        data-button-strip=""
        data-popup=""
        style={
          {
            ...anchoredPopoverStyle(popover, bounds, { constrainToViewport: false }),
            color: theme.colors.text,
            "--ui-strip-cell-width": `${anchor.bounds.width * sx}px`,
            "--ui-strip-cell-height": `${anchor.bounds.height * sy}px`,
            "--ui-strip-border-overlap": `${BUTTON_BORDER_OVERLAP}px`,
          } as CSSProperties
        }
      >
        <TooltipGroup>
          <div className={styles.buttons}>{children}</div>
        </TooltipGroup>
      </div>
    </ThemeScope>,
    anchorRef.current.ownerDocument.body,
  );
}
