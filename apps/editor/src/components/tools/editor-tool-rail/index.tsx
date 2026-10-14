import { useEffect, useRef, type RefObject } from "react";

import { EditorContextBar } from "$/components/tools/editor-context-bar";
import { ToolRail, toolGroups } from "$/components/tools/tool-rail";
import { tUi, tUiSource } from "$/i18n";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { useToolRailModel, type ToolRailModel } from "$/managers/tools/tool-rail-model";
import { WorkspaceContextPresentation } from "$/managers/workspace/workspace-panel-layout";
import {
  createUiPortal,
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
  placeAnchoredPopover,
  usePopoverContentSize,
  useAnchoredPopover,
  type AnchoredPopoverState,
} from "@xprite/ui/popover";
import { useElementSize, clientRect } from "@xprite/ui/utils";

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
  const contentSize = usePopoverContentSize(content, popover, {
    maximumWidth: MAX_TOOL_OPTIONS_POPUP_WIDTH,
    initialHeight: INITIAL_TOOL_OPTIONS_POPUP_HEIGHT,
    inset: TOOL_OPTIONS_POPUP_INSET,
    items: TOOL_OPTIONS_CONTENT_CONTROLS,
  });
  const scaleX = popover.viewport.width / popover.viewport.sceneWidth;
  const scaleY = popover.viewport.height / popover.viewport.sceneHeight;
  const triggerRect = clientRect(trigger);
  const anchorLeft = triggerRect ? (triggerRect.left - popover.origin.x) / scaleX : popover.x;
  const anchorTop = triggerRect ? (triggerRect.top - popover.origin.y) / scaleY : popover.y;
  const anchorBottom = triggerRect ? (triggerRect.bottom - popover.origin.y) / scaleY : popover.y;
  const placed = placeAnchoredPopover(
    { x: anchorLeft, y: anchorTop, width: 0, height: anchorBottom - anchorTop },
    contentSize,
    { width: popover.availableWidth, height: popover.availableHeight },
    { gap: TOOL_OPTIONS_POPUP_ANCHOR_GAP, fitHeight: true },
  );
  const bounds = { ...placed, x: 0, y: 0 };
  return (
    <div
      ref={panelRef}
      style={{
        ...anchoredPopoverStyle(popover, placed),
        visibility: contentSize.ready ? "visible" : "hidden",
      }}
    >
      <Popover
        open
        onOpenChange={(visible) => {
          if (!visible) onClose();
        }}
        label={selectedTool ? tUiSource(selectedTool.label) : tUi("ui.tool.options")}
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
        createUiPortal(
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
