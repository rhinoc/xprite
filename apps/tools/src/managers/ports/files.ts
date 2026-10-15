import type { SiteTelemetryEvent, SiteTelemetryProperties } from "@xprite/site-shell/telemetry";

/** One item shown in Files: an imported file, or an editor project listed in place. */
export enum FileEntryKind {
  File = "file",
  EditorProject = "editor-project",
}

export interface FileEntry {
  id: string;
  kind: FileEntryKind;
  name: string;
  type: string;
  size: number;
  /** A tool path, `/editor/`, or `/` for files dropped straight into Files. */
  folder: string;
  createdAt: number;
  modifiedAt: number;
  openedAt: number;
  label: number;
  comment: string;
  trashedAt?: number;
  width?: number;
  height?: number;
}

export interface FilesStorageEstimate {
  usage: number;
  quota: number;
  persisted: boolean;
}

/** Browser storage, navigation and download capabilities for Files. Never uploads. */
export interface FilesPort {
  list(): Promise<FileEntry[]>;
  add(file: File, folder: string, source: string): Promise<{ entry: FileEntry; deduped: boolean }>;
  read(entry: FileEntry): Promise<File>;
  update(id: string, patch: { name?: string; label?: number; comment?: string }): Promise<void>;
  duplicate(id: string): Promise<void>;
  touch(id: string): Promise<void>;
  trash(ids: readonly string[]): Promise<void>;
  restore(ids: readonly string[]): Promise<void>;
  emptyTrash(): Promise<number>;
  purgeTrash(olderThanMs: number): Promise<number>;
  /** Object URL for a small preview, or null when none can be made. */
  thumbnail(entry: FileEntry): Promise<string | null>;
  estimate(): Promise<FilesStorageEstimate | null>;
  persist(): Promise<boolean>;
  download(files: readonly File[], archiveName: string): Promise<void>;
  openInEditor(entry: FileEntry, file?: File): Promise<void>;
  /** Navigate to another tool page, which loads the item through takeHandoff. */
  openInTool(href: string, entry: FileEntry): void;
  /** A Files item handed to this page by Open in…, consumed once. */
  takeHandoff(): string | null;
  subscribe(listener: () => void): () => void;
  /** Name-free usage events only. */
  capture(event: SiteTelemetryEvent, properties: SiteTelemetryProperties): void;
}
