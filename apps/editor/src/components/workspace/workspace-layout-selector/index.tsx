import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Alert } from "$/components/dialogs/alert";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { useEditorLayoutSettings } from "$/components/shared/editor-layout-context";
import { tUi, useUiLanguage } from "$/i18n";
import { useEditorLayoutPreferences } from "$/managers/shell/layout-preferences";
import {
  MAX_WORKSPACE_PANEL_LAYOUT_NAME_LENGTH,
  type SavedWorkspacePanelLayout,
  type WorkspaceLayoutConfiguration,
  type WorkspaceLayoutMode,
  type WorkspacePanelLayout,
} from "$/managers/workspace/workspace-panel-layout";
import { Combobox } from "@xprite/ui";
import { UI_SCALE } from "@xprite/ui/canvas";

import "$/components/workspace/workspace-layout-selector/workspace-layout-selector.module.css";

const LAYOUT_COMBOBOX_SIZE = { width: 72, height: 12 };
export const WORKSPACE_LAYOUT_SELECTOR_WIDTH = LAYOUT_COMBOBOX_SIZE.width * UI_SCALE;
const newLayoutId = () =>
  `workspace-layout-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

export function WorkspaceLayoutSelector({
  layout,
  open,
  onLoadLayout,
  onSelectLayoutMode,
  onResetDefaultLayout,
}: {
  layout: WorkspacePanelLayout;
  open: boolean;
  onLoadLayout: (
    layout: WorkspacePanelLayout,
    configuration: WorkspaceLayoutConfiguration,
    savedLayoutId: string,
  ) => void;
  onSelectLayoutMode: (mode: Exclude<WorkspaceLayoutMode, "saved">) => void;
  onResetDefaultLayout: () => void;
}) {
  useUiLanguage();
  const {
    workspaceLayoutMode: layoutMode,
    savedWorkspaceLayoutId,
    workspaceLayoutConfiguration,
  } = useEditorLayoutSettings();
  const preferences = useEditorLayoutPreferences();
  const [savedLayouts, setSavedLayouts] = useState(() =>
    preferences.readSavedWorkspacePanelLayouts(),
  );
  const [nameAction, setNameAction] = useState<
    { kind: "save" } | { kind: "rename"; id: string } | null
  >(null);
  const [layoutName, setLayoutName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedWorkspacePanelLayout | null>(null);

  useEffect(() => {
    preferences.writeSavedWorkspacePanelLayouts(savedLayouts);
  }, [preferences, savedLayouts]);

  const activeSavedLayout =
    layoutMode === "saved"
      ? savedLayouts.find((saved) => saved.id === savedWorkspaceLayoutId)
      : undefined;
  useEffect(() => {
    if (layoutMode !== "saved" || !savedWorkspaceLayoutId) return;
    setSavedLayouts((current) => {
      const active = current.find((saved) => saved.id === savedWorkspaceLayoutId);
      if (
        !active ||
        (JSON.stringify(active.layout) === JSON.stringify(layout) &&
          JSON.stringify(active.configuration) === JSON.stringify(workspaceLayoutConfiguration))
      )
        return current;
      return current.map((saved) =>
        saved.id === savedWorkspaceLayoutId
          ? { ...saved, layout, configuration: workspaceLayoutConfiguration }
          : saved,
      );
    });
  }, [layout, layoutMode, savedWorkspaceLayoutId, workspaceLayoutConfiguration]);
  const normalizedName = layoutName.trim();
  const duplicateName = savedLayouts.some(
    (saved) =>
      saved.id !== (nameAction?.kind === "rename" ? nameAction.id : undefined) &&
      saved.name.trim().toLowerCase() === normalizedName.toLowerCase(),
  );
  const nameError =
    normalizedName.length > MAX_WORKSPACE_PANEL_LAYOUT_NAME_LENGTH
      ? tUi("ui.workspace.layout.name.too.long", {
          count: MAX_WORKSPACE_PANEL_LAYOUT_NAME_LENGTH,
        })
      : duplicateName
        ? tUi("ui.workspace.layout.name.exists")
        : undefined;
  const canSubmitName = !!normalizedName && !nameError;

  const openSaveDialog = () => {
    setLayoutName("");
    setNameAction({ kind: "save" });
  };
  const openRenameDialog = (saved: SavedWorkspacePanelLayout) => {
    setLayoutName(saved.name);
    setNameAction({ kind: "rename", id: saved.id });
  };
  const closeNameDialog = () => setNameAction(null);
  const commitName = () => {
    if (!canSubmitName || !nameAction) return;
    if (nameAction.kind === "save") {
      const saved = {
        id: newLayoutId(),
        name: normalizedName,
        layout,
        configuration: workspaceLayoutConfiguration,
      };
      setSavedLayouts((current) => [...current, saved]);
      onLoadLayout(layout, workspaceLayoutConfiguration, saved.id);
    } else {
      setSavedLayouts((current) =>
        current.map((saved) =>
          saved.id === nameAction.id ? { ...saved, name: normalizedName } : saved,
        ),
      );
    }
    closeNameDialog();
  };
  const deleteSavedLayout = () => {
    if (!deleteTarget) return;
    if (savedWorkspaceLayoutId === deleteTarget.id) onSelectLayoutMode("auto");
    setSavedLayouts((current) => current.filter((saved) => saved.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const options = [
    {
      value: "auto",
      label: tUi("ui.workspace.layout.mode.auto.short"),
    },
    {
      value: "compact",
      label: tUi("ui.workspace.layout.mode.compact.short"),
    },
    {
      value: "wide",
      label: tUi("ui.workspace.layout.mode.wide.short"),
    },
    ...(layoutMode === "saved" && !activeSavedLayout
      ? [{ value: "saved", label: tUi("ui.workspace.layout.custom"), disabled: true }]
      : []),
    { value: "separator-saved", label: "", separator: true },
    ...(savedLayouts.length
      ? savedLayouts.map((saved) => ({
          value: `saved:${saved.id}`,
          label: saved.name,
        }))
      : [
          { value: "no-saved-layouts", label: tUi("ui.workspace.layout.no.saved"), disabled: true },
        ]),
    { value: "separator-actions", label: "", separator: true },
    {
      value: "action:save",
      label: tUi("ui.workspace.layout.save.short"),
    },
    {
      value: "action:rename",
      label: tUi("ui.workspace.layout.rename.short"),
      disabled: !activeSavedLayout,
    },
    {
      value: "action:delete",
      label: tUi("ui.workspace.layout.delete.short"),
      disabled: !activeSavedLayout,
    },
    {
      value: "action:reset-default",
      label: tUi("ui.workspace.layout.reset"),
    },
  ];
  const value =
    layoutMode === "saved"
      ? activeSavedLayout
        ? `saved:${activeSavedLayout.id}`
        : "saved"
      : layoutMode;
  const onValueChange = (next: string) => {
    if (next === "auto" || next === "compact" || next === "wide") {
      onSelectLayoutMode(next);
    } else if (next.startsWith("saved:")) {
      const saved = savedLayouts.find((candidate) => `saved:${candidate.id}` === next);
      if (saved) {
        onLoadLayout(saved.layout, saved.configuration, saved.id);
      }
    } else if (next === "action:save") openSaveDialog();
    else if (next === "action:reset-default") onResetDefaultLayout();
    else if (next === "action:rename" && activeSavedLayout) openRenameDialog(activeSavedLayout);
    else if (next === "action:delete" && activeSavedLayout) setDeleteTarget(activeSavedLayout);
  };

  const slot =
    open && typeof document !== "undefined"
      ? document.querySelector<HTMLElement>("[data-workspace-layout-combo-slot]")
      : null;
  const selector = slot
    ? createPortal(
        <Combobox
          pixelSize={LAYOUT_COMBOBOX_SIZE}
          value={value}
          options={options}
          fitPopupToContent
          onValueChange={onValueChange}
          aria-label={tUi("ui.workspace.layout")}
        />,
        slot,
      )
    : null;

  return (
    <>
      {selector}
      <FormDialog
        open={!!nameAction}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) closeNameDialog();
        }}
        title={
          nameAction?.kind === "rename"
            ? tUi("ui.workspace.layout.rename")
            : tUi("ui.workspace.layout.save.current")
        }
        message={nameError}
        fields={[
          {
            key: "layout-name",
            label: tUi("ui.name"),
            type: "text",
            value: layoutName,
            onChange: setLayoutName,
          },
        ]}
        actions={[
          {
            label:
              nameAction?.kind === "rename" ? tUi("ui.workspace.layout.rename") : tUi("ui.save"),
            disabled: !canSubmitName,
            onClick: commitName,
          },
          { label: tUi("ui.cancel"), onClick: closeNameDialog },
        ]}
        width={350}
      />
      <Alert
        open={!!deleteTarget}
        onOpenChange={(alertOpen) => {
          if (!alertOpen) setDeleteTarget(null);
        }}
        title={tUi("ui.workspace.layout.delete")}
        messageLines={
          deleteTarget
            ? [tUi("ui.workspace.layout.confirm.delete", { name: deleteTarget.name })]
            : []
        }
        actions={[
          { label: tUi("ui.delete"), onClick: deleteSavedLayout },
          { label: tUi("ui.cancel"), onClick: () => setDeleteTarget(null) },
        ]}
        defaultActionIndex={1}
        cancelActionIndex={1}
      />
    </>
  );
}
