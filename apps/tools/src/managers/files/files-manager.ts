import {
  accepts,
  countBucket,
  entriesIn,
  extensionOf,
  FilesFolder,
  FilesSortKey,
  FilesView,
  importLimit,
  LOOSE_FOLDER,
  QUOTA_WARNING_RATIOS,
  sizeBucket,
  sortEntries,
  TRASH_RETENTION_MS,
  type FilesSort,
} from "$/managers/files/files-model";
import type { FilesTextKey } from "$/managers/locale/files-text";
import {
  FileEntryKind,
  type FileEntry,
  type FilesPort,
  type FilesStorageEstimate,
} from "$/managers/ports/files";
import { SiteTelemetryEvent } from "@xprite/site-shell/telemetry";

export enum FilesEntryPoint {
  DesktopIcon = "desktop_icon",
  Menubar = "menubar",
  Trash = "trash",
}

enum FilesOpenMethod {
  DoubleClick = "dblclick",
  OpenIn = "open_in",
  Drag = "drag",
}

/** A tool import area on this page that can load a Files item directly. */
export interface FilesTarget {
  path: string;
  accept: string;
  open(file: File): Promise<void>;
}

export interface FilesSnapshot {
  open: boolean;
  folder: string;
  view: FilesView;
  /** List folders that hold nothing (the open page's tool folder is always listed). */
  showEmpty: boolean;
  sort: FilesSort;
  entries: readonly FileEntry[];
  selection: readonly string[];
  loading: boolean;
  available: boolean;
  estimate: FilesStorageEstimate | null;
  infoId: string | null;
  confirmEmpty: boolean;
  /** Text keys; components translate them. */
  notice: FilesTextKey | null;
  error: FilesTextKey | null;
}

