import { tUi } from "$/i18n";
import type { BrowserProjectDiagnosticEntry } from "$/managers/ports/diagnostics";
import type { CanvasInputPort } from "$/managers/ports/platform";
import type { RecoverySettingsPort } from "$/managers/ports/recovery-settings";
import { normalizeRecoverySettings } from "$/managers/workspace/recovery-settings";
import type { RecoverySettings } from "$/managers/workspace/recovery-settings";
import type { RasterEditor } from "@xprite/editor-core";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";
import {
  createAutosaveCoordinator,
  type AutosaveCoordinator,
  type AutosaveState,
} from "@xprite/editor-core";

const WORKSPACE_ID = "xse.workspace.manifest.v2";
const WORKSPACE_MANIFEST_VERSION = 2;
interface WorkspaceEntry {
  slotId: string;
  projectId: string | null;
  recentId?: string;
}
interface Manifest {
  version: typeof WORKSPACE_MANIFEST_VERSION;
  activeId: string;
  entries: WorkspaceEntry[];
  views: readonly RecoveryView[];
}
interface RecoveryView {
  id: string;
  documentId: string;
}
export interface RecoveryLayout {
  activeId: string;
  slotIds: readonly string[];
  recentIds?: Readonly<Record<string, string>>;
  views: readonly RecoveryView[];
}
export interface RecoverySlot {
  id: string;
  core: RasterEditor;
}
export interface RecoveryEntry {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  colorDepth?: 8 | 16 | 32;
  frameCount?: number;
  readError?: unknown;
  sessionStartedAt?: number;
}
export interface ClosedProjectEntry {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
}
export interface WorkspaceRecoveryState {
  readonly settings: RecoverySettings;
  readonly backingUp: boolean;
  readonly error: unknown;
  readonly recoveredProjectIds: readonly string[];
  readonly documents: Readonly<Record<string, AutosaveState<string>>>;
}
interface WorkspaceRecoveryProjectRecord {
  projectId: string;
  metadata: Record<string, unknown> & { name: string };
  head: { id: string; backend?: string };
  updatedAt: number;
}
interface WorkspaceRecoveryLoadedProject {
  record: WorkspaceRecoveryProjectRecord;
  bytes: Uint8Array;
  recovered: boolean;
}
export interface WorkspaceRecoveryRepository {
  load(projectId: string): Promise<WorkspaceRecoveryLoadedProject | null>;
  save(input: {
    projectId: string;
    expectedHead: string | null;
    bytes: Uint8Array;
    metadata: Record<string, unknown> & { name: string };
  }): Promise<WorkspaceRecoveryProjectRecord>;
  list(): Promise<WorkspaceRecoveryProjectRecord[]>;
  close(): void;
  remove?(projectId: string, expectedHead: string): Promise<void>;
}
export interface WorkspaceRecoveryCodec {
  encode(snapshot: EditorPersistenceSnapshot): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<EditorPersistenceSnapshot>;
  close(): void;
}
export interface WorkspaceRecoveryDependencies {
  repository: WorkspaceRecoveryRepository;
  codec: WorkspaceRecoveryCodec;
  settingsStore: RecoverySettingsPort;
  createId: () => string;
  now?: () => number;
  inputDiagnostics?: Pick<CanvasInputPort, "debugInput">;
}
interface Binding {
  core: RasterEditor;
  runtimeId: number | undefined;
  projectId: string;
  snapshot: EditorPersistenceSnapshot;
  revision: number;
  coordinator: AutosaveCoordinator<string>;
}

function addRecoveryDiagnosticDetails(
  reason: unknown,
  details: Readonly<Record<string, unknown>>,
): Error {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const annotated = error as Error & { diagnosticDetails?: Record<string, unknown> };
  annotated.diagnosticDetails = { ...annotated.diagnosticDetails, recovery: details };
  return error;
}

/** Workspace recovery orchestration only. It depends on storage/codec ports and no view layer.
 * Each document has its own immutable checkpoints; the manifest publishes only
 * references to projects which have completed their first save. */
