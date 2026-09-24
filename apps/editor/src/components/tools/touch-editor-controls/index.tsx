import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { PixelArtIcon, type PixelArtIconName } from "$/components/shared/pixel-art-icon";
import { useElementSize } from "$/components/shared/use-size";
import { useEditorActions } from "$/components/shell/editor-actions";
import { SymmetryControlMode } from "$/components/tools/symmetry-controls";
import { toolGroups } from "$/components/tools/tool-rail";
import { TouchShortcutButton } from "$/components/tools/touch-editor-controls/TouchShortcutButton";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import { useTouchInteractionPreferences } from "$/managers/input/input-interaction-context";
import { useTouchInputPreferences } from "$/managers/preferences/use-touch-input-preferences";
import { useToolRailModel } from "$/managers/tools/tool-rail-model";
import {
  touchToolCanConstrain,
  touchToolCanStartFromCenter,
  useTouchEditorCommands,
  useTouchEditorSnapshotModel,
} from "$/managers/tools/touch-control-model";
import { Button, ButtonVariant, Menu, MenuCheckType } from "@xprite/ui";
import { Tooltip, TooltipGroup, ButtonStripPopover, ButtonStripAnchor } from "@xprite/ui";
import type { UiPartName } from "@xprite/ui/assets";

import "$/components/tools/touch-editor-controls/touch-editor-controls.module.css";
import { layoutSize, borderSize, computedStyle, observeResize } from "@xprite/ui/utils";

const symmetryOptions = [
  {
    mode: SymmetryControlMode.Horizontal,
    label: "Toggle Horizontal Symmetry",
    icon: "horizontal_symmetry",
  },
  {
    mode: SymmetryControlMode.Vertical,
    label: "Toggle Vertical Symmetry",
    icon: "vertical_symmetry",
  },
  {
    mode: SymmetryControlMode.DiagonalPositive,
    label: "Toggle 45° Symmetry",
    icon: "right_diagonal_symmetry",
  },
  {
    mode: SymmetryControlMode.DiagonalNegative,
    label: "Toggle -45° Symmetry",
    icon: "left_diagonal_symmetry",
  },
] as const;

type TouchShortcutAction = {
  id: TouchShortcutId;
  label: string;
  onClick: () => void;
  icon?: UiPartName;
  pixelIcon?: PixelArtIconName;
  selected?: boolean;
  disabled?: boolean;
  repeat?: boolean;
};

enum TouchShortcutId {
  NewFile = "New File",
  SaveAs = "Save As",
  Export = "Export",
  Undo = "Undo",
  Redo = "Redo",
  Grid = "Grid",
  Symmetry = "Symmetry Options",
  Copy = "Copy",
  Cut = "Cut",
  Paste = "Paste",
  Delete = "Delete",
  Deselect = "Deselect",
  Apply = "Apply",
  Discard = "Discard Changes",
  NudgeLeft = "Move Selection Left",
  NudgeRight = "Move Selection Right",
  NudgeUp = "Move Selection Up",
  NudgeDown = "Move Selection Down",
  PreviousTool = "Previous Tool",
  Constrain = "Constrain",
  DuplicateDrag = "Duplicate Drag",
  FromCenter = "From Center",
  FitScreen = "Fit Screen",
  ZoomIn = "Zoom In",
  ZoomOut = "Zoom Out",
  Menu = "Menu",
  More = "More",
}

