import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { useWorkspaceLayoutConfiguration } from "$/components/shared/editor-layout-context";
import type { RecoveryItem } from "$/managers/workspace/recovery-presentation";
import {
  Button,
  ButtonVariant,
  ListBox,
  ListBoxVariant,
  useUi,
  type WorkspaceListBoxItem,
} from "@xprite/ui";
import { uiControlSize } from "@xprite/ui/assets";
import { UI_SCALE_X, UI_SCALE_Y } from "@xprite/ui/canvas";
import { layoutSize, observeResize } from "@xprite/ui/utils";

import styles from "$/components/workspace/recovery-view-base/recovery-view-base.module.css";

interface RecoveryViewLabels {
  heading: string;
  recover: (count: number) => string;
  refresh: string;
  delete: string;
  loading: string;
  previousSessions: string;
  rawFrames: string;
  rawLayers: string;
  recoveryOptions: string;
  rawUnavailable: string;
}

export interface RecoveryViewProps {
  items: readonly RecoveryItem[];
  selectedIds: readonly string[];
  onSelectionChange: (ids: readonly string[]) => void;
  labels: RecoveryViewLabels;
  loading?: boolean;
  busy?: boolean;
  onRecover: (ids: readonly string[]) => void;
  onRefresh: () => void;
  onDelete?: (ids: readonly string[]) => void;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const STACKED_BUTTON_GUTTER = 4;
const STACKED_BUTTON_GAP = 4;
const STACKED_BUTTON_HEIGHT = 40;
const STACK_BREAKPOINT = 360;
const COLUMN_BREAKPOINT = 260;
const LOADING_ROW_HEIGHT = 18;
const LOADING_ITEM_ID = "recovery-loading";
const RECOVER_BUTTON_MINIMUM_WIDTH = 200;
const RECOVER_EXPAND_BUTTON_WIDTH = 24;
const TOOLBAR_HORIZONTAL_SPACING = 16;

function toolbarLayout(width: number, stacked: boolean, buttonWidths: readonly number[]) {
  if (!stacked) {
    return {
      sceneHeight: 38,
      buttons: [
        { x: 4, y: 0, width: buttonWidths[0], height: 34 },
        { x: 4 + buttonWidths[0] + 4, y: 0, width: buttonWidths[1], height: 34 },
        {
          x: Math.max(4 + buttonWidths[0] + buttonWidths[1] + 8, width - buttonWidths[2] - 4),
          y: 0,
          width: buttonWidths[2],
          height: 34,
        },
      ] as const,
    };
  }

  const innerWidth = Math.max(0, width - STACKED_BUTTON_GUTTER * 2);
  const buttonY = STACKED_BUTTON_GUTTER;
  const fullWidthButton = (y: number) => ({
    x: STACKED_BUTTON_GUTTER,
    y,
    width: innerWidth,
    height: STACKED_BUTTON_HEIGHT,
  });
  if (width < COLUMN_BREAKPOINT) {
    const secondY = buttonY + STACKED_BUTTON_HEIGHT + STACKED_BUTTON_GAP;
    const thirdY = secondY + STACKED_BUTTON_HEIGHT + STACKED_BUTTON_GAP;
    return {
      sceneHeight: thirdY + STACKED_BUTTON_HEIGHT + STACKED_BUTTON_GUTTER,
      buttons: [
        fullWidthButton(buttonY),
        fullWidthButton(secondY),
        fullWidthButton(thirdY),
      ] as const,
    };
  }

  const halfWidth = Math.floor((innerWidth - STACKED_BUTTON_GAP) / 2);
  if (width < STACK_BREAKPOINT) {
    const secondY = buttonY + STACKED_BUTTON_HEIGHT + STACKED_BUTTON_GAP;
    return {
      sceneHeight: secondY + STACKED_BUTTON_HEIGHT + STACKED_BUTTON_GUTTER,
      buttons: [
        fullWidthButton(buttonY),
        {
          x: STACKED_BUTTON_GUTTER,
          y: secondY,
          width: halfWidth,
          height: STACKED_BUTTON_HEIGHT,
        },
        {
          x: STACKED_BUTTON_GUTTER + halfWidth + STACKED_BUTTON_GAP,
          y: secondY,
          width: halfWidth,
          height: STACKED_BUTTON_HEIGHT,
        },
      ] as const,
    };
  }

  const contentWidth = Math.max(0, innerWidth - STACKED_BUTTON_GAP * 2);
  const recoverWidth = Math.floor(contentWidth / 2);
  const refreshWidth = Math.floor(contentWidth / 4);
  const deleteWidth = contentWidth - recoverWidth - refreshWidth;
  const refreshX = STACKED_BUTTON_GUTTER + recoverWidth + STACKED_BUTTON_GAP;
  const deleteX = refreshX + refreshWidth + STACKED_BUTTON_GAP;
  return {
    sceneHeight: STACKED_BUTTON_GUTTER * 2 + STACKED_BUTTON_HEIGHT,
    buttons: [
      {
        x: STACKED_BUTTON_GUTTER,
        y: buttonY,
        width: recoverWidth,
        height: STACKED_BUTTON_HEIGHT,
      },
      { x: refreshX, y: buttonY, width: refreshWidth, height: STACKED_BUTTON_HEIGHT },
      { x: deleteX, y: buttonY, width: deleteWidth, height: STACKED_BUTTON_HEIGHT },
    ] as const,
  };
}

/** The recovery workspace composes themed controls; the manager owns selection and operations. */
export function RecoveryView({
  items,
  selectedIds: selection,
  onSelectionChange,
  labels,
  loading = false,
  busy = false,
  onRecover,
  onRefresh,
  onDelete,
}: RecoveryViewProps) {
  const host = useRef<HTMLElement>(null);
  const { style: uiStyle } = useUi();
  const { recovery: configuration } = useWorkspaceLayoutConfiguration();
  const [width, setWidth] = useState(configuration.minimumWidth);

  useClientLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, Math.floor(layoutSize(node).width / UI_SCALE_X)));
    measure();
    const observer = observeResize([node], measure);

    return () => observer();
  }, []);

  const selectedIds = selection.filter((id) => items.some((item) => item.id === id));
  const locked = busy || loading;
  const recoverText = labels.recover(selectedIds.length);
  const buttonWidths = [
    Math.max(
      RECOVER_BUTTON_MINIMUM_WIDTH,
      uiControlSize(uiStyle, "drop_down_button_left_normal", recoverText).width,
    ) + RECOVER_EXPAND_BUTTON_WIDTH,
    uiControlSize(uiStyle, "button_normal", labels.refresh).width,
    uiControlSize(uiStyle, "button_normal", labels.delete).width,
  ];
  const requiredWidth =
    buttonWidths.reduce((sum, value) => sum + value, 0) + TOOLBAR_HORIZONTAL_SPACING;
  const toolbar = toolbarLayout(
    width,
    configuration.toolbarLayout === "stacked" || width < requiredWidth,
    buttonWidths,
  );
  const toolbarHeight = toolbar.sceneHeight * UI_SCALE_Y;
  const viewport = {
    sceneWidth: width,
    sceneHeight: toolbar.sceneHeight,
    width: width * UI_SCALE_X,
    height: toolbarHeight,
  };
  const recover = (ids: readonly string[]) => {
    if (!locked && ids.length) onRecover(ids);
  };
  const listItems: WorkspaceListBoxItem[] = [];
  if (loading)
    listItems.push({ value: LOADING_ITEM_ID, label: labels.loading, height: LOADING_ROW_HEIGHT });
  else if (items.length) {
    listItems.push({ separator: true, label: labels.previousSessions, heading: true });
    const sessions = new Map<string, RecoveryItem[]>();
    for (const item of items) {
      const key = item.session?.id ?? "";
      const group = sessions.get(key) ?? [];
      group.push(item);
      sessions.set(key, group);
    }
    for (const group of sessions.values()) {
      if (group[0].session) listItems.push({ separator: true, label: group[0].session.title });
      for (const item of group) listItems.push({ value: item.id, label: item.description });
    }
  }
  const buttonParts = {
    part: "button_normal",
    hotPart: "button_hot",
    pushedPart: "button_selected",
    focusedPart: "button_focused",
  } as const;

  return (
    <section
      ref={host}
      className={styles.root}
      aria-label={labels.heading}
      aria-busy={locked}
      style={{ "--ui-recovery-workspace": uiStyle.colors.workspace } as CSSProperties}
    >
      <div className={styles.toolbar} style={{ height: toolbarHeight }}>
        <Button
          variant={ButtonVariant.Split}
          viewport={viewport}
          bounds={toolbar.buttons[0]}
          text={recoverText}
          font="default"
          disabledTextShadow
          disabled={locked || !selectedIds.length}
          onClick={() => recover(selectedIds)}
          menu={{
            label: labels.recoveryOptions,
            description: labels.rawUnavailable,
            expandWidth: RECOVER_EXPAND_BUTTON_WIDTH,
            items: [
              { label: labels.rawFrames, disabled: true },
              { label: labels.rawLayers, disabled: true },
            ],
          }}
        />
        <Button
          {...buttonParts}
          viewport={viewport}
          bounds={toolbar.buttons[1]}
          text={labels.refresh}
          font="default"
          disabledTextShadow
          disabled={locked}
          onClick={onRefresh}
        />
        <Button
          {...buttonParts}
          viewport={viewport}
          bounds={toolbar.buttons[2]}
          text={labels.delete}
          font="default"
          disabledTextShadow
          disabled={locked || !selectedIds.length || !onDelete}
          onClick={() => onDelete?.(selectedIds)}
        />
      </div>
      <ListBox
        variant={ListBoxVariant.Workspace}
        className={styles.list}
        items={listItems}
        values={selectedIds}
        onValuesChange={onSelectionChange}
        onActivate={recover}
        disabled={locked}
        itemHeight={configuration.listRowHeight}
        aria-label={labels.heading}
        onKeyDown={(event) => {
          if (event.key === "Delete" && !locked && selectedIds.length && onDelete) {
            event.preventDefault();
            onDelete(selectedIds);
          }
        }}
      />
    </section>
  );
}
