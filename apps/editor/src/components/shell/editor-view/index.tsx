import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { EditorViewport } from "$/components/canvas/editor-viewport";
import {
  DocumentFeatureActionsProvider,
  DocumentFeatureDialogs,
} from "$/components/dialogs/document-feature-dialogs";
import { EffectActionsProvider, EffectDialogsHost } from "$/components/dialogs/effect-actions";
import { GridActionsProvider, GridSettingsHost } from "$/components/dialogs/grid-settings";
import { EditorTileset } from "$/components/inspector/editor-tileset";
import { EditorColorbar } from "$/components/palette/editor-colorbar";
import { EditorPalette } from "$/components/palette/editor-palette";
import {
  MAX_COLORBAR_WIDTH,
  MIN_COLORBAR_WIDTH,
  useEditorLayout,
} from "$/components/shared/editor-layout-context";
import { useEditorActions } from "$/components/shell/editor-actions";
import { EditorMenubar } from "$/components/shell/editor-menubar";
import { EditorStatusbar } from "$/components/shell/editor-statusbar-host";
import { EditorWorkflows } from "$/components/shell/editor-workflows";
import {
  AnimationActionsProvider,
  AnimationDialogsHost,
} from "$/components/timeline/animation-actions";
import { TimelineView } from "$/components/timeline/editor-timeline";
import {
  LayerCommandActionsProvider,
  LayerCommandHost,
} from "$/components/timeline/layer-command-actions";
import { TimelineActionsProvider } from "$/components/timeline/timeline-actions";
import { TimelineDialogs } from "$/components/timeline/timeline-dialogs";
import { ColorProfileProvider } from "$/components/tools/color-profile";
import { EditorContextBar } from "$/components/tools/editor-context-bar";
import { EditorToolRail } from "$/components/tools/editor-tool-rail";
import {
  SelectionActionsProvider,
  SelectionDialogsHost,
} from "$/components/tools/selection-actions";
import { TouchShortcutRail } from "$/components/tools/touch-editor-controls";
import { EditorDocumentTabs } from "$/components/workspace/editor-document-tabs-host";
import { EditorHomeView } from "$/components/workspace/home-view";
import { EditorRecoveryView } from "$/components/workspace/recovery-view";
import { UserGuideView } from "$/components/workspace/user-guide-view";
import {
  WorkspacePanelDock,
  type WorkspacePanelId,
} from "$/components/workspace/workspace-panel-dock";
import { useUiLanguage, tUi } from "$/i18n";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { useTilesetInspectorView } from "$/managers/inspector/tileset-view";
import { readDefaultPalette } from "$/managers/palette/presets";
import type { AppearanceMode } from "$/managers/preferences/appearance-preferences";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { useEditorDocumentView } from "$/managers/shell/editor-document-view";
import { HelpDocumentTab } from "$/managers/shell/help";
import { useEditorLocation } from "$/managers/shell/use-editor-location";
import { DockEdge } from "$/managers/workspace/dock-edge";
import {
  type WorkspaceDockNode,
  type WorkspacePaneSnapshot,
} from "$/managers/workspace/document-workspace";
import { EditorDocumentPane } from "$/managers/workspace/editor-document-pane";
import { WORKSPACE_WINDOW_GAP } from "$/managers/workspace/workspace-panel-geometry";
import { useWorkspaceResizeScheduler } from "$/managers/workspace/workspace-resize-scheduler";
import xpritePreview from "$assets/examples/xprite/xprite-preview.webp";
import { ScrollArea, Splitter, type TabDragPoint } from "@xprite/ui";

import "$/components/shell/editor-view/workspace-docking.module.css";
import {
  hitElement,
  layoutSize,
  clientRect,
  PointerDragAxis,
  PointerResizeGesture,
} from "@xprite/ui/utils";

const APP_NAME = "Xprite";
type WorkspaceTabDropPreview = {
  paneId: string;
  kind: "split" | "merge";
  rect: { left: number; top: number; width: number; height: number };
};

