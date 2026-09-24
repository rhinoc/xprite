import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useElementSize } from "$/components/shared/use-size";
import { EditorContextBar } from "$/components/tools/editor-context-bar";
import { ToolRail, toolGroups } from "$/components/tools/tool-rail";
import { tUi, tUiSource } from "$/i18n";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { useToolRailModel, type ToolRailModel } from "$/managers/tools/tool-rail-model";
import { WorkspaceContextPresentation } from "$/managers/workspace/workspace-panel-layout";
import {
  Button,
  ButtonVariant,
  OverlayContentLayout,
  Popover,
  Text,
  TextVariant,
  useUi,
} from "@xprite/ui";
import {
  anchoredPopoverStyle,
  useAnchoredPopover,
  type AnchoredPopoverState,
} from "@xprite/ui/popover";
import { layoutSize, clientRect, clientScale, observeResize } from "@xprite/ui/utils";

import styles from "$/components/tools/editor-tool-rail/editor-tool-rail.module.css";

const MAX_TOOL_OPTIONS_POPUP_WIDTH = 340;
const INITIAL_TOOL_OPTIONS_POPUP_HEIGHT = 100;
const TOOL_OPTIONS_POPUP_INSET = 6;
const TOOL_OPTIONS_POPUP_ANCHOR_GAP = 4;
const MIN_TOOL_CHOICES_FOR_PICKER = 2;
const TOOL_OPTIONS_CONTENT_CONTROLS =
  '[data-slot="control-flow-item"], [data-selected-tool-name], [role="toolbar"] > [data-slot="button"]';
const TOOL_OPTIONS_POPUP_INSETS = {
  left: TOOL_OPTIONS_POPUP_INSET,
  right: TOOL_OPTIONS_POPUP_INSET,
  top: TOOL_OPTIONS_POPUP_INSET,
  bottom: TOOL_OPTIONS_POPUP_INSET,
};

function useToolOptionsSize(content: RefObject<HTMLDivElement>, popover: AnchoredPopoverState) {
  const [size, setSize] = useState({
    width: MAX_TOOL_OPTIONS_POPUP_WIDTH,
    height: INITIAL_TOOL_OPTIONS_POPUP_HEIGHT,
    ready: false,
  });
  const scaleX = popover.viewport.width / popover.viewport.sceneWidth;
  const scaleY = popover.viewport.height / popover.viewport.sceneHeight;
  const maximumWidth = Math.min(MAX_TOOL_OPTIONS_POPUP_WIDTH, popover.availableWidth);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const rect = clientRect(node);
      let occupiedWidth = 0;
      for (const control of node.querySelectorAll<HTMLElement>(TOOL_OPTIONS_CONTENT_CONTROLS)) {
        const box = clientRect(control);
        if (!box.width || !box.height) continue;
        // Include intrinsic width so a scroll gutter cannot keep narrowing a wrapped control.
        const intrinsicWidth =
          Number.parseFloat(control.style.width) * clientScale(control).x || box.width;
        occupiedWidth = Math.max(occupiedWidth, box.right - rect.left, intrinsicWidth);
      }
      const viewport = node.closest<HTMLElement>("[data-ui-window-client]");
      const gutter = viewport
        ? Math.max(
            0,
            (layoutSize(viewport.parentElement)?.width ?? layoutSize(viewport).width) -
              layoutSize(viewport).width,
          ) * clientScale(viewport).x
        : 0;
      const padding = TOOL_OPTIONS_POPUP_INSET * 2;
      const next = {
        width: Math.min(maximumWidth, Math.ceil((occupiedWidth + gutter) / scaleX) + padding),
        height: Math.ceil(rect.height / scaleY) + padding,
        ready: true,
      };
      setSize((current) =>
        current.ready && current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = observeResize([node], schedule);

    const mutation = new MutationObserver(schedule);
    mutation.observe(node, { childList: true, subtree: true, attributes: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize();
      mutation.disconnect();
    };
    // Converge wrapped widths and scroll gutters before painting the opening position.
  }, [content, maximumWidth, scaleX, scaleY, size.width, size.height]);
  return size;
}

