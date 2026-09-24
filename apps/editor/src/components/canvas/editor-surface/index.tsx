import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { EditorLayoutProvider } from "$/components/shared/editor-layout-context";
import {
  EditorWorkflowBoundaryProvider,
  useEditorWorkflowBoundaryHost,
} from "$/components/shared/editor-workflow-boundary";
import { InputModeNotice } from "$/components/shell/input-mode-notice";
import { useCanvasManager, stepAsepriteZoom } from "$/managers/canvas/canvas-manager";
import {
  chooseShortcutTool,
  resolveShortcut,
  type CoreTool,
} from "$/managers/canvas/canvas-presentation";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import {
  InputInteractionProvider,
  type InputInteractionMode,
} from "$/managers/input/input-interaction-context";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { useEditorLayoutPreferences } from "$/managers/shell/layout-preferences";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import {
  WORKSPACE_BAR_GAP,
  WORKSPACE_WINDOW_GAP,
} from "$/managers/workspace/workspace-panel-geometry";
import { workspaceLayoutConfigurationForPreset } from "$/managers/workspace/workspace-panel-layout";
import type {
  WorkspaceLayoutConfiguration,
  WorkspaceLayoutMode,
  WorkspaceLayoutPresetId,
} from "$/managers/workspace/workspace-panel-layout";
import { CanvasScaleProvider, ScrollArea, useUi } from "@xprite/ui";
import { uiMetrics } from "@xprite/ui/assets";
import { UI_SCALE } from "@xprite/ui/canvas";
import { cursorScopeClassName, cursorScopeStyle } from "@xprite/ui/cursor";

import "$/components/canvas/editor-surface/editor-surface.module.css";
import { layoutSize, observeResize } from "@xprite/ui/utils";

const UI_COMPACT_WIDTH_THRESHOLD = 768; // CSS px; UI density is independent of workspace layout.
const WIDE_LAYOUT_MIN_ASPECT_RATIO = 1.2;
const COMPACT_EDITOR_HORIZONTAL_INSET = 2;
const WIDE_EDITOR_HORIZONTAL_INSET = 4;
const ZOOM_PERCENT_SCALE = 100;

function automaticWorkspaceLayoutPreset(width: number, height: number): WorkspaceLayoutPresetId {
  return width > 0 && height > 0 && width / height >= WIDE_LAYOUT_MIN_ASPECT_RATIO
    ? "wide"
    : "compact";
}

function initialInteractionMode(): InputInteractionMode {
  if (typeof navigator === "undefined") return "pointer";
  const coarsePointer =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return navigator.maxTouchPoints > 0 || coarsePointer ? "touch" : "pointer";
}

