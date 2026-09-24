export enum TelemetryEvent {
  EditorReady = "editor_ready",
  DocumentOpened = "document_opened",
  DocumentEditStarted = "document_edit_started",
  FileDownloadRequested = "file_download_requested",
  FileSaveAsCompleted = "file_save_as_completed",
  FeatureUsed = "feature_used",
}

export enum DocumentOpenMethod {
  Example = "example",
  New = "new",
  Import = "import",
  Recent = "recent",
  Recovery = "recovery",
}

export enum TelemetryFeature {
  Layout = "layout",
  Settings = "settings",
  About = "about",
  Donate = "donate",
}

export enum TelemetryFeatureAction {
  Open = "open",
  Click = "click",
  Select = "select",
  Reset = "reset",
  Resize = "resize",
}

export enum TelemetryDownloadKind {
  SaveAs = "save_as",
  Export = "export",
}

export enum TelemetryEditKind {
  Drawing = "drawing",
  Layers = "layers",
  Frames = "frames",
  Palette = "palette",
  Transform = "transform",
  Other = "other",
}

export type TelemetryProperties = Readonly<Record<string, string | number | boolean>>;

export interface TelemetryException {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** Optional, fire-and-forget reporting. Implementations must never throw into editor workflows. */
export interface TelemetryPort {
  readonly enabled: boolean;
  capture(event: TelemetryEvent, properties: TelemetryProperties): void;
  captureException(exception: TelemetryException, properties: TelemetryProperties): void;
}
