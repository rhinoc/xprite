export enum SiteTelemetryEvent {
  Pageview = "$pageview",
  CtaClick = "site_cta_click",
  FileOpened = "tool_file_opened",
  OutputHandedOff = "tool_output_handed_off",
  OperationFailed = "tool_operation_failed",
  FilesOpened = "files_opened",
  FilesImported = "files_item_imported",
  FilesItemOpened = "files_item_opened",
  FilesDownloaded = "files_download",
  FilesTrashed = "files_trash",
  FilesTrashEmptied = "files_trash_emptied",
  FilesViewChanged = "files_view_changed",
  FilesQuotaWarning = "files_quota_warning",
  FilesStorageError = "files_storage_error",
  FilesPersistResult = "files_persist_result",
}

export enum SitePageType {
  Editor = "editor",
  Showcase = "showcase",
  Components = "components",
  Article = "article",
  Help = "help",
  Tools = "tools",
  Tool = "tool",
  Other = "other",
}

export enum SiteToolName {
  Viewer = "viewer",
  GifSheet = "gif-to-sprite-sheet",
  AnimalCrossing = "animal-crossing-qr",
}

export type SiteTelemetryProperties = Readonly<Record<string, string | number | boolean | null>>;

/** Product workflows report results; the browser adapter supplies visit context and delivery. */
export interface SiteTelemetryPort {
  readonly enabled: boolean;
  capture(event: SiteTelemetryEvent, properties: SiteTelemetryProperties): void;
}
