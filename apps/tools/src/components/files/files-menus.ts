import { useMemo } from "react";

import { useFilesManager, useFilesSnapshot, useFilesText } from "$/components/files/files-context";
import { FilesFolder, FilesSortKey, FilesView } from "$/managers/files/files-model";
import { FileEntryKind } from "$/managers/ports/files";
import { MenuCheckType, type MenubarMenu, type MenuItem } from "@xprite/ui";

const EMPTY: { file: MenuItem[]; menus: MenubarMenu[] } = { file: [], menus: [] };

function commandKey() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    ? "Cmd"
    : "Ctrl";
}

/**
 * Menu bar entries for the Files window, which behaves like the Mac OS 8 Finder: while it is the
 * front window the File menu gains the Finder's window commands and View and Special menus join
 * the bar. Nothing is added while Files is closed or behind another window.
 */
export function useFilesMenus() {
  const manager = useFilesManager();
  const state = useFilesSnapshot(manager);
  const text = useFilesText();
  return useMemo(() => {
    if (!manager || !state?.open || !state.active) return EMPTY;
    const mod = commandKey();
    const inTrash = state.folder === FilesFolder.Trash;
    const atRoot = state.folder === FilesFolder.Root;
    const selected = state.selection.length ? manager.entry(state.selection[0]) : undefined;
    const hasSelection = state.selection.length > 0;
    const trashFull = manager.folderCount(FilesFolder.Trash) > 0;
    const sort = (key: FilesSortKey, label: Parameters<typeof text>[0]): MenuItem => ({
      label: text(label),
      checkType: MenuCheckType.Radio,
      checked: state.sort.key === key,
      onSelect: () => {
        if (state.sort.key !== key) manager.setSort(key);
      },
    });
    const file: MenuItem[] = [
      {
        label: text("files.open"),
        separator: true,
        disabled: !hasSelection,
        onSelect: () => manager.commands.openSelected?.(),
      },
      {
        label: text("files.enclosing.open"),
        shortcut: `${mod}+Up`,
        disabled: atRoot,
        onSelect: manager.openEnclosing,
      },
      {
        label: text("files.get.info"),
        shortcut: `${mod}+I`,
        disabled: !selected,
        onSelect: () => selected && manager.showInfo(selected.id),
      },
      {
        label: text("files.add"),
        disabled: inTrash,
        onSelect: () => manager.commands.addFiles?.(),
      },
      {
        label: text("files.move.trash"),
        disabled:
          inTrash ||
          !hasSelection ||
          !state.selection.every((id) => manager.entry(id)?.kind === FileEntryKind.File),
        onSelect: () => void manager.trash(),
      },
      {
        label: text("files.close.window"),
        separator: true,
        onSelect: manager.closeWindow,
      },
    ];
    const view: MenubarMenu = {
      label: text("files.view"),
      items: [
        {
          label: text("files.view.icons"),
          checkType: MenuCheckType.Radio,
          checked: state.view === FilesView.Icons,
          onSelect: () => manager.setView(FilesView.Icons),
        },
        {
          label: text("files.view.list"),
          checkType: MenuCheckType.Radio,
          checked: state.view === FilesView.List,
          onSelect: () => manager.setView(FilesView.List),
        },
        { ...sort(FilesSortKey.Name, "files.sort.name"), separator: true },
        sort(FilesSortKey.Modified, "files.sort.modified"),
        sort(FilesSortKey.Size, "files.sort.size"),
        sort(FilesSortKey.Kind, "files.sort.kind"),
        sort(FilesSortKey.Label, "files.sort.label"),
        {
          label: text("files.view.empty"),
          separator: true,
          checkType: MenuCheckType.Checkbox,
          checked: state.showEmpty,
          onSelect: manager.toggleEmptyFolders,
        },
      ],
    };
    const special: MenubarMenu = {
      label: text("files.special"),
      items: [
        {
          label: text("files.empty.trash"),
          disabled: !trashFull,
          onSelect: manager.requestEmptyTrash,
        },
      ],
    };
    return { file, menus: [view, special] };
  }, [manager, state, text]);
}
