import { currentUiLanguage } from "$/i18n";
import {
  EditorViewChangeTrigger,
  EditorViewChangeReason,
  EditorView,
  type EditorViewTransition,
} from "$/managers/editor/editor-view-transition";
import {
  DiagnosticSource,
  WorkspaceDiagnosticAction,
  type DiagnosticRecord,
  type WorkspaceDiagnosticEvent,
} from "$/managers/ports/diagnostics";
import {
  DocumentOpenMethod,
  TelemetryDownloadKind,
  TelemetryEditKind,
  TelemetryEvent,
  TelemetryLifecycleKind,
  TelemetryOperationAction,
  TelemetryOperationOutcome,
  TelemetryOperationPhase,
  TelemetryStartupStage,
  TelemetryStartupStatus,
  type TelemetryLifecycleSignal,
  type TelemetryOperationTarget,
  type TelemetryFeature,
  type TelemetryFeatureAction,
  type TelemetryPort,
  type TelemetryProperties,
} from "$/managers/ports/telemetry";
import {
  documentTelemetryContext,
  workspaceTelemetryContext,
} from "$/managers/telemetry/document-context";
import { telemetryException } from "$/managers/telemetry/exception-privacy";
import type { DocumentSlot, DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { exampleProjectId } from "$assets/examples/hello/hello-project";
import type { EditorSnapshot } from "@xprite/editor-core";
import type { EditorDocument } from "@xprite/editor-core/document";

const EXCEPTION_WINDOW_MS = 60_000;
const EXCEPTION_DUPLICATE_WINDOW_MS = 5_000;
const MAX_EXCEPTIONS_PER_WINDOW = 20;
const MAX_EXCEPTION_FINGERPRINTS = 100;
const STARTUP_STALL_MS = 30_000;
const OPERATION_ID_PREFIX = "operation";

interface OpenMetadata {
  method: DocumentOpenMethod;
  format?: string;
}

interface ObservedDocument {
  documentId: number | undefined;
  revision: number;
  pixelRevision: number;
  width: number;
  height: number;
  layerCount: number;
  frameCount: number;
  palette: EditorSnapshot["palette"];
  opened: boolean;
  edited: boolean;
  unsubscribe: () => void;
}

function documentBaseline(snapshot: EditorSnapshot) {
  const document = snapshot.document;
  return {
    documentId: document?.id,
    revision: snapshot.persistenceRevision,
    pixelRevision: snapshot.pixelRevision,
    width: document?.width ?? 0,
    height: document?.height ?? 0,
    layerCount: document?.timeline?.layers.length ?? (document ? 1 : 0),
    frameCount: document?.timeline?.frames.length ?? (document ? 1 : 0),
    palette: snapshot.palette,
  };
}

function editKind(before: ObservedDocument, snapshot: EditorSnapshot): TelemetryEditKind {
  const after = documentBaseline(snapshot);
  if (before.layerCount !== after.layerCount) return TelemetryEditKind.Layers;
  if (before.frameCount !== after.frameCount) return TelemetryEditKind.Frames;
  if (before.width !== after.width || before.height !== after.height)
    return TelemetryEditKind.Transform;
  if (before.palette !== after.palette) return TelemetryEditKind.Palette;
  if (before.pixelRevision !== after.pixelRevision) return TelemetryEditKind.Drawing;
  return TelemetryEditKind.Other;
}

/** Business telemetry lives here. Observers read canonical state; transport owns network I/O. */
export class TelemetryManager {
  private workspace: DocumentWorkspace | null = null;
  private disconnect: (() => void) | null = null;
  private readonly documents = new Map<string, ObservedDocument>();
  private readonly pendingOpens = new Map<string, OpenMetadata>();
  private readonly documentIdentities = new Map<
    string,
    { documentId: number; reportingId: string }
  >();
  private nextDocumentIdentity = 0;
  private ready = false;
  private reportedView: EditorView | null = null;
  private readonly startedAt = performance.now();
  private visitStarted = false;
  private startupTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly startupReports = new Set<string>();
  private readonly startupStageTimes = new Map<TelemetryStartupStage, number>();
  private lastStartupStage = TelemetryStartupStage.Bootstrap;
  private startupFailed = false;
  private visible = true;
  private clockAt = this.startedAt;
  private visibleMs = 0;
  private readonly viewVisibleMs = new Map<EditorView, number>();
  private checkpointSequence = 0;
  private operationSequence = 0;
  private openedCount = 0;
  private editedCount = 0;
  private exceptionWindowStartedAt = 0;
  private exceptionCount = 0;
  private readonly exceptionFingerprints = new Map<string, number>();

  constructor(
    private readonly port: TelemetryPort,
    private readonly visitContext: TelemetryProperties = {},
  ) {}

  get enabled(): boolean {
    return this.port.enabled;
  }

  async submitFeedback(properties: TelemetryProperties): Promise<void> {
    if (!this.port.enabled || !this.port.submitFeedback)
      throw new Error("Feedback transport is unavailable");
    await this.port.submitFeedback({ ...this.context(), ...properties });
  }

  startVisit(): void {
    if (!this.enabled || this.visitStarted) return;
    this.visitStarted = true;
    this.startup(TelemetryStartupStage.Bootstrap, TelemetryStartupStatus.Started);
    this.startupTimeout = setTimeout(() => {
      this.startupTimeout = null;
      if (this.ready || this.startupFailed) return;
      const stage = this.startupReports.has(
        `${TelemetryStartupStage.Workspace}:${TelemetryStartupStatus.Completed}`,
      )
        ? TelemetryStartupStage.UiAssets
        : TelemetryStartupStage.Workspace;
      this.startup(stage, TelemetryStartupStatus.Stalled);
    }, STARTUP_STALL_MS);
  }

  startup(stage: TelemetryStartupStage, status: TelemetryStartupStatus): void {
    if (!this.enabled || this.ready) return;
    const key = `${stage}:${status}`;
    if (this.startupReports.has(key)) return;
    this.startupReports.add(key);
    const now = performance.now();
    if (status === TelemetryStartupStatus.Started) this.startupStageTimes.set(stage, now);
    this.lastStartupStage = stage;
    if (status === TelemetryStartupStatus.Failed) {
      this.startupFailed = true;
      this.clearStartupTimeout();
    }
    const began = this.startupStageTimes.get(stage);
    this.capture(TelemetryEvent.EditorStartup, {
      ...this.context(),
      stage,
      status,
      startup_duration_ms: Math.round(now - this.startedAt),
      ...(began !== undefined ? { stage_duration_ms: Math.round(now - began) } : {}),
      is_visible: this.visible,
    });
  }

  observeLifecycle = (signal: TelemetryLifecycleSignal): void => {
    if (!this.enabled) return;
    this.advanceVisitClock();
    this.visible = signal.kind === TelemetryLifecycleKind.Visible;
    if (signal.initial || this.visible) return;
    this.capture(TelemetryEvent.VisitCheckpoint, {
      ...this.context(),
      checkpoint_sequence: ++this.checkpointSequence,
      checkpoint_reason: signal.kind,
      bfcache: signal.persisted,
      visit_duration_ms: Math.round(performance.now() - this.startedAt),
      visible_duration_ms: Math.round(this.visibleMs),
      home_visible_ms: Math.round(this.viewVisibleMs.get(EditorView.Home) ?? 0),
      editor_visible_ms: Math.round(this.viewVisibleMs.get(EditorView.Editor) ?? 0),
      last_view: this.reportedView,
      startup_ready: this.ready,
      startup_failed: this.startupFailed,
      last_startup_stage: this.lastStartupStage,
      workspace_ready: this.startupReports.has(
        `${TelemetryStartupStage.Workspace}:${TelemetryStartupStatus.Completed}`,
      ),
      ui_assets_ready: this.startupReports.has(
        `${TelemetryStartupStage.UiAssets}:${TelemetryStartupStatus.Completed}`,
      ),
      documents_opened: this.openedCount,
      documents_edited: this.editedCount,
    });
  };

  documentOpenRequested(method: DocumentOpenMethod): void {
    this.capture(TelemetryEvent.EditorOperation, {
      ...this.context(),
      action: TelemetryOperationAction.OpenDocument,
      phase: TelemetryOperationPhase.Requested,
      open_method: method,
    });
  }

  documentOpenCancelled(method: DocumentOpenMethod): void {
    this.capture(TelemetryEvent.EditorOperation, {
      ...this.context(),
      action: TelemetryOperationAction.OpenDocument,
      phase: TelemetryOperationPhase.Finished,
      outcome: TelemetryOperationOutcome.Cancelled,
      open_method: method,
    });
  }

  recentOpenRequested(recentId: string): void {
    this.documentOpenRequested(
      recentId === exampleProjectId ? DocumentOpenMethod.Example : DocumentOpenMethod.Recent,
    );
  }

  beginSave(
    action: TelemetryOperationAction.Save | TelemetryOperationAction.SaveAs,
    target: TelemetryOperationTarget,
    slotId?: string,
  ) {
    return this.beginOperation(action, {
      ...this.context(slotId),
      target,
    });
  }

  beginExport(properties: TelemetryProperties) {
    return this.beginOperation(TelemetryOperationAction.Export, properties);
  }

  dispose(): void {
    this.clearStartupTimeout();
    this.disconnect?.();
    this.disconnect = null;
    this.workspace = null;
  }

  private clearStartupTimeout(): void {
    if (this.startupTimeout !== null) clearTimeout(this.startupTimeout);
    this.startupTimeout = null;
  }

  private advanceVisitClock(): void {
    const now = performance.now();
    const elapsed = Math.max(0, now - this.clockAt);
    if (this.visible) {
      this.visibleMs += elapsed;
      if (this.reportedView)
        this.viewVisibleMs.set(
          this.reportedView,
          (this.viewVisibleMs.get(this.reportedView) ?? 0) + elapsed,
        );
    }
    this.clockAt = now;
  }

  private beginOperation(
    action: TelemetryOperationAction,
    properties: TelemetryProperties,
  ): (outcome: TelemetryOperationOutcome, details?: TelemetryProperties) => void {
    if (!this.enabled) return () => {};
    const operationId = `${OPERATION_ID_PREFIX}-${++this.operationSequence}`;
    const began = performance.now();
    this.capture(TelemetryEvent.EditorOperation, {
      ...properties,
      action,
      phase: TelemetryOperationPhase.Requested,
      operation_id: operationId,
    });
    let completed = false;
    return (outcome, details = {}) => {
      if (completed) return;
      completed = true;
      this.capture(TelemetryEvent.EditorOperation, {
        ...properties,
        ...details,
        action,
        phase: TelemetryOperationPhase.Finished,
        operation_id: operationId,
        outcome,
        operation_duration_ms: Math.round(performance.now() - began),
      });
    };
  }

  bindWorkspace(workspace: DocumentWorkspace): void {
    this.disconnect?.();
    this.workspace = workspace;
    if (!this.port.enabled) return;
    const reconcile = () => {
      const tabs = new Set(workspace.getSnapshot().tabs.map((tab) => tab.id));
      for (const [id, observed] of this.documents) {
        if (!tabs.has(id)) {
          observed.unsubscribe();
          this.documents.delete(id);
          this.pendingOpens.delete(id);
          this.documentIdentities.delete(id);
        }
      }
      for (const id of tabs) {
        if (this.documents.has(id)) continue;
        const slot = workspace.getSlot(id);
        if (!slot) continue;
        const observed: ObservedDocument = {
          ...documentBaseline(slot.core.getSnapshot()),
          opened: false,
          edited: false,
          unsubscribe: () => {},
        };
        this.documents.set(id, observed);
        const update = () => this.observeDocument(slot, observed);
        const offCore = slot.core.subscribe(update);
        const offSession = slot.session.subscribe(update);
        observed.unsubscribe = () => {
          offCore();
          offSession();
        };
        update();
      }
    };
    const offWorkspace = workspace.subscribe(reconcile);
    this.disconnect = () => {
      offWorkspace();
      for (const observed of this.documents.values()) observed.unsubscribe();
      this.documents.clear();
      this.pendingOpens.clear();
      this.documentIdentities.clear();
    };
    reconcile();
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.clearStartupTimeout();
    this.capture(TelemetryEvent.EditorReady, {
      ...this.context(),
      startup_duration_ms: Math.round(performance.now() - this.startedAt),
    });
    const restoredDocuments = new Set<string>();
    for (const [id, observed] of this.documents) {
      const slot = this.workspace?.getSlot(id);
      if (slot) {
        const state = slot.core.getSnapshot();
        Object.assign(observed, documentBaseline(state), { opened: Boolean(state.document) });
        if (state.document && !restoredDocuments.has(slot.documentId)) {
          restoredDocuments.add(slot.documentId);
          this.capture(TelemetryEvent.DocumentRestored, this.context(id));
        }
      }
    }
  }

  viewChanged(view: EditorView, transition: EditorViewTransition): void {
    if (!this.port.enabled || view === this.reportedView) return;
    this.advanceVisitClock();
    const previous = this.reportedView;
    this.reportedView = view;
    this.capture(TelemetryEvent.ViewChanged, {
      ...this.context(),
      from_view: previous,
      to_view: view,
      trigger: previous === null ? EditorViewChangeTrigger.Initial : transition.trigger,
      reason: previous === null ? EditorViewChangeReason.InitialLoad : transition.reason,
    });
  }

  context(slotId?: string): TelemetryProperties {
    try {
      const workspace = this.workspace;
      if (!workspace) return this.visitContext;
      const id = slotId ?? workspace.active.id;
      const document = workspace.getSlot(id)?.core.getSnapshot().document;
      let identity = this.documentIdentities.get(id);
      if (document?.id !== undefined && identity?.documentId !== document.id) {
        identity = {
          documentId: document.id,
          reportingId: `document-${++this.nextDocumentIdentity}`,
        };
        this.documentIdentities.set(id, identity);
      }
      return {
        ...this.visitContext,
        ...workspaceTelemetryContext(workspace, id),
        current_view: this.reportedView,
        ui_language: currentUiLanguage(),
        ...(document && identity ? { document_id: identity.reportingId } : {}),
      };
    } catch {
      return this.visitContext;
    }
  }

  documentContext(document: EditorDocument, slotId?: string): TelemetryProperties {
    return { ...this.context(slotId), ...documentTelemetryContext(document) };
  }

  prepareOpen(slotId: string, method: DocumentOpenMethod, format?: string): void {
    if (!this.port.enabled) return;
    this.pendingOpens.set(slotId, { method, format });
  }

  observeDiagnostic = (record: DiagnosticRecord): void => {
    if (!this.port.enabled) return;
    try {
      if (record.source === DiagnosticSource.Workspace && record.workspaceEvent) {
        this.observeWorkspaceEvent(record.workspaceEvent);
        return;
      }
      if (record.source === DiagnosticSource.Workspace) return;
      const names = this.workspace?.getSnapshot().tabs.map((tab) => tab.name) ?? [];
      const exception = telemetryException(record, names);
      const fingerprint = `${exception.name}:${exception.message}:${exception.stack ?? ""}`;
      const now = Date.now();
      const previous = this.exceptionFingerprints.get(fingerprint);
      if (previous !== undefined && now - previous < EXCEPTION_DUPLICATE_WINDOW_MS) return;
      if (now - this.exceptionWindowStartedAt >= EXCEPTION_WINDOW_MS) {
        this.exceptionWindowStartedAt = now;
        this.exceptionCount = 0;
      }
      if (this.exceptionCount >= MAX_EXCEPTIONS_PER_WINDOW) return;
      this.exceptionCount++;
      this.exceptionFingerprints.delete(fingerprint);
      this.exceptionFingerprints.set(fingerprint, now);
      if (this.exceptionFingerprints.size > MAX_EXCEPTION_FINGERPRINTS)
        this.exceptionFingerprints.delete(this.exceptionFingerprints.keys().next().value!);
      this.port.captureException(exception, {
        ...this.context(),
        error_source: record.source,
        ...(record.source === DiagnosticSource.Session &&
        record.context &&
        /^[a-z-]+$/.test(record.context)
          ? { operation: record.context }
          : {}),
      });
    } catch {
      // Reporting must not interfere with local diagnostics or editor recovery.
    }
  };

  featureUsed(
    feature: TelemetryFeature,
    action: TelemetryFeatureAction,
    properties: TelemetryProperties = {},
  ): void {
    if (!this.port.enabled) return;
    this.capture(TelemetryEvent.FeatureUsed, { ...this.context(), feature, action, ...properties });
  }

  recordOutput(
    kind: TelemetryDownloadKind,
    method: "download" | "picker" | "file",
    properties: TelemetryProperties,
  ): void {
    if (method !== "download" && kind !== TelemetryDownloadKind.SaveAs) return;
    this.capture(
      method === "download"
        ? TelemetryEvent.FileDownloadRequested
        : TelemetryEvent.FileSaveAsCompleted,
      { ...properties, download_kind: kind, delivery_method: method },
    );
  }

  private capture(event: TelemetryEvent, properties: TelemetryProperties): void {
    if (!this.port.enabled) return;
    if (event === TelemetryEvent.DocumentOpened) this.openedCount++;
    if (event === TelemetryEvent.DocumentEditStarted) this.editedCount++;
    try {
      this.port.capture(event, { ...properties, ...this.visitContext });
    } catch {
      /* Optional reporting is isolated. */
    }
  }

  private observeWorkspaceEvent(event: WorkspaceDiagnosticEvent): void {
    if (!this.ready || !event.slotId) return;
    switch (event.action) {
      case WorkspaceDiagnosticAction.SourceImportStarted:
        if (!this.pendingOpens.has(event.slotId))
          this.prepareOpen(event.slotId, DocumentOpenMethod.Import);
        break;
      case WorkspaceDiagnosticAction.SourceImportCompleted:
        this.tryOpen(event.slotId);
        break;
      case WorkspaceDiagnosticAction.DocumentCreated:
        this.prepareOpen(event.slotId, DocumentOpenMethod.New);
        this.tryOpen(event.slotId);
        break;
      case WorkspaceDiagnosticAction.ProjectRecovered:
        this.prepareOpen(event.slotId, DocumentOpenMethod.Recovery);
        this.tryOpen(event.slotId);
        break;
      case WorkspaceDiagnosticAction.BrowserProjectOpened:
      case WorkspaceDiagnosticAction.RecentImageOpened:
      case WorkspaceDiagnosticAction.ClosedDocumentReopened: {
        const slot = this.workspace?.getSlot(event.slotId);
        const example =
          event.recentId === exampleProjectId ||
          slot?.session.getActiveRecentId() === exampleProjectId;
        this.prepareOpen(
          event.slotId,
          example ? DocumentOpenMethod.Example : DocumentOpenMethod.Recent,
        );
        this.tryOpen(event.slotId);
        break;
      }
    }
  }

  private tryOpen(slotId: string): void {
    const observed = this.documents.get(slotId);
    const metadata = this.pendingOpens.get(slotId);
    const slot = this.workspace?.getSlot(slotId);
    if (!this.ready || !observed || !metadata || !slot) return;
    const state = slot.core.getSnapshot();
    const session = slot.session.getSnapshot();
    if (!state.document || session.busy || session.pendingImport || session.error) return;
    this.pendingOpens.delete(slotId);
    Object.assign(observed, documentBaseline(state), { opened: true });
    this.capture(TelemetryEvent.DocumentOpened, {
      ...this.context(slotId),
      open_method: metadata.method,
      ...(metadata.format ? { input_format: metadata.format } : {}),
      ...(metadata.method === DocumentOpenMethod.Example ? { example_id: "hello" } : {}),
    });
  }

  private observeDocument(slot: DocumentSlot, observed: ObservedDocument): void {
    const state = slot.core.getSnapshot();
    if (
      state.document?.id === observed.documentId &&
      state.persistenceRevision === observed.revision &&
      !this.pendingOpens.has(slot.id)
    )
      return;
    const session = slot.session.getSnapshot();
    if (state.document?.id !== observed.documentId) {
      Object.assign(observed, documentBaseline(state), { opened: false, edited: false });
    }
    const baseline = observed.revision;
    const kind = editKind(observed, state);
    const canEdit =
      this.ready && state.document && !session.busy && !session.saving && !session.pendingImport;
    const alreadyOpened = observed.opened;
    this.tryOpen(slot.id);
    if (
      canEdit &&
      alreadyOpened &&
      !observed.edited &&
      state.dirty &&
      state.persistenceRevision !== baseline
    ) {
      observed.edited = true;
      this.capture(TelemetryEvent.DocumentEditStarted, {
        ...this.context(slot.id),
        edit_kind: kind,
        tool: state.settings.tool,
      });
    }
    Object.assign(observed, documentBaseline(state));
  }
}