function ToolOptionsPopup({
  popover,
  panelRef,
  trigger,
  onClose,
  onToolSelect,
}: {
  popover: AnchoredPopoverState;
  panelRef: RefObject<HTMLDivElement>;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
  onToolSelect: ToolRailModel["setTool"];
}) {
  const { tool } = useToolRailModel();
  const { style: uiStyle } = useUi();
  const toolChoices =
    toolGroups
      .find((group) => group.tools.some((option) => option.value === tool))
      ?.tools.filter((option) => !option.disabled) ?? [];
  const selectedTool = toolGroups
    .flatMap((group) => group.tools)
    .find((option) => option.value === tool);
  const content = useRef<HTMLDivElement>(null);
  const contentSize = useToolOptionsSize(content, popover);
  const scaleX = popover.viewport.width / popover.viewport.sceneWidth;
  const scaleY = popover.viewport.height / popover.viewport.sceneHeight;
  const triggerRect = clientRect(trigger);
  const anchorLeft = triggerRect ? (triggerRect.left - popover.origin.x) / scaleX : popover.x;
  const anchorTop = triggerRect ? (triggerRect.top - popover.origin.y) / scaleY : popover.y;
  const anchorBottom = triggerRect ? (triggerRect.bottom - popover.origin.y) / scaleY : popover.y;
  const below = Math.max(0, popover.availableHeight - anchorBottom - TOOL_OPTIONS_POPUP_ANCHOR_GAP);
  const above = Math.max(0, anchorTop - TOOL_OPTIONS_POPUP_ANCHOR_GAP);
  const bounds = {
    x: 0,
    y: 0,
    width: Math.min(contentSize.width, popover.availableWidth),
    height: Math.min(contentSize.height, Math.max(above, below) || popover.availableHeight),
  };
  const left = Math.max(0, Math.min(anchorLeft, popover.availableWidth - bounds.width));
  const requestedTop =
    below >= contentSize.height || below >= above
      ? anchorBottom + TOOL_OPTIONS_POPUP_ANCHOR_GAP
      : anchorTop - TOOL_OPTIONS_POPUP_ANCHOR_GAP - bounds.height;
  const top = Math.max(0, Math.min(requestedTop, popover.availableHeight - bounds.height));
  return (
    <div
      ref={panelRef}
      style={{
        ...anchoredPopoverStyle(popover, { ...bounds, x: left, y: top }),
        visibility: contentSize.ready ? "visible" : "hidden",
      }}
    >
      <Popover
        open
        onOpenChange={(visible) => {
          if (!visible) onClose();
        }}
        label={selectedTool ? tUiSource(selectedTool.label) : tUiSource("Tool Options")}
        bounds={bounds}
        viewport={popover.viewport}
        sceneBounds={{ width: popover.availableWidth, height: popover.availableHeight }}
        clientInsets={TOOL_OPTIONS_POPUP_INSETS}
        showCloseButton={false}
        contentLayout={OverlayContentLayout.Flow}
        scrollX={false}
        scrollY
        closeOnOutsideClick={false}
        autoFocus={contentSize.ready}
      >
        <div ref={content} className={styles.options}>
          {selectedTool && (
            <div data-selected-tool-name className={styles.selectedTool}>
              <Text variant={TextVariant.Inline} scale={2} ink={uiStyle.colors.text}>
                {tUiSource(selectedTool.label)}
              </Text>
            </div>
          )}
          {toolChoices.length >= MIN_TOOL_CHOICES_FOR_PICKER && (
            <div role="toolbar" aria-label={tUi("ui.tools")} className={styles.tools}>
              {toolChoices.map((option) => (
                <Button
                  key={option.value}
                  variant={ButtonVariant.Tool}
                  icon={option.icon}
                  title={option.label}
                  aria-label={option.label}
                  selected={option.value === tool}
                  disabled={option.disabled}
                  onClick={() => onToolSelect(option.value as typeof tool)}
                />
              ))}
            </div>
          )}
          <EditorContextBar flow />
        </div>
      </Popover>
    </div>
  );
}

export function EditorToolRail() {
  const host = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(host);
  const { contextBarPresentation } = useEditorChromePreferences();
  const { tool, setTool } = useToolRailModel();
  const toolOptionsPopupEnabled = contextBarPresentation === WorkspaceContextPresentation.ToolPopup;
  const popupTool = useRef(tool);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);
  const { panelRef, popover, open, close } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >();
  useEffect(() => close(), [contextBarPresentation, close]);
  useEffect(() => {
    if (popover && popupTool.current !== tool) close();
  }, [tool, popover, close]);
  const bounds = {
    x: 0,
    y: 0,
    width: MAX_TOOL_OPTIONS_POPUP_WIDTH,
    height: INITIAL_TOOL_OPTIONS_POPUP_HEIGHT,
  };
  return (
    <div ref={host} style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}>
      <ToolRail
        layout={width >= height ? "row" : "column"}
        openToolOptions={toolOptionsPopupEnabled && popover ? tool : undefined}
        onActiveToolPress={
          toolOptionsPopupEnabled
            ? (trigger) => {
                if (popover && activeTrigger.current === trigger) close();
                else {
                  popupTool.current = tool;
                  activeTrigger.current = trigger;
                  open(bounds, trigger);
                }
              }
            : undefined
        }
      />
      {toolOptionsPopupEnabled &&
        popover &&
        createPortal(
          <ToolOptionsPopup
            popover={popover}
            panelRef={panelRef}
            trigger={activeTrigger.current}
            onClose={() => close(true)}
            onToolSelect={(nextTool) => {
              popupTool.current = nextTool;
              setTool(nextTool);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
