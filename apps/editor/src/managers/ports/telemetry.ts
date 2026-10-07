export enum TelemetryEvent {
  EditorStartup = "editor_startup",
  EditorReady = "editor_ready",
  VisitCheckpoint = "visit_checkpoint",
  ViewChanged = "view_changed",
  DocumentRestored = "document_restored",
  DocumentOpened = "document_opened",
  DocumentEditStarted = "document_edit_started",
  FileDownloadRequested = "file_download_requested",
  FileSaveAsCompleted = "file_save_as_completed",
  EditorOperation = "editor_operation",
  FeatureUsed = "feature_used",
  FeedbackSubmitted = "feedback_submitted",
}

export enum TelemetryStartupStage {
  Bootstrap = "bootstrap",
  Workspace = "workspace",
  UiAssets = "ui_assets",
}

export enum TelemetryStartupStatus {
  Started = "started",
  Completed = "completed",
  Failed = "failed",
  Stalled = "stalled",
}

export enum TelemetryLifecycleKind {
  Visible = "visible",
  Hidden = "hidden",
  PageHide = "pagehide",
}

export interface TelemetryLifecycleSignal {
  readonly kind: TelemetryLifecycleKind;
  readonly initial: boolean;
  readonly persisted: boolean;
}

export enum TelemetryOperationAction {
  OpenDocument = "open_document",
  Save = "save",
  SaveAs = "save_as",
  Export = "export",
}

export enum TelemetryOperationPhase {
  Requested = "requested",
  Finished = "finished",
}

export enum TelemetryOperationTarget {
  Browser = "browser",
  FileSystem = "file_system",
}

export enum TelemetryOperationOutcome {
  Success = "success",
  Cancelled = "cancelled",
  Failed = "failed",
  Ignored = "ignored",
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
  SaveAs = "save_as",
  Export = "export",
}

export enum TelemetryFeatureAction {
  Open = "open",
  Click = "click",
  Select = "select",
  Reset = "reset",
  Resize = "resize",
  Cancel = "cancel",
}

export enum TelemetryDownloadKind {
  Save = "save",
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

export type TelemetryProperties = Readonly<Record<string, string | number | boolean | null>>;

export enum CompareCampaign {
  AsepriteOnline = "aseprite-online",
  AsepriteOnIpad = "aseprite-on-ipad",
  PiskelAlternatives = "piskel-alternatives",
}

export interface TelemetryAttributionInput {
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
}

export interface TelemetryException {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** Ordinary reporting is fire-and-forget; explicit feedback reports success or failure. */
export interface TelemetryPort {
  readonly enabled: boolean;
  capture(event: TelemetryEvent, properties: TelemetryProperties): void;
  captureException(exception: TelemetryException, properties: TelemetryProperties): void;
  /** Explicit user submission; resolves only after the server accepts the event. */
  submitFeedback?(properties: TelemetryProperties): Promise<void>;
}