export function EditorSurface({
  children,
  label = "Pixel editor",
}: {
  children: ReactNode;
  label?: string;
}) {
  const editor = useEditorFields([
    "addFrame",
    "frameCount",
    "functional",
    "setBrushSize",
    "setFrame",
    "setPlaying",
    "setTimelineVisible",
    "setTool",
    "setZoom",
    "stepPaletteColor",
    "tab",
    "timelineVisible",
    "tool",
  ]);
  const shortcuts = useShortcutManager();
  const workflowHost = useEditorWorkflowBoundaryHost();
  const canvasManager = useCanvasManager(false);
  const visibleShapeTool = useRef<CoreTool>("rectangle");
  if (["rectangle", "filled_rectangle", "ellipse", "filled_ellipse"].includes(editor.tool))
    visibleShapeTool.current = editor.tool as CoreTool;
  const { style } = useUi();
  const metrics = uiMetrics(style);
  const preferences = useEditorLayoutPreferences();
  const chromePreferences = useEditorChromePreferences();
  const uiElementScale = chromePreferences.uiElementScale;
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const measured = size.width > 0 && size.height > 0;
  const [inputInteractionMode, setInputInteractionMode] = useState(initialInteractionMode);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const resize = () => {
      const width = layoutSize(host).width;
      const height = layoutSize(host).height;
      if (width <= 0 || height <= 0) return;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    resize();
    const observer = observeResize([host], resize);

    return () => {
      observer();
    };
  }, []);
  useEffect(() => {
    const updateMode = (event: PointerEvent) => {
      const mode =
        event.pointerType === "touch" ? "touch" : event.pointerType === "mouse" ? "pointer" : null;
      if (mode) setInputInteractionMode(mode);
    };
    document.addEventListener("pointerdown", updateMode, true);
    return () => document.removeEventListener("pointerdown", updateMode, true);
  }, []);
  const layoutWidth = size.width / uiElementScale;
  const layoutHeight = size.height / uiElementScale;
  const autoLayoutPreset = automaticWorkspaceLayoutPreset(layoutWidth, layoutHeight);
  const [workspaceLayoutSelection, setWorkspaceLayoutSelection] = useState(() =>
    preferences.readWorkspacePanelLayoutSelection(),
  );
  const baseWorkspaceLayoutConfiguration = useMemo(
    () =>
      workspaceLayoutSelection.mode === "auto"
        ? workspaceLayoutConfigurationForPreset(autoLayoutPreset)
        : workspaceLayoutSelection.mode === "saved"
          ? (workspaceLayoutSelection.configuration ??
            workspaceLayoutConfigurationForPreset("compact"))
          : workspaceLayoutConfigurationForPreset(workspaceLayoutSelection.mode),
    [autoLayoutPreset, workspaceLayoutSelection],
  );
  const workspaceChromeKey =
    workspaceLayoutSelection.mode === "saved"
      ? `saved:${workspaceLayoutSelection.savedLayoutId}`
      : workspaceLayoutSelection.mode === "auto"
        ? autoLayoutPreset
        : workspaceLayoutSelection.mode;
  useLayoutEffect(() => {
    chromePreferences.activateWorkspaceLayout(
      workspaceChromeKey,
      baseWorkspaceLayoutConfiguration.chrome,
    );
  }, [
    workspaceChromeKey,
    baseWorkspaceLayoutConfiguration,
    chromePreferences.activateWorkspaceLayout,
  ]);
  const activeWorkspaceLayoutConfiguration = useMemo(
    () => ({
      ...baseWorkspaceLayoutConfiguration,
      chrome: {
        ...baseWorkspaceLayoutConfiguration.chrome,
        showEditorMenuBar: chromePreferences.showEditorMenuBar,
        showShortcutToolbar: chromePreferences.showShortcutToolbar,
        showCanvasScrollbars: chromePreferences.showCanvasScrollbars,
        contextBarPresentation: chromePreferences.contextBarPresentation,
      },
    }),
    [
      baseWorkspaceLayoutConfiguration,
      chromePreferences.showEditorMenuBar,
      chromePreferences.showShortcutToolbar,
      chromePreferences.showCanvasScrollbars,
      chromePreferences.contextBarPresentation,
    ],
  );
  const setWorkspaceLayoutMode = useCallback(
    (
      mode: WorkspaceLayoutMode,
      configuration?: WorkspaceLayoutConfiguration,
      savedLayoutId?: string,
    ): WorkspaceLayoutConfiguration => {
      const nextConfiguration =
        configuration ??
        (mode === "saved"
          ? activeWorkspaceLayoutConfiguration
          : workspaceLayoutConfigurationForPreset(mode === "auto" ? autoLayoutPreset : mode));
      const key =
        mode === "saved" ? `saved:${savedLayoutId}` : mode === "auto" ? autoLayoutPreset : mode;
      const nextChrome = chromePreferences.activateWorkspaceLayout(
        key,
        nextConfiguration.chrome,
        mode === "saved",
      );
      setWorkspaceLayoutSelection((current) => {
        const next = {
          mode,
          ...(mode === "saved" ? { savedLayoutId, configuration: nextConfiguration } : {}),
        };
        return current.mode === next.mode &&
          current.configuration === next.configuration &&
          current.savedLayoutId === next.savedLayoutId
          ? current
          : next;
      });
      return { ...nextConfiguration, chrome: { ...nextConfiguration.chrome, ...nextChrome } };
    },
    [
      activeWorkspaceLayoutConfiguration,
      autoLayoutPreset,
      chromePreferences.activateWorkspaceLayout,
    ],
  );
  useEffect(() => {
    preferences.writeWorkspacePanelLayoutSelection(workspaceLayoutSelection);
  }, [preferences, workspaceLayoutSelection]);
  const compact = layoutWidth < UI_COMPACT_WIDTH_THRESHOLD;
  const horizontalInset =
    editor.tab === "home"
      ? 0
      : compact
        ? COMPACT_EDITOR_HORIZONTAL_INSET
        : WIDE_EDITOR_HORIZONTAL_INSET;
  return (
    <div
      className="xse-safe-area"
      style={
        {
          "--xse-safe-area-chrome": style.colors.window_face,
          "--xse-safe-area-workspace": style.colors.workspace,
        } as CSSProperties
      }
    >
      <ScrollArea
        viewportRef={hostRef}
        className={`${cursorScopeClassName} xse-root xse-global`}
        style={cursorScopeStyle({
          native: canvasManager.cursorPreferences.useNativeCursor,
          scale: canvasManager.cursorPreferences.cursorScale,
        })}
        contentStyle={{ height: "100%" }}
        // Suppress the browser menu after child controls have handled their own
        // context actions, including controls rendered through React portals.
        onContextMenu={(event) => event.preventDefault()}
      >
        <section
          {...workflowHost.props}
          data-slot="editor-window"
          data-ui-scene="true"
          data-ui-element-scale={uiElementScale}
          className="xse-editor-window"
          style={
            {
              width: "100%",
              height: "100%",
              zoom: uiElementScale,
              "--xse-ui-scale": UI_SCALE,
              "--xse-editor-horizontal-inset": `${horizontalInset}px`,
              "--xse-window-tooltip-face": style.colors.tooltip_face,
              "--xse-window-tooltip-text": style.colors.tooltip_text,
              "--xse-window-menuitem-normal-face": style.colors.menuitem_normal_face,
              "--xse-window-menuitem-normal-text": style.colors.menuitem_normal_text,
              "--xse-window-menuitem-hot-face": style.colors.menuitem_hot_face,
              "--xse-window-menuitem-hot-text": style.colors.menuitem_hot_text,
              "--xse-context-height": `${metrics.toolHeight * UI_SCALE}px`,
              "--xse-workspace-bar-thickness": `${metrics.toolHeight * UI_SCALE}px`,
              "--xse-workspace-bar-gap": `${WORKSPACE_BAR_GAP}px`,
              "--xse-workspace-window-gap": `${WORKSPACE_WINDOW_GAP}px`,
              "--xse-timeline-row": `${metrics.timelineRowHeight * UI_SCALE}px`,
              "--xse-tool-pitch": `${metrics.toolPitch * UI_SCALE}px`,
              "--xse-workspace-column-gap": `${activeWorkspaceLayoutConfiguration.surface.workspaceColumnGap}px`,
              "--xse-workspace-overflow":
                activeWorkspaceLayoutConfiguration.surface.workspaceOverflow,
              "--xse-document-dock-trailing-margin": `${activeWorkspaceLayoutConfiguration.surface.documentDockTrailingMargin}px`,
              "--xse-side-timeline-direction":
                activeWorkspaceLayoutConfiguration.surface.sideTimelineDirection,
              "--xse-workspace-panel-tab-height": `${activeWorkspaceLayoutConfiguration.surface.panelTabHeight}px`,
            } as CSSProperties
          }
          data-client-layout="intrinsic"
          data-ui-appearance={canvasManager.snapshot?.view.appearance ?? "light"}
          data-timeline-visible={editor.timelineVisible}
          data-ui-compact={compact ? "true" : "false"}
          data-ui-input-mode={inputInteractionMode}
          data-workspace-panel-arrangement={
            activeWorkspaceLayoutConfiguration.panelLayout.defaultArrangement
          }
          data-workspace-tabs-adjacent={
            activeWorkspaceLayoutConfiguration.chrome.tabsAdjacentToMenu ? "true" : "false"
          }
          data-home-file-content-height={activeWorkspaceLayoutConfiguration.home.contentHeight}
          data-workspace-recovery-layout={activeWorkspaceLayoutConfiguration.recovery.toolbarLayout}
          aria-label={label}
          tabIndex={0}
          onKeyDown={(event) => {
            if (editor.functional) return;
            if (
              event.target instanceof HTMLElement &&
              (event.target.matches("input, textarea, select") || event.target.isContentEditable)
            )
              return;
            if (
              event.defaultPrevented ||
              (event.target instanceof HTMLElement &&
                event.target.closest('[role="menu"], [role="dialog"], dialog'))
            )
              return;
            if (
              (event.key === " " || event.key === "Enter") &&
              event.target instanceof HTMLElement &&
              event.target.closest(
                'button, [role="button"], [role="checkbox"], [role="tab"], [role="option"]',
              )
            )
              return;
            const input = {
              key: event.key,
              ctrl: event.ctrlKey,
              meta: event.metaKey,
              alt: event.altKey,
              shift: event.shiftKey,
            };
            const command = shortcuts?.resolve(input, resolveShortcut(input));
            if (!command) return;
            if (
              command.type === "toggle-timeline" &&
              event.key === "Tab" &&
              event.target !== event.currentTarget &&
              !(
                event.target instanceof HTMLElement &&
                event.target.classList.contains("xse-viewport")
              )
            )
              return;
            if (command?.type === "tool") {
              event.preventDefault();
              editor.setTool(
                chooseShortcutTool(
                  command.tools ?? [command.tool],
                  editor.tool as CoreTool,
                  visibleShapeTool.current,
                ),
              );
            } else if (command.type === "commit") {
              event.preventDefault();
              editor.setPlaying((playing) => !playing);
            } else if (command.type === "brush-grow" || command.type === "brush-shrink") {
              event.preventDefault();
              editor.setBrushSize((brush) => brush + (command.type === "brush-grow" ? 1 : -1));
            } else if (command.type === "palette-next" || command.type === "palette-previous") {
              event.preventDefault();
              editor.stepPaletteColor("foreground", command.type === "palette-next" ? 1 : -1);
            } else if (command.type === "zoom-in" || command.type === "zoom-out") {
              event.preventDefault();
              editor.setZoom((zoom) => stepAsepriteZoom(zoom, command.type === "zoom-in" ? 1 : -1));
            } else if (command.type === "zoom-to") {
              event.preventDefault();
              editor.setZoom(command.zoom * ZOOM_PERCENT_SCALE);
            } else if (command.type === "toggle-timeline") {
              event.preventDefault();
              editor.setTimelineVisible((visible) => !visible);
            } else if (command.type === "new-frame") {
              event.preventDefault();
              editor.addFrame();
            } else if (command.type === "move-selection" && command.dx && !command.dy) {
              event.preventDefault();
              editor.setFrame((frame) =>
                Math.max(1, Math.min(editor.frameCount, frame + Math.sign(command.dx))),
              );
            }
          }}
        >
          <EditorLayoutProvider
            width={layoutWidth}
            height={layoutHeight}
            workspaceLayoutSelection={workspaceLayoutSelection}
            workspaceLayoutConfiguration={activeWorkspaceLayoutConfiguration}
            onWorkspaceLayoutModeChange={setWorkspaceLayoutMode}
          >
            <EditorWorkflowBoundaryProvider value={workflowHost.boundary}>
              <InputInteractionProvider mode={inputInteractionMode}>
                <CanvasScaleProvider scale={uiElementScale}>
                  {measured ? children : null}
                </CanvasScaleProvider>
              </InputInteractionProvider>
            </EditorWorkflowBoundaryProvider>
          </EditorLayoutProvider>
          <InputModeNotice />
        </section>
      </ScrollArea>
    </div>
  );
}
