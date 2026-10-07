import type { PixelBuffer, Rgba } from "$/base/primitives";
import { createAsepriteSpriteProject } from "$/color/conversion";
import { syncTimeline } from "$/document/document";
import { cloneEditorProject, isImmutableEditorProject } from "$/document/project";
import { validateBitmapText } from "$/drawing/text/text";
import {
  isCommittedPersistenceSnapshot,
  projectFromCommittedPersistenceSnapshot,
} from "$/editor/persistence-snapshot";
import { RasterEditor } from "$/editor/RasterEditor";
import type { EditorSnapshot } from "$/editor/types";
import { PixelArtClassification, PixelationMethod } from "$/import-export/image/import";
import {
  RecentImageStore,
  createBlankImage,
  type RecentImageStoreOptions,
} from "$/session/recent-images";
import type {
  EditorSessionPorts,
  EditorSessionSnapshot,
  SessionProject,
  SessionSource,
  SessionInitialOptions,
  SessionSize,
  SessionPixelationOptions,
  RecentIdentityPort,
} from "$/session/types";
import { SessionOperation, SessionOutcome, SessionSaveIntent } from "$/session/types";

type Checkpoint = Pick<
  EditorSnapshot,
  | "pixelRevision"
  | "palette"
  | "floatingPaste"
  | "preview"
  | "dirty"
  | "inlineText"
  | "selectionTransform"
> & { layerState: string };
function layerState(state: EditorSnapshot) {
  const layer = state.document?.layer;
  return layer
    ? JSON.stringify([
        layer.name,
        layer.x,
        layer.y,
        layer.visible,
        layer.locked,
        layer.pixels.width,
        layer.pixels.height,
      ])
    : "";
}
interface Candidate {
  recentIdentity?: string;
  recentAlias?: string;
  pixels: PixelBuffer;
  name: string;
  classification: PixelArtClassification;
  checkpoint: Checkpoint;
  project?: SessionProject;
}
type Replacement<S> =
  | { kind: "source"; source: SessionSource<S> }
  | { kind: "candidate"; candidate: Candidate }
  | { kind: "accepted"; candidate: Candidate; pixels: PixelBuffer }
  | { kind: "new"; size: SessionSize }
  | { kind: "recent"; id: string; name: string }
  | { kind: "close"; exit: boolean };
const messageOf = (reason: unknown): string =>
  reason instanceof Error
    ? reason.message
    : typeof reason === "object" && reason !== null && "message" in reason
      ? String(reason.message)
      : String(reason);
const cancelled = (reason: unknown) =>
  typeof reason === "object" && reason !== null && "name" in reason && reason.name === "AbortError";

/** Application use cases with injected IO. Construction has no effects; snapshots
 * contain metadata only, and no React, DOM, File, Worker or ambient timer enters this layer. */