export class WorkspaceRecovery {
  private readonly repository: WorkspaceRecoveryRepository;
  private readonly codec: WorkspaceRecoveryCodec;
  private manifestHead: string | null = null;
  private restored = new Map<
    string,
    { projectId: string; head: string; persistedRevision?: number }
  >();
  private adopted = new Map<
    string,
    { projectId: string; head: string; persistedRevision?: number }
  >();
  private bindings = new Map<string, Binding>();
  private retiring = new Set<Binding>();
  private unsubscribers: (() => void)[] = [];
  private observedSlots = new Set<string>();
  private listeners = new Set<() => void>();
  private layout: RecoveryLayout = { activeId: "", slotIds: [], views: [] };
  private readonly settingsStore: RecoverySettingsPort;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly inputDiagnostics?: Pick<CanvasInputPort, "debugInput">;
  private readonly sessionStartedAt: number;
  private state: WorkspaceRecoveryState;
  private archiveQueue: Promise<void> = Promise.resolve();
  private archiveTimes = new Map<string, number>();
  private archivePending = new Map<
    string,
    { snapshot: EditorPersistenceSnapshot; bytes: Uint8Array }
  >();
  private archiveTimer?: ReturnType<typeof setTimeout>;
  private manifestQueue: Promise<void> = Promise.resolve();
  private manifestScheduled = false;
  private lastManifest = "";
  private stopped = false;
  private writable = false;

