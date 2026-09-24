import { useEffect, useMemo, useState } from "react";

import "$/components/workspace/document-tabs/document-tabs.module.css";
import type { MouseEvent, ReactNode } from "react";

import { useEditorLayout } from "$/components/shared/editor-layout-context";
import { PixelArtIcon } from "$/components/shared/pixel-art-icon";
import { useEditorActions } from "$/components/shell/editor-actions";
import { WORKSPACE_LAYOUT_SELECTOR_WIDTH } from "$/components/workspace/workspace-layout-selector";
import { EDITOR_EXTERNAL_LINKS } from "$/config/external-links";
import { tUi } from "$/i18n";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import type { EditorTab } from "$/managers/editor/editor-ui-store";
import { HelpDocumentTab } from "$/managers/shell/help";
import {
  Button,
  ButtonVariant,
  ContextMenu,
  Tabs,
  useUi,
  type TabDragPoint,
  type TabItem,
} from "@xprite/ui";
import { UiIcon } from "@xprite/ui/assets";

type Editor = ReturnType<typeof useEditor>;
const WORKSPACE_LAYOUT_BUTTON_WIDTH = 32;
const WORKSPACE_SETTINGS_BUTTON_WIDTH = 32;
const DOCUMENT_FLAG_WIDTH = 32;
const DOCUMENT_MENU_TOGGLE_WIDTH = 32;
const RECOVERY_TAB_ID = "recovery";

export interface DocumentTab {
  id: string;
  name: string;
  modified?: boolean;
}