export class EditorSession<Source> {
  private readonly recent: RecentImageStore;
  private readonly listeners = new Set<() => void>();
  private readonly ownedSources = new Map<Source, number>();
  private generation = 0;
  private disposed = false;
  private bootstrapping = false;
  private bootstrapPromise: Promise<void> | null = null;
  private candidate: Candidate | null = null;
  private replacement: Replacement<Source> | null = null;
  private hydration: Promise<void> | null = null;
  private persistence = Promise.resolve();
  private pendingPersistence = 0;
  private persistenceVersion = 0;
  private persistenceAvailable = true;
  private activeRecentId: string | null = null;
  private recentHydrated = false;
  private recentClearGeneration = 0;
  private recentLimitVersion = 0;
  private acceptedNewSize: SessionSize = { width: 64, height: 64 };
  private state: EditorSessionSnapshot;
  constructor(
    private activeEditor: RasterEditor,
    private readonly ports: EditorSessionPorts<Source>,
    recentOptions?: RecentImageStoreOptions,
    sharedRecent?: RecentImageStore,
    private readonly documentKey = "session",
    private readonly onError?: (reason: unknown, operation: SessionOperation) => void,
    private readonly recentIdentities?: RecentIdentityPort,
  ) {
    this.recent = sharedRecent ?? new RecentImageStore(recentOptions);
    this.state = {
      busy: false,
      saving: false,
      pendingImport: null,
      replacement: null,
      pixelationOptions: {
        targetWidth: 64,
        targetHeight: 64,
        maxColors: 32,
        method: PixelationMethod.Nearest,
        preserveDimensions: false,
      },
      newSize: { ...this.acceptedNewSize },
      error: null,
      notice: "",
      recentFiles: [],
      documentActivation: 0,
      documentActivationKind: "initial",
      exitRequests: 0,
      persisting: false,
      prompt: null,
    };
  }
  get editor(): RasterEditor {
    return this.activeEditor;
  }
  /** A document has one IO session; its selected editing view owns staged edits. */
  selectView(editor: RasterEditor): void {
    const currentId = this.activeEditor.getSnapshot().document?.id;
    if (currentId !== editor.getSnapshot().document?.id)
      throw new Error("Cannot select a view of a different document");
    this.activeEditor = editor;
  }
  getSnapshot = (): EditorSessionSnapshot => this.state;
  subscribe = (listener: () => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<EditorSessionSnapshot>) {
    if (this.disposed) return;
    const next = { ...this.state, ...patch };
    next.prompt = next.error
      ? "error"
      : next.replacement
        ? "replacement"
        : next.pendingImport
          ? "pixelation"
          : null;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  private valid(generation: number) {
    return !this.disposed && generation === this.generation;
  }
  private checkpoint(): Checkpoint {
    const state = this.editor.getSnapshot();
    return {
      pixelRevision: state.pixelRevision,
      palette: state.palette,
      floatingPaste: state.floatingPaste,
      preview: state.preview,
      dirty: state.dirty,
      inlineText: state.inlineText,
      selectionTransform: state.selectionTransform,
      layerState: layerState(state),
    };
  }
  private release(source: Source, owner?: number) {
    if (owner !== undefined && this.ownedSources.get(source) !== owner) return;
    if (!this.ownedSources.delete(source)) return;
    try {
      this.ports.releaseSource?.(source);
    } catch {
      /* Resource cleanup must not authorize a document replacement. */
    }
  }
  private invalidate(except?: Source) {
    ++this.generation;
    for (const source of this.ownedSources.keys()) if (source !== except) this.release(source);
    this.candidate = null;
    this.replacement = null;
    this.publish({ busy: false, pendingImport: null, replacement: null });
    return this.generation;
  }
  private hasUnsavedWork() {
    const state = this.editor.getSnapshot();
    return state.dirty || this.editor.hasPendingDocumentEdit();
  }
  private changedSince(before: Checkpoint) {
    const now = this.editor.getSnapshot();
    return (
      (now.pixelRevision !== before.pixelRevision ||
        now.palette !== before.palette ||
        now.floatingPaste !== before.floatingPaste ||
        now.inlineText !== before.inlineText ||
        now.selectionTransform !== before.selectionTransform ||
        now.dirty !== before.dirty ||
        layerState(now) !== before.layerState ||
        (!!now.preview && now.preview !== before.preview)) &&
      this.hasUnsavedWork()
    );
  }
  reportError(reason: unknown, operation: SessionOperation = SessionOperation.Editor) {
    if (this.disposed) return;
    try {
      this.onError?.(reason, operation);
    } catch {
      // Error reporting must not change the editor operation's result.
    }
    this.publish({ error: { operation, message: messageOf(reason) } });
  }
  clearError() {
    if (this.state.error) this.publish({ error: null });
  }
  clearNotice() {
    if (this.state.notice) this.publish({ notice: "" });
  }
  /** Hydration precedes import recording, so an early import cannot erase older persisted files. */
  refreshRecent() {
    const recentFiles = this.recent.getList();
    if (JSON.stringify(recentFiles) !== JSON.stringify(this.state.recentFiles))
      this.publish({ recentFiles });
  }
  setRecentItemsLimit(limit: number) {
    this.recent.setLimit(limit);
    this.refreshRecent();
    const version = ++this.recentLimitVersion;
    if (this.recentHydrated) {
      this.persistRecent();
      return;
    }
    const clearGeneration = this.recentClearGeneration;
    // Changing a preference before Home has its catalog must not publish an
    // empty replacement. Hydration applies the latest limit without loading pixels.
    void this.restoreRecent().then(() => {
      if (
        this.disposed ||
        version !== this.recentLimitVersion ||
        clearGeneration !== this.recentClearGeneration
      )
        return;
      this.persistRecent();
    });
  }
  /** An explicit clear is authoritative, including an empty persisted list. */
  clearRecentFiles() {
    this.recentClearGeneration++;
    this.recentHydrated = true;
    this.recent.clear();
    this.refreshRecent();
  }
  /** The workspace persists selective removal after draining all shared writers. */
  removeRecentFiles(ids: readonly string[]) {
    this.recentClearGeneration++;
    this.recentHydrated = true;
    for (const id of ids) this.recent.remove(id);
    this.refreshRecent();
  }
  getActiveRecentId() {
    return this.activeRecentId;
  }
  /** Reattach a recovered workspace document to its persisted recent-file identity. */
  restoreRecentIdentity(id: string) {
    if (this.editor.getSnapshot().document) this.activeRecentId = id;
  }
  /** Record the active document in the shared recent list under a stable identity. */
  async rememberCurrentDocument(identity: string | null): Promise<string | null> {
    const editor = this.editor;
    const documentId = editor.getSnapshot().document?.id;
    if (documentId === undefined) return null;
    await this.restoreRecent();
    const document = editor.getSnapshot().document;
    if (this.disposed || !document || document.id !== documentId) return null;
    const image = document.timeline ? editor.canvas.composite() : editor.canvas.exportComposite();
    const project = document.timeline
      ? { image, timeline: document.timeline, palette: document.palette }
      : undefined;
    this.activeRecentId = this.remember(image, document.name, identity, project);
    await this.flushPersistence();
    return this.activeRecentId;
  }
  restoreRecent(): Promise<void> {
    if (this.recentHydrated) {
      this.refreshRecent();
      return Promise.resolve();
    }
    if (this.recent.getList().length) {
      this.recentHydrated = true;
      this.refreshRecent();
      return Promise.resolve();
    }
    if (this.hydration) return this.hydration;
    const clearGeneration = this.recentClearGeneration;
    this.hydration = (async () => {
      if (!this.ports.listRecentImages) {
        this.recentHydrated = true;
        return;
      }
      try {
        const images = await this.ports.listRecentImages();
        if (this.disposed) return;
        if (clearGeneration !== this.recentClearGeneration) return;
        this.recent.restoreCatalog(images);
        this.recentHydrated = true;
        this.publish({ recentFiles: this.recent.getList() });
      } catch (reason) {
        this.persistenceAvailable = false;
        if (!this.disposed) this.reportError(reason, SessionOperation.Recent);
      }
    })();
    return this.hydration;
  }
  flushPersistence(): Promise<void> {
    return this.persistence;
  }
  private persistRecent() {
    if (!this.ports.saveRecentImages || !this.persistenceAvailable) return;
    const images = this.recent.getPersistenceSnapshot();
    const version = ++this.persistenceVersion;
    this.pendingPersistence++;
    this.publish({ persisting: true });
    this.persistence = this.persistence
      .then(async () => {
        await this.ports.saveRecentImages!(images);
        this.recent.confirmPersistence(images);
      })
      .catch((reason) => {
        if (!this.disposed && version === this.persistenceVersion)
          this.reportError(reason, SessionOperation.Recent);
      })
      .finally(() => {
        this.pendingPersistence--;
        this.publish({ persisting: this.pendingPersistence > 0 });
      });
  }
  private remember(
    image: PixelBuffer,
    name: string,
    identity?: string | null,
    project?: SessionProject,
    immutable = false,
  ) {
    const id =
      immutable || isImmutableEditorProject(project)
        ? this.recent.recordImmutable(image, name, identity, project)
        : this.recent.record(image, name, identity, project);
    this.publish({ recentFiles: this.recent.getList() });
    if (id) this.persistRecent();
    return id;
  }
  private install(
    image: PixelBuffer,
    name: string,
    activate = true,
    palette?: readonly Rgba[],
    record = true,
    project?: SessionProject,
    recentIdentity: string | null = null,
    recentAlias: string | null = null,
  ): SessionOutcome {
    if (project)
      this.editor.document.loadTimeline(
        project.timeline,
        image.width,
        image.height,
        name,
        project.palette ?? palette,
      );
    else this.editor.document.loadImage(image, name, palette);
    this.activeRecentId = record ? this.remember(image, name, recentIdentity, project) : null;
    if (this.activeRecentId && recentAlias)
      this.recentIdentities?.link(recentAlias, this.activeRecentId);
    this.candidate = null;
    this.replacement = null;
    this.publish({
      pendingImport: null,
      replacement: null,
      busy: false,
      documentActivation: this.state.documentActivation + (activate ? 1 : 0),
      documentActivationKind: activate ? "replace" : this.state.documentActivationKind,
    });
    return SessionOutcome.Created;
  }
  /** A hidden initial document must not activate the Document tab over Home. */
  initialize(source: SessionSource<Source>, options: SessionInitialOptions = {}): Promise<void> {
    if (this.disposed || this.generation > 0) {
      if (!this.ownedSources.has(source.source)) this.ports.releaseSource?.(source.source);
      return Promise.resolve();
    }
    if (this.bootstrapping) {
      if (!this.ownedSources.has(source.source)) this.ports.releaseSource?.(source.source);
      return this.bootstrapPromise ?? Promise.resolve();
    }
    this.bootstrapping = true;
    this.ownedSources.set(source.source, this.generation);
    const generation = this.generation;
    if (options.foreground || options.background)
      this.editor.drawing.settings.setSettings({
        ...(options.foreground ? { foreground: options.foreground } : {}),
        ...(options.background ? { background: options.background } : {}),
      });
    this.bootstrapPromise = (async () => {
      try {
        if (options.rememberInitial !== false && this.ports.listRecentImages)
          await this.restoreRecent();
        if (!this.valid(generation)) return;
        const project = this.ports.decodeProject
          ? await this.ports.decodeProject(source.source)
          : null;
        const pixels = project ? project.image : await this.ports.decode(source.source);
        if (!this.valid(generation)) return;
        if (options.rememberOnly) {
          if (options.rememberInitial !== false)
            this.remember(
              pixels,
              source.name,
              options.initialRecentId ?? null,
              project ?? undefined,
            );
        } else {
          this.install(
            pixels,
            source.name,
            false,
            project?.palette ?? options.palette,
            options.rememberInitial !== false &&
              (!!options.initialRecentId || this.state.recentFiles.length === 0),
            project ?? undefined,
            options.initialRecentId ?? null,
          );
        }
        if (options.awaitPersistence !== false) await this.flushPersistence();
      } catch (reason) {
        if (this.valid(generation)) this.reportError(reason, SessionOperation.Initialization);
      } finally {
        this.release(source.source, generation);
      }
    })();
    return this.bootstrapPromise;
  }
  requestImport(source: SessionSource<Source>): Promise<SessionOutcome> {
    if (this.disposed) {
      this.ports.releaseSource?.(source.source);
      return Promise.resolve(SessionOutcome.Ignored);
    }
    this.invalidate(source.source);
    this.ownedSources.set(source.source, this.generation);
    this.clearError();
    if (this.hasUnsavedWork()) {
      this.askReplacement({ kind: "source", source });
      return Promise.resolve(SessionOutcome.Confirmation);
    }
    return this.readImport(source);
  }
  private async readImport(source: SessionSource<Source>): Promise<SessionOutcome> {
    const generation = this.generation,
      before = this.checkpoint();
    this.publish({ busy: true, error: null });
    try {
      if (this.ports.listRecentImages) await this.restoreRecent();
      if (!this.valid(generation)) return SessionOutcome.Ignored;
      const project = this.ports.decodeProject
        ? await this.ports.decodeProject(source.source)
        : null;
      const pixels = project ? project.image : await this.ports.decode(source.source);
      const recentAlias = await this.ports.identifySource?.(source.source);
      const recentIdentity = recentAlias
        ? (this.recentIdentities?.resolve(recentAlias) ?? recentAlias)
        : null;
      if (!this.valid(generation)) return SessionOutcome.Ignored;
      const analysis = project
        ? { classification: PixelArtClassification.LikelyPixelArt }
        : await this.ports.analyze(pixels);
      if (!this.valid(generation)) return SessionOutcome.Ignored;
      this.release(source.source, generation);
      const candidate: Candidate = {
        pixels,
        name: source.name,
        classification: analysis.classification,
        checkpoint: before,
        ...(recentIdentity ? { recentIdentity } : {}),
        ...(recentAlias ? { recentAlias } : {}),
        ...(project ? { project } : {}),
      };
      if (this.changedSince(before)) {
        this.askReplacement({ kind: "candidate", candidate });
        return SessionOutcome.Confirmation;
      }
      const outcome = this.offerCandidate(candidate);
      await this.flushPersistence();
      return outcome;
    } catch (reason) {
      if (this.valid(generation)) this.reportError(reason, SessionOperation.Import);
      return this.valid(generation) ? SessionOutcome.Error : SessionOutcome.Ignored;
    } finally {
      if (this.valid(generation)) {
        this.release(source.source);
        this.publish({ busy: false });
      }
    }
  }
  private offerCandidate(candidate: Candidate): SessionOutcome {
    if (candidate.classification === PixelArtClassification.LikelyPixelArt)
      return this.install(
        candidate.pixels,
        candidate.name,
        true,
        candidate.project?.palette,
        true,
        candidate.project,
        candidate.recentIdentity ?? null,
        candidate.recentAlias ?? null,
      );
    this.candidate = candidate;
    this.publish({
      busy: false,
      replacement: null,
      pendingImport: {
        name: candidate.name,
        width: candidate.pixels.width,
        height: candidate.pixels.height,
        classification: candidate.classification,
      },
      pixelationOptions: {
        ...this.state.pixelationOptions,
        targetWidth: Math.max(1, Math.round(candidate.pixels.width / 8)),
        targetHeight: Math.max(1, Math.round(candidate.pixels.height / 8)),
      },
    });
    return SessionOutcome.Pending;
  }
  private askReplacement(intent: Replacement<Source>) {
    this.replacement = intent;
    this.candidate = null;
    const kind =
      intent.kind === "close"
        ? intent.exit
          ? "exit"
          : "close"
        : intent.kind === "new"
          ? "new"
          : intent.kind === "recent"
            ? "recent"
            : "import";
    const name =
      intent.kind === "close"
        ? (this.editor.getSnapshot().document?.name ?? "")
        : intent.kind === "new"
          ? "Sprite-0001.png"
          : intent.kind === "source"
            ? intent.source.name
            : intent.kind === "recent"
              ? intent.name
              : intent.candidate.name;
    this.publish({
      replacement: { kind, name },
      pendingImport: null,
      busy: false,
    });
  }
  async confirmReplacement(): Promise<SessionOutcome> {
    if (this.disposed || !this.replacement) return SessionOutcome.Ignored;
    const intent = this.replacement;
    this.replacement = null;
    this.publish({ replacement: null, error: null });
    if (intent.kind === "close") return this.completeClose(intent.exit);
    if (intent.kind === "source") return this.readImport(intent.source);
    if (intent.kind === "new") return this.createNew(intent.size);
    if (intent.kind === "recent") return this.loadRecent(intent.id);
    intent.candidate.checkpoint = this.checkpoint();
    try {
      return intent.kind === "accepted"
        ? this.install(
            intent.pixels,
            intent.candidate.name,
            true,
            intent.candidate.project?.palette,
            true,
            intent.candidate.project,
            intent.candidate.recentIdentity ?? null,
            intent.candidate.recentAlias ?? null,
          )
        : this.offerCandidate(intent.candidate);
    } catch (reason) {
      this.reportError(reason, SessionOperation.Import);
      return SessionOutcome.Error;
    }
  }
  cancelReplacement() {
    if (!this.disposed) this.invalidate();
  }
  cancelImport() {
    if (!this.disposed) this.invalidate();
  }
  setPixelationOptions(options: Partial<SessionPixelationOptions>) {
    if (!this.disposed)
      this.publish({
        pixelationOptions: { ...this.state.pixelationOptions, ...options },
      });
  }
  setNewSize(size: Partial<SessionSize>) {
    if (!this.disposed) this.publish({ newSize: { ...this.state.newSize, ...size } });
  }
  /** NewFile stores dimensions only after OK; opening/cancelling restores that accepted preference. */
  resetNewSizeDraft() {
    if (!this.disposed) this.publish({ newSize: { ...this.acceptedNewSize } });
  }
  acceptOriginal(): SessionOutcome {
    if (this.disposed || !this.candidate) return SessionOutcome.Ignored;
    const candidate = this.candidate;
    this.invalidate();
    if (this.changedSince(candidate.checkpoint)) {
      this.askReplacement({
        kind: "accepted",
        candidate,
        pixels: candidate.pixels,
      });
      return SessionOutcome.Confirmation;
    }
    try {
      return this.install(
        candidate.pixels,
        candidate.name,
        true,
        candidate.project?.palette,
        true,
        candidate.project,
        candidate.recentIdentity ?? null,
        candidate.recentAlias ?? null,
      );
    } catch (reason) {
      this.reportError(reason, SessionOperation.Import);
      return SessionOutcome.Error;
    }
  }
  async pixelate(options?: Partial<SessionPixelationOptions>): Promise<SessionOutcome> {
    if (this.disposed || !this.candidate || this.state.busy) return SessionOutcome.Ignored;
    if (options) this.setPixelationOptions(options);
    const candidate = this.candidate,
      generation = this.generation;
    let completionGeneration = generation;
    this.publish({ busy: true, error: null });
    try {
      const pixels = await this.ports.pixelate(candidate.pixels, {
        ...this.state.pixelationOptions,
      });
      if (!this.valid(generation)) return SessionOutcome.Ignored;
      this.invalidate();
      completionGeneration = this.generation;
      if (this.changedSince(candidate.checkpoint)) {
        this.askReplacement({ kind: "accepted", candidate, pixels });
        return SessionOutcome.Confirmation;
      }
      return this.install(
        pixels,
        candidate.name,
        true,
        candidate.project?.palette,
        true,
        candidate.project,
        candidate.recentIdentity ?? null,
        candidate.recentAlias ?? null,
      );
    } catch (reason) {
      if (this.valid(completionGeneration)) this.reportError(reason, SessionOperation.Pixelate);
      return this.valid(completionGeneration) ? SessionOutcome.Error : SessionOutcome.Ignored;
    } finally {
      if (this.valid(completionGeneration)) this.publish({ busy: false });
    }
  }
  requestNew(size: SessionSize = this.state.newSize): SessionOutcome {
    if (this.disposed) return SessionOutcome.Ignored;
    this.acceptedNewSize = { ...size };
    this.invalidate();
    this.publish({ newSize: { ...size }, error: null });
    if (this.hasUnsavedWork()) {
      this.askReplacement({ kind: "new", size: { ...size } });
      return SessionOutcome.Confirmation;
    }
    return this.createNew(size);
  }
  private createNew(size: SessionSize): SessionOutcome {
    try {
      const image = createBlankImage(size.width, size.height);
      if (size.colorDepth !== undefined || size.background !== undefined) {
        const project = createAsepriteSpriteProject(
          size.width,
          size.height,
          size.colorDepth ?? 32,
          size.background ?? "transparent",
          size.palette ?? this.editor.getSnapshot().palette,
        );
        return this.install(
          project.image,
          "Sprite-0001.aseprite",
          true,
          project.palette,
          false,
          project,
        );
      }
      return this.install(image, "Sprite-0001.png", true, undefined, false);
    } catch (reason) {
      this.reportError(reason, SessionOperation.New);
      return SessionOutcome.Error;
    }
  }
  async openRecent(id: string): Promise<SessionOutcome> {
    if (this.disposed) return SessionOutcome.Ignored;
    const item = this.state.recentFiles.find((item) => item.id === id);
    if (!item) return SessionOutcome.Ignored;
    this.invalidate();
    this.clearError();
    // A matching stable file identity activates the existing document; equal names alone do not.
    if (this.activeRecentId === item.id && this.editor.getSnapshot().document?.name === item.name) {
      this.publish({
        documentActivation: this.state.documentActivation + 1,
        documentActivationKind: "activate",
      });
      return SessionOutcome.Activated;
    }
    if (this.hasUnsavedWork()) {
      this.askReplacement({ kind: "recent", id, name: item.name });
      return SessionOutcome.Confirmation;
    }
    return this.loadRecent(id);
  }
  private async loadRecent(id: string): Promise<SessionOutcome> {
    const generation = this.generation;
    const clearGeneration = this.recentClearGeneration;
    this.publish({ busy: true });
    try {
      const item = this.state.recentFiles.find((item) => item.id === id);
      let pixels = this.recent.read(id),
        project = this.recent.readProject(id);
      if (item && !pixels && this.ports.readRecentImage) {
        const snapshot = await this.ports.readRecentImage(id);
        if (!this.valid(generation) || clearGeneration !== this.recentClearGeneration)
          return SessionOutcome.Ignored;
        if (!snapshot || !this.recent.cache(snapshot)) return SessionOutcome.Ignored;
        pixels = snapshot.image;
        project = snapshot.project ?? null;
      }
      if (!item || !pixels) return SessionOutcome.Ignored;
      const outcome = this.install(
        pixels,
        item.name,
        true,
        project?.palette,
        false,
        project ?? undefined,
      );
      this.activeRecentId = id;
      return outcome;
    } catch (reason) {
      if (this.valid(generation)) this.reportError(reason, SessionOperation.Recent);
      return this.valid(generation) ? SessionOutcome.Error : SessionOutcome.Ignored;
    } finally {
      if (this.valid(generation)) this.publish({ busy: false });
    }
  }
  hasUnsavedChanges(): boolean {
    return this.hasUnsavedWork();
  }
  requestClose(exit = false, guardUnsaved = this.hasUnsavedWork()): SessionOutcome {
    if (this.disposed) return SessionOutcome.Ignored;
    this.invalidate();
    this.clearError();
    if (this.editor.getSnapshot().document && guardUnsaved) {
      this.askReplacement({ kind: "close", exit });
      return SessionOutcome.Confirmation;
    }
    return this.completeClose(exit);
  }
  private completeClose(exit: boolean): SessionOutcome {
    this.editor.document.close();
    this.activeRecentId = null;
    this.publish({
      documentActivation: this.state.documentActivation + 1,
      documentActivationKind: "close",
      exitRequests: this.state.exitRequests + (exit ? 1 : 0),
      replacement: null,
      pendingImport: null,
    });
    return SessionOutcome.Closed;
  }
  /** Save must finish successfully and leave no newer edits before the pending intent may run. */
  async saveAndContinue(): Promise<SessionOutcome> {
    const intent = this.replacement,
      generation = this.generation;
    if (!intent || this.disposed) return SessionOutcome.Ignored;
    const result = await this.save(SessionSaveIntent.Save);
    if (!this.valid(generation) || this.replacement !== intent) return SessionOutcome.Ignored;
    if (result !== SessionOutcome.Created) return result;
    if (this.hasUnsavedWork()) return SessionOutcome.Confirmation;
    return this.confirmReplacement();
  }
  canSave(): boolean {
    return (
      !this.disposed &&
      !this.state.busy &&
      !this.state.saving &&
      !!this.editor.getSnapshot().document
    );
  }
  /** Do not open a second interactive workflow over asynchronous IO or a domain prompt. */
  canStartInteraction(): boolean {
    return !this.disposed && !this.state.busy && !this.state.saving && this.state.prompt === null;
  }
  async save(
    intent: SessionSaveIntent = SessionSaveIntent.Save,
    suggestedName?: string,
  ): Promise<SessionOutcome> {
    if (!this.canSave()) return SessionOutcome.Ignored;
    const editor = this.editor;
    if (editor.getSnapshot().inlineText && !editor.drawing.text.commitInlineText()) {
      this.reportError(
        editor.getSnapshot().error ??
          "The current text could not be applied. Unlock the layer or cancel the text edit.",
        SessionOperation.Save,
      );
      return SessionOutcome.Error;
    }
    if (editor.getSnapshot().floatingPaste && !editor.clipboard.commitFloatingPaste())
      return SessionOutcome.Error;
    const before = editor.getSnapshot(),
      beforeRecentId = this.activeRecentId;
    if (!before.document) return SessionOutcome.Ignored;
    this.publish({ saving: true });
    try {
      const timeline = before.document.timeline;
      const requiresProject =
        !!timeline &&
        (before.document.format === "aseprite" ||
          !!timeline.asepriteSource ||
          timeline.layers.some((layer) => layer.kind === "tilemap") ||
          timeline.layers.length > 1 ||
          timeline.frames.length > 1);
      const needsProject =
        intent !== SessionSaveIntent.Export &&
        !!timeline &&
        (requiresProject || !!this.ports.writeProject);
      // Aseprite reference layers are editing guides: display previews may include them,
      // flattened PNG output must use the export renderer.
      let project: SessionProject | undefined;
      if (needsProject) {
        if (!this.ports.writeProject)
          throw new Error("This session cannot save an Aseprite or animated sprite project.");
        const committed = !editor.hasPendingDocumentEdit()
          ? editor.getCommittedPersistenceSnapshot()
          : null;
        // Reuse already detached committed buffers, with current navigation.
        // An active edit retains a fresh isolated snapshot of its exact live
        // state. Neither path lends mutable document buffers to an async port.
        if (committed && isCommittedPersistenceSnapshot(committed))
          project = projectFromCommittedPersistenceSnapshot(committed, timeline!);
        else {
          const image = editor.canvas.composite();
          syncTimeline(before.document);
          // A staged tilemap projection may exist only in the active layer.
          // Retain its exact export raster before the async format picker; the
          // ordinary committed path can generate PNG lazily from its timeline.
          const pendingProject: SessionProject = {
            image,
            timeline: before.document.timeline!,
            palette: before.document.palette,
            pngImage: editor.canvas.exportComposite(),
          };
          project = cloneEditorProject(pendingProject);
        }
      }
      const pixels = project?.image ?? editor.canvas.exportComposite();
      // These browser write ports are invoked before the first await so a
      // File System Access picker retains the originating user activation.
      const writeName = suggestedName?.trim() || before.document.name;
      const result = project
        ? await this.ports.writeProject!(project, writeName, intent, this.documentKey)
        : await this.ports.write(pixels, writeName, intent, this.documentKey);
      if (this.disposed) return SessionOutcome.Ignored;
      if ("cancelled" in result) return SessionOutcome.Cancelled;
      if (this.ports.listRecentImages) await this.restoreRecent();
      if (this.disposed) return SessionOutcome.Ignored;
      const now = editor.getSnapshot();
      const writeRecentId = result.recentIdentity
        ? (this.recentIdentities?.resolve(result.recentIdentity) ?? result.recentIdentity)
        : null;
      const recentIdentity =
        intent === SessionSaveIntent.Export
          ? null
          : intent === SessionSaveIntent.SaveAs
            ? writeRecentId
            : writeRecentId && writeRecentId !== beforeRecentId
              ? writeRecentId
              : (beforeRecentId ?? writeRecentId);
      const savedRecent = this.remember(pixels, result.name, recentIdentity, project, true);
      if (savedRecent && intent !== SessionSaveIntent.Export && result.recentIdentity)
        this.recentIdentities?.link(result.recentIdentity, savedRecent);
      if (
        now.document !== null &&
        now.document.id === before.document.id &&
        now.document.name === before.document.name &&
        now.persistenceRevision === before.persistenceRevision &&
        !editor.hasPendingDocumentEdit() &&
        now.floatingPaste === before.floatingPaste &&
        now.inlineText === before.inlineText &&
        now.selectionTransform === before.selectionTransform
      ) {
        if (intent !== SessionSaveIntent.Export) {
          editor.history.markSaved(result.name, result.format ?? (project ? "aseprite" : "png"));
          this.activeRecentId = savedRecent;
        }
      }
      await this.flushPersistence();
      if (this.disposed) return SessionOutcome.Ignored;
      this.publish({
        notice: `${result.method === "download" ? "Downloaded" : "Saved"} ${result.name}`,
      });
      return SessionOutcome.Created;
    } catch (reason) {
      if (this.disposed) return SessionOutcome.Ignored;
      if (cancelled(reason)) return SessionOutcome.Cancelled;
      this.reportError(reason, SessionOperation.Save);
      return SessionOutcome.Error;
    } finally {
      if (!this.disposed) this.publish({ saving: false });
    }
  }
  validateText(text: string): string | null {
    const font = this.editor.getSnapshot().settings.font;
    return font ? validateBitmapText(text, font) : "Select a bitmap font before adding text.";
  }
  acceptText(text: string, scale: number, color: Rgba, viewport: SessionSize): boolean {
    if (this.disposed) return false;
    if (!text) {
      this.editor.drawing.settings.setSettings({ text: "", textScale: scale });
      return true;
    }
    const error = this.validateText(text);
    if (error) {
      this.reportError(error, SessionOperation.Text);
      return false;
    }
    const accepted = this.editor.drawing.text.beginTextPasteInViewport(
      text,
      scale,
      viewport,
      color,
    );
    if (!accepted) {
      const error = this.editor.getSnapshot().error;
      if (error) this.reportError(error, SessionOperation.Text);
    }
    return accepted;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.candidate = null;
    this.replacement = null;
    for (const source of this.ownedSources.keys()) this.release(source);
    this.listeners.clear();
    this.ports.dispose?.();
  }
}