const TOUCH_SHORTCUT_BUTTON_HEIGHT = 32;
const TOUCH_SHORTCUT_ITEM_GAP = 0;
const TOUCH_SHORTCUT_SECTION_GAP = 7;
const fileShortcutIds = [TouchShortcutId.NewFile, TouchShortcutId.SaveAs, TouchShortcutId.Export];
const editShortcutIds = [TouchShortcutId.Undo, TouchShortcutId.Redo];
const viewShortcutIds = [TouchShortcutId.Grid, TouchShortcutId.Symmetry];
const actionShortcutIds = [
  TouchShortcutId.Copy,
  TouchShortcutId.Cut,
  TouchShortcutId.Paste,
  TouchShortcutId.Delete,
  TouchShortcutId.Deselect,
];
const completionShortcutIds = [TouchShortcutId.Apply, TouchShortcutId.Discard];
const selectionShortcutIds = [
  TouchShortcutId.NudgeLeft,
  TouchShortcutId.NudgeRight,
  TouchShortcutId.NudgeUp,
  TouchShortcutId.NudgeDown,
];
const drawingShortcutIds = [
  TouchShortcutId.PreviousTool,
  TouchShortcutId.Constrain,
  TouchShortcutId.DuplicateDrag,
  TouchShortcutId.FromCenter,
];
const viewCommandShortcutIds = [
  TouchShortcutId.FitScreen,
  TouchShortcutId.ZoomIn,
  TouchShortcutId.ZoomOut,
];
const shortcutGroups = [
  completionShortcutIds,
  editShortcutIds,
  fileShortcutIds,
  viewShortcutIds,
  actionShortcutIds,
  selectionShortcutIds,
  drawingShortcutIds,
  viewCommandShortcutIds,
];
const allShortcutIds = shortcutGroups.flat();

const dataTouchAction = (id: TouchShortcutId) => id.replace(/ /g, "");

