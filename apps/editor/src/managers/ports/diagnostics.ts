export const MAX_DIAGNOSTIC_RECORDS = 200;
export const DIAGNOSTIC_RETENTION_DAYS = 7;

export enum DiagnosticSource {
  ReactBoundary = "react-boundary",
  GlobalError = "global-error",
  UnhandledRejection = "unhandled-rejection",
  ServiceWorker = "service-worker",
  Session = "session",
  ImportWorker = "import-worker",
  RecoveryWorker = "recovery-worker",
  Workspace = "workspace",
}

export enum WorkspaceDiagnosticAction {
  WorkspaceReady = "workspace-ready",
  DocumentCreated = "document-created",
  SourceImportStarted = "source-import-started",
  SourceImportCompleted = "source-import-completed",
  BrowserProjectOpened = "browser-project-opened",
  ProjectRecovered = "project-recovered",
  RecentImageOpened = "recent-image-opened",
  ClosedDocumentReopened = "closed-document-reopened",
  DocumentClosed = "document-closed",
  BrowserProjectSaved = "browser-project-saved",
  BrowserProjectSavedAs = "browser-project-saved-as",
}

export interface WorkspaceDiagnosticEvent {
  readonly action: WorkspaceDiagnosticAction;
  readonly slotId?: string;
  readonly projectId?: string;
  readonly previousProjectId?: string;
  readonly recentId?: string;
  readonly documentName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly result?: string;
}

interface WorkspaceDiagnosticOpenDocument {
  readonly slotId: string;
  readonly projectId: string | null;
  readonly documentName: string;
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  readonly modified: boolean;
}

export interface BrowserProjectDiagnosticEntry {
  readonly projectId: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly width: number;
  readonly height: number;
  readonly storageBackend: string;
  readonly isOpen: boolean;
  readonly slotId?: string;
  readonly lastSlotId?: string;
}

export interface WorkspaceDiagnosticSnapshot {
  readonly activeSlotId: string;
  readonly openDocuments: readonly WorkspaceDiagnosticOpenDocument[];
  readonly browserProjects: readonly BrowserProjectDiagnosticEntry[];
  readonly duplicateNameGroups: readonly {
    readonly name: string;
    readonly count: number;
    readonly projectIds: readonly string[];
  }[];
}

export interface DiagnosticRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly source: DiagnosticSource;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly componentStack?: string;
  readonly context?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly workspaceEvent?: WorkspaceDiagnosticEvent;
}

export interface DiagnosticCaptureDetails {
  context?: string;
  componentStack?: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface RuntimeCapabilitySnapshot {
  readonly openFilePicker: boolean;
  readonly saveFilePicker: boolean;
  readonly opfs: boolean;
  readonly indexedDb: boolean;
  readonly workers: boolean;
  readonly compressionStream: boolean;
  readonly offscreenCanvas: boolean;
  readonly imageBitmap: boolean;
}

/** Local diagnostic capture and export capability supplied by the browser adapter. */
export interface DiagnosticsPort {
  capture(reason: unknown, source: DiagnosticSource, details?: DiagnosticCaptureDetails): void;
  recordWorkspaceEvent(event: WorkspaceDiagnosticEvent): void;
  setWorkspaceSnapshotProvider(provider: (() => Promise<WorkspaceDiagnosticSnapshot>) | null): void;
  getRuntimeCapabilities(): RuntimeCapabilitySnapshot;
  getRecent(): Promise<readonly DiagnosticRecord[]>;
  clear(): Promise<void>;
  exportLogs(): Promise<number>;
  /** Hosts without file downloads may supply a report for an in-page viewer. */
  readReport?(): Promise<string>;
}