const INITIAL: FilesSnapshot = {
  open: false,
  folder: FilesFolder.Root,
  view: FilesView.Icons,
  showEmpty: false,
  sort: { key: FilesSortKey.Name, ascending: true },
  entries: [],
  selection: [],
  loading: false,
  available: true,
  estimate: null,
  infoId: null,
  confirmEmpty: false,
  notice: null,
  error: null,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function storageCategory(reason: unknown): string {
  const name = reason instanceof Error ? reason.name : "";
  if (name === "QuotaExceededError") return "quota";
  if (name === "UnknownError" || name === "SecurityError" || name === "InvalidStateError")
    return "unavailable";
  return "io";
}

/** Owns the Files window, its selection and every file operation. Bytes stay in the browser. */
export class FilesManager {
  private state: FilesSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private targets = new Set<FilesTarget>();
  private thumbnails = new Map<string, Promise<string | null>>();
  private persistAsked = false;
  private warnedRatio = 0;
  private stop?: () => void;
  private refreshing?: Promise<void>;
  private disposed = false;

  constructor(private readonly port: FilesPort) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<FilesSnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Start listening to other tabs and purge old Trash once per page. */
  start() {
    if (this.stop) return;
    this.stop = this.port.subscribe(() => void this.refresh());
    void this.port.purgeTrash(TRASH_RETENTION_MS).catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    this.stop?.();
    this.listeners.clear();
  }

  /** Entries of the open folder, in the current sort order. */
  visibleEntries(): FileEntry[] {
    return sortEntries(entriesIn(this.state.entries, this.state.folder), this.state.sort);
  }

  folderCount(folder: string): number {
    return entriesIn(this.state.entries, folder).length;
  }

  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const [entries, estimate] = await Promise.all([this.port.list(), this.port.estimate()]);
        const ids = new Set(entries.map((entry) => entry.id));
        this.publish({
          entries,
          estimate,
          available: true,
          selection: this.state.selection.filter((id) => ids.has(id)),
          infoId: this.state.infoId && ids.has(this.state.infoId) ? this.state.infoId : null,
        });
        this.warnQuota(estimate);
      } catch (reason) {
        this.publish({ available: false, error: "files.notice.unavailable" });
        this.port.capture(SiteTelemetryEvent.FilesStorageError, {
          category: storageCategory(reason),
        });
      } finally {
        this.refreshing = undefined;
      }
    })();
    return this.refreshing;
  }

  private warnQuota(estimate: FilesStorageEstimate | null) {
    if (!estimate?.quota) return;
    const ratio = estimate.usage / estimate.quota;
    const level = [...QUOTA_WARNING_RATIOS].reverse().find((value) => ratio >= value);
    if (!level || level <= this.warnedRatio) return;
    this.warnedRatio = level;
    this.publish({
      notice: level >= 0.95 ? "files.notice.almost.full" : "files.notice.eighty",
    });
    this.port.capture(SiteTelemetryEvent.FilesQuotaWarning, { level: Math.round(level * 100) });
  }

  async openWindow(entry: FilesEntryPoint, folder: string = FilesFolder.Root) {
    this.publish({ open: true, folder, selection: [], loading: true, confirmEmpty: false });
    this.port.capture(SiteTelemetryEvent.FilesOpened, { entry });
    await this.refresh();
    this.publish({ loading: false });
  }

  closeWindow = () => this.publish({ open: false, infoId: null, confirmEmpty: false });

  setFolder = (folder: string) =>
    this.publish({ folder, selection: [], confirmEmpty: false, error: null });

  setView = (view: FilesView) => {
    if (view === this.state.view) return;
    this.publish({ view });
    this.port.capture(SiteTelemetryEvent.FilesViewChanged, { view });
  };

  toggleEmptyFolders = () => this.publish({ showEmpty: !this.state.showEmpty });

  setSort = (key: FilesSortKey) => {
    const ascending = this.state.sort.key === key ? !this.state.sort.ascending : key === "name";
    this.publish({ sort: { key, ascending } });
  };

  select = (id: string, mode: "replace" | "toggle" | "extend" = "replace") => {
    const selection = this.state.selection;
    if (mode === "toggle")
      return this.publish({
        selection: selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id],
      });
    if (mode === "extend" && selection.length) {
      const ids = this.visibleEntries().map((entry) => entry.id);
      const anchor = ids.indexOf(selection[0]);
      const end = ids.indexOf(id);
      if (anchor >= 0 && end >= 0) {
        const [from, to] = anchor < end ? [anchor, end] : [end, anchor];
        const range = ids.slice(from, to + 1);
        return this.publish({
          selection: [selection[0], ...range.filter((s) => s !== selection[0])],
        });
      }
    }
    this.publish({ selection: [id] });
  };

  selectAll = () => this.publish({ selection: this.visibleEntries().map((entry) => entry.id) });
  clearSelection = () => this.publish({ selection: [] });
  dismissNotice = () => this.publish({ notice: null, error: null });

  selectedEntries(): FileEntry[] {
    const ids = new Set(this.state.selection);
    return this.state.entries.filter((entry) => ids.has(entry.id));
  }

  entry(id: string | null): FileEntry | undefined {
    return id ? this.state.entries.find((entry) => entry.id === id) : undefined;
  }

  /** Register a tool import area on this page. */
  registerTarget(target: FilesTarget): () => void {
    this.targets.add(target);
    return () => this.targets.delete(target);
  }

  /** The page's own tool, used for double-click and drag. */
  pageTarget(): FilesTarget | undefined {
    return [...this.targets][0];
  }

  /** Auto-save after a tool parsed a file. Over-limit files still open; they are not kept. */
  async remember(file: File, folder: string, source = "file"): Promise<void> {
    if (file.size > importLimit(folder, file.name)) {
      this.publish({ notice: "files.notice.too.large" });
      return;
    }
    await this.add(file, folder, source);
  }

  /** Drag in or Add…: files go to the open tool folder, or the Files root. */
  async importFiles(files: readonly File[], folder = this.state.folder) {
    const target = folder.startsWith("/") ? folder : LOOSE_FOLDER;
    let skipped = 0;
    for (const file of files) {
      if (file.size > importLimit(target, file.name)) {
        skipped++;
        continue;
      }
      await this.add(file, target, "drop");
    }
    if (skipped) this.publish({ notice: "files.notice.skipped" });
  }

  private async add(file: File, folder: string, source: string) {
    try {
      const { deduped } = await this.port.add(file, folder, source);
      this.port.capture(SiteTelemetryEvent.FilesImported, {
        source,
        kind: extensionOf(file.name),
        size_bucket: sizeBucket(file.size),
        deduped,
      });
      if (!this.persistAsked) {
        this.persistAsked = true;
        const granted = await this.port.persist();
        this.port.capture(SiteTelemetryEvent.FilesPersistResult, { granted });
      }
      await this.refresh();
    } catch (reason) {
      const category = storageCategory(reason);
      this.port.capture(SiteTelemetryEvent.FilesStorageError, { category });
      this.publish({
        notice: category === "quota" ? "files.notice.quota" : "files.notice.save.failed",
      });
    }
  }

  readFile(entry: FileEntry): Promise<File> {
    return this.port.read(entry);
  }

  thumbnail(entry: FileEntry): Promise<string | null> {
    const key = `${entry.id}:${entry.modifiedAt}`;
    let url = this.thumbnails.get(key);
    if (!url) {
      url = this.port.thumbnail(entry).catch(() => null);
      this.thumbnails.set(key, url);
    }
    return url;
  }

  /** Default open: the editor for projects and Aseprite files on other pages, else this tool. */
  async openEntry(entry: FileEntry, method = FilesOpenMethod.DoubleClick) {
    const target = this.pageTarget();
    if (entry.kind === FileEntryKind.File && target) {
      const file = await this.port.read(entry);
      if (method !== FilesOpenMethod.Drag && !this.accepts(target, file))
        return this.openInEditor(entry, method);
      return this.loadInto(target, entry, file, method);
    }
    return this.openInEditor(entry, method);
  }

  accepts(target: Pick<FilesTarget, "accept">, entry: Pick<FileEntry, "name" | "type">) {
    return accepts(target.accept, entry.name, entry.type);
  }

  async loadInto(
    target: FilesTarget,
    entry: FileEntry,
    file?: File,
    method = FilesOpenMethod.Drag,
  ) {
    const loaded = file ?? (await this.port.read(entry));
    this.port.capture(SiteTelemetryEvent.FilesItemOpened, { target_tool: target.path, method });
    await this.port.touch(entry.id).catch(() => undefined);
    this.publish({ open: false });
    await target.open(loaded);
  }

  async openInEditor(entry: FileEntry, method = FilesOpenMethod.OpenIn) {
    this.port.capture(SiteTelemetryEvent.FilesItemOpened, { target_tool: "editor", method });
    if (entry.kind === FileEntryKind.File) await this.port.touch(entry.id).catch(() => undefined);
    await this.port.openInEditor(entry);
  }

  /** `href` is the page-language URL of the tool at `path`. */
  async openInTool(path: string, href: string, entry: FileEntry) {
    const target = [...this.targets].find((candidate) => candidate.path === path);
    if (target) return this.loadInto(target, entry, undefined, FilesOpenMethod.OpenIn);
    this.port.capture(SiteTelemetryEvent.FilesItemOpened, {
      target_tool: path,
      method: FilesOpenMethod.OpenIn,
    });
    await this.port.touch(entry.id).catch(() => undefined);
    this.port.openInTool(href, entry);
  }

  /** Load an item handed over from another page's Open in… command. */
  async takeHandoff(target: FilesTarget): Promise<void> {
    const id = this.port.takeHandoff();
    if (!id) return;
    await this.refresh();
    const entry = this.entry(id);
    if (entry) await target.open(await this.port.read(entry));
  }

  async rename(id: string, name: string) {
    const trimmed = name.trim();
    const entry = this.entry(id);
    if (!entry || !trimmed || trimmed === entry.name || entry.kind !== FileEntryKind.File) return;
    await this.port.update(id, { name: trimmed.replace(/[\\/:]/g, "-") });
    await this.refresh();
  }

  async setLabel(ids: readonly string[], label: number) {
    for (const id of ids)
      if (this.entry(id)?.kind === FileEntryKind.File) await this.port.update(id, { label });
    await this.refresh();
  }

  async setComment(id: string, comment: string) {
    if (this.entry(id)?.kind !== FileEntryKind.File) return;
    await this.port.update(id, { comment });
    await this.refresh();
  }

  async duplicate(ids: readonly string[]) {
    for (const id of ids)
      if (this.entry(id)?.kind === FileEntryKind.File) await this.port.duplicate(id);
    await this.refresh();
  }

  async trash(ids: readonly string[] = this.state.selection) {
    const files = ids.filter((id) => this.entry(id)?.kind === FileEntryKind.File);
    if (!files.length) return;
    await this.port.trash(files);
    this.port.capture(SiteTelemetryEvent.FilesTrashed, { count_bucket: countBucket(files.length) });
    this.publish({ selection: [] });
    await this.refresh();
  }

  /** Put Away. */
  async restore(ids: readonly string[] = this.state.selection) {
    if (!ids.length) return;
    await this.port.restore(ids);
    this.publish({ selection: [] });
    await this.refresh();
  }

  requestEmptyTrash = () => {
    if (this.folderCount(FilesFolder.Trash)) this.publish({ confirmEmpty: true });
  };
  cancelEmptyTrash = () => this.publish({ confirmEmpty: false });

  async emptyTrash() {
    this.publish({ confirmEmpty: false });
    const removed = await this.port.emptyTrash();
    this.port.capture(SiteTelemetryEvent.FilesTrashEmptied, { count_bucket: countBucket(removed) });
    await this.refresh();
  }

  /** One file downloads as itself; several become one zip. Editor projects open in the editor. */
  async download(ids: readonly string[] = this.state.selection) {
    const entries = ids
      .map((id) => this.entry(id))
      .filter((entry): entry is FileEntry => entry?.kind === FileEntryKind.File);
    if (!entries.length) {
      this.publish({ notice: "files.notice.project.download" });
      return;
    }
    try {
      const files = await Promise.all(entries.map((entry) => this.port.read(entry)));
      await this.port.download(files, `Xprite Files ${today()}.zip`);
      this.port.capture(SiteTelemetryEvent.FilesDownloaded, {
        count_bucket: countBucket(files.length),
        zipped: files.length > 1,
      });
    } catch {
      this.publish({ error: "files.notice.download.failed" });
    }
  }

  showInfo = (id: string | null) => this.publish({ infoId: id });
}