/** Compact editor commands that follow the orientation of their dock or floating pane. */
export function TouchShortcutRail({
  menu,
  showShortcutToolbar = true,
}: {
  menu?: ReactNode;
  showShortcutToolbar?: boolean;
}) {
  useUiLanguage();
  const actions = useEditorActions();
  const state = useTouchEditorSnapshotModel();
  const touchPreferences = useTouchInteractionPreferences();
  const inputPreferences = useTouchInputPreferences();
  const tools = useToolRailModel();
  const previousToolIcon =
    toolGroups.flatMap((group) => group.tools).find((tool) => tool.value === tools.previousTool)
      ?.icon ?? "ani_previous";
  const {
    run,
    toggleGrid,
    setSymmetryEnabled,
    setSymmetryMode,
    clearSelectionPixels,
    deselect,
    nudge,
  } = useTouchEditorCommands();
  const rail = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const railSize = useElementSize(rail);
  const horizontal = railSize.width > railSize.height;
  const tooltipPlacement = horizontal ? "top" : "auto";
  const [symmetryMenuOpen, setSymmetryMenuOpen] = useState(false);
  const measuredButtonExtents = useRef(new Map<TouchShortcutId, number>());
  const shortcutActionsRef = useRef<TouchShortcutAction[]>([]);
  const [overflowedShortcutIds, setOverflowedShortcutIds] = useState<string[]>([]);
  useEffect(() => {
    if (!showShortcutToolbar || !state.hasDocument || !overflowedShortcutIds.length)
      setOverflowOpen(false);
  }, [overflowedShortcutIds.length, showShortcutToolbar, state.hasDocument, horizontal]);
  const setSymmetryOption = (mode: number) => {
    const currentMode = state.symmetryEnabled ? state.symmetryMode : 0;
    const nextMode = currentMode ^ mode;
    setSymmetryMode(nextMode);
    setSymmetryEnabled(nextMode !== 0);
  };
  const toggleSymmetry = () => {
    if (state.symmetryEnabled) {
      setSymmetryEnabled(false);
      return;
    }
    if (!state.symmetryMode) setSymmetryMode(SymmetryControlMode.Horizontal);
    setSymmetryEnabled(true);
  };
  const symmetryIcon =
    symmetryOptions.find(
      (option) => state.symmetryEnabled && Boolean(state.symmetryMode & option.mode),
    )?.icon ?? symmetryOptions[0].icon;
  const pending =
    state.floatingPaste || state.inlineText || state.selectionTransform || state.stagedDrawing;
  const canConstrain = touchToolCanConstrain(state.tool) || state.selectionTransform;
  const menuVisible = Boolean(menu);

  const shortcuts: TouchShortcutAction[] = [
    {
      id: TouchShortcutId.NewFile,
      label: TouchShortcutId.NewFile,
      onClick: () => actions?.new(),
      pixelIcon: "file-plus",
    },
    {
      id: TouchShortcutId.SaveAs,
      label: TouchShortcutId.SaveAs,
      onClick: () => actions?.saveAs(),
      icon: "icon_save",
      disabled: !actions?.canSave,
    },
    {
      id: TouchShortcutId.Export,
      label: TouchShortcutId.Export,
      onClick: () => actions?.exportFile(),
      pixelIcon: "export",
      disabled: !actions?.canSave || !actions?.canStartInteraction,
    },
    {
      id: TouchShortcutId.Undo,
      label: TouchShortcutId.Undo,
      onClick: () => run("undo"),
      repeat: true,
      pixelIcon: "undo",
      disabled: !state.canUndo && !state.floatingPaste && !state.inlineText,
    },
    {
      id: TouchShortcutId.Redo,
      label: TouchShortcutId.Redo,
      onClick: () => run("redo"),
      repeat: true,
      pixelIcon: "redo",
      disabled: !state.canRedo && !state.inlineText,
    },
    {
      id: TouchShortcutId.Grid,
      label: TouchShortcutId.Grid,
      onClick: toggleGrid,
      pixelIcon: "grid",
      selected: state.grid,
    },
    {
      id: TouchShortcutId.Symmetry,
      label: TouchShortcutId.Symmetry,
      onClick: toggleSymmetry,
      icon: symmetryIcon,
      selected: state.symmetryEnabled,
      disabled: !state.hasDocument,
    },
    ...(state.hasDocument
      ? ([
          {
            id: TouchShortcutId.Copy,
            label: TouchShortcutId.Copy,
            onClick: () => actions?.copy(),
            pixelIcon: "copy",
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(state.hasSelection
      ? ([
          {
            id: TouchShortcutId.Cut,
            label: TouchShortcutId.Cut,
            onClick: () => actions?.cut(),
            pixelIcon: "cut",
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(state.hasDocument
      ? ([
          {
            id: TouchShortcutId.Paste,
            label: TouchShortcutId.Paste,
            onClick: () => actions?.paste(),
            pixelIcon: "clipboard",
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(state.hasSelection
      ? ([
          {
            id: TouchShortcutId.Delete,
            label: TouchShortcutId.Delete,
            onClick: clearSelectionPixels,
            pixelIcon: "delete",
          },
          {
            id: TouchShortcutId.Deselect,
            label: TouchShortcutId.Deselect,
            onClick: deselect,
            pixelIcon: "section-x",
          },
        ] satisfies TouchShortcutAction[])
      : []),
    // Reserve completion slots before the first nudge so repeat targets stay put.
    ...(pending || state.hasSelection
      ? ([
          {
            id: TouchShortcutId.Apply,
            label: TouchShortcutId.Apply,
            onClick: () => run("finish-edit"),
            disabled: !pending || !state.canFinish,
            pixelIcon: "check",
          },
          {
            id: TouchShortcutId.Discard,
            label: TouchShortcutId.Discard,
            onClick: () => run("discard-edit"),
            disabled: !pending,
            pixelIcon: "cancel",
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(state.hasSelection
      ? ([
          {
            id: TouchShortcutId.NudgeLeft,
            label: TouchShortcutId.NudgeLeft,
            icon: "combobox_arrow_left",
            onClick: () => nudge(-1, 0),
            repeat: true,
            disabled: !state.canNudge,
          },
          {
            id: TouchShortcutId.NudgeRight,
            label: TouchShortcutId.NudgeRight,
            icon: "combobox_arrow_right",
            onClick: () => nudge(1, 0),
            repeat: true,
            disabled: !state.canNudge,
          },
          {
            id: TouchShortcutId.NudgeUp,
            label: TouchShortcutId.NudgeUp,
            icon: "combobox_arrow_up",
            onClick: () => nudge(0, -1),
            repeat: true,
            disabled: !state.canNudge,
          },
          {
            id: TouchShortcutId.NudgeDown,
            label: TouchShortcutId.NudgeDown,
            icon: "combobox_arrow_down",
            onClick: () => nudge(0, 1),
            repeat: true,
            disabled: !state.canNudge,
          },
        ] satisfies TouchShortcutAction[])
      : []),
    {
      id: TouchShortcutId.PreviousTool,
      label: TouchShortcutId.PreviousTool,
      icon: previousToolIcon,
      onClick: tools.switchToPreviousTool,
      disabled: !state.hasDocument || !tools.previousTool,
    },
    ...(canConstrain || state.hasSelection
      ? ([
          {
            id: TouchShortcutId.Constrain,
            label: TouchShortcutId.Constrain,
            onClick: () => touchPreferences.setTouchConstrain(!touchPreferences.touchConstrain),
            icon: "icon_aspect_ratio",
            selected: touchPreferences.touchConstrain,
            disabled: !canConstrain,
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(state.tool === "move" || state.selectionTransform || state.hasSelection
      ? ([
          {
            id: TouchShortcutId.DuplicateDrag,
            label: TouchShortcutId.DuplicateDrag,
            onClick: () => touchPreferences.setTouchDuplicate(!touchPreferences.touchDuplicate),
            pixelIcon: "section-copy",
            selected: touchPreferences.touchDuplicate,
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(touchToolCanStartFromCenter(state.tool)
      ? ([
          {
            id: TouchShortcutId.FromCenter,
            label: TouchShortcutId.FromCenter,
            onClick: () => touchPreferences.setTouchFromCenter(!touchPreferences.touchFromCenter),
            icon: "pivot_center",
            selected: touchPreferences.touchFromCenter,
          },
        ] satisfies TouchShortcutAction[])
      : []),
    ...(state.tool !== "zoom"
      ? ([
          {
            id: TouchShortcutId.FitScreen,
            label: TouchShortcutId.FitScreen,
            onClick: () => run("fit-screen"),
            pixelIcon: "frame",
          },
        ] satisfies TouchShortcutAction[])
      : []),
    {
      id: TouchShortcutId.ZoomIn,
      label: TouchShortcutId.ZoomIn,
      onClick: () => run("zoom-in"),
      pixelIcon: "zoom-in",
    },
    {
      id: TouchShortcutId.ZoomOut,
      label: TouchShortcutId.ZoomOut,
      onClick: () => run("zoom-out"),
      pixelIcon: "zoom-out",
    },
  ];

  shortcutActionsRef.current = shortcuts;
  const shortcutOrderKey = `${menuVisible ? "menu" : "no-menu"}|${shortcuts
    .map((shortcut) => shortcut.id)
    .join("|")}`;

  useLayoutEffect(() => {
    if (!showShortcutToolbar) {
      setOverflowedShortcutIds([]);
      return;
    }
    const railNode = rail.current;
    if (!railNode) return;

    let frame = 0;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const railExtent = horizontal ? layoutSize(railNode).width : layoutSize(railNode).height;
        if (railExtent === 0) return;
        const currentIds = shortcutActionsRef.current.map((shortcut) => shortcut.id);
        railNode.querySelectorAll<HTMLElement>("[data-touch-action]").forEach((button) => {
          const id = allShortcutIds.find(
            (shortcutId) => dataTouchAction(shortcutId) === button.dataset.touchAction,
          );
          if (id)
            measuredButtonExtents.current.set(
              id,
              horizontal ? borderSize(button).width : borderSize(button).height,
            );
          else if (button.dataset.touchAction === TouchShortcutId.Menu)
            measuredButtonExtents.current.set(
              TouchShortcutId.Menu,
              horizontal ? borderSize(button).width : borderSize(button).height,
            );
          else if (button.dataset.touchAction === TouchShortcutId.More)
            measuredButtonExtents.current.set(
              TouchShortcutId.More,
              horizontal ? borderSize(button).width : borderSize(button).height,
            );
        });

        const style = computedStyle(railNode);
        const pixels = (value: string) => Number.parseFloat(value) || 0;
        const availableExtent =
          railExtent -
          (horizontal
            ? pixels(style.paddingLeft) + pixels(style.paddingRight)
            : pixels(style.paddingTop) + pixels(style.paddingBottom));
        const group = railNode.querySelector<HTMLElement>(".xse-touch-shortcut-group");
        const itemGap =
          pixels(
            group
              ? horizontal
                ? computedStyle(group).columnGap
                : computedStyle(group).rowGap
              : "",
          ) || TOUCH_SHORTCUT_ITEM_GAP;
        const sectionGap =
          pixels(style.getPropertyValue("--xse-touch-rail-section-gap")) ||
          TOUCH_SHORTCUT_SECTION_GAP;
        const heightOf = (id: TouchShortcutId) =>
          measuredButtonExtents.current.get(id) ?? TOUCH_SHORTCUT_BUTTON_HEIGHT;
        const groupHeight = (ids: TouchShortcutId[]) =>
          ids.reduce((height, id) => height + heightOf(id), 0) +
          Math.max(0, ids.length - 1) * itemGap;
        const requiredHeight = (included: Set<TouchShortcutId>) => {
          const groups = [
            ...(menuVisible ? [[TouchShortcutId.Menu]] : []),
            ...shortcutGroups.map((ids) => ids.filter((id) => included.has(id))),
            ...(included.size < currentIds.length ? [[TouchShortcutId.More]] : []),
          ].filter((ids) => ids.length > 0);
          return groups.reduce(
            (height, ids) => height + (height ? sectionGap : 0) + groupHeight(ids),
            0,
          );
        };

        // Pending edit controls and history stay directly available. On an unusually
        // small dock, the rail scrolls rather than burying the only way to finish.
        const protectedIds = new Set<TouchShortcutId>([
          ...completionShortcutIds,
          ...editShortcutIds,
        ]);
        const included = new Set(currentIds);
        const overflowCandidates = [...currentIds].reverse().filter((id) => !protectedIds.has(id));
        for (const id of overflowCandidates) {
          if (requiredHeight(included) <= availableExtent) break;
          included.delete(id);
        }
        // Replacing a single action with More costs the same button slot and
        // adds an unnecessary step. Keep that action directly available.
        const lastHidden = currentIds.filter((id) => !included.has(id));
        if (lastHidden.length === 1) included.add(lastHidden[0]);
        const nextOverflow = currentIds.filter((id) => !included.has(id));
        setOverflowedShortcutIds((current) =>
          current.length === nextOverflow.length &&
          current.every((id, index) => id === nextOverflow[index])
            ? current
            : nextOverflow,
        );
      });
    };

    const stopResize = observeResize(
      [railNode, ...railNode.querySelectorAll<HTMLElement>("[data-touch-action]")],
      measure,
    );
    window.addEventListener("resize", measure);
    measure();
    return () => {
      stopResize();
      window.removeEventListener("resize", measure);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [horizontal, menuVisible, shortcutOrderKey, showShortcutToolbar]);

  const button = (
    shortcut: TouchShortcutAction,
    ref?: (node: HTMLButtonElement | null) => void,
    inOverflow = false,
  ) => (
    <Tooltip key={shortcut.id} text={shortcut.label} placement={tooltipPlacement}>
      <TouchShortcutButton
        onRepeat={shortcut.onClick}
        repeatEnabled={Boolean(shortcut.repeat) && inputPreferences.rapidHistoryEnabled}
        repeatDelay={inputPreferences.rapidHistoryDelayMs}
        variant={ButtonVariant.Tool}
        ref={ref}
        className={inOverflow ? undefined : "xse-touch-shortcut"}
        data-touch-action={dataTouchAction(shortcut.id)}
        aria-label={tUiSource(shortcut.label)}
        aria-pressed={shortcut.selected}
        label={shortcut.icon || shortcut.pixelIcon ? undefined : shortcut.label}
        icon={shortcut.icon}
        tintIcon={
          shortcut.id === TouchShortcutId.SaveAs || shortcut.id === TouchShortcutId.Constrain
        }
        leading={shortcut.pixelIcon ? <PixelArtIcon name={shortcut.pixelIcon} /> : undefined}
        labelScale={1.05}
        selected={shortcut.selected}
        disabled={shortcut.disabled}
        onClick={() => {
          shortcut.onClick();
          if (inOverflow && !shortcut.repeat) setOverflowOpen(false);
        }}
      />
    </Tooltip>
  );
  const includedShortcutIds = new Set(
    shortcuts.map((shortcut) => shortcut.id).filter((id) => !overflowedShortcutIds.includes(id)),
  );
  const renderShortcutGroup = (ids: readonly TouchShortcutId[]) =>
    ids
      .filter((id) => includedShortcutIds.has(id))
      .map((id) => {
        const shortcut = shortcuts.find((item) => item.id === id);
        if (!shortcut) return null;
        if (id !== TouchShortcutId.Symmetry) return button(shortcut);
        return (
          <Menu
            key={id}
            label={TouchShortcutId.Symmetry}
            expanded={symmetryMenuOpen}
            onExpandedChange={setSymmetryMenuOpen}
            items={symmetryOptions.map((option) => ({
              label: option.label,
              checked: state.symmetryEnabled && Boolean(state.symmetryMode & option.mode),
              checkType: MenuCheckType.Checkbox,
              onSelect: () => setSymmetryOption(option.mode),
            }))}
            renderTrigger={({ buttonRef, ...props }) => (
              <Tooltip
                text={TouchShortcutId.Symmetry}
                placement={tooltipPlacement}
                disabled={!!props["aria-expanded"]}
              >
                <Button
                  variant={ButtonVariant.Tool}
                  {...props}
                  ref={buttonRef}
                  className="xse-touch-shortcut"
                  data-touch-action={dataTouchAction(id)}
                  aria-label={tUi("ui.symmetry.options")}
                  aria-pressed={state.symmetryEnabled}
                  icon={symmetryIcon}
                  selected={state.symmetryEnabled}
                  disabled={shortcut.disabled}
                  onClick={(event) => {
                    if (!state.symmetryEnabled) toggleSymmetry();
                    else props.onClick?.(event);
                  }}
                />
              </Tooltip>
            )}
          />
        );
      });
  return (
    <>
      <TooltipGroup retainWarm={symmetryMenuOpen || overflowOpen}>
        <div
          ref={rail}
          className="xse-touch-shortcut-rail"
          data-layout={horizontal ? "row" : "column"}
          role="toolbar"
          aria-label={tUi("ui.shortcuts")}
        >
          {menu && <div className="xse-touch-shortcut-group">{menu}</div>}
          {showShortcutToolbar &&
            shortcutGroups.map((ids, index) =>
              ids.some((id) => includedShortcutIds.has(id)) ? (
                <div className="xse-touch-shortcut-group" key={index}>
                  {renderShortcutGroup(ids)}
                </div>
              ) : null,
            )}
          {showShortcutToolbar && overflowedShortcutIds.length > 0 && (
            <div className="xse-touch-shortcut-group">
              <Tooltip
                text={TouchShortcutId.More}
                placement={tooltipPlacement}
                disabled={overflowOpen}
              >
                <Button
                  variant={ButtonVariant.Tool}
                  ref={moreButton}
                  className="xse-touch-shortcut"
                  data-touch-action={TouchShortcutId.More}
                  aria-label={tUiSource("More")}
                  aria-expanded={overflowOpen}
                  leading={<PixelArtIcon name="more-vertical" />}
                  selected={overflowOpen}
                  onClick={() => setOverflowOpen((value) => !value)}
                />
              </Tooltip>
            </div>
          )}
        </div>
      </TooltipGroup>
      <ButtonStripPopover
        open={overflowOpen}
        onOpenChange={setOverflowOpen}
        anchorRef={moreButton}
        placement={horizontal ? ButtonStripAnchor.Below : ButtonStripAnchor.Side}
        count={overflowedShortcutIds.length}
        label={tUiSource("More")}
      >
        {shortcuts
          .filter((shortcut) => overflowedShortcutIds.includes(shortcut.id))
          .map((shortcut) => button(shortcut, undefined, true))}
      </ButtonStripPopover>
    </>
  );
}