const removePaneForPreview = (
  node: WorkspaceDockNode,
  paneId: string,
): WorkspaceDockNode | null => {
  if (node.kind === "pane") return node.id === paneId ? null : node;
  const first = removePaneForPreview(node.first, paneId);
  const second = removePaneForPreview(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
};

const workspacePaneRect = (
  node: WorkspaceDockNode,
  paneId: string,
  rect: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } | null => {
  if (node.kind === "pane") return node.id === paneId ? rect : null;
  const horizontal = node.axis === "horizontal";
  const extent = horizontal ? rect.width : rect.height;
  const available = Math.max(0, extent - 4);
  const firstSize = available * node.ratio;
  const first = horizontal ? { ...rect, width: firstSize } : { ...rect, height: firstSize };
  const second = horizontal
    ? { ...rect, left: rect.left + firstSize + 4, width: available - firstSize }
    : { ...rect, top: rect.top + firstSize + 4, height: available - firstSize };
  return (
    workspacePaneRect(node.first, paneId, first) ?? workspacePaneRect(node.second, paneId, second)
  );
};

const documentSplitPreviewRect = (
  tree: WorkspaceDockNode,
  panes: readonly WorkspacePaneSnapshot[],
  sourcePaneId: string,
  documentId: string,
  targetPaneId: string,
  edge: DockEdge,
  width: number,
  height: number,
) => {
  const source = panes.find((pane) => pane.id === sourcePaneId && pane.tabs.includes(documentId));
  if (sourcePaneId === targetPaneId && (source?.tabs.length ?? 0) < 2) return null;
  const candidateTree =
    sourcePaneId !== targetPaneId && source?.tabs.length === 1
      ? (removePaneForPreview(tree, sourcePaneId) ?? tree)
      : tree;
  const target = workspacePaneRect(candidateTree, targetPaneId, {
    left: 0,
    top: 0,
    width,
    height,
  });
  if (!target) return null;
  const horizontal = edge === DockEdge.Left || edge === DockEdge.Right;
  const before = edge === DockEdge.Left || edge === DockEdge.Top;
  const extent = horizontal ? target.width : target.height;
  const available = Math.max(0, extent - 4);
  const newPaneRatio = targetPaneId === "main" ? 0.3 : 0.5;
  const firstRatio = before ? newPaneRatio : 1 - newPaneRatio;
  const firstSize = available * firstRatio;
  const newPaneSize = before ? firstSize : available - firstSize;
  return horizontal
    ? {
        left: before ? target.left : target.left + firstSize + 4,
        top: target.top,
        width: newPaneSize,
        height: target.height,
      }
    : {
        left: target.left,
        top: before ? target.top : target.top + firstSize + 4,
        width: target.width,
        height: newPaneSize,
      };
};

const workspacePaneById = (paneId: string) =>
  [...document.querySelectorAll<HTMLElement>("[data-workspace-pane-id]")].find(
    (pane) => pane.dataset.workspacePaneId === paneId,
  );

/** Shared view tree composes the workspace and Home page inside app-owned runtime contexts. */
export function EditorView({
  appearanceMode,
  onAppearanceModeChange,
  persistAppearanceMode,
}: {
  home?: boolean;
  appearanceMode: AppearanceMode;
  onAppearanceModeChange: (mode: AppearanceMode) => void;
  persistAppearanceMode: (mode: AppearanceMode) => void;
}) {
  return (
    <GridActionsProvider>
      <AnimationActionsProvider>
        <EffectActionsProvider>
          <LayerCommandActionsProvider>
            <SelectionActionsProvider>
              <DocumentFeatureActionsProvider>
                <TimelineActionsProvider>
                  <EditorWorkflows
                    appearanceMode={appearanceMode}
                    onAppearanceModeChange={onAppearanceModeChange}
                    persistAppearanceMode={persistAppearanceMode}
                  >
                    <DocumentScene />
                  </EditorWorkflows>
                </TimelineActionsProvider>
              </DocumentFeatureActionsProvider>
            </SelectionActionsProvider>
          </LayerCommandActionsProvider>
        </EffectActionsProvider>
      </AnimationActionsProvider>
    </GridActionsProvider>
  );
}
function DocumentScene() {
  const language = useUiLanguage();
  const editor = useEditorFields([
    "openTab",
    "openTabs",
    "previewVisible",
    "setNotice",
    "setPreviewVisible",
    "setTimelineInteractionPreferences",
    "setTimelinePanelPreferences",
    "setTimelinePanelPreferencesAsDefaults",
    "setTimelinePosition",
    "tab",
    "timelineInteractionPreferences",
    "timelinePanelPreferences",
    "timelinePosition",
    "timelineVisible",
  ]);
  const chromePreferences = useEditorChromePreferences();
  const { document: activeDocument, dirty } = useEditorDocumentView();
  useEffect(() => {
    document.title = activeDocument
      ? `${activeDocument.name} | ${APP_NAME}`
      : tUi("ui.online.pixel.art.editor.animation.tool", { value1: APP_NAME });
  }, [activeDocument?.name, language]);
  const { hasTileset } = useTilesetInspectorView();
  const {
    width: editorWidth,
    colorbarWidth,
    colorbarSplitPosition,
    setColorbarWidth,
    setColorbarSplitPosition,
    workspaceLayoutConfiguration,
  } = useEditorLayout();
  const compactWorkspaceLayout =
    workspaceLayoutConfiguration.panelLayout.defaultArrangement === "stacked";
  const shortcutPanelVisible = chromePreferences.showShortcutToolbar;
  useEditorLocation(editor.tab, editor.openTab);
  const actions = useEditorActions()!;
  const name = activeDocument?.name ?? "Untitled";
  const [dropPreview, setDropPreview] = useState<WorkspaceTabDropPreview | null>(null);
  const [workspaceLayoutOpen, setWorkspaceLayoutOpen] = useState(false);
  const rootPaneId = actions.workspaceRootPaneId;
  const rootPane =
    actions.workspacePanes.find((pane) => pane.id === rootPaneId) ?? actions.workspacePanes[0];
  const documentMode = editor.tab === "document" && !actions.recoveryOpen;
  const guideSelected = editor.tab === HelpDocumentTab.Guide;
  const isHomePage = editor.tab === "home" || actions.recoveryOpen;
  const documentMenuToggle = !chromePreferences.showEditorMenuBar ? (
    <EditorMenubar presentation="rail" />
  ) : undefined;
  const workspaceLayoutAvailable = documentMode;
  const showStatusbar = documentMode;
  useEffect(() => {
    if (!workspaceLayoutAvailable) setWorkspaceLayoutOpen(false);
  }, [workspaceLayoutAvailable]);
  const edgeAt = (x: number, y: number): { paneId: string; edge: DockEdge } | null => {
    for (const node of document.querySelectorAll<HTMLElement>("[data-workspace-pane-id]")) {
      const paneId = node.dataset.workspacePaneId;
      const content = node.querySelector<HTMLElement>(".xse-workspace-pane-content");
      const rect = clientRect(content);
      if (!rect) continue;
      if (!paneId || x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue;
      const left = x - rect.left,
        top = y - rect.top,
        right = rect.right - x,
        bottom = rect.bottom - y;
      const threshold = Math.min(32, rect.width / 2, rect.height / 2);
      if (left < threshold && left < right && left < top && left < bottom)
        return { paneId, edge: DockEdge.Left };
      if (top < threshold && top < left && top < right && top < bottom)
        return { paneId, edge: DockEdge.Top };
      if (right < threshold && right < left && right < top && right < bottom)
        return { paneId, edge: DockEdge.Right };
      if (bottom < threshold && bottom < left && bottom < right && bottom < top)
        return { paneId, edge: DockEdge.Bottom };
      return null;
    }
    return null;
  };
  const onTabDragMove = (sourcePaneId: string) => (id: string, point: TabDragPoint) => {
    if (!documentMode || !actions.documentTabs.some((tab) => tab.id === id) || !point.floating) {
      setDropPreview((current) => (current ? null : current));
      return;
    }
    const target = hitElement({ x: point.x, y: point.y }, document);
    const targetStrip =
      target instanceof Element
        ? target.closest<HTMLElement>(".xse-document-tabs[data-ui-tab-pane]")
        : null;
    const stripPaneId = targetStrip?.dataset.uiTabPane;
    const viewportTree = document.querySelector<HTMLElement>(".xse-workspace-viewport-tree");
    const viewportRect = clientRect(viewportTree);
    let next: WorkspaceTabDropPreview | null = null;
    if (stripPaneId && stripPaneId !== sourcePaneId && viewportRect) {
      const mergePane = workspacePaneById(stripPaneId);
      if (mergePane) {
        const rect = clientRect(mergePane);
        next = {
          paneId: stripPaneId,
          kind: "merge",
          rect: {
            left: (rect.left - viewportRect.left) / chromePreferences.uiElementScale,
            top: (rect.top - viewportRect.top) / chromePreferences.uiElementScale,
            width: rect.width / chromePreferences.uiElementScale,
            height: rect.height / chromePreferences.uiElementScale,
          },
        };
      }
    } else if (!stripPaneId) {
      const edgeDrop = edgeAt(point.x, point.y);
      if (!edgeDrop || !viewportRect) {
        next = null;
      } else {
        const rect = documentSplitPreviewRect(
          actions.workspaceDockTree,
          actions.workspacePanes,
          sourcePaneId,
          id,
          edgeDrop.paneId,
          edgeDrop.edge,
          viewportRect.width / chromePreferences.uiElementScale,
          viewportRect.height / chromePreferences.uiElementScale,
        );
        if (rect) next = { paneId: edgeDrop.paneId, kind: "split", rect };
      }
    } else {
      next = null;
    }
    setDropPreview((current) =>
      current?.paneId === next?.paneId &&
      current?.kind === next?.kind &&
      current?.rect.left === next?.rect.left &&
      current?.rect.top === next?.rect.top &&
      current?.rect.width === next?.rect.width &&
      current?.rect.height === next?.rect.height
        ? current
        : next,
    );
  };
  const onTabDragEnd =
    (sourcePaneId: string) => (id: string, point: TabDragPoint, cancelled: boolean) => {
      setDropPreview(null);
      if (cancelled || !point.floating || !actions.documentTabs.some((tab) => tab.id === id))
        return;
      const target = hitElement({ x: point.x, y: point.y }, document);
      const targetStrip =
        target instanceof Element
          ? target.closest<HTMLElement>(".xse-document-tabs[data-ui-tab-pane]")
          : null;
      const targetPaneId = targetStrip?.dataset.uiTabPane;
      if (targetPaneId) {
        if (targetPaneId === sourcePaneId) return;
        const tabNode =
          target instanceof Element ? target.closest<HTMLElement>("[data-ui-tab-value]") : null;
        const targetId = tabNode?.dataset.uiTabValue;
        const rect = clientRect(tabNode);
        const before = !rect || point.x < rect.left + rect.width / 2;
        actions.moveDocumentTab(id, targetPaneId, targetId, before);
        return;
      }
      const drop = edgeAt(point.x, point.y);
      if (drop) actions.splitDocumentTab(id, drop.paneId, drop.edge);
    };
  const timelinePosition = editor.timelinePosition ?? "bottom";
  const workspacePanelDefaults = {
    timelinePosition: editor.timelinePosition ?? "bottom",
    colorbarRatio: editorWidth > 0 ? colorbarWidth / editorWidth : 0.16,
    colorbarSplitPosition: colorbarSplitPosition / 100,
  } as const;
  const workspacePanelContent = useCallback(
    (id: WorkspacePanelId): ReactNode => {
      if (id === "shortcuts")
        return <TouchShortcutRail showShortcutToolbar={chromePreferences.showShortcutToolbar} />;
      if (id === "tools") return <EditorToolRail />;
      if (id === "context")
        return (
          <div className="xse-workspace-context-panel">
            <EditorContextBar />
          </div>
        );
      if (id === "palette") return <EditorPalette colors={readDefaultPalette()} panelDocked />;
      if (id === "timeline") return <TimelineView renderDialogs={false} docked />;
      if (id === "picker") return <EditorColorbar />;
      return <EditorTileset />;
    },
    [chromePreferences.showShortcutToolbar],
  );
  const viewport = (
    <WorkspaceViewportTree
      tree={actions.workspaceDockTree}
      panes={actions.workspacePanes}
      rootPaneId={rootPane?.id ?? rootPaneId}
      dropPreview={dropPreview}
      onDragMove={onTabDragMove}
      onDragEnd={onTabDragEnd}
      onSelectTab={actions.selectPaneTab}
      onReorderTab={actions.reorderDocumentTab}
      onActivatePane={actions.activateWorkspacePane}
      onResizeSplit={actions.resizeWorkspaceSplit}
    />
  );
  const recoveryView = (
    <EditorRecoveryView
      items={actions.recoveryItems ?? []}
      selectedIds={actions.recoverySelectedIds ?? []}
      onSelectionChange={actions.selectRecoveryProjects!}
      loading={actions.recoveryLoading}
      busy={actions.recoveryBusy}
      onRecover={actions.recoverProjects!}
      onRefresh={actions.refreshRecovery!}
      onDelete={actions.deleteRecoveryProjects}
    />
  );
  const homeView = (
    <EditorHomeView
      files={actions.recentFiles}
      onNew={actions.new}
      onOpen={actions.open}
      onAbout={actions.about}
      onOpenRecent={actions.openRecent}
      onRecover={actions.recoverFiles}
      onPinRecent={actions.pinRecent}
      onDownloadRecent={actions.downloadRecent}
      downloadRecentDisabled={
        actions.downloadRecentBusy || actions.deleteBrowserCopyBusy || !actions.canStartInteraction
      }
      onDeleteBrowserCopy={actions.deleteBrowserCopy}
      deleteBrowserCopyDisabled={
        actions.deleteBrowserCopyBusy || actions.downloadRecentBusy || !actions.canStartInteraction
      }
    />
  );
  const documentTabs = rootPane ? (
    <EditorDocumentTabs
      filename={name}
      modified={dirty}
      paneId={rootPane.id}
      visibleDocumentIds={rootPane.tabs}
      activeDocumentId={rootPane.activeId}
      onDocumentTabSelect={(id) => actions.selectPaneTab(rootPane.id, id)}
      onDocumentTabReorder={(id, targetId, paneId) =>
        actions.reorderDocumentTab(id, targetId, paneId)
      }
      leadingContent={documentMenuToggle}
      showWorkspaceLayoutButton={documentMode}
      workspaceLayoutOpen={workspaceLayoutOpen}
      workspaceLayoutDisabled={!workspaceLayoutAvailable}
      onWorkspaceLayoutToggle={() => setWorkspaceLayoutOpen((open) => !open)}
      onTabDragMove={onTabDragMove(rootPane.id)}
      onTabDragEnd={onTabDragEnd(rootPane.id)}
    />
  ) : (
    <EditorDocumentTabs
      filename={name}
      modified={dirty}
      leadingContent={documentMenuToggle}
      showWorkspaceLayoutButton={documentMode}
      workspaceLayoutOpen={workspaceLayoutOpen}
      workspaceLayoutDisabled={!workspaceLayoutAvailable}
      onWorkspaceLayoutToggle={() => setWorkspaceLayoutOpen((open) => !open)}
    />
  );
  return (
    <ColorProfileProvider profile={activeDocument?.colorProfile}>
      {chromePreferences.showEditorMenuBar && <EditorMenubar presentation="bar" />}
      <div className="xse-fixed-document-header">{documentTabs}</div>
      <div
        className={
          compactWorkspaceLayout
            ? "xse-touch-composition xse-touch-main xse-compact-editor-layout"
            : "xse-touch-composition xse-touch-main"
        }
      >
        {editor.openTabs.includes(HelpDocumentTab.Guide) && (
          <UserGuideView hidden={!guideSelected} />
        )}
        {guideSelected ? null : isHomePage ? (
          <>{actions.recoveryOpen ? recoveryView : homeView}</>
        ) : (
          <>
            <ScrollArea
              className="xse-editor-workspace"
              contentClassName="xse-editor-workspace-content"
              scrollX={workspaceLayoutConfiguration.surface.workspaceOverflow === "auto"}
              scrollY={workspaceLayoutConfiguration.surface.workspaceOverflow === "auto"}
            >
              <div className="xse-editor-document-dock">
                <WorkspacePanelDock
                  renderCanvas={() => (
                    <div className="xse-workspace-canvas-content">{viewport}</div>
                  )}
                  renderPanel={workspacePanelContent}
                  tilesetAvailable={hasTileset}
                  timelineVisible={editor.timelineVisible}
                  timelinePosition={editor.timelinePosition ?? "bottom"}
                  onTimelinePositionChange={editor.setTimelinePosition}
                  layoutEditing={workspaceLayoutOpen}
                  onLayoutEditingChange={setWorkspaceLayoutOpen}
                  layoutDefaults={workspacePanelDefaults}
                  shortcutPanelVisible={shortcutPanelVisible}
                  onSplitRatioChange={(target, ratio, extent) => {
                    if (target === "colorbar-width")
                      setColorbarWidth(
                        Math.min(
                          MAX_COLORBAR_WIDTH,
                          Math.max(
                            MIN_COLORBAR_WIDTH,
                            ratio * Math.max(1, extent - WORKSPACE_WINDOW_GAP),
                          ),
                        ),
                      );
                    else if (target === "colorbar-split-position")
                      setColorbarSplitPosition(ratio * 100);
                  }}
                />
              </div>
            </ScrollArea>
          </>
        )}
      </div>
      <TimelineDialogs />
      <GridSettingsHost enabled={editor.tab === "document" && !actions.recoveryOpen} />
      <EffectDialogsHost enabled={editor.tab === "document" && !actions.recoveryOpen} />
      <AnimationDialogsHost
        enabled={editor.tab === "document" && !actions.recoveryOpen}
        previewOpen={editor.previewVisible}
        onPreviewOpenChange={editor.setPreviewVisible}
        timelinePosition={timelinePosition}
        onTimelinePositionChange={editor.setTimelinePosition}
        timelinePanelPreferences={editor.timelinePanelPreferences}
        onTimelinePanelPreferencesChange={editor.setTimelinePanelPreferences}
        onSetTimelinePanelPreferencesAsDefaults={editor.setTimelinePanelPreferencesAsDefaults}
        timelineInteractionPreferences={editor.timelineInteractionPreferences}
        onTimelineInteractionPreferencesChange={editor.setTimelineInteractionPreferences}
      />
      <LayerCommandHost
        enabled={editor.tab === "document" && !actions.recoveryOpen}
        onError={editor.setNotice}
      />
      <SelectionDialogsHost enabled={editor.tab === "document" && !actions.recoveryOpen} />
      <DocumentFeatureDialogs enabled={editor.tab === "document" && !actions.recoveryOpen} />
      {showStatusbar && (
        <EditorStatusbar
          filename={name}
          dimensions={`${activeDocument?.width ?? 0} x ${activeDocument?.height ?? 0}`}
          directory="Browser document"
        />
      )}
    </ColorProfileProvider>
  );
}

function WorkspaceViewportTree({
  tree,
  panes,
  rootPaneId,
  dropPreview,
  onDragMove,
  onDragEnd,
  onSelectTab,
  onReorderTab,
  onActivatePane,
  onResizeSplit,
}: {
  tree: WorkspaceDockNode;
  panes: readonly WorkspacePaneSnapshot[];
  rootPaneId: string;
  dropPreview: WorkspaceTabDropPreview | null;
  onDragMove: (paneId: string) => (id: string, point: TabDragPoint) => void;
  onDragEnd: (paneId: string) => (id: string, point: TabDragPoint, cancelled: boolean) => void;
  onSelectTab: (paneId: string, id: string) => void;
  onReorderTab: (id: string, targetId: string, paneId?: string) => void;
  onActivatePane: (paneId: string) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
}) {
  const actions = useEditorActions()!;
  const renderNode = (node: WorkspaceDockNode): ReactNode => {
    if (node.kind === "split") {
      const first = renderNode(node.first),
        second = renderNode(node.second);
      const horizontal = node.axis === "horizontal";
      return (
        <div
          key={node.id}
          className="xse-workspace-split"
          data-axis={node.axis}
          style={
            horizontal
              ? {
                  gridTemplateColumns: `minmax(0, ${node.ratio}fr) 4px minmax(0, ${1 - node.ratio}fr)`,
                }
              : {
                  gridTemplateRows: `minmax(0, ${node.ratio}fr) 4px minmax(0, ${1 - node.ratio}fr)`,
                }
          }
        >
          {first}
          <WorkspaceSplitHandle node={node} onResize={onResizeSplit} />
          {second}
        </div>
      );
    }
    const pane = panes.find((item) => item.id === node.id);
    if (!pane) return null;
    const filename =
      actions.documentTabs.find((tab) => tab.id === pane.activeId)?.name ?? "Untitled";
    const modified = actions.documentTabs.find((tab) => tab.id === pane.activeId)?.modified;
    return (
      <section
        key={pane.id}
        className="xse-workspace-pane"
        data-workspace-pane-id={pane.id}
        data-active={actions.activeDocumentId === pane.activeId}
        onPointerDownCapture={() => onActivatePane(pane.id)}
      >
        {pane.activeId ? (
          <EditorDocumentPane documentId={pane.activeId}>
            <WorkspacePaneDocument>
              {pane.id !== rootPaneId && (
                <EditorDocumentTabs
                  filename={filename}
                  modified={modified}
                  paneId={pane.id}
                  visibleDocumentIds={pane.tabs}
                  activeDocumentId={pane.activeId}
                  showGlobalTabs={false}
                  showWorkspaceControls={false}
                  onDocumentTabSelect={(id) => onSelectTab(pane.id, id)}
                  onDocumentTabReorder={(id, targetId, paneId) =>
                    onReorderTab(id, targetId, paneId)
                  }
                  onTabDragMove={onDragMove(pane.id)}
                  onTabDragEnd={onDragEnd(pane.id)}
                />
              )}
              <div className="xse-workspace-pane-content">
                <EditorViewport
                  src={xpritePreview}
                  previewSrc={xpritePreview}
                  alt={tUi("ui.sprite.canvas.2", { value1: filename })}
                />
              </div>
            </WorkspacePaneDocument>
          </EditorDocumentPane>
        ) : null}
      </section>
    );
  };
  return (
    <div className="xse-workspace-viewport-tree">
      {renderNode(tree)}
      {dropPreview && (
        <div
          className="xse-workspace-drop-mask"
          data-preview-kind={dropPreview.kind}
          data-preview-pane={dropPreview.paneId}
          style={{
            left: dropPreview.rect.left,
            top: dropPreview.rect.top,
            width: dropPreview.rect.width,
            height: dropPreview.rect.height,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function WorkspacePaneDocument({ children }: { children: ReactNode }) {
  const { document } = useEditorDocumentView();
  return <ColorProfileProvider profile={document?.colorProfile}>{children}</ColorProfileProvider>;
}

function WorkspaceSplitHandle({
  node,
  onResize,
}: {
  node: Extract<WorkspaceDockNode, { kind: "split" }>;
  onResize: (id: string, ratio: number) => void;
}) {
  const resizeScheduler = useWorkspaceResizeScheduler();
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const drag = useRef<{
    pointer: number;
    host: HTMLElement;
    gesture: PointerResizeGesture;
    ratio: number;
    moved: boolean;
  } | null>(null);
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const horizontal = node.axis === "horizontal";
    const candidate = current.gesture.valueAt(event);
    if (candidate === null) return;
    const ratio = Math.min(0.85, Math.max(0.15, candidate));
    resizeScheduler.schedule(() => {
      if (current.ratio === ratio) return;
      current.ratio = ratio;
      current.moved = true;
      const tracks = `minmax(0, ${ratio}fr) 4px minmax(0, ${1 - ratio}fr)`;
      if (horizontal) current.host.style.gridTemplateColumns = tracks;
      else current.host.style.gridTemplateRows = tracks;
    });
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (event.type === "pointerup") update(event);
    resizeScheduler.flush();
    drag.current = null;
    if (current.moved) onResizeRef.current(node.id, current.ratio);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    const end = () => {
      resizeScheduler.flush();
      const current = drag.current;
      drag.current = null;
      if (current?.moved) onResizeRef.current(node.id, current.ratio);
    };
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("blur", end);
      end();
    };
  }, [node.id, resizeScheduler]);
  const step = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const towardFirst =
      node.axis === "horizontal" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const towardSecond =
      node.axis === "horizontal" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (towardFirst || towardSecond) {
      event.preventDefault();
      onResize(node.id, node.ratio + (towardSecond ? 0.02 : -0.02));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onResize(node.id, event.key === "Home" ? 0.15 : 0.85);
    }
  };
  return (
    <Splitter
      className="xse-workspace-splitter"
      axis={node.axis}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(node.ratio * 100)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const host = event.currentTarget.parentElement;
        if (!host || drag.current) return;
        const horizontal = node.axis === "horizontal";
        const rect = clientRect(host);
        const extent = horizontal ? layoutSize(host).width : layoutSize(host).height;
        drag.current = {
          pointer: event.pointerId,
          host,
          gesture: new PointerResizeGesture(event, {
            axis: horizontal ? PointerDragAxis.Horizontal : PointerDragAxis.Vertical,
            initialValue: node.ratio,
            pixelsPerUnit:
              (Math.max(1, extent - 4) * (horizontal ? rect.width : rect.height)) /
              Math.max(1, extent),
          }),
          ratio: node.ratio,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={update}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={step}
    />
  );
}
