import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { useFilesManager, useFilesSnapshot, useFilesText } from "$/components/files/files-context";
import { FilesInfoWindow } from "$/components/files/files-info";
import { createFolderNavGate, opensOnPrimaryClick } from "$/components/files/files-item-gestures";
import type { FilesManager } from "$/managers/files/files-manager";
import {
  decodeFilesDrag,
  encodeFilesDrag,
  EDITOR_FOLDER,
  FILES_DRAG_TYPE,
  FilesFolder,
  FilesSortKey,
  FilesView,
  formatBytes,
  formatDate,
  formatShortDate,
} from "$/managers/files/files-model";
import type { FilesText } from "$/managers/locale/files-text";
import { useToolLanguage } from "$/managers/locale/tool-language";
import { FileEntryKind, type FileEntry } from "$/managers/ports/files";
import {
  ANIMAL_CROSSING_TOOL,
  BEADS_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  VIEWER_TOOL,
} from "$/managers/tools/tool-catalog";
import { localizedSiteHref } from "@xprite/growth-content/language";
import {
  AlertDialog,
  Button,
  ButtonVariant,
  ContextMenu,
  Dialog,
  Icon,
  IconKind,
  IconSize,
  Input,
  OverlayContentLayout,
  ScrollArea,
  Text,
  TextVariant,
  type MenuItem,
  windowMetrics,
} from "@xprite/ui";
import { layoutSize } from "@xprite/ui/utils";

import styles from "$/components/files/files.module.css";

const FILE_TOOLS = [VIEWER_TOOL, PIXELATE_TOOL, BEADS_TOOL, GIF_SHEET_TOOL, ANIMAL_CROSSING_TOOL];

/** Preferred size; shared Dialog chrome keeps a viewport edge inset so it never goes flush. */
const WINDOW_BOUNDS = { x: 0, y: 0, width: 640, height: 420 };
const WINDOW_MIN = { width: 320, height: 240 };
const ZOOM_MAX = { width: 960, height: 640 };
const NARROW_QUERY = "(max-width: 700px)";
const MENU_BAR_SELECTOR = '[role="menubar"], [role="menu"], [role="menuitem"]';
const TILE_WIDTH = 104;
const SPRING_DELAY_MS = 1000;
const LABEL_COLORS = [
  "transparent",
  "#ff6600",
  "#dd0000",
  "#ff0099",
  "#00ccff",
  "#0000dd",
  "#006600",
  "#663300",
];

interface FolderItem {
  id: string;
  name: string;
  icon: IconKind;
}

export function folderName(folder: string, text: FilesText, t: (source: string) => string) {
  switch (folder) {
    case FilesFolder.Root:
      return text("files.title");
    case FilesFolder.Recent:
      return text("files.folder.recent");
    case FilesFolder.EditorProjects:
      return text("files.folder.projects");
    case FilesFolder.Trash:
      return text("files.trash");
    case EDITOR_FOLDER:
      return text("files.folder.editor");
    default: {
      const tool = FILE_TOOLS.find((candidate) => candidate.path === folder);
      return tool ? t(tool.label) : text("files.title");
    }
  }
}

export function entryKind(entry: FileEntry, text: FilesText): string {
  if (entry.kind === FileEntryKind.EditorProject) return text("files.kind.project");
  if (/\.(?:ase|aseprite)$/i.test(entry.name)) return text("files.kind.aseprite");
  if (/\.acnl$/i.test(entry.name)) return text("files.kind.design");
  const extension = /\.([a-z0-9]+)$/i.exec(entry.name)?.[1]?.toUpperCase();
  if (!extension) return text("files.kind.document");
  return text("files.kind.image", { format: extension === "JPG" ? "JPEG" : extension });
}

function Thumbnail({
  manager,
  entry,
  size,
}: {
  manager: FilesManager;
  entry: FileEntry;
  size: IconSize;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void manager.thumbnail(entry).then((value) => {
      if (active) setUrl(value);
    });
    return () => {
      active = false;
    };
  }, [manager, entry]);
  if (url)
    return (
      <img
        className={styles.thumbnail}
        src={url}
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
    );
  return (
    <Icon
      kind={entry.kind === FileEntryKind.EditorProject ? IconKind.Application : IconKind.Document}
      size={size}
    />
  );
}