  constructor(options: WorkspaceRecoveryDependencies) {
    this.inputDiagnostics = options.inputDiagnostics;
    this.repository = options.repository;
    this.codec = options.codec;
    this.now = options.now ?? Date.now;
    this.sessionStartedAt = this.now();
    this.createId = options.createId;
    this.settingsStore = options.settingsStore;
    let settings: RecoverySettings;
    let error: unknown = null;
    try {
      settings = normalizeRecoverySettings(this.settingsStore.load());
    } catch (cause) {
      settings = normalizeRecoverySettings({});
      error = cause;
    }
    this.state = { error, settings, backingUp: false, recoveredProjectIds: [], documents: {} };
  }
  getSnapshot = () => this.state;
  getRecoverySettings = () => this.state.settings;
  getSlotProjectId = (slotId: string): string | null =>
    this.bindings.get(slotId)?.projectId ?? null;
  /** Whether this document's latest committed snapshot is resumable. */
  isSlotUnpersisted(slotId: string): boolean {
    if (!this.writable) return true;
    const binding = this.bindings.get(slotId);
    if (!binding) return true;
    const state = binding.coordinator.getState();
    if (
      !state.head ||
      state.persistedRevision < state.committedRevision ||
      state.status === "error"
    )
      return true;
    if (!this.lastManifest) return true;
    const manifest = JSON.parse(this.lastManifest) as Manifest;
    return !manifest.entries.some(
      (entry) => entry.slotId === slotId && entry.projectId === binding.projectId,
    );
  }
  /** Synchronous unload check for the live workspace, excluding optional archives. */
  hasUnpersistedWorkspaceChanges(): boolean {
    if (!this.writable) return true;
    const entries = this.layout.slotIds.map((slotId) => {
      const binding = this.bindings.get(slotId);
      if (binding) {
        const state = binding.coordinator.getState();
        if (
          !state.head ||
          state.persistedRevision < state.committedRevision ||
          state.status === "error"
        )
          return null;
      }
      return {
        slotId,
        projectId: binding?.projectId ?? null,
        ...(this.layout.recentIds?.[slotId] ? { recentId: this.layout.recentIds[slotId] } : {}),
      };
    });
    if (entries.includes(null)) return true;
    return (
      JSON.stringify({
        version: WORKSPACE_MANIFEST_VERSION,
        activeId: this.layout.activeId,
        views: this.layout.views,
        entries,
      }) !== this.lastManifest
    );
  }
  async setRecoverySettings(patch: Partial<RecoverySettings>): Promise<void> {
    const wasEnabled = this.state.settings.enabled;
    const settings = normalizeRecoverySettings({ ...this.state.settings, ...patch });
    try {
      this.settingsStore.save(settings);
      this.publish({ settings });
      if (!settings.enabled) {
        clearTimeout(this.archiveTimer);
        this.archivePending.clear();
      } else if (!wasEnabled && this.writable && !this.stopped) {
        // Enabling archives captures current edited documents, never stale
        // snapshots accumulated while the feature was disabled.
        for (const slotId of this.layout.slotIds) {
          if (this.stopped || this.state.settings !== settings) break;
          const binding = this.bindings.get(slotId);
          if (!binding) continue;
          await binding.coordinator.flush();
          if (this.stopped || this.state.settings !== settings) break;
          const snapshot = binding.snapshot;
          if (!snapshot.dirty) continue;
          const bytes = await this.codec.encode(snapshot);
          if (this.stopped || this.state.settings !== settings) break;
          if (
            this.bindings.get(slotId) === binding &&
            binding.snapshot === snapshot &&
            this.layout.slotIds.includes(slotId)
          ) {
            this.archivePending.set(binding.projectId, { snapshot, bytes });
          }
        }
      }
      await this.archive();
    } catch (error) {
      this.publish({ error });
      throw error;
    }
  }
  async listRecoveryEntries(): Promise<RecoveryEntry[]> {
    await this.archiveQueue;
    const entries: RecoveryEntry[] = [];
    const records = (await this.repository.list()).filter(
      (record) => record.metadata.kind === "recovery-checkpoint",
    );
    // Read one snapshot at a time so listing large animations does not retain
    // several decoded documents. The current checkpoint remains the sole owner
    // of dimensions, color mode and frame count.
    for (const record of records) {
      const entry: RecoveryEntry = {
        id: record.projectId,
        name: record.metadata.name,
        updatedAt:
          typeof record.metadata.checkpointAt === "number"
            ? record.metadata.checkpointAt
            : record.updatedAt,
        width: Number(record.metadata.width),
        height: Number(record.metadata.height),
        ...(typeof record.metadata.sessionStartedAt === "number"
          ? { sessionStartedAt: record.metadata.sessionStartedAt }
          : {}),
      };
      try {
        const { document } = await this.loadRecoveryEntry(record.projectId);
        entry.width = document.width;
        entry.height = document.height;
        entry.colorDepth = document.timeline?.colorDepth ?? 32;
        entry.frameCount = document.timeline?.frames.length ?? 1;
      } catch (error) {
        // An unreadable backup must remain selectable for deletion, and must
        // not prevent healthy backups from appearing in the recovery list.
        entry.readError = error;
      }
      entries.push(entry);
    }
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async listClosedProjects(): Promise<ClosedProjectEntry[]> {
    const active = new Set(
      this.layout.slotIds.map((id) => this.bindings.get(id)?.projectId).filter(Boolean),
    );
    return (await this.repository.list())
      .filter(
        (record) => record.metadata.kind === "editor-project" && !active.has(record.projectId),
      )
      .map((record) => ({
        id: record.projectId,
        name: record.metadata.name,
        updatedAt: record.updatedAt,
        width: Number(record.metadata.width) || 0,
        height: Number(record.metadata.height) || 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async findProjectByName(...names: string[]): Promise<ClosedProjectEntry | null> {
    const candidates = new Set(names);
    const record = (await this.repository.list())
      .filter(
        (item) => item.metadata.kind === "editor-project" && candidates.has(item.metadata.name),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    return record
      ? {
          id: record.projectId,
          name: record.metadata.name,
          updatedAt: record.updatedAt,
          width: Number(record.metadata.width) || 0,
          height: Number(record.metadata.height) || 0,
        }
      : null;
  }
  /** Store the bundled playground as a durable browser project without making
   * it appear as a user-created recent-image snapshot. Existing data always wins. */
  async seedProject(
    projectId: string,
    snapshot: EditorPersistenceSnapshot,
  ): Promise<ClosedProjectEntry> {
    if (this.stopped || !this.writable)
      throw new Error(tUi("ui.browser.project.storage.not.ready"));
    const existing = await this.repository.load(projectId);
    if (existing) {
      if (existing.record.metadata.kind !== "editor-project")
        throw new Error(tUi("ui.playground.identity.in.use"));
      return {
        id: existing.record.projectId,
        name: existing.record.metadata.name,
        updatedAt: existing.record.updatedAt,
        width: Number(existing.record.metadata.width) || 0,
        height: Number(existing.record.metadata.height) || 0,
      };
    }
    const storedSnapshot = { ...snapshot, dirty: false };
    const bytes = await this.codec.encode(storedSnapshot);
    try {
      const saved = await this.repository.save({
        projectId,
        expectedHead: null,
        bytes,
        metadata: {
          name: storedSnapshot.document.name,
          kind: "editor-project",
          width: storedSnapshot.document.width,
          height: storedSnapshot.document.height,
        },
      });
      return {
        id: saved.projectId,
        name: saved.metadata.name,
        updatedAt: saved.updatedAt,
        width: Number(saved.metadata.width) || 0,
        height: Number(saved.metadata.height) || 0,
      };
    } catch (error) {
      // Another tab may have seeded the same singleton while this tab encoded it.
      const concurrent = await this.repository.load(projectId);
      if (concurrent?.record.metadata.kind === "editor-project")
        return {
          id: concurrent.record.projectId,
          name: concurrent.record.metadata.name,
          updatedAt: concurrent.record.updatedAt,
          width: Number(concurrent.record.metadata.width) || 0,
          height: Number(concurrent.record.metadata.height) || 0,
        };
      throw error;
    }
  }
  async listProjectsForDiagnostics(): Promise<readonly BrowserProjectDiagnosticEntry[]> {
    const openSlotsByProject = new Map<string, string>();
    for (const slotId of this.layout.slotIds) {
      const projectId = this.bindings.get(slotId)?.projectId;
      if (projectId) openSlotsByProject.set(projectId, slotId);
    }
    return (await this.repository.list())
      .filter((record) => record.metadata.kind === "editor-project")
      .map((record) => {
        const slotId = openSlotsByProject.get(record.projectId);
        return {
          projectId: record.projectId,
          name: record.metadata.name,
          updatedAt: record.updatedAt,
          width: Number(record.metadata.width) || 0,
          height: Number(record.metadata.height) || 0,
          storageBackend: record.head.backend ?? "unknown",
          isOpen: slotId !== undefined,
          ...(slotId ? { slotId } : {}),
          ...(typeof record.metadata.slotId === "string"
            ? { lastSlotId: record.metadata.slotId }
            : {}),
        };
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }
  async loadClosedProject(
    id: string,
  ): Promise<{ snapshot: EditorPersistenceSnapshot; head: string }> {
    if (this.layout.slotIds.some((slotId) => this.bindings.get(slotId)?.projectId === id))
      throw new Error("Project is already open");
    const loaded = await this.repository.load(id);
    if (!loaded || loaded.record.metadata.kind !== "editor-project")
      throw new Error("Saved project is unavailable");
    try {
      return { snapshot: await this.codec.decode(loaded.bytes), head: loaded.record.head.id };
    } catch (error) {
      throw addRecoveryDiagnosticDetails(error, {
        projectId: loaded.record.projectId,
        headId: loaded.record.head.id,
        metadata: loaded.record.metadata,
        byteLength: loaded.bytes.byteLength,
        recovered: loaded.recovered,
      });
    }
  }
  async getClosedProjectHead(id: string): Promise<string | null> {
    if (this.layout.slotIds.some((slotId) => this.bindings.get(slotId)?.projectId === id))
      throw new Error("Project is already open");
    const record = (await this.repository.list()).find((item) => item.projectId === id);
    if (!record) return null;
    if (record.metadata.kind !== "editor-project") throw new Error("Saved project is unavailable");
    return record.head.id;
  }
  adoptClosedProject(slotId: string, projectId: string, head: string, persistSnapshot = false) {
    this.adopted.set(slotId, {
      projectId,
      head,
      ...(persistSnapshot ? { persistedRevision: -1 } : {}),
    });
  }
  async forkSlot(
    slotId: string,
    name: string,
    format: "png" | "aseprite",
    commitSavedState: () => void,
  ): Promise<void> {
    const binding = this.bindings.get(slotId);
    if (!binding) throw new Error("Document recovery is not ready");
    await binding.coordinator.flush();
    if (this.bindings.get(slotId) !== binding)
      throw new Error("Document changed before its browser copy could be saved");
    const forkedRevision = binding.revision;
    const source = binding.snapshot;
    const snapshot: EditorPersistenceSnapshot = {
      ...source,
      dirty: false,
      document: { ...source.document, name, format },
    };
    const bytes = await this.codec.encode(snapshot);
    const projectId = this.createId();
    const record = await this.repository.save({
      projectId,
      expectedHead: null,
      bytes,
      metadata: {
        name,
        kind: "editor-project",
        slotId,
        width: snapshot.document.width,
        height: snapshot.document.height,
      },
    });
    if (this.stopped || this.bindings.get(slotId) !== binding) {
      await this.repository.remove?.(projectId, record.head.id);
      throw new Error("Document closed before its browser copy could be saved");
    }
    await binding.coordinator.flush();
    binding.coordinator.dispose();
    this.bindings.delete(slotId);
    this.adopted.set(slotId, {
      projectId,
      head: record.head.id,
      persistedRevision: forkedRevision,
    });
    // The committed state change synchronously binds the slot to the fork.
    commitSavedState();
    if (!this.bindings.has(slotId)) {
      this.observe({ id: slotId, core: binding.core }, true);
    }
    this.scheduleManifest();
    await this.flush();
  }
  /** Discard a queued unsaved revision when the user closes without saving. */
  discardSlotChanges(slotId: string): boolean {
    const binding = this.bindings.get(slotId);
    if (!binding) return true;
    if (binding.coordinator.getState().status === "saving") return false;
    binding.coordinator.dispose();
    this.bindings.delete(slotId);
    this.archivePending.delete(binding.projectId);
    const documents = { ...this.state.documents };
    delete documents[slotId];
    this.publish({ documents });
    return true;
  }
  async loadRecoveryEntry(id: string): Promise<EditorPersistenceSnapshot> {
    const loaded = await this.repository.load(id);
    if (!loaded || loaded.record.metadata.kind !== "recovery-checkpoint")
      throw new Error("Recovery checkpoint is unavailable");
    return this.codec.decode(loaded.bytes);
  }
  async deleteRecoveryEntry(id: string): Promise<void> {
    await this.archiveQueue;
    const record = (await this.repository.list()).find((record) => record.projectId === id);
    if (!record) return;
    if (record.metadata.kind !== "recovery-checkpoint" || !this.repository.remove)
      throw new Error("Recovery checkpoint cannot be deleted");
    await this.repository.remove(id, record.head.id);
  }
  /** Removes only repository-owned browser projects and their recovery copies. */
  deleteClosedProjects(ids: readonly string[]): Promise<void> {
    const projectIds = new Set(ids);
    const assertClosed = () => {
      if (this.stopped || !this.writable)
        throw new Error(tUi("ui.browser.project.storage.not.ready"));
      if (
        this.layout.slotIds.some((slotId) =>
          projectIds.has(this.bindings.get(slotId)?.projectId ?? ""),
        ) ||
        [...this.adopted.values(), ...this.retiring].some((binding) =>
          projectIds.has(binding.projectId),
        )
      )
        throw new Error(tUi("ui.browser.copy.delete.close.first"));
    };
    const run = this.archiveQueue
      .catch(() => {})
      .then(async () => {
        assertClosed();
        if (!this.repository.remove) throw new Error(tUi("ui.browser.project.delete.unavailable"));
        const records = await this.repository.list();
        assertClosed();
        if (
          records.some(
            (record) =>
              projectIds.has(record.projectId) && record.metadata.kind !== "editor-project",
          )
        )
          throw new Error(tUi("ui.browser.project.delete.home.only"));
        // Keep the project available for retry if deleting one of its backups fails.
        for (const record of records) {
          if (
            record.metadata.kind === "recovery-checkpoint" &&
            projectIds.has(String(record.metadata.sourceProjectId))
          ) {
            assertClosed();
            await this.repository.remove(record.projectId, record.head.id);
          }
        }
        for (const record of records) {
          if (!projectIds.has(record.projectId)) continue;
          assertClosed();
          await this.repository.remove(record.projectId, record.head.id);
          this.archivePending.delete(record.projectId);
          this.archiveTimes.delete(record.projectId);
          for (const [slotId, binding] of this.bindings) {
            if (binding.projectId !== record.projectId) continue;
            binding.coordinator.dispose();
            this.bindings.delete(slotId);
          }
        }
      });
    this.archiveQueue = run;
    return run;
  }
  /** Only detached archive projects expire. Workspace heads never participate. */
  private archive(): Promise<void> {
    const run = this.archiveQueue
      .catch(() => {})
      .then(async () => {
        if (this.stopped) return;
        clearTimeout(this.archiveTimer);
        const now = this.now();
        for (const [sourceProjectId, pending] of this.archivePending) {
          if (this.stopped || !this.state.settings.enabled) break;
          const settings = this.state.settings;
          const last = this.archiveTimes.get(sourceProjectId);
          if (last !== undefined && now - last < settings.intervalMinutes * 60_000) continue;
          this.publish({ backingUp: true });
          try {
            await this.repository.save({
              projectId: `recovery-${this.createId()}`,
              expectedHead: null,
              bytes: pending.bytes,
              metadata: {
                kind: "recovery-checkpoint",
                name: pending.snapshot.document.name,
                sourceProjectId,
                checkpointAt: now,
                sessionStartedAt: this.sessionStartedAt,
                width: pending.snapshot.document.width,
                height: pending.snapshot.document.height,
              },
            });
          } finally {
            this.publish({ backingUp: false });
          }
          this.archiveTimes.set(sourceProjectId, now);
          if (this.archivePending.get(sourceProjectId) === pending)
            this.archivePending.delete(sourceProjectId);
        }
        if (this.stopped) return;
        const records = (await this.repository.list()).filter(
          (record) => record.metadata.kind === "recovery-checkpoint",
        );
        const newest = new Map<string, string>();
        records.sort(
          (a, b) =>
            Number(b.metadata.checkpointAt ?? b.updatedAt) -
            Number(a.metadata.checkpointAt ?? a.updatedAt),
        );
        for (const record of records) {
          if (this.stopped) return;
          const settings = this.state.settings;
          const active = new Set(
            this.layout.slotIds.map((id) => this.bindings.get(id)?.projectId).filter(Boolean),
          );
          const source = String(record.metadata.sourceProjectId);
          const timestamp = Number(record.metadata.checkpointAt ?? record.updatedAt);
          const expired =
            settings.retentionDays === 0
              ? !active.has(source) || newest.has(source)
              : timestamp < now - settings.retentionDays * 86_400_000;
          newest.set(source, record.projectId);
          if (expired && this.repository.remove)
            await this.repository.remove(record.projectId, record.head.id);
        }
        const settings = this.state.settings;
        if (!this.stopped && settings.enabled && this.archivePending.size) {
          const delay = Math.max(
            1,
            Math.min(
              ...[...this.archivePending.keys()].map(
                (id) =>
                  (this.archiveTimes.get(id) ?? now) + settings.intervalMinutes * 60_000 - now,
              ),
            ),
          );
          this.archiveTimer = setTimeout(() => {
            void this.archive().catch((error) => this.publish({ error }));
          }, delay);
        }
      });
    this.archiveQueue = run;
    return run;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  suspend(error: unknown) {
    this.writable = false;
    this.publish({ error });
  }
  private publish(patch: Partial<WorkspaceRecoveryState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Hydrate before subscribing. A read/decode failure disables writes so a
   * default document can never overwrite recovery data which failed to load. */
  async restore(
    knownSlotIds?: readonly string[],
  ): Promise<{ layout: RecoveryLayout; documents: Map<string, EditorPersistenceSnapshot> } | null> {
    try {
      const [records, loaded] = await Promise.all([
        this.state.settings.enabled ? this.repository.list() : Promise.resolve([]),
        this.repository.load(WORKSPACE_ID),
      ]);
      for (const record of records) {
        if (record.metadata.kind !== "recovery-checkpoint") continue;
        const source = String(record.metadata.sourceProjectId);
        const time = Number(record.metadata.checkpointAt ?? record.updatedAt);
        this.archiveTimes.set(source, Math.max(this.archiveTimes.get(source) ?? -Infinity, time));
      }
      if (!loaded) {
        this.writable = true;
        return null;
      }
      const manifest = JSON.parse(new TextDecoder().decode(loaded.bytes)) as Manifest;
      if (
        manifest.version !== WORKSPACE_MANIFEST_VERSION ||
        typeof manifest.activeId !== "string" ||
        !Array.isArray(manifest.entries) ||
        (knownSlotIds !== undefined && manifest.entries.length > knownSlotIds.length) ||
        manifest.entries.some(
          (e) =>
            !e ||
            typeof e.slotId !== "string" ||
            !e.slotId ||
            (knownSlotIds !== undefined && !knownSlotIds.includes(e.slotId)) ||
            (e.projectId !== null && typeof e.projectId !== "string") ||
            (e.recentId !== undefined && (typeof e.recentId !== "string" || !e.recentId)),
        ) ||
        new Set(manifest.entries.map((e) => e.slotId)).size !== manifest.entries.length ||
        !Array.isArray(manifest.views) ||
        manifest.views.some(
          (view) =>
            !view ||
            typeof view.id !== "string" ||
            !view.id ||
            !manifest.entries.some((entry) => entry.slotId === view.documentId) ||
            manifest.entries.some(
              (entry) => entry.slotId === view.id && entry.slotId !== view.documentId,
            ),
        ) ||
        manifest.entries.some(
          (entry) => !manifest.views.some((view) => view.documentId === entry.slotId),
        ) ||
        new Set(manifest.views.map((view) => view.id)).size !== manifest.views.length ||
        (manifest.views.length > 0
          ? !manifest.views.some((view) => view.id === manifest.activeId)
          : manifest.activeId !== "")
      )
        throw new Error("Invalid workspace recovery manifest");
      const documents = new Map<string, EditorPersistenceSnapshot>();
      const recoveredProjectIds: string[] = loaded.recovered ? [WORKSPACE_ID] : [];
      const projects = await Promise.all(
        manifest.entries.map(async (entry) => {
          if (!entry.projectId) return null;
          const project = await this.repository.load(entry.projectId);
          if (!project) throw new Error("A workspace recovery project is missing");
          let snapshot: EditorPersistenceSnapshot;
          try {
            snapshot = await this.codec.decode(project.bytes);
          } catch (error) {
            throw addRecoveryDiagnosticDetails(error, {
              slotId: entry.slotId,
              projectId: project.record.projectId,
              headId: project.record.head.id,
              metadata: project.record.metadata,
              byteLength: project.bytes.byteLength,
              recovered: project.recovered,
            });
          }
          return { entry, project, snapshot };
        }),
      );
      for (const item of projects) {
        if (!item) continue;
        documents.set(item.entry.slotId, item.snapshot);
        this.restored.set(item.entry.slotId, {
          projectId: item.entry.projectId!,
          head: item.project.record.head.id,
        });
        if (item.project.recovered) recoveredProjectIds.push(item.entry.projectId!);
      }
      this.manifestHead = loaded.record.head.id;
      this.lastManifest = JSON.stringify(manifest);
      this.writable = true;
      this.publish({ recoveredProjectIds });
      const recentIds = Object.fromEntries(
        manifest.entries.filter((e) => e.recentId).map((e) => [e.slotId, e.recentId!]),
      );
      return {
        layout: {
          activeId: manifest.activeId,
          slotIds: manifest.entries.map((e) => e.slotId),
          views: manifest.views,
          ...(Object.keys(recentIds).length ? { recentIds } : {}),
        },
        documents,
      };
    } catch (error) {
      this.publish({ error });
      throw error;
    }
  }

  start(slots: readonly RecoverySlot[], layout: RecoveryLayout) {
    if (this.stopped || !this.writable) return;
    this.layout = {
      activeId: layout.activeId,
      slotIds: [...layout.slotIds],
      views: layout.views.map((view) => ({
        ...view,
      })),
      ...(layout.recentIds ? { recentIds: { ...layout.recentIds } } : {}),
    };
    for (const slot of slots) {
      if (this.observedSlots.has(slot.id)) continue;
      this.observedSlots.add(slot.id);
      const update = () => this.observe(slot);
      this.unsubscribers.push(slot.core.subscribe(update));
      this.observe(slot, true);
    }
    this.scheduleManifest();
  }

  private observe(slot: RecoverySlot, initial = false) {
    if (this.stopped || !this.writable) return;
    const state = slot.core.getSnapshot();
    let binding = this.bindings.get(slot.id);
    if (binding && (state.document?.id !== binding.runtimeId || !state.document)) {
      // Its immutable captured snapshot survives replacement of the live core.
      const retired = binding;
      this.retiring.add(retired);
      void retired.coordinator
        .flush()
        .then(() => {
          retired.coordinator.dispose();
          this.retiring.delete(retired);
        })
        .catch((error) => this.publish({ error }));
      this.bindings.delete(slot.id);
      binding = undefined;
    }
    if (!state.document) {
      this.scheduleManifest();
      return;
    }
    if (binding?.revision === state.persistenceRevision) return;
    // This graph is already detached by the core and remains immutable after
    // the next commit. Avoid copying every cel again in a pointer-up listener.
    const snapshot = slot.core.getCommittedPersistenceSnapshot();
    if (!snapshot) return;
    if (binding && !snapshot.dirty) this.archivePending.delete(binding.projectId);
    if (binding) {
      binding.snapshot = snapshot;
      binding.revision = state.persistenceRevision;
      binding.coordinator.notifyCommitted(binding.revision);
      return;
    }
    const restored =
      this.adopted.get(slot.id) ?? (initial ? this.restored.get(slot.id) : undefined);
    this.adopted.delete(slot.id);
    const projectId = restored?.projectId ?? this.createId();
    const next = {
      core: slot.core,
      runtimeId: state.document.id,
      projectId,
      snapshot,
      revision: state.persistenceRevision,
    } as Binding;
    next.coordinator = createAutosaveCoordinator<EditorPersistenceSnapshot, string>({
      projectId,
      clock: {
        now: Date.now,
        setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
        clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
      },
      initialHead: restored?.head,
      initialPersistedRevision: restored
        ? (restored.persistedRevision ?? state.persistenceRevision)
        : undefined,
      capture: () => ({ revision: next.revision, snapshot: next.snapshot }),
      save: async (snapshot, expectedHead) => {
        const revision = next.revision;
        const startedAt = this.now();
        const trace = (kind: string, extra: Record<string, unknown> = {}) =>
          this.inputDiagnostics?.debugInput(kind, undefined, {
            extra: {
              slotId: slot.id,
              documentId: next.runtimeId,
              projectId,
              revision,
              latestRevision: next.revision,
              expectedHead,
              durationMs: this.now() - startedAt,
              ...extra,
            },
          });
        trace("autosave-start");
        try {
          const bytes = await this.codec.encode(snapshot);
          trace("autosave-encoded", { byteLength: bytes.byteLength });
          const record = await this.repository.save({
            projectId,
            expectedHead,
            bytes,
            metadata: {
              name: snapshot.document.name,
              kind: "editor-project",
              slotId: slot.id,
              width: snapshot.document.width,
              height: snapshot.document.height,
            },
          });
          if (this.state.settings.enabled && snapshot.dirty && next.snapshot.dirty && !this.stopped)
            this.archivePending.set(projectId, { snapshot, bytes });
          else this.archivePending.delete(projectId);
          void this.archive().catch((error) => this.publish({ error }));
          trace("autosave-completed", { head: record.head.id, byteLength: bytes.byteLength });
          return record.head.id;
        } catch (error) {
          trace("autosave-failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      onStateChange: (status) => {
        this.inputDiagnostics?.debugInput("autosave-state", undefined, {
          extra: {
            slotId: slot.id,
            documentId: next.runtimeId,
            projectId,
            status: status.status,
            committedRevision: status.committedRevision,
            persistedRevision: status.persistedRevision,
          },
        });
        if (this.bindings.get(slot.id) === next)
          this.publish({ documents: { ...this.state.documents, [slot.id]: status } });
        if (status.status === "saved") this.scheduleManifest();
      },
    });
    this.bindings.set(slot.id, next);
    this.publish({
      documents: { ...this.state.documents, [slot.id]: next.coordinator.getState() },
    });
    next.coordinator.notifyCommitted(next.revision);
  }

  updateLayout(layout: RecoveryLayout) {
    this.layout = {
      activeId: layout.activeId,
      slotIds: [...layout.slotIds],
      views: layout.views.map((view) => ({
        ...view,
      })),
      ...(layout.recentIds ? { recentIds: { ...layout.recentIds } } : {}),
    };
    this.scheduleManifest();
  }
  private scheduleManifest() {
    if (this.stopped || !this.writable || this.manifestScheduled) return;
    this.manifestScheduled = true;
    queueMicrotask(() => {
      this.manifestScheduled = false;
      if (!this.stopped) void this.flush().catch((error) => this.publish({ error }));
    });
  }

  async flush(): Promise<void> {
    if (!this.writable || this.stopped) return;
    // Serialize the complete barrier, not only the final manifest write. A new
    // document can arrive while another project's first checkpoint is pending.
    // Publish only a layout whose exact binding identities have all been saved.
    const run = this.manifestQueue
      .catch(() => {})
      .then(async () => {
        while (!this.stopped && this.writable) {
          const layout = this.layout;
          const bindings = [...this.bindings.entries()];
          const sameWorkspace = () =>
            this.layout === layout &&
            bindings.length === this.bindings.size &&
            bindings.every(([slotId, binding]) => {
              const state = binding.coordinator.getState();
              return (
                this.bindings.get(slotId) === binding &&
                state.persistedRevision >= state.committedRevision
              );
            });
          await Promise.all(
            [...bindings.map(([, binding]) => binding), ...this.retiring].map((binding) =>
              binding.coordinator.flush(),
            ),
          );
          if (this.stopped || !this.writable) return;
          // Replacements, Open/New and Close during the await need their own
          // checkpoint barrier. Never substitute a null/missing project entry.
          if (!sameWorkspace()) continue;
          const savedBindings = new Map(bindings);
          const manifest: Manifest = {
            version: WORKSPACE_MANIFEST_VERSION,
            activeId: layout.activeId,
            views: layout.views,
            entries: layout.slotIds.map((slotId) => {
              const binding = savedBindings.get(slotId);
              if (binding && !binding.coordinator.getState().head)
                throw new Error("Project has not completed its first checkpoint");
              return {
                slotId,
                projectId: binding?.projectId ?? null,
                ...(layout.recentIds?.[slotId] ? { recentId: layout.recentIds[slotId] } : {}),
              };
            }),
          };
          const json = JSON.stringify(manifest);
          if (json !== this.lastManifest) {
            const record = await this.repository.save({
              projectId: WORKSPACE_ID,
              expectedHead: this.manifestHead,
              bytes: new TextEncoder().encode(json),
              metadata: { name: "Workspace", kind: "workspace" },
            });
            this.manifestHead = record.head.id;
            this.lastManifest = json;
            this.publish({});
          }
          // A layout can also change during the manifest's own repository write.
          // Drain that change before resolving an explicit workspace flush.
          if (sameWorkspace()) return;
        }
      });
    this.manifestQueue = run;
    try {
      await run;
      await this.archive();
    } catch (error) {
      this.publish({ error });
      throw error;
    }
  }
  async retry(): Promise<void> {
    if (!this.writable) throw this.state.error ?? new Error("Workspace recovery is not writable");
    await Promise.all(
      [...this.bindings.values(), ...this.retiring].map((b) => b.coordinator.retry()),
    );
    await this.flush();
    this.publish({ error: null });
  }
  /** No final-save guarantee on process termination; active checkpoints matter. */
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.archiveTimer);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    for (const binding of [...this.bindings.values(), ...this.retiring])
      binding.coordinator.dispose();
    this.codec.close();
    this.repository.close();
    this.listeners.clear();
  }
}