export function DocumentTabs({
  editor,
  recoveryTabOpen = false,
  recoverySelected = false,
  onRecoverySelect,
  onRecoveryClose,
  filename,
  modified = false,
  documentTabs,
  activeDocumentId,
  onDocumentTabSelect,
  onDocumentTabClose,
  onDocumentTabDuplicate,
  onDocumentTabReorder,
  onNewDocument,
  paneId,
  visibleDocumentIds,
  leadingContent,
  showGlobalTabs = true,
  showWorkspaceControls = true,
  showWorkspaceLayoutButton = true,
  workspaceLayoutOpen = false,
  workspaceLayoutDisabled = false,
  onWorkspaceLayoutToggle,
  onDragMove,
  onDragEnd,
}: {
  editor: Editor;
  recoveryTabOpen?: boolean;
  recoverySelected?: boolean;
  onRecoverySelect?: () => void;
  onRecoveryClose?: () => void;
  filename: string;
  modified?: boolean;
  documentTabs?: readonly DocumentTab[];
  activeDocumentId?: string;
  onDocumentTabSelect?: (id: string) => void;
  onDocumentTabClose?: (id: string) => void;
  onDocumentTabDuplicate?: (id: string) => void;
  onDocumentTabReorder?: (id: string, targetId: string, paneId?: string) => void;
  onNewDocument?: () => void;
  paneId?: string;
  visibleDocumentIds?: readonly string[];
  leadingContent?: ReactNode;
  showGlobalTabs?: boolean;
  showWorkspaceControls?: boolean;
  showWorkspaceLayoutButton?: boolean;
  workspaceLayoutOpen?: boolean;
  workspaceLayoutDisabled?: boolean;
  onWorkspaceLayoutToggle?: () => void;
  onDragMove?: (id: string, point: TabDragPoint) => void;
  onDragEnd?: (id: string, point: TabDragPoint, cancelled: boolean) => void;
}) {
  const { sceneWidth } = useEditorLayout();
  const actions = useEditorActions();
  const { style, translateSource } = useUi();
  const [unread, setUnread] = useState(true);
  const [contextTab, setContextTab] = useState("home");
  const visible = visibleDocumentIds ? new Set(visibleDocumentIds) : undefined;
  const sourceTabs = useMemo(
    () =>
      documentTabs
        ? [
            ...(showGlobalTabs && editor.openTabs.includes("home") ? ["home"] : []),
            ...(recoveryTabOpen ? [RECOVERY_TAB_ID] : []),
            ...(showGlobalTabs && editor.openTabs.includes(HelpDocumentTab.Guide)
              ? [HelpDocumentTab.Guide]
              : []),
            ...documentTabs.filter((tab) => !visible || visible.has(tab.id)).map((tab) => tab.id),
          ]
        : [...editor.openTabs, ...(recoveryTabOpen ? [RECOVERY_TAB_ID] : [])],
    [documentTabs, editor.openTabs, showGlobalTabs, visibleDocumentIds, recoveryTabOpen],
  );
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  useEffect(() => {
    setTabOrder((order) => order.filter((tab) => sourceTabs.includes(tab)));
  }, [sourceTabs]);
  const tabs = useMemo(
    () => [
      ...tabOrder.filter((tab) => sourceTabs.includes(tab)),
      ...sourceTabs.filter((tab) => !tabOrder.includes(tab)),
    ],
    [sourceTabs, tabOrder],
  );
  const infoFor = (id: string) => documentTabs?.find((tab) => tab.id === id);
  const activeTab = recoverySelected
    ? RECOVERY_TAB_ID
    : documentTabs
      ? editor.tab !== "document"
        ? editor.tab
        : (activeDocumentId ?? documentTabs[0]?.id ?? "home")
      : editor.tab;
  const selectTab = (id: string) => {
    if (id === RECOVERY_TAB_ID) onRecoverySelect?.();
    else if (id === "home" || id === HelpDocumentTab.Guide) editor.openTab(id);
    else if (documentTabs) onDocumentTabSelect?.(id);
    else editor.openTab(id as EditorTab);
  };
  const closeTab = (id: string) => {
    if (id === RECOVERY_TAB_ID) onRecoveryClose?.();
    else if (id === "home" || id === HelpDocumentTab.Guide) editor.closeTab(id);
    else if (documentTabs) onDocumentTabClose?.(id);
    else editor.closeTab(id as EditorTab);
  };
  const items: TabItem[] = tabs.map((id) => {
    const home = id === "home";
    const recovery = id === RECOVERY_TAB_ID;
    const guide = id === HelpDocumentTab.Guide;
    const document = infoFor(id);
    return {
      id,
      label: home
        ? "Home"
        : recovery
          ? "Recover Files"
          : guide
            ? tUi("ui.user.guide")
            : (document?.name ?? filename),
      modified: home || recovery || guide ? false : (document?.modified ?? modified),
      closable: true,
      translateLabel: home || recovery,
      ...(home
        ? {
            icon: {
              active: "tab_home_icon_active" as const,
              inactive: "tab_home_icon_normal" as const,
            },
          }
        : {}),
    };
  });
  const trailingContentWidth = showWorkspaceControls
    ? DOCUMENT_FLAG_WIDTH +
      WORKSPACE_SETTINGS_BUTTON_WIDTH +
      (showWorkspaceLayoutButton
        ? WORKSPACE_LAYOUT_BUTTON_WIDTH +
          (workspaceLayoutOpen ? WORKSPACE_LAYOUT_SELECTOR_WIDTH : 0)
        : 0)
    : 0;
  const trailingContent = showWorkspaceControls ? (
    <span
      className="xse-document-tab-controls"
      style={{ flexBasis: trailingContentWidth, width: trailingContentWidth }}
    >
      {showWorkspaceLayoutButton && (
        <span
          className="xse-workspace-layout-combo-slot"
          data-workspace-layout-combo-slot=""
          data-open={workspaceLayoutOpen ? "true" : undefined}
        />
      )}
      {showWorkspaceLayoutButton && (
        <button
          type="button"
          className="xse-layout-button"
          data-workspace-layout-trigger=""
          data-open={workspaceLayoutOpen ? "true" : undefined}
          aria-label={translateSource("Workspace layout")}
          title={translateSource("Workspace layout")}
          aria-pressed={workspaceLayoutOpen}
          disabled={workspaceLayoutDisabled || !onWorkspaceLayoutToggle}
          onClick={onWorkspaceLayoutToggle}
        >
          <span className="xse-layout-icon-frame" aria-hidden="true">
            <UiIcon
              part="icon_layout"
              className="xse-layout-icon"
              color="var(--xse-layout-button-icon-color, var(--xse-window-menuitem-normal-text, currentColor))"
              x={0}
              y={0}
              scale={2}
            />
          </span>
        </button>
      )}
      <Button
        variant={ButtonVariant.FlatIcon}
        paintArtwork={false}
        className="xse-workspace-settings-button"
        style={{ width: WORKSPACE_SETTINGS_BUTTON_WIDTH, height: "100%" }}
        aria-label={tUi("ui.settings")}
        title={tUi("ui.settings")}
        disabled={!actions?.canStartInteraction}
        onClick={() => actions?.preferences()}
      >
        <PixelArtIcon name="workspace-settings" />
      </Button>
      <span className="xse-document-notifications">
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: DOCUMENT_FLAG_WIDTH,
            height: "100%",
            background: unread ? style.colors.flag_active : style.colors.flag_normal,
          }}
        />
        <UiIcon part={unread ? "flag_highlight" : "flag_normal"} x={0} y={0} scale={2} />
        <a
          className="xse-notifications-button"
          href={EDITOR_EXTERNAL_LINKS.xpriteIssues}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={tUi("ui.github.issues")}
          title={tUi("ui.github.issues")}
          onClick={() => setUnread(false)}
        />
      </span>
    </span>
  ) : null;
  const leadingControl = leadingContent ? (
    <span className="xse-document-tab-menu-controls">{leadingContent}</span>
  ) : null;
  const leadingContentWidth = leadingContent ? DOCUMENT_MENU_TOGGLE_WIDTH : 0;
  return (
    <ContextMenu
      label="Document tab menu"
      longPressTarget="[data-ui-tab-value]"
      items={[
        { label: "Close", onSelect: () => closeTab(contextTab) },
        ...(contextTab !== "home" &&
        contextTab !== RECOVERY_TAB_ID &&
        contextTab !== HelpDocumentTab.Guide
          ? [
              {
                label: "Duplicate View",
                disabled: !onDocumentTabDuplicate,
                onSelect: () => onDocumentTabDuplicate?.(contextTab),
              },
              { label: "Open with OS", separator: true, disabled: true },
              { label: "Open in Folder", disabled: true },
              { label: "Copy Path", separator: true, disabled: true },
            ]
          : []),
      ]}
      onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-ui-tab-value]")?.dataset
          .uiTabValue;
        if (id) setContextTab(id);
        else event.preventDefault();
      }}
    >
      {(getTargetProps) => (
        <Tabs
          {...getTargetProps()}
          className="xse-document-tabs"
          tabs={items}
          value={activeTab}
          width={sceneWidth}
          leadingContent={leadingControl}
          leadingContentWidth={leadingContentWidth}
          trailingContentWidth={trailingContentWidth}
          paneId={paneId}
          ariaLabel="Document tabs and workspace controls"
          tabListLabel="Documents"
          onDragMove={(id, point) => {
            if (id !== RECOVERY_TAB_ID && id !== HelpDocumentTab.Guide) onDragMove?.(id, point);
          }}
          onDragEnd={(id, point, cancelled) => {
            if (id !== RECOVERY_TAB_ID && id !== HelpDocumentTab.Guide)
              onDragEnd?.(id, point, cancelled);
          }}
          onValueChange={selectTab}
          onClose={closeTab}
          onDoubleClickEmpty={onNewDocument}
          onReorder={(id, target) => {
            const from = tabs.indexOf(id);
            const to = tabs.indexOf(target);
            if (from < 0 || to < 0 || from === to) return;
            const next = [...tabs];
            next.splice(from, 1);
            next.splice(to, 0, id);
            setTabOrder(next);
            if (
              id !== "home" &&
              target !== "home" &&
              id !== RECOVERY_TAB_ID &&
              target !== RECOVERY_TAB_ID &&
              id !== HelpDocumentTab.Guide &&
              target !== HelpDocumentTab.Guide
            )
              onDocumentTabReorder?.(id, target, paneId);
          }}
          trailingContent={trailingContent}
        />
      )}
    </ContextMenu>
  );
}