/** The Mac OS 8 Finder-style Files window, opened on top of the current tool page. */
export function FilesWindow() {
  const manager = useFilesManager();
  const state = useFilesSnapshot(manager);
  const text = useFilesText();
  const { language, translate: t } = useToolLanguage();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dropping, setDropping] = useState(false);
  const [columns, setColumns] = useState(4);
  const picker = useRef<HTMLInputElement>(null);
  const spring = useRef<{ folder: string; timer: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  /** Blocks ghost clicks that land on the item under the finger after a folder change. */
  const folderNavGate = useMemo(() => createFolderNavGate(), []);
  const lastPointerType = useRef("mouse");
  const frame = useRef<HTMLDivElement | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => manager?.start(), [manager]);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // The window is "active" while it is the front window: clicks on the page behind it make it
  // inactive, but the menu bar (and its menus) belongs to the front window and keeps it active.
  const open = state?.open;
  useEffect(() => {
    if (!manager || !open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null;
      if (frame.current?.contains(target)) manager.setActive(true);
      else if (!target?.closest?.(MENU_BAR_SELECTOR)) manager.setActive(false);
    };
    // Command-Up is Open Enclosing Folder whenever the Files window is in front.
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!manager.getSnapshot().active || event.key !== "ArrowUp") return;
      if (!(event.metaKey || event.ctrlKey) || (event.target as Element)?.closest?.("input"))
        return;
      event.preventDefault();
      manager.openEnclosing();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [manager, open]);
  if (!manager || !state) return null;

  const folder = state.folder;
  const entries = manager.visibleEntries();
  const atRoot = folder === FilesFolder.Root;
  const inTrash = folder === FilesFolder.Trash;
  const pagePath = manager.pageTarget()?.path;
  // Only folders with something in them, plus the current tool's own folder, which is where
  // dropped files go. "Show Empty Folders" restores the full structure.
  const listed = (id: string) => state.showEmpty || id === pagePath || manager.folderCount(id) > 0;
  const allFolders: FolderItem[] = [
    { id: FilesFolder.Recent, name: text("files.folder.recent"), icon: IconKind.Folder },
    {
      id: FilesFolder.EditorProjects,
      name: text("files.folder.projects"),
      icon: IconKind.Folder,
    },
    { id: EDITOR_FOLDER, name: text("files.folder.editor"), icon: IconKind.Folder },
    ...FILE_TOOLS.map((tool) => ({ id: tool.path, name: t(tool.label), icon: IconKind.Folder })),
    {
      id: FilesFolder.Trash,
      name: text("files.trash"),
      icon: manager.folderCount(FilesFolder.Trash) ? IconKind.TrashFull : IconKind.Trash,
    },
  ];
  const nothingSaved =
    atRoot &&
    !state.showEmpty &&
    !entries.length &&
    allFolders.every((item) => !manager.folderCount(item.id));
  const folders: FolderItem[] =
    atRoot && !nothingSaved ? allFolders.filter((item) => listed(item.id)) : [];
  const count = folders.length + entries.length;
  const free = state.estimate?.quota
    ? formatBytes(Math.max(0, state.estimate.quota - state.estimate.usage), language)
    : null;
  const countText =
    count === 1 ? text("files.info.bar.count.one") : text("files.info.bar.count", { count });
  const freeText = free ? text("files.info.available", { free }) : null;
  const selected = new Set(state.selection);
  const title = folderName(folder, text, t);
  const order = [...folders.map((item) => item.id), ...entries.map((entry) => entry.id)];
  const focusId = state.selection[state.selection.length - 1] ?? order[0];

  const startRename = (entry: FileEntry) => {
    if (entry.kind !== FileEntryKind.File || inTrash) return;
    setDraft(entry.name);
    setRenaming(entry.id);
  };
  const commitRename = (id: string, value: string) => {
    setRenaming(null);
    void manager.rename(id, value);
  };
  const goToFolder = (id: string) => {
    folderNavGate.arm();
    manager.setFolder(id);
  };
  const openItem = (id: string) => {
    if (allFolders.some((item) => item.id === id) || id === FilesFolder.Root) {
      return goToFolder(id);
    }
    // Ghost click after folder open: ignore file open into the editor.
    if (folderNavGate.suppressed()) return;
    const entry = manager.entry(id);
    if (entry && !inTrash) void manager.openEntry(entry);
  };

  const entryMenu = (entry: FileEntry): MenuItem[] => {
    const ids = selected.has(entry.id) ? state.selection : [entry.id];
    const isFile = entry.kind === FileEntryKind.File;
    if (inTrash)
      return [
        { label: text("files.put.away"), onSelect: () => void manager.restore(ids) },
        { label: text("files.get.info"), onSelect: () => manager.showInfo(entry.id) },
        { label: text("files.empty.trash"), separator: true, onSelect: manager.requestEmptyTrash },
      ];
    return [
      { label: text("files.open"), onSelect: () => openItem(entry.id) },
      {
        label: text("files.open.in"),
        children: [
          { label: text("files.editor"), onSelect: () => void manager.openInEditor(entry) },
          ...(isFile
            ? FILE_TOOLS.filter((tool) => manager.accepts(tool, entry)).map((tool) => ({
                label: t(tool.label),
                onSelect: () =>
                  void manager.openInTool(tool.path, localizedSiteHref(tool.path, language), entry),
              }))
            : []),
        ],
      },
      {
        label: text("files.get.info"),
        separator: true,
        onSelect: () => manager.showInfo(entry.id),
      },
      { label: text("files.rename"), disabled: !isFile, onSelect: () => startRename(entry) },
      {
        label: text("files.duplicate"),
        disabled: !isFile,
        onSelect: () => void manager.duplicate(ids),
      },
      {
        label: text("files.label"),
        disabled: !isFile,
        children: Array.from({ length: 8 }, (_, label) => ({
          label: text(`files.label.${label}` as `files.label.${0}`),
          checked: entry.label === label,
          onSelect: () => void manager.setLabel(ids, label),
        })),
      },
      {
        label: text("files.download"),
        separator: true,
        onSelect: () => void manager.download(ids),
      },
      {
        label: text("files.move.trash"),
        disabled: !isFile,
        onSelect: () => void manager.trash(ids),
      },
    ];
  };
  const backgroundMenu: MenuItem[] = [
    { label: text("files.add"), disabled: inTrash, onSelect: () => picker.current?.click() },
    { label: text("files.select.all"), onSelect: manager.selectAll },
    {
      label: text("files.view.icons"),
      separator: true,
      checked: state.view === FilesView.Icons,
      onSelect: () => manager.setView(FilesView.Icons),
    },
    {
      label: text("files.view.list"),
      checked: state.view === FilesView.List,
      onSelect: () => manager.setView(FilesView.List),
    },
    {
      label: text("files.view.empty"),
      separator: true,
      checked: state.showEmpty,
      onSelect: manager.toggleEmptyFolders,
    },
    // Empty Trash is in Special, and only in Trash here (and on the Trash folder's own menu).
    ...(inTrash
      ? [
          {
            label: text("files.empty.trash"),
            separator: true as const,
            disabled: !manager.folderCount(FilesFolder.Trash),
            onSelect: manager.requestEmptyTrash,
          },
        ]
      : []),
  ];

  const folderMenu = (id: string): MenuItem[] => [
    { label: text("files.open"), onSelect: () => openItem(id) },
    ...(id === FilesFolder.Trash
      ? [
          {
            label: text("files.empty.trash"),
            separator: true as const,
            disabled: !manager.folderCount(FilesFolder.Trash),
            onSelect: manager.requestEmptyTrash,
          },
        ]
      : []),
  ];

  const titleIconKind = inTrash
    ? manager.folderCount(FilesFolder.Trash)
      ? IconKind.TrashFull
      : IconKind.Trash
    : IconKind.Folder;
  // Command-click (or press-and-hold, or tap on touch) on the title: the folder and the
  // folders enclosing it, nearest first, like the classic Finder's title-bar path menu.
  const pathMenu: MenuItem[] = [
    {
      label: title,
      icon: <Icon kind={titleIconKind} size={IconSize.Small} />,
      onSelect: () => undefined,
    },
    ...(atRoot
      ? []
      : [
          {
            label: folderName(FilesFolder.Root, text, t),
            icon: <Icon kind={IconKind.Folder} size={IconSize.Small} />,
            onSelect: () => goToFolder(FilesFolder.Root),
          },
        ]),
  ];
  const zoomBounds = () => {
    const screen = layoutSize(document.documentElement);
    return {
      x: 12,
      y: 12,
      width: Math.min(screen.width - 24, ZOOM_MAX.width),
      height: Math.min(screen.height - 80, ZOOM_MAX.height),
    };
  };
  const zoom = () => setZoomed((value) => !value);
  manager.commands = {
    addFiles: () => picker.current?.click(),
    openSelected: () => {
      if (focusId) openItem(focusId);
    },
    zoom,
  };

  const move = (delta: number, extend: boolean) => {
    const index = Math.max(0, order.indexOf(focusId));
    const next = order[Math.min(order.length - 1, Math.max(0, index + delta))];
    if (next) {
      manager.select(next, extend ? "extend" : "replace");
      grid.current?.querySelector<HTMLElement>(`[data-files-item="${CSS.escape(next)}"]`)?.focus();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    const command = event.metaKey || event.ctrlKey;
    const current = manager.entry(focusId);
    const step = state.view === FilesView.Icons ? columns : 1;
    const handled = (() => {
      switch (event.key) {
        case "ArrowRight":
          if (state.view === FilesView.Icons) move(1, event.shiftKey);
          else return false;
          return true;
        case "ArrowLeft":
          if (state.view === FilesView.Icons) move(-1, event.shiftKey);
          else return false;
          return true;
        case "ArrowDown":
          if (command) openItem(focusId);
          else move(step, event.shiftKey);
          return true;
        case "ArrowUp":
          if (command) manager.openEnclosing();
          else move(-step, event.shiftKey);
          return true;
        case "Enter":
          if (focusId) openItem(focusId);
          return true;
        case "F2":
          if (current) startRename(current);
          return true;
        case "Delete":
        case "Backspace":
          if (inTrash || !state.selection.length) return false;
          void manager.trash();
          return true;
        case "a":
          if (!command) return false;
          manager.selectAll();
          return true;
        case "i":
          if (!command || !current) return false;
          manager.showInfo(current.id);
          return true;
        case "d":
          if (!command) return false;
          void manager.duplicate(state.selection);
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };

  const isOsFileDrag = (event: DragEvent) =>
    event.dataTransfer.types.includes("Files") &&
    !event.dataTransfer.types.includes(FILES_DRAG_TYPE);
  const stopSpring = () => {
    if (spring.current) window.clearTimeout(spring.current.timer);
    spring.current = null;
  };
  const springOpen = (id: string) => {
    if (spring.current?.folder === id) return;
    stopSpring();
    spring.current = {
      folder: id,
      timer: window.setTimeout(() => {
        spring.current = null;
        goToFolder(id);
      }, SPRING_DELAY_MS),
    };
  };

  const itemProps = (id: string, entry?: FileEntry) => ({
    "data-files-item": id,
    role: "option" as const,
    "aria-selected": selected.has(id),
    "data-selected": selected.has(id) || undefined,
    tabIndex: id === focusId ? 0 : -1,
    draggable: !!entry && !inTrash,
    onPointerDown: (event: PointerEvent<Element>) => {
      lastPointerType.current = event.pointerType || "mouse";
    },
    onClick: (event: MouseEvent<Element>) => {
      // After navigating into a folder, a delayed/ghost click can hit the file
      // now under the finger and would select+open it into the editor.
      if (folderNavGate.suppressed()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      manager.select(
        id,
        event.metaKey || event.ctrlKey ? "toggle" : event.shiftKey ? "extend" : "replace",
      );
      // Touch/pen: single tap opens. Mouse/trackpad: click only selects.
      if (opensOnPrimaryClick(lastPointerType.current)) openItem(id);
    },
    onDoubleClick: (event: MouseEvent<Element>) => {
      if (folderNavGate.suppressed()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Touch already opened on the first tap; ignore the synthesized dblclick.
      if (opensOnPrimaryClick(lastPointerType.current)) return;
      openItem(id);
    },
    onDragStart: (event: DragEvent) => {
      if (!entry) return event.preventDefault();
      const ids = selected.has(id) ? state.selection : [id];
      if (!selected.has(id)) manager.select(id);
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(FILES_DRAG_TYPE, encodeFilesDrag(ids));
      event.dataTransfer.setData(
        "text/plain",
        ids.map((value) => manager.entry(value)?.name ?? "").join("\n"),
      );
    },
    onDragOver: entry
      ? undefined
      : (event: DragEvent) => {
          if (id === FilesFolder.Trash && event.dataTransfer.types.includes(FILES_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            return;
          }
          if (!isOsFileDrag(event)) return;
          event.preventDefault();
          springOpen(id);
        },
    onDrop:
      id === FilesFolder.Trash
        ? (event: DragEvent) => {
            const ids = decodeFilesDrag(event.dataTransfer.getData(FILES_DRAG_TYPE));
            if (!ids.length) return;
            event.preventDefault();
            event.stopPropagation();
            void manager.trash(ids);
          }
        : undefined,
    onDragLeave: entry ? undefined : stopSpring,
  });

  const renderName = (entry: FileEntry) =>
    renaming === entry.id ? (
      <Input
        aria-label={text("files.rename")}
        pixelWidth={TILE_WIDTH - 8}
        value={draft}
        autoFocus
        onValueChange={setDraft}
        onCommit={(value) => commitRename(entry.id, value)}
        onBlur={() => commitRename(entry.id, draft)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setRenaming(null);
          event.stopPropagation();
        }}
      />
    ) : (
      entry.name
    );

  const iconView = (
    <div className={styles.icons}>
      {folders.map((item) => (
        <ContextMenu key={item.id} label={item.name} items={folderMenu(item.id)}>
          <Button
            variant={ButtonVariant.Tile}
            tileSize={IconSize.Medium}
            {...itemProps(item.id)}
            slots={{ leading: <Icon kind={item.icon} size={IconSize.Medium} /> }}
            text={item.name}
          />
        </ContextMenu>
      ))}
      {entries.map((entry) => (
        <ContextMenu key={entry.id} label={entry.name} items={entryMenu(entry)}>
          <Button
            variant={ButtonVariant.Tile}
            tileSize={IconSize.Medium}
            {...itemProps(entry.id, entry)}
            data-label={entry.label || undefined}
            style={{ "--files-label": LABEL_COLORS[entry.label] } as React.CSSProperties}
            slots={{
              leading: <Thumbnail manager={manager} entry={entry} size={IconSize.Medium} />,
              content: renderName(entry),
            }}
          />
        </ContextMenu>
      ))}
    </div>
  );

  const header = (key: FilesSortKey, label: string, className: string) => (
    <th
      scope="col"
      className={className}
      aria-sort={
        state.sort.key === key ? (state.sort.ascending ? "ascending" : "descending") : undefined
      }
      data-sorted={state.sort.key === key || undefined}
    >
      <button type="button" className={styles.sortButton} onClick={() => manager.setSort(key)}>
        <span className={styles.sortLabel}>{label}</span>
        {state.sort.key === key && (
          <span
            className={styles.sortArrow}
            aria-hidden="true"
            data-ascending={state.sort.ascending}
          >
            {"\u25B4"}
          </span>
        )}
      </button>
    </th>
  );
  const dateCell = (time: number | undefined) =>
    time ? (
      <>
        <span className={styles.dateLong}>{formatDate(time, language)}</span>
        <span className={styles.dateShort}>{formatShortDate(time, language)}</span>
      </>
    ) : (
      text("files.unknown")
    );
  const listView = (
    <table className={styles.list}>
      <thead>
        <tr>
          {header(FilesSortKey.Name, text("files.column.name"), styles.colName)}
          {header(FilesSortKey.Modified, text("files.column.modified"), styles.colModified)}
          {header(FilesSortKey.Size, text("files.column.size"), styles.colSize)}
          {header(FilesSortKey.Kind, text("files.column.kind"), styles.colKind)}
          {header(FilesSortKey.Label, text("files.column.label"), styles.colLabel)}
        </tr>
      </thead>
      <tbody>
        {folders.map((item) => (
          <ContextMenu key={item.id} label={item.name} items={folderMenu(item.id)}>
            <tr {...itemProps(item.id)}>
              <td className={styles.colName}>
                <span className={styles.nameCell}>
                  <Icon kind={item.icon} size={IconSize.Small} />
                  <span className={styles.nameText}>{item.name}</span>
                </span>
              </td>
              <td className={styles.colModified}>{text("files.unknown")}</td>
              <td className={styles.colSize}>{text("files.unknown")}</td>
              <td className={styles.colKind}>{text("files.kind.folder")}</td>
              <td className={styles.colLabel} />
            </tr>
          </ContextMenu>
        ))}
        {entries.map((entry) => (
          <ContextMenu key={entry.id} label={entry.name} items={entryMenu(entry)}>
            <tr {...itemProps(entry.id, entry)}>
              <td className={styles.colName}>
                <span className={styles.nameCell}>
                  <Thumbnail manager={manager} entry={entry} size={IconSize.Small} />
                  <span className={styles.nameText}>{renderName(entry)}</span>
                </span>
              </td>
              <td className={styles.colModified}>{dateCell(entry.modifiedAt)}</td>
              <td className={styles.colSize}>
                {entry.size ? formatBytes(entry.size, language) : text("files.unknown")}
              </td>
              <td className={styles.colKind}>{entryKind(entry, text)}</td>
              <td className={styles.colLabel}>
                {entry.label ? (
                  <span className={styles.labelCell}>
                    <span
                      className={styles.labelSwatch}
                      style={{ background: LABEL_COLORS[entry.label] }}
                      aria-hidden="true"
                    />
                    {text(`files.label.${entry.label}` as `files.label.${0}`)}
                  </span>
                ) : null}
              </td>
            </tr>
          </ContextMenu>
        ))}
      </tbody>
    </table>
  );

  const notice = state.error ?? state.notice;
  return (
    <>
      <Dialog
        portal
        open={state.open}
        centerOnOpen
        constrainToViewport
        viewportEdgeInset={windowMetrics.viewportEdgeInset}
        title={title}
        titleIcon={<Icon kind={titleIconKind} size={IconSize.Small} />}
        titleMenu={{ label: text("files.path.menu"), items: pathMenu }}
        inactive={!state.active}
        onZoom={narrow ? undefined : zoom}
        zoomLabel={text("files.zoom")}
        onRootRef={(node) => {
          frame.current = node;
        }}
        closeLabel={text("files.close")}
        defaultBounds={WINDOW_BOUNDS}
        bounds={zoomed ? zoomBounds() : undefined}
        minSize={WINDOW_MIN}
        onOpenChange={(open) => {
          if (!open) manager.closeWindow();
        }}
        movable
        resizable
        contentLayout={OverlayContentLayout.Flow}
      >
        {({ clientBounds }) => {
          const nextColumns = Math.max(1, Math.floor((clientBounds.width - 16) / (TILE_WIDTH + 8)));
          if (nextColumns !== columns) queueMicrotask(() => setColumns(nextColumns));
          return (
            <div
              className={styles.window}
              style={{ height: clientBounds.height }}
              data-files-window=""
            >
              <div className={styles.infoStrip} role="status" data-files-info="">
                <span className={styles.infoCount}>{countText}</span>
                {freeText && <span className={styles.infoFree}>{freeText}</span>}
              </div>
              <ContextMenu label={title} items={backgroundMenu}>
                <div
                  ref={grid}
                  className={styles.body}
                  data-dropping={dropping || undefined}
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label={text("files.list.label", { folder: title })}
                  aria-description={text("files.instructions")}
                  onKeyDown={onKeyDown}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) manager.clearSelection();
                  }}
                  onDragOver={(event) => {
                    if (!isOsFileDrag(event) || inTrash) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setDropping(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDropping(false);
                      stopSpring();
                    }
                  }}
                  onDrop={(event) => {
                    setDropping(false);
                    stopSpring();
                    if (!isOsFileDrag(event) || inTrash) return;
                    event.preventDefault();
                    void manager.importFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  <ScrollArea className={styles.scroll} aria-label={title}>
                    {count === 0 ? null : state.view === FilesView.Icons ? iconView : listView}
                  </ScrollArea>
                  {dropping && (
                    <div className={styles.dropOverlay}>
                      <Text variant={TextVariant.Reading}>{text("files.drop.add")}</Text>
                    </div>
                  )}
                </div>
              </ContextMenu>
              {notice && (
                <div className={styles.notice} role="status" aria-live="polite">
                  <Text variant={TextVariant.Reading} wrap>
                    {text(notice)}
                  </Text>
                  <Button text={text("files.dismiss")} onClick={manager.dismissNotice} />
                </div>
              )}
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                aria-label={text("files.add")}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = "";
                  void manager.importFiles(files);
                }}
              />
            </div>
          );
        }}
      </Dialog>
      <FilesInfoWindow />
      <AlertDialog
        open={state.confirmEmpty}
        onOpenChange={(open) => {
          if (!open) manager.cancelEmptyTrash();
        }}
        title={text("files.confirm.title")}
        messageLines={[
          text("files.confirm.message", { count: manager.folderCount(FilesFolder.Trash) }),
        ]}
        actions={[
          {
            label: text("files.confirm.ok"),
            primary: true,
            onClick: () => void manager.emptyTrash(),
          },
          { label: text("files.cancel"), onClick: manager.cancelEmptyTrash },
        ]}
      />
    </>
  );
}
