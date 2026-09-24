import { tUi } from "$/i18n";
import { ImageClipboard } from "$/managers/clipboard";
import { ColorPickerPreferences } from "$/managers/colors/color-picker-preferences";
import { DEFAULT_UNDO_PREFERENCES } from "$/managers/dialogs/preferences-model";
import {
  lastDocumentExport,
  type DocumentExportPreferences,
  type ExportRecord,
} from "$/managers/files/export-preferences";
import { CanvasPointerController } from "$/managers/input/controllers/pointer-controller";
import { WorkspaceDiagnosticAction } from "$/managers/ports/diagnostics";
import type {
  DiagnosticsPort,
  WorkspaceDiagnosticEvent,
  WorkspaceDiagnosticSnapshot,
} from "$/managers/ports/diagnostics";
import type { EditorPrimaryModifier, PreferenceStoragePort } from "$/managers/ports/platform";
import type { ShortcutFilePort } from "$/managers/ports/shortcut-files";
import type { UserPresetStoragePort } from "$/managers/ports/user-presets";
import {
  DEFAULT_CANVAS_DISPLAY_PREFERENCES,
  normalizeCanvasDisplayPreferences,
} from "$/managers/preferences/canvas-display-preferences";
import type { CanvasDisplayPreferences } from "$/managers/preferences/canvas-display-preferences";
import {
  DEFAULT_CURSOR_PREFERENCES,
  normalizeCursorPreferences,
  type CursorPreferences,
} from "$/managers/preferences/cursor-preferences";
import {
  DocumentPreferencesManager,
  CanvasDisplayPreferenceTarget,
} from "$/managers/preferences/document-preferences";
import {
  DEFAULT_EDITOR_PREFERENCES,
  normalizeEditorPreferences,
  type EditorPreferences,
} from "$/managers/preferences/editor-preferences";
import { EffectDialogPreferences } from "$/managers/preferences/effect-dialog-preferences";
import {
  DEFAULT_FILE_PREFERENCES,
  fileNameWithExtension,
  normalizeFilePreferences,
} from "$/managers/preferences/file-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import {
  gridBoundsPreferencesFromView,
  normalizeGridBoundsPreferences,
  type GridBoundsPreferences,
} from "$/managers/preferences/grid-preferences";
import {
  DEFAULT_GUIDE_SLICE_PREFERENCES,
  normalizeGuideSlicePreferences,
} from "$/managers/preferences/guide-slice-preferences";
import type { GuideSlicePreferences } from "$/managers/preferences/guide-slice-preferences";
import {
  defaultSelectionPreferences,
  normalizeSelectionPreferences,
} from "$/managers/preferences/selection-preferences";
import type { SelectionPreferences } from "$/managers/preferences/selection-preferences";
import {
  defaultTimelineInteractionPreferences,
  normalizeTimelineInteractionPreferences,
} from "$/managers/preferences/timeline-interaction-preferences";
import type { TimelineInteractionPreferences } from "$/managers/preferences/timeline-interaction-preferences";
import type {
  TimelinePanelPreferences,
  TimelinePanelPreferencesPatch,
} from "$/managers/preferences/timeline-panel-preferences";
import {
  DEFAULT_TOUCH_INPUT_PREFERENCES,
  TOUCH_INPUT_PREFERENCE_KEY,
  normalizeTouchInputPreferences,
  type TouchInputPreferences,
} from "$/managers/preferences/touch-input-preferences";
import {
  DEFAULT_USER_DATA_VISIBILITY_PREFERENCES,
  readUserDataVisibilityPreferences,
  UserDataVisibilityScope,
  writeUserDataVisibilityPreferences,
} from "$/managers/preferences/user-data-preferences";
import type { UserDataVisibilityPreferences } from "$/managers/preferences/user-data-preferences";
import { UserPresetsManager } from "$/managers/preferences/user-presets";
import { ShortcutManager } from "$/managers/shortcuts/shortcut-manager";
import { DockEdge } from "$/managers/workspace/dock-edge";
import {
  FileImportKind,
  importItemSources,
  MIN_SEQUENCE_FRAME_DURATION_MS,
  MAX_SEQUENCE_FRAME_DURATION_MS,
  type FileImportItem,
} from "$/managers/workspace/file-import-plan";
import { RecentFilesCatalog } from "$/managers/workspace/recent-files-catalog";
import { SaveTarget } from "$/managers/workspace/save-target";
import { SpriteNames } from "$/managers/workspace/sprite-names";
import type {
  WorkspaceRecovery,
  ClosedProjectEntry,
} from "$/managers/workspace/workspace-recovery";
import {
  xpriteProjectFileName,
  xpriteProjectId,
  xpriteProjectName,
} from "$assets/examples/xprite/xprite-project";
import projectUrl from "$assets/examples/xprite/xprite.ase?url";
import { canPickSaveFile } from "@xprite/bedrock/browser/file-system";
import { DEFAULT_VIEW, DocumentViewTarget, RasterEditor, fitScreenZoom } from "@xprite/editor-core";
import type { UndoOptions } from "@xprite/editor-core";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";
import type { PixelBuffer, ToolSettings, Rgba } from "@xprite/editor-core";
import {
  rasterAnimationProject,
  assertRasterAnimationCapacity,
  projectFromDocument,
} from "@xprite/editor-core/import-export";
import {
  EditorSession,
  SessionOperation,
  SessionOutcome,
  SessionSaveIntent,
  RecentImageStore,
} from "@xprite/editor-core/session";
import type {
  EditorSessionPorts,
  SessionSize,
  SessionSource,
  SessionProject,
} from "@xprite/editor-core/session";

const SLOT_PREFERENCE_PREFIX = "slot:";
const VIEW_SLOT_ID_PREFIX = "view-";
const RECENT_PREFERENCE_PREFIX = "recent:";
const PROJECT_PREFERENCE_PREFIX = "project:";
const LOCAL_PROJECT_RECENT_PREFIX = "local-project:";

const TOOL_PREFERENCES_KEY = "xse.workspace.tool-preferences.v1";

function isPlaygroundName(name: string | undefined | null) {
  return name === xpriteProjectName || name === xpriteProjectFileName;
}

interface DocumentTabSnapshot {
  id: string;
  name: string;
  /** Unsaved state follows the selected file-system or browser-project target. */
  modified: boolean;
}

export interface DocumentSlot {
  id: string;
  /** File, history, session and recovery identity shared by all its views. */
  documentId: string;
  name: string;
  core: RasterEditor;
  session: EditorSession<string>;
  unsubscribe: () => void;
}

export type WorkspaceDockNode =
  | { kind: "pane"; id: string }
  | {
      kind: "split";
      id: string;
      axis: "horizontal" | "vertical";
      ratio: number;
      first: WorkspaceDockNode;
      second: WorkspaceDockNode;
    };
export interface WorkspacePaneSnapshot {
  id: string;
  tabs: readonly string[];
  activeId: string;
}

export interface DocumentWorkspaceSnapshot {
  activeId: string;
  activePaneId: string;
  dockTree: WorkspaceDockNode;
  panes: readonly WorkspacePaneSnapshot[];
  exitRequests: number;
  tabs: readonly DocumentTabSnapshot[];
  closedProjects: readonly ClosedProjectEntry[];
  canReopenClosedFile: boolean;
  importBatch: { index: number; total: number; name: string } | null;
}

export interface WorkspaceSessionPorts extends EditorSessionPorts<string> {
  registerAsset(url: string, name: string): SessionSource<string>;
  registerFile(file: File): SessionSource<string>;
  registerProject(name: string, load: () => Promise<SessionProject>): SessionSource<string>;
  pickFiles(): Promise<readonly SessionSource<string>[]> | null;
  bindSourceToDocument(source: string, documentKey: string): void;
  releaseDocumentHandle(documentKey: string): void;
  hydrateDocumentHandles?(documentKeys: readonly string[]): Promise<void>;
}

export interface DocumentWorkspaceDependencies {
  ports: WorkspaceSessionPorts;
  recovery: WorkspaceRecovery;
  createId: () => string;
  preferenceStorage: PreferenceStoragePort;
  userPresetStorage?: UserPresetStoragePort;
  shortcutFiles?: ShortcutFilePort;
  primaryModifier?: EditorPrimaryModifier;
  diagnostics?: Pick<DiagnosticsPort, "recordWorkspaceEvent">;
  onSessionError?: (reason: unknown, operation: SessionOperation) => void;
}

interface ClosedDocumentSnapshot {
  preferenceId: string;
  projectId: string | null;
  recentId: string | null;
  snapshot: EditorPersistenceSnapshot;
  bytes: number;
}

function snapshotByteLength(value: unknown, seen = new WeakSet<object>()): number {
  if (value === null || typeof value !== "object") return 0;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value))
    return value.reduce<number>((bytes, item) => bytes + snapshotByteLength(item, seen), 0);
  return Object.values(value as Record<string, unknown>).reduce<number>(
    (bytes, item) => bytes + snapshotByteLength(item, seen),
    0,
  );
}

/** Owns document views. Linked views share content, history and IO while keeping
 * their own canvas and active-cel state. */
export class DocumentWorkspace {
  readonly clipboard = new ImageClipboard();
  readonly shortcuts: ShortcutManager;
  readonly effectPreferences: EffectDialogPreferences;
  readonly userPresets: UserPresetsManager;
  readonly ports: WorkspaceSessionPorts;
  private readonly sessionPorts: EditorSessionPorts<string>;
  readonly slots: DocumentSlot[];
  private readonly recentFilesCatalog: RecentFilesCatalog;
  private readonly recent = new RecentImageStore({
    maxBytes: 256 * 1024 * 1024,
    maxItems: 8,
    createId: () => this.createId(),
  });
  private closeQueue: string[] = [];
  private closeAllExit = false;
  private exitRequests = 0;
  private ready = false;
  private sharedSettings: Partial<ToolSettings> = {};
  private undoOptions: UndoOptions = {
    maxBytes: 0,
    allowNonlinearHistory: false,
    gotoModified: true,
    showTooltip: true,
  };
  private readonly undoPreferenceKey: string;
  private readonly saveTargetPreferenceKey: string;
  private composeGroups = false;
  private readonly composeGroupsPreferenceKey = "xse.workspace.compose-groups.v1";
  private sliceUseKeys = false;
  private readonly sliceUseKeysPreferenceKey = "xse.workspace.slice-use-keys.v1";
  private guideSlicePreferences = DEFAULT_GUIDE_SLICE_PREFERENCES;
  private readonly guideSlicePreferenceKey: string;
  private cursorPreferences: CursorPreferences = { ...DEFAULT_CURSOR_PREFERENCES };
  private readonly cursorPreferenceKey = "xse.workspace.cursor-preferences.v1";
  private canvasDisplayPreferences: CanvasDisplayPreferences = {
    ...DEFAULT_CANVAS_DISPLAY_PREFERENCES,
  };
  private readonly canvasDisplayPreferenceKey: string;
  private filePreferences: FilePreferences = { ...DEFAULT_FILE_PREFERENCES };
  private readonly filePreferenceKey: string;
  private editorPreferences: EditorPreferences = { ...DEFAULT_EDITOR_PREFERENCES };
  private readonly editorPreferenceKey = "xse.workspace.editor-preferences.v1";
  private selectionPreferences: SelectionPreferences = { ...defaultSelectionPreferences };
  private readonly selectionPreferenceKey = "xse.workspace.selection-preferences.v1";
  private timelineInteractionPreferences: TimelineInteractionPreferences = {
    ...defaultTimelineInteractionPreferences,
  };
  private userDataVisibilityPreferences: UserDataVisibilityPreferences = {
    ...DEFAULT_USER_DATA_VISIBILITY_PREFERENCES,
  };
  private readonly timelineInteractionPreferenceKey =
    "xse.workspace.timeline-interaction-preferences.v1";
  private readonly spriteNames: SpriteNames;
  private newSize: SessionSize = { width: 64, height: 64 };
  private touchInputPreferences: TouchInputPreferences = { ...DEFAULT_TOUCH_INPUT_PREFERENCES };
  private readonly preferenceStorage: PreferenceStoragePort;
  private readonly documentPreferences: DocumentPreferencesManager;
  private readonly restoringDocumentPreferences = new WeakSet<RasterEditor>();
  private readonly pendingViewportFits = new WeakSet<RasterEditor>();
  private readonly documentPreferenceKeys = new Map<string, string>();
  private persistentToolPreferences: unknown = null;
  readonly colorPickerPreferences: ColorPickerPreferences;
  private serializedToolPreferences = "";
  private persistedToolSettings: ToolSettings | null = null;
  private readonly onSessionError?: (reason: unknown, operation: SessionOperation) => void;
  private readonly diagnostics?: Pick<DiagnosticsPort, "recordWorkspaceEvent">;
  private readonly createId: () => string;
  readonly inputController = new CanvasPointerController();
  readonly recovery: WorkspaceRecovery;
  private activeId = "untitled";
  private activePaneId = "main";
  private dockTree: WorkspaceDockNode = { kind: "pane", id: "main" };
  private paneTabs = new Map<string, string[]>();
  private paneActiveIds = new Map<string, string>();
  private paneSerial = 0;
  private splitSerial = 0;
  private closed = new Set<string>();
  private order: string[] = [];
  private listeners = new Set<() => void>();
  private snapshot: DocumentWorkspaceSnapshot;
  private initialization: Promise<void> | null = null;
  private openingRecent = new Map<string, Promise<boolean>>();
  private closedProjects: ClosedProjectEntry[] = [];
  private closedProjectsRefresh = 0;
  private closedDocuments: ClosedDocumentSnapshot[] = [];
  private closedDocumentBytes = 0;
  private pendingCloseSnapshots = new Map<string, EditorPersistenceSnapshot>();
  private pendingCloseProjectIds = new Map<string, string | null>();
  private pendingCloseRecentIds = new Map<string, string | null>();
  private reopeningClosedDocument = false;
  private recentClearGeneration = 0;
  private deletingBrowserCopy = false;
  private readonly maxClosedDocumentCount = 8;
  private readonly maxClosedDocumentBytes = 256 * 1024 * 1024;
  private importBatch: DocumentWorkspaceSnapshot["importBatch"] = null;
  private importController: AbortController | null = null;
  private importSlot: DocumentSlot | null = null;
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private backgroundClosedProjectsTimer: number | null = null;
  private unsubscribeRecovery: () => void;

  constructor({
    ports,
    recovery,
    createId,
    preferenceStorage,
    userPresetStorage,
    shortcutFiles,
    primaryModifier,
    diagnostics,
    onSessionError,
  }: DocumentWorkspaceDependencies) {
    this.ports = ports;
    // Document and bootstrap sessions borrow these resources; only the workspace disposes them.
    this.sessionPorts = {
      loadRecentImages: ports.loadRecentImages?.bind(ports),
      saveRecentImages: ports.saveRecentImages?.bind(ports),
      decodeProject: ports.decodeProject?.bind(ports),
      identifySource: ports.identifySource?.bind(ports),
      decode: (...args) => ports.decode(...args),
      analyze: (...args) => ports.analyze(...args),
      pixelate: (...args) => ports.pixelate(...args),
      write: (...args) => ports.write(...args),
      writeProject: ports.writeProject?.bind(ports),
      releaseSource: ports.releaseSource?.bind(ports),
    };
    this.recovery = recovery;
    this.createId = createId;
    this.preferenceStorage = preferenceStorage;
    this.spriteNames = new SpriteNames(preferenceStorage);
    this.colorPickerPreferences = new ColorPickerPreferences(preferenceStorage);
    this.shortcuts = new ShortcutManager(preferenceStorage, shortcutFiles, primaryModifier);
    this.recentFilesCatalog = new RecentFilesCatalog(preferenceStorage);
    this.userDataVisibilityPreferences = readUserDataVisibilityPreferences(preferenceStorage);
    this.diagnostics = diagnostics;
    this.effectPreferences = new EffectDialogPreferences(preferenceStorage);
    this.userPresets = new UserPresetsManager(userPresetStorage, (error) =>
      this.active.session.reportError(error),
    );
    this.documentPreferences = new DocumentPreferencesManager(preferenceStorage);
    try {
      this.persistentToolPreferences = JSON.parse(
        preferenceStorage?.getItem(TOOL_PREFERENCES_KEY) ?? "null",
      );
    } catch {
      /* Use defaults when saved preferences are unavailable or malformed. */
    }
    this.onSessionError = onSessionError;
    this.undoPreferenceKey = "xse.workspace.undo-options.v1";
    this.saveTargetPreferenceKey = "xse.workspace.save-target.v1";
    this.guideSlicePreferenceKey = "xse.workspace.guide-slice-preferences.v1";
    this.canvasDisplayPreferenceKey = "xse.workspace.canvas-display-preferences.v1";
    this.filePreferenceKey = "xse.workspace.file-preferences.v1";
    try {
      const saved = JSON.parse(this.preferenceStorage?.getItem(this.undoPreferenceKey) ?? "null");
      if (
        saved &&
        Number.isSafeInteger(saved.maxBytes) &&
        saved.maxBytes >= 0 &&
        typeof saved.allowNonlinearHistory === "boolean"
      )
        this.undoOptions = {
          maxBytes: saved.maxBytes,
          allowNonlinearHistory: saved.allowNonlinearHistory,
          gotoModified: typeof saved.gotoModified === "boolean" ? saved.gotoModified : true,
          showTooltip: typeof saved.showTooltip === "boolean" ? saved.showTooltip : true,
        };
    } catch {
      /* Keep source defaults when preferences are unavailable. */
    }
    try {
      this.composeGroups =
        this.preferenceStorage?.getItem(this.composeGroupsPreferenceKey) === "true";
    } catch {
      /* Default remains false when storage is unavailable. */
    }
    try {
      this.sliceUseKeys =
        this.preferenceStorage?.getItem(this.sliceUseKeysPreferenceKey) === "true";
    } catch {
      /* Default remains false when storage is unavailable. */
    }
    try {
      this.guideSlicePreferences = normalizeGuideSlicePreferences(
        JSON.parse(this.preferenceStorage?.getItem(this.guideSlicePreferenceKey) ?? "null"),
      );
    } catch {
      /* Keep source defaults when preferences are unavailable. */
    }
    try {
      this.cursorPreferences = normalizeCursorPreferences(
        JSON.parse(this.preferenceStorage?.getItem(this.cursorPreferenceKey) ?? "null"),
      );
    } catch {
      /* Keep defaults when saved preferences cannot be read. */
    }
    try {
      this.canvasDisplayPreferences = normalizeCanvasDisplayPreferences(
        JSON.parse(this.preferenceStorage?.getItem(this.canvasDisplayPreferenceKey) ?? "null"),
      );
    } catch {
      /* Keep source defaults when preferences are unavailable. */
    }
    try {
      this.filePreferences = normalizeFilePreferences(
        JSON.parse(this.preferenceStorage?.getItem(this.filePreferenceKey) ?? "null"),
      );
    } catch {
      /* Keep source defaults when preferences are unavailable. */
    }
    try {
      this.selectionPreferences = normalizeSelectionPreferences(
        JSON.parse(this.preferenceStorage?.getItem(this.selectionPreferenceKey) ?? "null"),
      );
    } catch {
      /* Keep source defaults when preferences are unavailable. */
    }
    try {
      this.timelineInteractionPreferences = normalizeTimelineInteractionPreferences(
        JSON.parse(
          this.preferenceStorage?.getItem(this.timelineInteractionPreferenceKey) ?? "null",
        ),
      );
    } catch {
      /* Keep source defaults when preferences are unavailable. */
    }
    try {
      this.editorPreferences = normalizeEditorPreferences(
        JSON.parse(this.preferenceStorage?.getItem(this.editorPreferenceKey) ?? "null"),
      );
    } catch {
      /* Keep defaults when storage is unavailable. */
    }
    this.recent.setLimit(this.filePreferences.recentItemLimit);
    this.sharedSettings = {
      straightLinePreview: this.editorPreferences.straightLinePreview,
      discardBrushOnEyedropper: this.editorPreferences.discardBrushOnEyedropper,
      rightClickMode: this.editorPreferences.rightClickMode,
      composeGroups: this.composeGroups,
      sliceUseKeys: this.sliceUseKeys,
      selectionAutoOpaque: this.selectionPreferences.autoOpaque,
      selectionKeepAfterClear: this.selectionPreferences.keepSelectionAfterClear,
      selectionAutoShowEdges: this.selectionPreferences.autoShowSelectionEdges,
      selectionDoubleClickSelectTile: this.selectionPreferences.doubleClickSelectTile,
      selectionMoveEdges: this.selectionPreferences.moveEdges,
      selectionModifiersDisableHandles: this.selectionPreferences.modifiersDisableHandles,
      selectionMoveOnAddMode: this.selectionPreferences.moveOnAddMode,
      selectionMulticelWhenLayersOrFrames: this.selectionPreferences.multicelWhenLayersOrFrames,
      ...this.guideSlicePreferences,
    };
    // Timeline playback controls mirror the workspace-wide Rewind on Stop preference.
    // The view option is consumed by editor-core's playback controller.

    this.slots = [this.createSlot("untitled", "Untitled")];
    this.order = this.slots.map((slot) => slot.id);
    this.paneTabs.set("main", [...this.order]);
    this.paneActiveIds.set("main", this.activeId);
    this.snapshot = this.buildSnapshot();
    this.unsubscribeRecovery = this.recovery.subscribe(() => this.notifyIfTabsChanged());
    try {
      this.touchInputPreferences = normalizeTouchInputPreferences(
        JSON.parse(this.preferenceStorage?.getItem(TOUCH_INPUT_PREFERENCE_KEY) ?? "null"),
      );
    } catch {
      /* Automatic input remains available when preferences cannot be read. */
    }
    this.inputController.setFingerMode(this.touchInputPreferences.fingerMode);
  }
  getTouchInputPreferences = (): TouchInputPreferences => this.touchInputPreferences;
  setTouchInputPreferences(value: TouchInputPreferences) {
    const next = normalizeTouchInputPreferences(value);
    const keys = Object.keys(next) as (keyof TouchInputPreferences)[];
    if (keys.every((key) => next[key] === this.touchInputPreferences[key])) return;
    this.touchInputPreferences = next;
    this.inputController.setFingerMode(next.fingerMode);
    try {
      this.preferenceStorage?.setItem(TOUCH_INPUT_PREFERENCE_KEY, JSON.stringify(next));
    } catch {
      /* Keep input usable for this workspace when preferences cannot be written. */
    }
    this.notify();
  }
  getConfiguredSaveTarget(): SaveTarget | null {
    try {
      const saved = this.preferenceStorage?.getItem(this.saveTargetPreferenceKey);
      return saved === SaveTarget.FileSystem || saved === SaveTarget.Browser ? saved : null;
    } catch {
      return null;
    }
  }
  getSaveTarget(slotId = this.activeId): SaveTarget {
    const slot = this.slots.find((candidate) => candidate.id === slotId) ?? this.active;
    const documentName = slot.core.getSnapshot().document?.name;
    const saved = this.getConfiguredSaveTarget();
    if (saved === SaveTarget.Browser) return SaveTarget.Browser;
    if (saved === SaveTarget.FileSystem)
      return canPickSaveFile() ? SaveTarget.FileSystem : SaveTarget.Browser;
    if (
      isPlaygroundName(documentName) ||
      slot.session.getActiveRecentId() === xpriteProjectId ||
      this.getRecoveryProjectId(slot.id) === xpriteProjectId
    )
      return SaveTarget.Browser;
    return canPickSaveFile() ? SaveTarget.FileSystem : SaveTarget.Browser;
  }
  setSaveTarget(target: SaveTarget) {
    try {
      this.preferenceStorage?.setItem(this.saveTargetPreferenceKey, target);
    } catch (error) {
      this.active.session.reportError(error);
    }
    this.notify();
  }
  getUndoOptions = (): UndoOptions => ({ ...this.undoOptions });
  getEditorPreferences = (): EditorPreferences => this.editorPreferences;
  setEditorPreferences(preferences: EditorPreferences) {
    const next = normalizeEditorPreferences(preferences);
    if (
      (Object.keys(next) as (keyof EditorPreferences)[]).every(
        (key) => next[key] === this.editorPreferences[key],
      )
    )
      return;
    this.editorPreferences = next;
    const settings = {
      straightLinePreview: next.straightLinePreview,
      discardBrushOnEyedropper: next.discardBrushOnEyedropper,
      rightClickMode: next.rightClickMode,
    };
    this.sharedSettings = { ...this.sharedSettings, ...settings };
    for (const slot of this.slots) {
      slot.core.drawing.settings.setSettings(settings);
      slot.core.canvas.setView({
        nonActiveLayersOpacity: next.nonActiveLayersOpacity,
        zoomFromCenterWithKeys: next.zoomFromCenterWithKeys,
      });
    }
    try {
      this.preferenceStorage?.setItem(this.editorPreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep preferences for this workspace. */
    }
    this.notify();
  }
  getSelectionPreferences = (): SelectionPreferences => ({ ...this.selectionPreferences });
  getTimelineInteractionPreferences = (): TimelineInteractionPreferences => ({
    ...this.timelineInteractionPreferences,
  });
  getGuideSlicePreferences = (): GuideSlicePreferences => ({ ...this.guideSlicePreferences });
  getDocumentPreferenceId = (slotId = this.activeId): string =>
    this.documentPreferenceKeys.get(slotId) ?? `${SLOT_PREFERENCE_PREFIX}${slotId}`;

  getExportPreferenceId = (slotId = this.activeId): string => {
    const recentId = this.getSlot(slotId)?.session.getActiveRecentId();
    if (recentId) return `${RECENT_PREFERENCE_PREFIX}${recentId}`;
    const projectId = this.getRecoveryProjectId(slotId);
    return projectId
      ? `${PROJECT_PREFERENCE_PREFIX}${projectId}`
      : `${SLOT_PREFERENCE_PREFIX}${this.getDocumentId(slotId)}`;
  };
  getExportPreferences = (slotId = this.activeId): DocumentExportPreferences =>
    this.documentPreferences.get(this.getExportPreferenceId(slotId)).exports ?? {};
  getLastExport = (slotId = this.activeId) => lastDocumentExport(this.getExportPreferences(slotId));
  rememberExport(preferenceId: string, record: ExportRecord) {
    this.documentPreferences.setExport(preferenceId, record);
    // Keep recovery identities synchronized even when export has no canvas publication.
    for (const slot of this.slots) {
      if (this.getExportPreferenceId(slot.id) !== preferenceId) continue;
      this.documentPreferences.setExport(`${SLOT_PREFERENCE_PREFIX}${slot.id}`, record);
      const projectId = this.getRecoveryProjectId(slot.id);
      if (projectId)
        this.documentPreferences.setExport(`${PROJECT_PREFERENCE_PREFIX}${projectId}`, record);
    }
    this.notify();
  }
  getCursorPreferences = (): CursorPreferences => this.cursorPreferences;
  getCanvasDisplayDefaults = (): CanvasDisplayPreferences => this.canvasDisplayPreferences;
  getGridBoundsPreferences = (
    target = CanvasDisplayPreferenceTarget.Document,
  ): GridBoundsPreferences =>
    gridBoundsPreferencesFromView(
      target === CanvasDisplayPreferenceTarget.Defaults || !this.active.core.getSnapshot().document
        ? { ...DEFAULT_VIEW, ...this.documentPreferences.getDefaultView() }
        : this.active.core.getSnapshot().view,
    );

  setGridBoundsPreferences(
    value: GridBoundsPreferences,
    target = CanvasDisplayPreferenceTarget.Document,
  ) {
    const bounds = normalizeGridBoundsPreferences(value);
    const current = this.getGridBoundsPreferences(target);
    if (
      bounds.x === current.x &&
      bounds.y === current.y &&
      bounds.width === current.width &&
      bounds.height === current.height
    )
      return;
    const patch = {
      gridX: bounds.x,
      gridY: bounds.y,
      gridWidth: bounds.width,
      gridHeight: bounds.height,
    };
    const core = this.active.core;
    if (target === CanvasDisplayPreferenceTarget.Defaults || !core.getSnapshot().document) {
      this.documentPreferences.setDefaultView({
        ...core.canvas.getDefaultDocumentView(),
        ...this.documentPreferences.getDefaultView(),
        ...patch,
      });
      for (const slot of this.slots)
        slot.core.canvas.setDocumentViewOptions(patch, DocumentViewTarget.Defaults);
      this.notify();
      return;
    }
    const visible = core.getSnapshot().view.grid;
    core.canvas.setGridBounds(bounds);
    core.canvas.setDocumentViewOptions({ grid: visible });
  }
  getCanvasDisplayPreferences = (): CanvasDisplayPreferences =>
    this.active.core.getSnapshot().document
      ? (this.documentPreferences.get(this.getDocumentPreferenceId()).display ??
        this.canvasDisplayPreferences)
      : this.canvasDisplayPreferences;
  getTimelinePanelPreferences = (): TimelinePanelPreferences =>
    this.active.core.getSnapshot().document
      ? this.documentPreferences.get(this.getDocumentPreferenceId()).timeline
      : this.documentPreferences.getTimelineDefaults();
  getTimelinePanelDefaults = (): TimelinePanelPreferences =>
    this.documentPreferences.getTimelineDefaults();
  setTimelinePanelPreferences(patch: TimelinePanelPreferencesPatch) {
    const next = { ...this.getTimelinePanelPreferences(), ...patch };
    if (this.active.core.getSnapshot().document) {
      this.documentPreferences.setTimeline(this.getDocumentPreferenceId(), next);
      this.active.core.timeline.setOnionSkin(next.onionSkin);
    } else this.documentPreferences.setTimelineDefaults(next);
    this.notify();
  }
  setTimelinePanelDefaults(value: TimelinePanelPreferences) {
    this.documentPreferences.setTimelineDefaults(value);
    this.notify();
  }
  private restoreDocumentPreferences(core: RasterEditor, key: string) {
    const preferences = this.documentPreferences.get(key);
    if (preferences.viewport) this.pendingViewportFits.delete(core);
    this.restoringDocumentPreferences.add(core);
    try {
      const site = preferences.site;
      const timeline = core.getSnapshot().document?.timeline;
      if (site && timeline) {
        if (site.frame < timeline.frames.length) core.timeline.selectFrame(site.frame);
        if (site.layer < timeline.layers.length) core.timeline.selectLayer(site.layer);
      }
      core.canvas.setView({
        ...preferences.view,
        ...preferences.viewport,
        onionSkin: preferences.timeline.onionSkin,
        snapToGrid: false,
      });
    } finally {
      this.restoringDocumentPreferences.delete(core);
    }
  }
  /** Fit once after measurement; saved or manually adjusted viewpoints take priority. */
  initializeDocumentViewport(core: RasterEditor, viewport: { width: number; height: number }) {
    const state = core.getSnapshot();
    if (
      !state.document ||
      !this.pendingViewportFits.has(core) ||
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    )
      return false;
    this.pendingViewportFits.delete(core);
    core.canvas.setView({
      zoom: this.editorPreferences.autoFit
        ? fitScreenZoom(state.view.zoom, viewport, state.document)
        : state.view.zoom,
      pan: { ...DEFAULT_VIEW.pan },
    });
    return true;
  }
  resetDocumentPreferences() {
    this.documentPreferences.resetAll();
    for (const slot of this.slots) {
      const document = slot.core.getSnapshot().document;
      if (!document) continue;
      const key = this.getDocumentPreferenceId(slot.id);
      this.documentPreferences.setDisplay(key, this.canvasDisplayPreferences);
      const grid = document.timeline?.gridBounds;
      const currentView = slot.core.getSnapshot().view;
      slot.core.canvas.setView({
        ...slot.core.canvas.getDefaultDocumentView(),
        ...this.documentPreferences.getDefaultView(),
        gridX: grid?.x ?? currentView.gridX,
        gridY: grid?.y ?? currentView.gridY,
        gridWidth: grid?.width ?? currentView.gridWidth,
        gridHeight: grid?.height ?? currentView.gridHeight,
        symmetryMode: 0,
        symmetryX: document.width / 2,
        symmetryY: document.height / 2,
        tiledMode: 0,
        snapToGrid: false,
        onionSkin: this.documentPreferences.getTimelineDefaults().onionSkin,
      });
    }
    this.notify();
  }
  getFilePreferences = (): FilePreferences => this.filePreferences;
  getRecentFiles() {
    return this.recentFilesCatalog
      .list(this.recent.getList(), this.closedProjects, this.filePreferences.recentItemLimit)
      .map((file) => ({ ...file, isOpen: this.isRecentFileOpen(file.id) }));
  }
  async downloadRecentFile(id: string): Promise<void> {
    if (!this.ready || this.disposed || this.deletingBrowserCopy) return;
    const file = this.getRecentFiles().find((entry) => entry.id === id);
    if (!file) return;
    const projectId = id.startsWith(LOCAL_PROJECT_RECENT_PREFIX)
      ? id.slice(LOCAL_PROJECT_RECENT_PREFIX.length)
      : null;
    const recentId = projectId
      ? (this.recentFilesCatalog.recentIdForProject(projectId) ?? projectId)
      : id;
    const openSlot = this.findOpenRecentFile(id);
    const linkedProjectId =
      projectId ??
      this.closedProjects.find(
        (project) => this.recentFilesCatalog.recentIdForProject(project.id) === recentId,
      )?.id;
    const snapshot = openSlot
      ? openSlot.core.getCommittedPersistenceSnapshot()
      : linkedProjectId
        ? (await this.recovery.loadClosedProject(linkedProjectId)).snapshot
        : null;
    if (this.disposed) return;
    let project: SessionProject | null = null;
    let pixels: PixelBuffer | null = null;
    if (snapshot) {
      const core = new RasterEditor();
      core.restorePersistenceSnapshot(snapshot);
      const document = core.getSnapshot().document!;
      pixels = core.canvas.exportComposite();
      if (document.timeline) project = { ...projectFromDocument(document), pngImage: pixels };
    } else {
      project = this.recent.readProject(recentId);
      pixels = this.recent.read(recentId);
    }
    if (project) {
      if (!this.ports.writeProject) throw new Error(tUi("ui.recent.file.download.unavailable"));
      await this.ports.writeProject(project, file.name, SessionSaveIntent.Export);
    } else {
      if (!pixels) throw new Error(tUi("ui.recent.file.download.unavailable"));
      await this.ports.write(pixels, file.name, SessionSaveIntent.Export);
    }
  }
  private isRecentFileOpen(id: string) {
    return Boolean(this.findOpenRecentFile(id));
  }
  private findOpenRecentFile(id: string) {
    const projectId = id.startsWith(LOCAL_PROJECT_RECENT_PREFIX)
      ? id.slice(LOCAL_PROJECT_RECENT_PREFIX.length)
      : null;
    const recentId = projectId
      ? (this.recentFilesCatalog.recentIdForProject(projectId) ?? projectId)
      : id;
    return this.slots.find(
      (slot) =>
        !this.closed.has(slot.id) &&
        (slot.session.getActiveRecentId() === recentId ||
          (!!projectId && this.getRecoveryProjectId(slot.id) === projectId) ||
          this.recentFilesCatalog.recentIdForProject(this.getRecoveryProjectId(slot.id) ?? "") ===
            recentId),
    );
  }

  /** Delete browser storage only. No source-file handles or file I/O ports are used. */
  async deleteBrowserCopy(id: string): Promise<void> {
    if (
      !this.ready ||
      this.disposed ||
      this.deletingBrowserCopy ||
      this.openingRecent.size ||
      this.reopeningClosedDocument ||
      this.slots.some((slot) => !slot.session.canStartInteraction())
    )
      throw new Error(tUi("ui.browser.copy.delete.wait"));
    if (this.isRecentFileOpen(id)) throw new Error(tUi("ui.browser.copy.delete.close.first"));
    const explicitProjectId = id.startsWith(LOCAL_PROJECT_RECENT_PREFIX)
      ? id.slice(LOCAL_PROJECT_RECENT_PREFIX.length)
      : null;
    const recentId = explicitProjectId
      ? (this.recentFilesCatalog.recentIdForProject(explicitProjectId) ?? explicitProjectId)
      : id;
    this.deletingBrowserCopy = true;
    try {
      await this.recovery.flush();
      await Promise.all(this.slots.map((slot) => slot.session.restoreRecent()));
      await Promise.all(this.slots.map((slot) => slot.session.flushPersistence()));
      const projects = await this.recovery.listClosedProjects();
      const projectIds = projects
        .filter(
          (project) =>
            project.id === explicitProjectId ||
            project.id === recentId ||
            this.recentFilesCatalog.recentIdForProject(project.id) === recentId,
        )
        .map((project) => project.id);
      if (
        this.disposed ||
        this.isRecentFileOpen(id) ||
        this.slots.some((slot) => !slot.session.canStartInteraction())
      )
        throw new Error(tUi("ui.browser.copy.delete.workspace.changed"));
      if (projectIds.length) await this.recovery.deleteClosedProjects(projectIds);
      const remainingImages = this.recent.getList().filter((item) => item.id !== recentId);
      if (this.ports.saveRecentImages)
        await this.ports.saveRecentImages(
          remainingImages.map((item) => ({
            id: item.id,
            name: item.name,
            image: this.recent.read(item.id)!,
            project: this.recent.readProject(item.id) ?? undefined,
          })),
        );
      for (const slot of this.slots) slot.session.removeRecentFiles([recentId]);
      this.recentFilesCatalog.forgetBrowserCopy([recentId, id], projectIds);
      // Deleting the bundled browser copy must also survive startup seeding.
      if (recentId === xpriteProjectId) this.recentFilesCatalog.dismissProjects([xpriteProjectId]);
      const removedProjects = new Set(projectIds);
      this.closedProjectsRefresh++;
      this.closedProjects = projects.filter((project) => !removedProjects.has(project.id));
      this.closedDocuments = this.closedDocuments.filter(
        (entry) => entry.recentId !== recentId && !removedProjects.has(entry.projectId ?? ""),
      );
      this.closedDocumentBytes = this.closedDocuments.reduce(
        (bytes, entry) => bytes + entry.bytes,
        0,
      );
      this.notify();
    } finally {
      this.deletingBrowserCopy = false;
    }
  }
  setRecentFilePinned(id: string, pinned: boolean) {
    if (this.recentFilesCatalog.setPinned(id, pinned)) this.notify();
  }
  isPlaygroundProjectId(projectId: string | null) {
    return (
      projectId === xpriteProjectId ||
      (!!projectId && this.recentFilesCatalog.recentIdForProject(projectId) === xpriteProjectId)
    );
  }
  linkRecentFileToWorkspaceProject(slotId = this.activeId) {
    const slot = this.slots.find((item) => item.id === slotId && !this.closed.has(item.id));
    if (!slot) return;
    const projectId = this.getRecoveryProjectId(slotId);
    this.recentFilesCatalog.linkProject(projectId, slot.session.getActiveRecentId() ?? projectId);
    this.notify();
  }
  resetConfigurationPreferences() {
    this.colorPickerPreferences.reset();
    this.setEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES });
    this.effectPreferences.reset();
    this.setUndoOptions(DEFAULT_UNDO_PREFERENCES);
    this.setFilePreferences(DEFAULT_FILE_PREFERENCES);
    this.setCursorPreferences(DEFAULT_CURSOR_PREFERENCES);
    this.setCanvasDisplayPreferences(
      DEFAULT_CANVAS_DISPLAY_PREFERENCES,
      CanvasDisplayPreferenceTarget.Defaults,
    );
    this.setGuideSlicePreferences(DEFAULT_GUIDE_SLICE_PREFERENCES);
    this.setSelectionPreferences(defaultSelectionPreferences);
    this.setTimelineInteractionPreferences(defaultTimelineInteractionPreferences);
    this.setSharedSettings({ composeGroups: false, sliceUseKeys: false });
    this.inputController.resetPenDetection();
    this.setTouchInputPreferences(DEFAULT_TOUCH_INPUT_PREFERENCES);
  }
  resetToolPreferences() {
    for (const slot of this.slots) slot.core.drawing.settings.resetToolPreferences();
  }
  suggestedSaveName = (name: string): string =>
    fileNameWithExtension(name, this.filePreferences.saveDefaultExtension);
  setFilePreferences(preferences: FilePreferences) {
    const next = normalizeFilePreferences(preferences);
    const keys = Object.keys(next) as (keyof FilePreferences)[];
    if (keys.every((key) => next[key] === this.filePreferences[key])) return;
    const recentLimitChanged = next.recentItemLimit !== this.filePreferences.recentItemLimit;
    this.filePreferences = next;
    if (recentLimitChanged) {
      this.active.session.setRecentItemsLimit(next.recentItemLimit);
      for (const slot of this.slots) if (slot !== this.active) slot.session.refreshRecent();
    }
    try {
      this.preferenceStorage?.setItem(this.filePreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep the updated file preferences for this session when storage is unavailable. */
    }
    this.notify();
  }
  setCursorPreferences(preferences: CursorPreferences) {
    const next = normalizeCursorPreferences(preferences);
    const keys = Object.keys(next) as (keyof CursorPreferences)[];
    if (keys.every((key) => next[key] === this.cursorPreferences[key])) return;
    this.cursorPreferences = next;
    try {
      this.preferenceStorage?.setItem(this.cursorPreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep changes in this workspace when storage is unavailable. */
    }
    this.notify();
  }
  setCanvasDisplayPreferences(
    preferences: CanvasDisplayPreferences,
    target = CanvasDisplayPreferenceTarget.Document,
  ) {
    if (
      target === CanvasDisplayPreferenceTarget.Document &&
      this.active.core.getSnapshot().document
    ) {
      this.documentPreferences.setDisplay(this.getDocumentPreferenceId(), preferences);
      this.notify();
      return;
    }
    const next = normalizeCanvasDisplayPreferences(preferences);
    const keys = Object.keys(next) as (keyof CanvasDisplayPreferences)[];
    if (keys.every((key) => next[key] === this.canvasDisplayPreferences[key])) return;
    this.canvasDisplayPreferences = next;
    try {
      this.preferenceStorage?.setItem(this.canvasDisplayPreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep the updated display preferences for this session when storage is unavailable. */
    }
    this.notify();
  }
  setGuideSlicePreferences(preferences: GuideSlicePreferences) {
    const next = normalizeGuideSlicePreferences(preferences);
    if (
      next.layerEdgesColor === this.guideSlicePreferences.layerEdgesColor &&
      next.autoGuidesColor === this.guideSlicePreferences.autoGuidesColor &&
      next.defaultSliceColor === this.guideSlicePreferences.defaultSliceColor
    )
      return;
    this.guideSlicePreferences = next;
    this.sharedSettings = { ...this.sharedSettings, ...next };
    for (const slot of this.slots) slot.core.drawing.settings.setSettings(next);
    try {
      this.preferenceStorage?.setItem(this.guideSlicePreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep the updated colors for this session when storage is unavailable. */
    }
  }
  setSelectionPreferences(preferences: SelectionPreferences) {
    const next = normalizeSelectionPreferences(preferences);
    if (
      next.autoOpaque === this.selectionPreferences.autoOpaque &&
      next.keepSelectionAfterClear === this.selectionPreferences.keepSelectionAfterClear &&
      next.autoShowSelectionEdges === this.selectionPreferences.autoShowSelectionEdges &&
      next.doubleClickSelectTile === this.selectionPreferences.doubleClickSelectTile &&
      next.moveEdges === this.selectionPreferences.moveEdges &&
      next.modifiersDisableHandles === this.selectionPreferences.modifiersDisableHandles &&
      next.moveOnAddMode === this.selectionPreferences.moveOnAddMode &&
      next.multicelWhenLayersOrFrames === this.selectionPreferences.multicelWhenLayersOrFrames
    )
      return;
    this.selectionPreferences = next;
    const settings: Partial<ToolSettings> = {
      selectionAutoOpaque: next.autoOpaque,
      selectionKeepAfterClear: next.keepSelectionAfterClear,
      selectionAutoShowEdges: next.autoShowSelectionEdges,
      selectionDoubleClickSelectTile: next.doubleClickSelectTile,
      selectionMoveEdges: next.moveEdges,
      selectionModifiersDisableHandles: next.modifiersDisableHandles,
      selectionMoveOnAddMode: next.moveOnAddMode,
      selectionMulticelWhenLayersOrFrames: next.multicelWhenLayersOrFrames,
    };
    this.sharedSettings = { ...this.sharedSettings, ...settings };
    for (const slot of this.slots) slot.core.drawing.settings.setSettings(settings);
    try {
      this.preferenceStorage?.setItem(this.selectionPreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep the updated selection behavior for this session. */
    }
    this.notify();
  }
  setTimelineInteractionPreferences(preferences: TimelineInteractionPreferences) {
    const next = normalizeTimelineInteractionPreferences(preferences);
    const keys = Object.keys(next) as (keyof TimelineInteractionPreferences)[];
    if (keys.every((key) => next[key] === this.timelineInteractionPreferences[key])) return;
    const rewindOnStopChanged =
      next.rewindOnStop !== this.timelineInteractionPreferences.rewindOnStop;
    this.timelineInteractionPreferences = next;
    if (rewindOnStopChanged)
      for (const slot of this.slots)
        slot.core.timeline.setPlaybackOptions({ rewindOnStop: next.rewindOnStop });
    try {
      this.preferenceStorage?.setItem(this.timelineInteractionPreferenceKey, JSON.stringify(next));
    } catch {
      /* Keep the updated timeline behavior for this session. */
    }
    this.notify();
  }
  getUserDataVisibility(scope: UserDataVisibilityScope): boolean {
    return this.userDataVisibilityPreferences[scope];
  }
  setUserDataVisibility(scope: UserDataVisibilityScope, visible: boolean) {
    if (this.userDataVisibilityPreferences[scope] === visible) return;
    this.userDataVisibilityPreferences = {
      ...this.userDataVisibilityPreferences,
      [scope]: visible,
    };
    writeUserDataVisibilityPreferences(this.preferenceStorage, this.userDataVisibilityPreferences);
  }
  setUndoOptions(options: UndoOptions) {
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0)
      throw new RangeError("Invalid undo memory limit");
    this.undoOptions = { ...options };
    for (const slot of this.slots) slot.core.history.setOptions(options);
    try {
      this.preferenceStorage?.setItem(this.undoPreferenceKey, JSON.stringify(options));
    } catch (error) {
      this.active.session.reportError(error);
    }
    this.notify();
  }
  async recoverProject(id: string) {
    const snapshot = await this.recovery.loadRecoveryEntry(id);
    if (this.disposed) return;
    const slot = this.appendSlot(snapshot.document.name);
    try {
      slot.core.restorePersistenceSnapshot({ ...snapshot, dirty: true });
      this.select(slot.id);
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.ProjectRecovered, slot);
    } catch (error) {
      this.closed.add(slot.id);
      this.notify();
      throw error;
    }
  }

  private createSlot(id: string, name: string, source?: DocumentSlot): DocumentSlot {
    const documentId = source?.documentId ?? id;
    const core = source ? source.core.createLinkedView() : new RasterEditor();
    core.history.setOptions(this.undoOptions);
    core.canvas.setView({
      nonActiveLayersOpacity: this.editorPreferences.nonActiveLayersOpacity,
      zoomFromCenterWithKeys: this.editorPreferences.zoomFromCenterWithKeys,
    });
    if (!source) core.canvas.setDocumentViewOptions(this.documentPreferences.getDefaultView());
    const session =
      source?.session ??
      new EditorSession(
        core,
        this.sessionPorts,
        {
          maxBytes: 256 * 1024 * 1024,
          maxItems: 8,
        },
        this.recent,
        id,
        this.onSessionError,
        {
          resolve: (identity) => this.recentFilesCatalog.resolveIdentity(identity),
          link: (identity, recentId) => this.recentFilesCatalog.linkIdentity(identity, recentId),
        },
      );
    core.drawing.settings.restorePersistentPreferences(this.persistentToolPreferences);
    core.drawing.settings.setSettings(this.sharedSettings);
    core.timeline.setPlaybackOptions({
      rewindOnStop: this.timelineInteractionPreferences.rewindOnStop,
    });
    let activation = session.getSnapshot().documentActivation;
    let recentId = session.getActiveRecentId();
    let tabName = core.getSnapshot().document?.name ?? name;
    let playbackDocumentId = core.getSnapshot().document?.id;
    let tabRevision = core.getSnapshot().persistenceRevision;
    let tabDraft = core.hasPendingDocumentEdit();
    let restoringPreferences = false;
    let viewDocumentId = core.getSnapshot().document?.id;
    let defaultView = JSON.stringify(core.canvas.getDefaultDocumentView());
    const unsubscribeCore = core.subscribe(() => {
      if (!restoringPreferences && !this.restoringDocumentPreferences.has(core)) {
        const state = core.getSnapshot();
        if (state.document?.id !== viewDocumentId) {
          viewDocumentId = state.document?.id;
          this.pendingViewportFits.delete(core);
          if (state.document) {
            this.pendingViewportFits.add(core);
            restoringPreferences = true;
            if (
              !this.ready ||
              this.getDocumentPreferenceId(id).startsWith(PROJECT_PREFERENCE_PREFIX)
            ) {
              this.restoreDocumentPreferences(core, this.getDocumentPreferenceId(id));
            } else {
              this.documentPreferenceKeys.delete(id);
              this.documentPreferences.reset(this.getDocumentPreferenceId(id));
              core.timeline.setOnionSkin(this.documentPreferences.getTimelineDefaults().onionSkin);
            }
            const key = this.getDocumentPreferenceId(id);
            const display =
              this.documentPreferences.get(key).display ?? this.canvasDisplayPreferences;
            this.documentPreferences.setDisplay(key, display);
            restoringPreferences = false;
          }
        }
        if (state.document) {
          const key = this.getDocumentPreferenceId(id);
          const timeline = core.getSnapshot().document?.timeline;
          const changed = this.documentPreferences.captureView(
            key,
            core.getSnapshot().view,
            timeline ? { frame: timeline.activeFrame, layer: timeline.activeLayer } : undefined,
          );
          const view = core.getSnapshot().view;
          if (
            view.zoom !== DEFAULT_VIEW.zoom ||
            view.pan.x !== DEFAULT_VIEW.pan.x ||
            view.pan.y !== DEFAULT_VIEW.pan.y
          )
            this.pendingViewportFits.delete(core);
          // Do not save the unmeasured default as a document's remembered viewpoint.
          if (!this.pendingViewportFits.has(core))
            this.documentPreferences.captureViewport(key, view);
          this.documentPreferences.copy(key, `${SLOT_PREFERENCE_PREFIX}${id}`);
          const projectId = this.getRecoveryProjectId(id);
          if (projectId)
            this.documentPreferences.copy(key, `${PROJECT_PREFERENCE_PREFIX}${projectId}`);
          if (changed && id === this.activeId) this.notify();
        } else {
          const nextDefault = JSON.stringify(core.canvas.getDefaultDocumentView());
          if (defaultView !== nextDefault) {
            defaultView = nextDefault;
            this.documentPreferences.setDefaultView(core.canvas.getDefaultDocumentView());
            for (const slot of this.slots) {
              if (slot.core !== core)
                slot.core.canvas.setDefaultDocumentView({
                  ...slot.core.canvas.getDefaultDocumentView(),
                  ...this.documentPreferences.getDefaultView(),
                });
            }
          }
        }
      }
      if (id === this.activeId) {
        const settings = core.getSnapshot().settings;
        // Pointer, pixel and view publications retain the same settings object.
        // Compare before cloning every per-tool preference and serializing it.
        if (settings !== this.persistedToolSettings) {
          const preferences = core.drawing.settings.capturePersistentPreferences();
          const serialized = JSON.stringify(preferences);
          if (serialized !== this.serializedToolPreferences) {
            this.persistentToolPreferences = preferences;
            try {
              this.preferenceStorage?.setItem(TOOL_PREFERENCES_KEY, serialized);
              this.serializedToolPreferences = serialized;
              this.persistedToolSettings = settings;
            } catch {
              /* Keep the current preferences in memory if storage is unavailable. */
            }
          } else {
            this.persistedToolSettings = settings;
          }
        }
        const composeGroups = core.getSnapshot().settings.composeGroups === true;
        if (composeGroups !== this.composeGroups) {
          this.composeGroups = composeGroups;
          this.sharedSettings = { ...this.sharedSettings, composeGroups };
          try {
            this.preferenceStorage?.setItem(this.composeGroupsPreferenceKey, String(composeGroups));
          } catch {
            /* Keep the in-session preference when storage is unavailable. */
          }
        }
        const sliceUseKeys = core.getSnapshot().settings.sliceUseKeys === true;
        if (sliceUseKeys !== this.sliceUseKeys) {
          this.sliceUseKeys = sliceUseKeys;
          this.sharedSettings = { ...this.sharedSettings, sliceUseKeys };
          try {
            this.preferenceStorage?.setItem(this.sliceUseKeysPreferenceKey, String(sliceUseKeys));
          } catch {
            /* Keep the in-session preference when storage is unavailable. */
          }
        }
        const selectionAutoOpaque = core.getSnapshot().settings.selectionAutoOpaque ?? true;
        if (selectionAutoOpaque !== this.selectionPreferences.autoOpaque) {
          this.selectionPreferences = {
            ...this.selectionPreferences,
            autoOpaque: selectionAutoOpaque,
          };
          this.sharedSettings = { ...this.sharedSettings, selectionAutoOpaque };
          try {
            this.preferenceStorage?.setItem(
              this.selectionPreferenceKey,
              JSON.stringify(this.selectionPreferences),
            );
          } catch {
            /* Keep the updated selection behavior for this session. */
          }
          for (const slot of this.slots)
            if (slot.core !== core) slot.core.drawing.settings.setSettings({ selectionAutoOpaque });
          this.notify();
        }
      }
      const state = core.getSnapshot();
      if (state.document?.id !== playbackDocumentId) {
        playbackDocumentId = state.document?.id;
        core.timeline.setPlaybackOptions({
          rewindOnStop: this.timelineInteractionPreferences.rewindOnStop,
        });
      }
      if (this.pendingCloseSnapshots.has(id) && state.document) {
        const latest = core.getPersistenceSnapshot();
        if (latest) this.pendingCloseSnapshots.set(id, latest);
      }
      const nextName = state.document?.name ?? name;
      const nextDraft = core.hasPendingDocumentEdit();
      if (
        nextName !== tabName ||
        state.persistenceRevision !== tabRevision ||
        nextDraft !== tabDraft
      ) {
        tabName = nextName;
        tabRevision = state.persistenceRevision;
        tabDraft = nextDraft;
        this.notifyIfTabsChanged();
      }
    });
    const unsubscribeSession = session.subscribe(() => {
      const state = session.getSnapshot();
      const activated = activation !== state.documentActivation;
      const closed = activated && state.documentActivationKind === "close";
      activation = state.documentActivation;
      if (closed && session.editor === core) this.close(id);
      const nextRecentId = session.getActiveRecentId();
      if (recentId !== nextRecentId) {
        const previousKey = this.getDocumentPreferenceId(id);
        recentId = nextRecentId;
        if (!closed && nextRecentId)
          this.recentFilesCatalog.linkProject(this.getRecoveryProjectId(id), nextRecentId);
        const key =
          id !== documentId
            ? `${SLOT_PREFERENCE_PREFIX}${id}`
            : nextRecentId
              ? `${RECENT_PREFERENCE_PREFIX}${nextRecentId}`
              : `${SLOT_PREFERENCE_PREFIX}${id}`;
        if (!activated || !this.documentPreferences.has(key))
          this.documentPreferences.copy(previousKey, key);
        this.documentPreferenceKeys.set(id, key);
        if (!activated)
          this.documentPreferences.copyExports(previousKey, this.getExportPreferenceId(id));
        if (!closed && core.getSnapshot().document) {
          restoringPreferences = true;
          this.restoreDocumentPreferences(core, key);
          restoringPreferences = false;
          this.documentPreferences.captureView(key, core.getSnapshot().view);
        }
        this.notify();
        if (!closed && this.ready) this.rememberLayout();
      }
    });
    return {
      id,
      documentId,
      name,
      core,
      session,
      unsubscribe: () => {
        unsubscribeCore();
        unsubscribeSession();
      },
    };
  }

  private buildSnapshot(): DocumentWorkspaceSnapshot {
    const paneIds = this.paneIds(this.dockTree);
    const panes = paneIds.map((id) => {
      const tabs = (this.paneTabs.get(id) ?? []).filter((tab) => !this.closed.has(tab));
      const selected = this.paneActiveIds.get(id) ?? tabs[0] ?? "";
      return { id, tabs, activeId: tabs.includes(selected) ? selected : (tabs[0] ?? "") };
    });
    return {
      activeId: this.activeId,
      activePaneId: this.activePaneId,
      dockTree: this.dockTree,
      panes,
      exitRequests: this.exitRequests,
      closedProjects: this.closedProjects,
      canReopenClosedFile: this.closedDocuments.length > 0,
      importBatch: this.importBatch,
      tabs: this.order
        .map((id) => this.slots.find((slot) => slot.id === id)!)
        .filter((slot) => !this.closed.has(slot.id))
        .map((slot) => ({
          id: slot.id,
          name: slot.core.getSnapshot().document?.name ?? slot.name,
          modified: this.isTabModified(slot),
        })),
    };
  }

  private notify() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
  private hasPendingDraft(core: RasterEditor) {
    return core.hasPendingDocumentEdit();
  }
  private isSlotModified(slot: DocumentSlot) {
    // File-system mode retains the external-file dirty marker; browser mode
    // treats an acknowledged local project checkpoint as the saved document.
    return (
      this.ready &&
      !!slot.core.getSnapshot().document &&
      (this.hasPendingDraft(slot.core) ||
        this.recovery.isSlotUnpersisted(slot.documentId) ||
        (this.getSaveTarget(slot.id) === SaveTarget.FileSystem && slot.session.hasUnsavedChanges()))
    );
  }
  /** The tab dot follows the active document save target. */
  private isTabModified(slot: DocumentSlot) {
    return this.isSlotModified(slot);
  }
  isDocumentLocallyModified(id: string) {
    const slot = this.slots.find((item) => item.id === id);
    return !!slot && !this.closed.has(id) && this.isSlotModified(slot);
  }
  private notifyIfTabsChanged() {
    const next = this.buildSnapshot();
    const tabsEqual =
      next.tabs.length === this.snapshot.tabs.length &&
      next.tabs.every(
        (tab, index) =>
          tab.id === this.snapshot.tabs[index].id &&
          tab.name === this.snapshot.tabs[index].name &&
          tab.modified === this.snapshot.tabs[index].modified,
      );
    const panesEqual =
      next.panes.length === this.snapshot.panes.length &&
      next.panes.every((pane, index) => {
        const old = this.snapshot.panes[index];
        return (
          pane.id === old.id &&
          pane.activeId === old.activeId &&
          pane.tabs.length === old.tabs.length &&
          pane.tabs.every((id, at) => id === old.tabs[at])
        );
      });
    if (
      tabsEqual &&
      panesEqual &&
      next.activeId === this.snapshot.activeId &&
      next.activePaneId === this.snapshot.activePaneId &&
      next.dockTree === this.snapshot.dockTree
    )
      return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  private paneIds(node: WorkspaceDockNode): string[] {
    return node.kind === "pane"
      ? [node.id]
      : [...this.paneIds(node.first), ...this.paneIds(node.second)];
  }
  private paneForTab(id: string) {
    return this.paneIds(this.dockTree).find((paneId) => this.paneTabs.get(paneId)?.includes(id));
  }
  private firstPaneId(node = this.dockTree): string {
    return node.kind === "pane" ? node.id : this.firstPaneId(node.first);
  }
  private replacePane(
    node: WorkspaceDockNode,
    paneId: string,
    replacement: WorkspaceDockNode,
  ): WorkspaceDockNode {
    if (node.kind === "pane") return node.id === paneId ? replacement : node;
    return {
      ...node,
      first: this.replacePane(node.first, paneId, replacement),
      second: this.replacePane(node.second, paneId, replacement),
    };
  }
  private removePane(node: WorkspaceDockNode, paneId: string): WorkspaceDockNode | null {
    if (node.kind === "pane") return node.id === paneId ? null : node;
    const first = this.removePane(node.first, paneId);
    const second = this.removePane(node.second, paneId);
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
  }
  getSlot(id: string) {
    return this.slots.find((slot) => slot.id === id && !this.closed.has(id));
  }
  getRootPaneId() {
    return this.paneTabs.has("main") && this.paneIds(this.dockTree).includes("main")
      ? "main"
      : this.firstPaneId();
  }
  getPane(paneId: string) {
    return this.snapshot.panes.find((pane) => pane.id === paneId);
  }
  selectPaneTab(paneId: string, id: string) {
    return this.paneTabs.get(paneId)?.includes(id) ? this.select(id) : false;
  }
  activatePane(paneId: string) {
    const pane = this.getPane(paneId);
    return pane?.activeId ? this.selectPaneTab(paneId, pane.activeId) : false;
  }
  private recoveryLayout() {
    const views = this.order
      .filter((id) => !this.closed.has(id))
      .map((id) => ({
        id,
        documentId: this.getDocumentId(id),
      }));
    const slotIds = [...new Set(views.map((view) => view.documentId))];
    const recentIds = Object.fromEntries(
      slotIds.flatMap((id) => {
        const recentId = this.slots.find((slot) => slot.id === id)?.session.getActiveRecentId();
        return recentId ? [[id, recentId]] : [];
      }),
    );
    return {
      activeId: this.activeId,
      slotIds,
      views,
      ...(Object.keys(recentIds).length ? { recentIds } : {}),
    };
  }
  private rememberLayout() {
    this.recovery.updateLayout(this.recoveryLayout());
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async getDiagnosticsSnapshot(): Promise<WorkspaceDiagnosticSnapshot> {
    const openDocuments = this.order.flatMap((slotId) => {
      if (this.closed.has(slotId)) return [];
      const slot = this.slots.find((candidate) => candidate.id === slotId);
      const document = slot?.core.getSnapshot().document;
      if (!slot || !document) return [];
      return [
        {
          slotId,
          projectId: this.getRecoveryProjectId(slotId),
          documentName: document.name,
          width: document.width,
          height: document.height,
          active: slotId === this.activeId,
          modified: this.isSlotModified(slot),
        },
      ];
    });
    const browserProjects = await this.recovery.listProjectsForDiagnostics();
    const projectsByName = new Map<string, string[]>();
    for (const project of browserProjects) {
      const projectIds = projectsByName.get(project.name) ?? [];
      projectIds.push(project.projectId);
      projectsByName.set(project.name, projectIds);
    }
    const duplicateNameGroups = [...projectsByName]
      .filter(([, projectIds]) => projectIds.length > 1)
      .map(([name, projectIds]) => ({ name, count: projectIds.length, projectIds }));
    return {
      activeSlotId: this.activeId,
      openDocuments,
      browserProjects,
      duplicateNameGroups,
    };
  }

  getDocumentId(slotId = this.activeId): string {
    return this.slots.find((slot) => slot.id === slotId)?.documentId ?? slotId;
  }
  private getRecoveryProjectId(slotId: string): string | null {
    return this.recovery.getSlotProjectId?.(this.getDocumentId(slotId)) ?? null;
  }

  private recordWorkspaceEvent(
    action: WorkspaceDiagnosticAction,
    slot: DocumentSlot,
    details: Partial<Omit<WorkspaceDiagnosticEvent, "action" | "slotId">> = {},
  ) {
    const document = slot.core.getSnapshot().document;
    try {
      this.diagnostics?.recordWorkspaceEvent({
        action,
        slotId: slot.id,
        projectId: this.getRecoveryProjectId(slot.id) ?? undefined,
        documentName: document?.name ?? slot.name,
        ...(document ? { width: document.width, height: document.height } : {}),
        ...details,
      });
    } catch {
      // Diagnostic capture must never interrupt a workspace operation.
    }
  }

  get active() {
    return (
      this.slots.find((slot) => slot.id === this.activeId) ??
      this.slots.find((slot) => !slot.core.getSnapshot().document) ??
      this.slots[0]
    );
  }

  select(id: string) {
    if (
      !this.active.session.canStartInteraction() ||
      this.closed.has(id) ||
      !this.slots.some((slot) => slot.id === id)
    )
      return false;
    const paneId = this.paneForTab(id);
    if (!paneId) return false;
    const destination = this.slots.find((slot) => slot.id === id)!;
    const recentId = destination.session.getActiveRecentId();
    if (
      destination.documentId === id &&
      recentId &&
      this.getDocumentPreferenceId(id) !== `${RECENT_PREFERENCE_PREFIX}${recentId}`
    ) {
      const key = `${RECENT_PREFERENCE_PREFIX}${recentId}`;
      if (!this.documentPreferences.has(key))
        this.documentPreferences.copy(this.getDocumentPreferenceId(id), key);
      this.documentPreferenceKeys.set(id, key);
      this.restoreDocumentPreferences(destination.core, key);
    }
    if (this.activeId === id) {
      destination.session.selectView(destination.core);
      const paneChanged = this.activePaneId !== paneId || this.paneActiveIds.get(paneId) !== id;
      this.activePaneId = paneId;
      this.paneActiveIds.set(paneId, id);
      if (paneChanged) this.notify();
      return true;
    }
    const documentViews = this.slots.filter(
      (slot) =>
        slot.id !== id &&
        slot.documentId === destination.documentId &&
        slot.core.hasPendingDocumentEdit(),
    );
    for (const view of documentViews) if (!view.core.finishViewEdit()) return false;
    const previous = this.active.core.getSnapshot();
    // Switching views must not discard a staged paste or text draft. Only an
    // unfinished pointer stroke is cancelled; preferences transfer is inert.
    if (
      (previous.preview || previous.linePreview) &&
      !previous.floatingPaste &&
      !previous.inlineText
    )
      this.active.core.cancelGesture();
    const preferences = this.active.core.drawing.settings.capturePreferences();
    this.slots.find((slot) => slot.id === id)?.session.refreshRecent();
    this.activeId = id;
    this.activePaneId = paneId;
    this.paneActiveIds.set(paneId, id);
    destination.session.selectView(destination.core);
    this.active.core.drawing.settings.applyPreferences(preferences);
    this.active.core.canvas.setView({ appearance: previous.view.appearance });
    this.notify();
    this.rememberLayout();
    return true;
  }

  reorder(id: string, targetId: string) {
    const paneId = this.paneForTab(id);
    if (paneId) this.reorderInPane(paneId, id, targetId);
  }

  reorderInPane(paneId: string, id: string, targetId: string) {
    const tabs = this.paneTabs.get(paneId);
    const from = tabs?.indexOf(id) ?? -1,
      to = tabs?.indexOf(targetId) ?? -1;
    if (!tabs || from < 0 || to < 0 || from === to) return;
    tabs.splice(from, 1);
    tabs.splice(to, 0, id);
    const globalFrom = this.order.indexOf(id),
      globalTo = this.order.indexOf(targetId);
    if (globalFrom >= 0 && globalTo >= 0) {
      this.order.splice(globalFrom, 1);
      this.order.splice(globalTo, 0, id);
    }
    this.notify();
    this.rememberLayout();
  }

  moveTabToPane(id: string, targetPaneId: string, targetId?: string, before = true) {
    const sourcePaneId = this.paneForTab(id);
    const source = sourcePaneId && this.paneTabs.get(sourcePaneId);
    const target = this.paneTabs.get(targetPaneId);
    if (!sourcePaneId || !source || !target || !this.paneIds(this.dockTree).includes(targetPaneId))
      return false;
    if (sourcePaneId === targetPaneId) {
      if (!targetId) return false;
      const from = target.indexOf(id),
        to = target.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return false;
      target.splice(from, 1);
      const adjusted = target.indexOf(targetId) + (before ? 0 : 1);
      target.splice(adjusted, 0, id);
    } else {
      const from = source.indexOf(id);
      if (from < 0) return false;
      source.splice(from, 1);
      const anchor = targetId ? target.indexOf(targetId) : -1;
      target.splice(anchor < 0 ? target.length : anchor + (before ? 0 : 1), 0, id);
      if (this.paneActiveIds.get(sourcePaneId) === id)
        this.paneActiveIds.set(sourcePaneId, source[Math.min(from, source.length - 1)] ?? "");
      if (!source.length && sourcePaneId !== targetPaneId) {
        const remaining = this.removePane(this.dockTree, sourcePaneId);
        if (remaining) this.dockTree = remaining;
        this.paneTabs.delete(sourcePaneId);
        this.paneActiveIds.delete(sourcePaneId);
      }
    }
    this.paneActiveIds.set(targetPaneId, id);
    const globalFrom = this.order.indexOf(id);
    if (globalFrom >= 0) {
      this.order.splice(globalFrom, 1);
      const globalAnchor = targetId ? this.order.indexOf(targetId) : -1;
      this.order.splice(
        globalAnchor < 0 ? this.order.length : globalAnchor + (before ? 0 : 1),
        0,
        id,
      );
    }
    this.select(id);
    this.notify();
    this.rememberLayout();
    return true;
  }

  splitTab(id: string, targetPaneId: string, edge: DockEdge) {
    const sourcePaneId = this.paneForTab(id);
    const source = sourcePaneId && this.paneTabs.get(sourcePaneId);
    const target = this.paneTabs.get(targetPaneId);
    if (!sourcePaneId || !source || !target || !this.paneIds(this.dockTree).includes(targetPaneId))
      return false;
    if (sourcePaneId === targetPaneId && source.length < 2) return false;
    const targetNodeExists = this.paneIds(this.dockTree).includes(targetPaneId);
    if (!targetNodeExists) return false;

    const sourceIndex = source.indexOf(id);
    if (sourceIndex < 0) return false;
    source.splice(sourceIndex, 1);
    if (this.paneActiveIds.get(sourcePaneId) === id)
      this.paneActiveIds.set(sourcePaneId, source[Math.min(sourceIndex, source.length - 1)] ?? "");

    const paneId = `pane-${++this.paneSerial}`;
    this.paneTabs.set(paneId, [id]);
    this.paneActiveIds.set(paneId, id);
    const targetNode: WorkspaceDockNode = { kind: "pane", id: targetPaneId };
    const newNode: WorkspaceDockNode = { kind: "pane", id: paneId };
    const before = edge === DockEdge.Left || edge === DockEdge.Top;
    const axis = edge === DockEdge.Left || edge === DockEdge.Right ? "horizontal" : "vertical";
    const sideRatio = targetPaneId === "main" ? 0.3 : 0.5;
    const split: WorkspaceDockNode = {
      kind: "split",
      id: `split-${++this.splitSerial}`,
      axis,
      ratio: before ? sideRatio : 1 - sideRatio,
      first: before ? newNode : targetNode,
      second: before ? targetNode : newNode,
    };
    this.dockTree = this.replacePane(this.dockTree, targetPaneId, split);
    const globalFrom = this.order.indexOf(id);
    if (globalFrom >= 0) {
      this.order.splice(globalFrom, 1);
      this.order.push(id);
    }
    if (!source.length && sourcePaneId !== targetPaneId) {
      const remaining = this.removePane(this.dockTree, sourcePaneId);
      if (remaining) this.dockTree = remaining;
      this.paneTabs.delete(sourcePaneId);
      this.paneActiveIds.delete(sourcePaneId);
    }
    this.activeId = id;
    this.activePaneId = paneId;
    this.select(id);
    this.notify();
    this.rememberLayout();
    return true;
  }

  resizeSplit(splitId: string, ratio: number) {
    const update = (node: WorkspaceDockNode): WorkspaceDockNode => {
      if (node.kind === "pane") return node;
      if (node.id === splitId) {
        const nextRatio = Math.max(0.15, Math.min(0.85, ratio));
        return nextRatio === node.ratio ? node : { ...node, ratio: nextRatio };
      }
      const first = update(node.first),
        second = update(node.second);
      return first === node.first && second === node.second ? node : { ...node, first, second };
    };
    const next = update(this.dockTree);
    if (next === this.dockTree) return;
    this.dockTree = next;
    this.notify();
    this.rememberLayout();
  }

  /** Close is called only after the session has completed its save/discard guard. */
  close(id: string) {
    if (this.closed.has(id)) return;
    const open = this.order.filter((key) => !this.closed.has(key));
    const index = open.indexOf(id);
    if (index < 0) return;
    const closedSnapshot = this.pendingCloseSnapshots.get(id);
    this.pendingCloseSnapshots.delete(id);
    const closedProjectId = this.pendingCloseProjectIds.get(id) ?? this.getRecoveryProjectId(id);
    const closedRecentId = this.pendingCloseRecentIds.get(id) ?? null;
    this.pendingCloseProjectIds.delete(id);
    this.pendingCloseRecentIds.delete(id);
    const closingSlot = this.slots.find((slot) => slot.id === id);
    if (closingSlot)
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.DocumentClosed, closingSlot, {
        projectId: closedProjectId ?? undefined,
      });
    if (closedSnapshot)
      this.rememberClosedDocument(
        closedSnapshot,
        this.getDocumentPreferenceId(id),
        closedProjectId,
        closedRecentId,
      );
    if (closedProjectId)
      this.documentPreferences.copy(
        this.getDocumentPreferenceId(id),
        `${PROJECT_PREFERENCE_PREFIX}${closedProjectId}`,
      );
    const otherView =
      closingSlot &&
      this.slots.find(
        (slot) =>
          slot.id !== id && !this.closed.has(slot.id) && slot.documentId === closingSlot.documentId,
      );
    if (!otherView) this.ports.releaseDocumentHandle(closingSlot?.documentId ?? id);
    this.closed.add(id);
    const closingPaneId = this.paneForTab(id);
    const closingPaneTabs = closingPaneId ? this.paneTabs.get(closingPaneId) : undefined;
    const closingPaneIndex = closingPaneTabs?.indexOf(id) ?? -1;
    closingPaneTabs?.splice(closingPaneIndex, 1);
    if (
      closingPaneId &&
      closingPaneTabs &&
      !closingPaneTabs.length &&
      this.paneIds(this.dockTree).length > 1
    ) {
      const remaining = this.removePane(this.dockTree, closingPaneId);
      if (remaining) this.dockTree = remaining;
      this.paneTabs.delete(closingPaneId);
      this.paneActiveIds.delete(closingPaneId);
    } else if (closingPaneId && this.paneActiveIds.get(closingPaneId) === id) {
      this.paneActiveIds.set(
        closingPaneId,
        closingPaneTabs?.[Math.min(closingPaneIndex, (closingPaneTabs?.length ?? 1) - 1)] ?? "",
      );
    }
    if (id === this.activeId) {
      const appearance = this.active.core.getSnapshot().view.appearance;
      const preferences = this.active.core.drawing.settings.capturePreferences();
      const nextId =
        (closingPaneId ? this.paneActiveIds.get(closingPaneId) : "") ||
        open[index + 1] ||
        open[index - 1] ||
        "";
      this.activeId = nextId;
      this.activePaneId = nextId
        ? (this.paneForTab(nextId) ?? this.firstPaneId())
        : this.firstPaneId();
      const next = this.slots.find((slot) => slot.id === nextId);
      // The hidden workspace editor supplies preferences for the next new sprite.
      (next ?? this.active).core.drawing.settings.applyPreferences(preferences);
      next?.core.canvas.setView({ appearance });
      if (next) next.session.selectView(next.core);
    }
    this.notify();
    this.rememberLayout();
    void this.recovery
      .flush()
      .catch((error) => this.active.session.reportError(error))
      .finally(() => {
        void this.refreshClosedProjects();
      });
    if (this.closeQueue[0] === id) {
      this.closeQueue.shift();
      queueMicrotask(() => this.advanceCloseAll());
    }
  }
  requestClose(id = this.activeId) {
    const slot = this.slots.find((slot) => slot.id === id);
    if (
      !slot ||
      this.closed.has(id) ||
      !slot.session.canStartInteraction() ||
      !this.active.session.canStartInteraction()
    )
      return;
    if (!this.select(id)) return;
    const otherView = this.slots.some(
      (candidate) =>
        candidate.id !== id &&
        !this.closed.has(candidate.id) &&
        candidate.documentId === slot.documentId,
    );
    if (otherView) {
      if (!slot.core.finishViewEdit()) return;
      this.close(id);
      return;
    }
    const snapshot = slot.core.getPersistenceSnapshot();
    if (snapshot) this.pendingCloseSnapshots.set(id, snapshot);
    this.pendingCloseProjectIds.set(id, this.getRecoveryProjectId(id));
    this.pendingCloseRecentIds.set(id, slot.session.getActiveRecentId());
    const result = slot.session.requestClose(false, this.isSlotModified(slot));
    if (result === SessionOutcome.Closed) this.close(id);
    else if (result !== SessionOutcome.Confirmation) {
      this.pendingCloseSnapshots.delete(id);
      this.pendingCloseProjectIds.delete(id);
      this.pendingCloseRecentIds.delete(id);
    }
  }
  private rememberClosedDocument(
    snapshot: EditorPersistenceSnapshot,
    preferenceId: string,
    projectId: string | null,
    recentId: string | null,
  ) {
    // RasterEditor.getPersistenceSnapshot already returns a detached graph;
    // retaining it avoids another full sprite copy during close.
    const bytes = snapshotByteLength(snapshot);
    this.closedDocuments.unshift({ snapshot, bytes, preferenceId, projectId, recentId });
    this.closedDocumentBytes += bytes;
    while (
      this.closedDocuments.length > 1 &&
      (this.closedDocuments.length > this.maxClosedDocumentCount ||
        this.closedDocumentBytes > this.maxClosedDocumentBytes)
    ) {
      const removed = this.closedDocuments.pop()!;
      this.closedDocumentBytes -= removed.bytes;
    }
    this.notifyIfTabsChanged();
  }
  get canReopenClosedFile() {
    return this.closedDocuments.length > 0;
  }
  async reopenClosedFile(): Promise<boolean> {
    if (this.reopeningClosedDocument || this.deletingBrowserCopy) return false;
    if (!this.closedDocuments.length || !this.active.session.canStartInteraction()) return false;
    const entry = this.closedDocuments.shift()!;
    this.closedDocumentBytes -= entry.bytes;
    this.reopeningClosedDocument = true;
    this.notifyIfTabsChanged();
    try {
      let project: { projectId: string; head: string } | undefined;
      if (entry.projectId) {
        await this.recovery.flush();
        const head = await this.recovery.getClosedProjectHead(entry.projectId);
        if (head) project = { projectId: entry.projectId, head };
      }
      const reopened = this.restoreClosedDocument(entry, project);
      if (!reopened) return false;
      try {
        await this.recovery.flush();
      } catch (error) {
        this.active.session.reportError(error);
      }
      return true;
    } catch (error) {
      this.restoreClosedDocumentToStack(entry);
      this.active.session.reportError(error);
      return false;
    } finally {
      this.reopeningClosedDocument = false;
      this.notifyIfTabsChanged();
    }
  }

  private restoreClosedDocument(
    entry: ClosedDocumentSnapshot,
    project?: { projectId: string; head: string },
  ): boolean {
    const slot = this.appendSlot(entry.snapshot.document.name);
    try {
      if (project) this.recovery.adoptClosedProject(slot.id, project.projectId, project.head, true);
      slot.core.restorePersistenceSnapshot(entry.snapshot);
      if (entry.recentId) {
        slot.session.restoreRecentIdentity(entry.recentId);
        this.recentFilesCatalog.linkProject(entry.projectId, entry.recentId);
      }
      this.documentPreferences.copy(entry.preferenceId, this.getDocumentPreferenceId(slot.id));
      this.restoreDocumentPreferences(slot.core, this.getDocumentPreferenceId(slot.id));
      if (!this.select(slot.id)) throw new Error("The closed document could not be activated");
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.ClosedDocumentReopened, slot, {
        previousProjectId: entry.projectId ?? undefined,
      });
      return true;
    } catch (error) {
      this.closed.add(slot.id);
      this.restoreClosedDocumentToStack(entry);
      this.notify();
      this.active.session.reportError(error);
      return false;
    }
  }

  private restoreClosedDocumentToStack(entry: ClosedDocumentSnapshot) {
    if (this.closedDocuments.some((candidate) => candidate === entry)) return;
    this.closedDocuments.unshift(entry);
    this.closedDocumentBytes += entry.bytes;
    this.notifyIfTabsChanged();
  }
  async clearRecentFiles(): Promise<void> {
    const generation = ++this.recentClearGeneration;
    let closedProjects = this.closedProjects;
    try {
      await this.recovery.flush();
    } catch (error) {
      this.active.session.reportError(error, SessionOperation.Recent);
    }
    try {
      closedProjects = await this.recovery.listClosedProjects();
    } catch (error) {
      this.active.session.reportError(error, SessionOperation.Recent);
    }
    this.recentFilesCatalog.dismissProjects([
      ...closedProjects
        .filter(
          (project) => !this.isPlaygroundProjectId(project.id) && !isPlaygroundName(project.name),
        )
        .map((project) => project.id),
      ...this.slots
        .filter(
          (slot) =>
            !this.closed.has(slot.id) &&
            !isPlaygroundName(slot.core.getSnapshot().document?.name) &&
            !this.isPlaygroundProjectId(this.getRecoveryProjectId(slot.id)) &&
            slot.session.getActiveRecentId() !== xpriteProjectId,
        )
        .map((slot) => this.getRecoveryProjectId(slot.id) ?? ""),
    ]);
    this.recentFilesCatalog.clearPinned();
    this.closedProjects = closedProjects;
    for (const slot of this.slots) slot.session.clearRecentFiles();
    this.notify();
    const persist = this.ports.saveRecentImages;
    if (!persist) return;
    try {
      await Promise.all(this.slots.map((slot) => slot.session.flushPersistence()));
      if (
        this.disposed ||
        generation !== this.recentClearGeneration ||
        this.recent.getList().length
      )
        return;
      await persist([]);
    } catch (error) {
      this.active.session.reportError(error, SessionOperation.Recent);
    }
  }
  discardLocalChanges(id = this.activeId) {
    return this.recovery.discardSlotChanges(this.getDocumentId(id));
  }
  closeAll(exit = false) {
    if (!this.active.session.canStartInteraction()) return;
    this.closeQueue = this.order.filter((id) => !this.closed.has(id));
    this.closeAllExit = exit;
    this.advanceCloseAll();
  }
  private advanceCloseAll() {
    if (this.disposed) return;
    const next = this.closeQueue[0];
    if (next) this.requestClose(next);
    else if (this.closeAllExit) {
      this.closeAllExit = false;
      this.exitRequests++;
      this.notify();
    }
  }
  cancelCloseAll() {
    this.closeQueue = [];
    this.closeAllExit = false;
  }
  hasUnsavedChanges() {
    return this.slots.some((slot) => !this.closed.has(slot.id) && this.isSlotModified(slot));
  }
  needsBeforeUnloadWarning() {
    if (!this.ready) return false;
    if (
      this.slots.some((slot) => {
        if (this.closed.has(slot.id)) return false;
        return this.hasPendingDraft(slot.core);
      })
    )
      return true;
    // The next launch restores the durable workspace snapshot even when the
    // associated user file still has unsaved edits.
    return this.recovery.hasUnpersistedWorkspaceChanges();
  }
  setSharedSettings(settings: Partial<ToolSettings>) {
    this.sharedSettings = { ...this.sharedSettings, ...settings };
    for (const slot of this.slots) slot.core.drawing.settings.setSettings(settings);
  }
  private appendSlot(name = "Untitled") {
    const slot = this.createSlot(`document-${this.createId()}`, name);
    slot.core.drawing.settings.applyPreferences(
      this.active.core.drawing.settings.capturePreferences(),
    );
    slot.core.canvas.setView({ appearance: this.active.core.getSnapshot().view.appearance });
    this.slots.push(slot);
    this.order.push(slot.id);
    const paneId = this.paneIds(this.dockTree).includes(this.activePaneId)
      ? this.activePaneId
      : this.firstPaneId();
    const tabs = this.paneTabs.get(paneId) ?? [];
    tabs.push(slot.id);
    this.paneTabs.set(paneId, tabs);
    this.paneActiveIds.set(paneId, slot.id);
    if (this.ready) this.recovery.start([slot], this.recoveryLayout());
    return slot;
  }
  duplicateView(id = this.activeId): boolean {
    const source = this.slots.find((slot) => slot.id === id && !this.closed.has(id));
    if (!source || !source.core.getSnapshot().document || !source.session.canStartInteraction())
      return false;
    if (!this.select(id) || !source.core.finishViewEdit()) return false;
    const cloneId = `${VIEW_SLOT_ID_PREFIX}${this.createId()}`;
    const key = `${SLOT_PREFERENCE_PREFIX}${cloneId}`;
    this.documentPreferences.copy(this.getDocumentPreferenceId(id), key);
    this.documentPreferenceKeys.set(cloneId, key);
    const clone = this.createSlot(cloneId, source.name, source);
    this.slots.push(clone);
    const paneId = this.paneForTab(id)!;
    const tabs = this.paneTabs.get(paneId)!;
    tabs.splice(tabs.indexOf(id) + 1, 0, clone.id);
    this.order.splice(this.order.indexOf(id) + 1, 0, clone.id);
    this.select(clone.id);
    this.notify();
    this.rememberLayout();
    return true;
  }

  private nextSpriteName(extension: ".png" | ".aseprite" = ".png") {
    return `${this.suggestNewSpriteBaseName()}${extension}`;
  }
  suggestNewSpriteBaseName() {
    return this.spriteNames.suggest([
      ...this.slots.map((slot) => slot.core.getSnapshot().document?.name ?? slot.name),
      ...this.closedProjects.map((project) => project.name),
      ...this.recent.getList().map((item) => item.name),
    ]);
  }
  prepareNew() {
    this.active.session.setNewSize(this.newSize);
  }
  createDocument(size: SessionSize, name?: string) {
    const slot = this.appendSlot();
    const result = slot.session.requestNew(size);
    if (result === SessionOutcome.Error) {
      this.active.session.reportError(
        slot.session.getSnapshot().error?.message ?? "Unable to create sprite",
      );
      this.closed.add(slot.id);
      this.notify();
      return result;
    }
    this.newSize = { ...size };
    slot.core.history.markSaved(
      name?.trim() ||
        this.nextSpriteName(
          size.colorDepth !== undefined || size.background !== undefined ? ".aseprite" : ".png",
        ),
    );
    this.spriteNames.remember(slot.core.getSnapshot().document!.name);
    this.select(slot.id);
    this.recordWorkspaceEvent(WorkspaceDiagnosticAction.DocumentCreated, slot);
    return result;
  }
  createDocumentFromImage(image: PixelBuffer, palette?: readonly Rgba[], name?: string) {
    const slot = this.appendSlot();
    try {
      slot.core.document.loadImage(image, name ?? this.nextSpriteName(), palette);
      const snapshot = slot.core.getPersistenceSnapshot()!;
      slot.core.restorePersistenceSnapshot({ ...snapshot, dirty: true });
      this.spriteNames.remember(snapshot.document.name);
      this.select(slot.id);
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.DocumentCreated, slot);
    } catch (error) {
      this.closed.add(slot.id);
      this.active.session.reportError(error);
    }
  }
  createDocumentFromProject(project: SessionProject, name?: string) {
    const documentName = name ?? this.nextSpriteName(".aseprite"),
      slot = this.appendSlot(documentName);
    try {
      slot.core.document.loadTimeline(
        project.timeline,
        project.image.width,
        project.image.height,
        documentName,
        project.palette,
      );
      const saved = slot.core.getPersistenceSnapshot()!;
      slot.core.restorePersistenceSnapshot({ ...saved, dirty: true });
      this.spriteNames.remember(saved.document.name);
      this.select(slot.id);
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.DocumentCreated, slot);
    } catch (error) {
      this.closed.add(slot.id);
      this.active.session.reportError(error);
    }
  }
  async openSource(source: SessionSource<string>) {
    const slot = this.appendSlot(source.name);
    this.ports.bindSourceToDocument(source.source, slot.id);
    this.select(slot.id);
    this.recordWorkspaceEvent(WorkspaceDiagnosticAction.SourceImportStarted, slot, {
      documentName: source.name,
    });
    const result = await slot.session.requestImport(source);
    this.linkRecentFileToWorkspaceProject(slot.id);
    this.recordWorkspaceEvent(WorkspaceDiagnosticAction.SourceImportCompleted, slot, {
      documentName: slot.core.getSnapshot().document?.name ?? source.name,
      result: String(result),
    });
    return slot;
  }
  /** A batch owns queued sources and pauses while each document needs a user decision. */
  async openFiles(items: readonly FileImportItem[]) {
    if (this.importController || this.disposed) {
      for (const item of items)
        for (const source of importItemSources(item)) this.ports.releaseSource?.(source.source);
      return;
    }
    const controller = new AbortController();
    this.importController = controller;
    const aborted = new Promise<void>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    try {
      for (let index = 0; index < items.length && !controller.signal.aborted; index++) {
        const item = items[index];
        this.importBatch = {
          index: index + 1,
          total: items.length,
          name: item.kind === FileImportKind.Document ? item.source.name : item.name,
        };
        this.notify();
        try {
          if (item.kind === FileImportKind.Document) {
            const opening = this.openSource(item.source);
            this.importSlot = this.active;
            await Promise.race([opening, aborted]);
          } else {
            const source = this.ports.registerProject(item.name, () =>
              this.decodePngSequence(item, controller.signal),
            );
            const opening = this.openSource(source);
            this.importSlot = this.active;
            await Promise.race([opening, aborted]);
            this.ports.releaseSource?.(source.source);
          }
          if (controller.signal.aborted) break;
          const slot = this.importSlot ?? this.active;
          await this.waitForImportDecision(slot, controller.signal);
          if (!slot.core.getSnapshot().document && !this.closed.has(slot.id)) this.close(slot.id);
        } catch (reason) {
          if (controller.signal.aborted) break;
          const slot = this.importSlot ?? this.active;
          slot.session.reportError(reason, SessionOperation.Import);
          await this.waitForImportDecision(slot, controller.signal);
        } finally {
          this.importSlot = null;
        }
      }
    } finally {
      // Includes unopened files and failed sequence members. Release is idempotent.
      for (const item of items)
        for (const source of importItemSources(item)) this.ports.releaseSource?.(source.source);
      this.importBatch = null;
      this.importController = null;
      this.importSlot = null;
      if (!this.disposed) this.notify();
    }
  }
  private async decodePngSequence(
    item: Extract<FileImportItem, { kind: FileImportKind.PngSequence }>,
    signal: AbortSignal,
  ): Promise<SessionProject> {
    if (
      !Number.isSafeInteger(item.durationMs) ||
      item.durationMs < MIN_SEQUENCE_FRAME_DURATION_MS ||
      item.durationMs > MAX_SEQUENCE_FRAME_DURATION_MS
    )
      throw new RangeError(tUi("ui.png.sequence.duration.invalid"));
    const frames: { pixels: PixelBuffer; durationMs: number }[] = [];
    for (const source of item.sources) {
      const pixels = await this.ports.decode(source.source);
      if (signal.aborted || this.disposed) throw new DOMException("Import cancelled", "AbortError");
      const first = frames[0]?.pixels;
      if (!first) assertRasterAnimationCapacity(pixels.width, pixels.height, item.sources.length);
      if (first && (pixels.width !== first.width || pixels.height !== first.height))
        throw new Error(
          tUi("ui.png.sequence.dimensions.mismatch", {
            name: source.name,
            width: pixels.width,
            height: pixels.height,
            expectedWidth: first.width,
            expectedHeight: first.height,
          }),
        );
      frames.push({ pixels, durationMs: item.durationMs });
    }
    const first = frames[0]?.pixels;
    if (!first) throw new Error(tUi("ui.png.sequence.frames.empty"));
    if (signal.aborted || this.disposed) throw new DOMException("Import cancelled", "AbortError");
    return rasterAnimationProject({ width: first.width, height: first.height, frames });
  }
  private waitForImportDecision(slot: DocumentSlot, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      let unsubscribeSession = () => {};
      let unsubscribeWorkspace = () => {};
      const check = () => {
        if (
          !signal.aborted &&
          !this.disposed &&
          !this.closed.has(slot.id) &&
          !slot.session.canStartInteraction()
        )
          return;
        unsubscribeSession();
        unsubscribeWorkspace();
        signal.removeEventListener("abort", check);
        resolve();
      };
      unsubscribeSession = slot.session.subscribe(check);
      unsubscribeWorkspace = this.subscribe(check);
      signal.addEventListener("abort", check, { once: true });
      check();
    });
  }
  cancelFileImport() {
    this.importController?.abort();
    const slot = this.importSlot;
    if (slot) {
      slot.session.cancelImport();
      if (!slot.core.getSnapshot().document && !this.closed.has(slot.id)) this.close(slot.id);
    }
  }
  discardEmptyImport() {
    const slot = this.active;
    slot.session.cancelImport();
    if (!slot.core.getSnapshot().document) this.close(slot.id);
  }
  openRecent(id: string): Promise<boolean> {
    if (this.deletingBrowserCopy) return Promise.resolve(false);
    const pending = this.openingRecent.get(id);
    if (pending) return pending;
    const opening = this.openRecentOnce(id);
    this.openingRecent.set(id, opening);
    const clearPending = () => {
      if (this.openingRecent.get(id) === opening) this.openingRecent.delete(id);
    };
    void opening.then(clearPending, clearPending);
    return opening;
  }
  private async openRecentOnce(id: string): Promise<boolean> {
    if (id.startsWith(LOCAL_PROJECT_RECENT_PREFIX))
      return this.openClosedProject(id.slice(LOCAL_PROJECT_RECENT_PREFIX.length));
    const existing = this.slots.find(
      (slot) => !this.closed.has(slot.id) && slot.session.getActiveRecentId() === id,
    );
    if (existing) {
      const selected = this.select(existing.id);
      if (selected)
        this.recordWorkspaceEvent(WorkspaceDiagnosticAction.RecentImageOpened, existing, {
          recentId: id,
        });
      return selected;
    }
    if (!this.active.session.canStartInteraction()) return false;
    const linkedProject = this.closedProjects.find(
      (project) =>
        !this.recentFilesCatalog.isProjectDismissed(project.id) &&
        this.recentFilesCatalog.recentIdForProject(project.id) === id,
    );
    if (linkedProject) return this.openClosedProject(linkedProject.id);
    const slot = this.appendSlot();
    await slot.session.restoreRecent();
    if (slot.session.openRecent(id) === SessionOutcome.Created && this.select(slot.id)) {
      this.linkRecentFileToWorkspaceProject(slot.id);
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.RecentImageOpened, slot, {
        recentId: id,
      });
      return true;
    }
    this.closed.add(slot.id);
    this.notify();
    return false;
  }
  private async openClosedProject(projectId: string): Promise<boolean> {
    if (!this.active.session.canStartInteraction()) return false;
    const { snapshot, head } = await this.recovery.loadClosedProject(projectId);
    if (this.disposed) return false;
    const slot = this.appendSlot(snapshot.document.name);
    try {
      this.documentPreferenceKeys.set(slot.id, `${PROJECT_PREFERENCE_PREFIX}${projectId}`);
      this.recovery.adoptClosedProject(slot.id, projectId, head);
      slot.core.restorePersistenceSnapshot(snapshot);
      const recentId = this.recentFilesCatalog.recentIdForProject(projectId) ?? projectId;
      slot.session.restoreRecentIdentity(recentId);
      const rememberedId = await slot.session.rememberCurrentDocument(recentId);
      this.recentFilesCatalog.linkProject(projectId, rememberedId);
      this.restoreDocumentPreferences(slot.core, this.getDocumentPreferenceId(slot.id));
      this.select(slot.id);
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.BrowserProjectOpened, slot);
      void this.refreshClosedProjects();
      return true;
    } catch (error) {
      this.closed.add(slot.id);
      this.notify();
      throw error;
    }
  }
  private async refreshClosedProjects() {
    const refresh = ++this.closedProjectsRefresh;
    try {
      const projects = await this.recovery.listClosedProjects();
      if (this.disposed || refresh !== this.closedProjectsRefresh) return;
      this.closedProjects = projects;
      this.notify();
    } catch (error) {
      if (!this.disposed) this.active.session.reportError(error);
    }
  }

  private removeEmptyStartupSlots() {
    const emptySlotIds = new Set(
      this.slots.filter((slot) => !slot.core.getSnapshot().document).map((slot) => slot.id),
    );
    if (!emptySlotIds.size) return;

    for (const id of emptySlotIds) this.closed.add(id);
    this.order = this.order.filter((id) => !emptySlotIds.has(id));
    for (const [paneId, tabs] of this.paneTabs) {
      const openTabs = tabs.filter((id) => !emptySlotIds.has(id) && !this.closed.has(id));
      this.paneTabs.set(paneId, openTabs);
      const selected = this.paneActiveIds.get(paneId);
      if (!selected || !openTabs.includes(selected))
        this.paneActiveIds.set(paneId, openTabs[0] ?? "");
    }

    if (!this.order.some((id) => !this.closed.has(id))) {
      this.activeId = "";
      this.activePaneId = this.firstPaneId();
      return;
    }
    if (this.order.some((id) => id === this.activeId && !this.closed.has(id))) return;

    this.activeId = this.order.find((id) => !this.closed.has(id)) ?? "";
    this.activePaneId = this.activeId
      ? (this.paneForTab(this.activeId) ?? this.firstPaneId())
      : this.firstPaneId();
    if (this.activeId) this.paneActiveIds.set(this.activePaneId, this.activeId);
  }

  async initialize() {
    if (this.initialization) return this.initialization;
    this.initialization = this.initializeWorkspace();
    return this.initialization;
  }
  private async initializeWorkspace() {
    const presets = this.userPresets.initialize();
    // Keep an early rejection handled while independent recovery IO runs.
    // The startup gate below still awaits and reports the original promise.
    void presets.catch(() => {});
    try {
      const saved = await this.recovery.restore();
      if (this.disposed) return;
      if (saved) {
        // Do not replace edits made while storage hydration was in progress.
        const untouched = this.slots.every((slot) => !slot.core.getSnapshot().document);
        if (!untouched) throw new Error("Workspace changed before recovery completed");
        for (const id of saved.layout.slotIds) {
          if (!this.slots.some((slot) => slot.id === id))
            this.slots.push(this.createSlot(id, "Untitled"));
        }
        for (const slot of this.slots) {
          const snapshot = saved.documents.get(slot.id);
          if (snapshot) {
            slot.core.restorePersistenceSnapshot(snapshot);
            const recentId = isPlaygroundName(snapshot.document.name)
              ? xpriteProjectId
              : saved.layout.recentIds?.[slot.id];
            if (recentId) {
              slot.session.restoreRecentIdentity(recentId);
              const key = `${RECENT_PREFERENCE_PREFIX}${recentId}`;
              if (!this.documentPreferences.has(key))
                this.documentPreferences.copy(this.getDocumentPreferenceId(slot.id), key);
              this.documentPreferenceKeys.set(slot.id, key);
              this.restoreDocumentPreferences(slot.core, key);
            }
          }
        }
        const views = saved.layout.views;
        for (const view of views) {
          if (view.id === view.documentId) continue;
          const source = this.slots.find((slot) => slot.id === view.documentId);
          if (!source?.core.getSnapshot().document) continue;
          const key = `${SLOT_PREFERENCE_PREFIX}${view.id}`;
          this.documentPreferenceKeys.set(view.id, key);
          const linked = this.createSlot(view.id, source.name, source);
          this.slots.push(linked);
          this.restoreDocumentPreferences(linked.core, key);
        }
        this.activeId = saved.layout.activeId;
        const visibleIds = views.map((view) => view.id);
        this.order = visibleIds;
        this.closed = new Set(
          this.slots.map((slot) => slot.id).filter((id) => !visibleIds.includes(id)),
        );
        const active = this.slots.find((slot) => slot.id === this.activeId);
        if (active) active.session.selectView(active.core);
        this.activePaneId = "main";
        this.dockTree = { kind: "pane", id: "main" };
        this.paneTabs = new Map([["main", this.order.filter((id) => !this.closed.has(id))]]);
        this.paneActiveIds = new Map([["main", this.activeId]]);
      }
    } catch (error) {
      this.recovery.suspend(error);
      // Recovery exposes its error state through a logic API. New error/status
      // controls require UI approval; existing external-save guards stay active.
    }
    if (this.disposed) return;
    this.removeEmptyStartupSlots();
    await Promise.all([
      presets,
      this.initializeDefaultPlayground(),
      canPickSaveFile()
        ? this.ports.hydrateDocumentHandles?.(this.recoveryLayout().slotIds)
        : undefined,
    ]);
    if (this.disposed) return;
    this.active.session.refreshRecent();
    this.ready = true;
    this.recovery.start(
      this.slots.filter((slot) => slot.id === slot.documentId),
      this.recoveryLayout(),
    );
    for (const slot of this.slots)
      if (!this.closed.has(slot.id)) this.linkRecentFileToWorkspaceProject(slot.id);
    if (this.activeId)
      this.recordWorkspaceEvent(WorkspaceDiagnosticAction.WorkspaceReady, this.active);
    this.notify();
  }
  private async initializeDefaultPlayground(): Promise<void> {
    if (this.disposed || this.recentFilesCatalog.isProjectDismissed(xpriteProjectId)) return;
    let existingProject: ClosedProjectEntry | null;
    try {
      existingProject = await this.recovery.findProjectByName(
        xpriteProjectName,
        xpriteProjectFileName,
      );
    } catch (reason) {
      await this.rememberBundledProjectFallback();
      this.active.session.reportError(reason, SessionOperation.Initialization);
      return;
    }
    if (existingProject) {
      this.recentFilesCatalog.linkProject(existingProject.id, xpriteProjectId);
      const playgroundIsOpen = this.slots.some(
        (slot) =>
          isPlaygroundName(slot.core.getSnapshot().document?.name) ||
          slot.session.getActiveRecentId() === xpriteProjectId,
      );
      if (!playgroundIsOpen) this.closedProjects = [existingProject, ...this.closedProjects];
      return;
    }
    if (
      this.slots.some(
        (slot) =>
          isPlaygroundName(slot.core.getSnapshot().document?.name) ||
          slot.session.getActiveRecentId() === xpriteProjectId ||
          this.isPlaygroundProjectId(this.getRecoveryProjectId(slot.id)),
      )
    )
      return;

    const core = new RasterEditor();
    const bootstrap = new EditorSession(
      core,
      this.sessionPorts,
      undefined,
      undefined,
      "playground-seed",
    );
    try {
      await bootstrap.initialize(this.ports.registerAsset(projectUrl, xpriteProjectName), {
        rememberInitial: false,
        awaitPersistence: false,
      });
      const snapshot = core.getPersistenceSnapshot();
      if (!snapshot)
        throw new Error(bootstrap.getSnapshot().error?.message ?? tUi("ui.playground.load.failed"));
      const playground = await this.recovery.seedProject(xpriteProjectId, snapshot);
      if (playground)
        this.closedProjects = [
          playground,
          ...this.closedProjects.filter((project) => project.id !== playground.id),
        ];
      if (playground) this.recentFilesCatalog.linkProject(playground.id, xpriteProjectId);
    } catch (reason) {
      await this.rememberBundledProjectFallback();
      this.active.session.reportError(reason, SessionOperation.Initialization);
    } finally {
      bootstrap.dispose();
    }
  }
  private rememberBundledProjectFallback(): Promise<void> {
    return this.active.session.initialize(this.ports.registerAsset(projectUrl, xpriteProjectName), {
      rememberOnly: true,
      initialRecentId: xpriteProjectId,
      awaitPersistence: false,
    });
  }

  /** Start project-list scans after the first editor paint. */
  startBackgroundInitialization() {
    if (this.disposed || !this.ready || typeof window === "undefined") return;
    if (this.backgroundClosedProjectsTimer === null) {
      this.backgroundClosedProjectsTimer = window.setTimeout(() => {
        this.backgroundClosedProjectsTimer = null;
        if (!this.disposed) void this.refreshClosedProjects();
      }, 750);
    }
  }

  flushRecovery = () =>
    Promise.all([this.recovery.flush(), this.userPresets.flush()]).then(() => {});

  async saveLocally(slotId?: string) {
    if (!this.ready || this.disposed) throw new Error("Workspace is not ready to save");
    const target = slotId
      ? this.slots.find((slot) => slot.id === slotId && !this.closed.has(slot.id))
      : undefined;
    if (slotId && !target) throw new Error("Document is no longer open");
    const stillPending = () =>
      target ? this.isSlotModified(target) : this.needsBeforeUnloadWarning();
    for (const slot of this.slots) {
      if (this.closed.has(slot.id) || (slotId && slot.id !== slotId)) continue;
      const state = slot.core.getSnapshot();
      if (slot.core.hasPendingDocumentEdit() && !state.inlineText && !state.floatingPaste)
        throw new Error("Finish the current edit before saving");
      if (state.inlineText && !slot.core.drawing.text.commitInlineText())
        throw new Error("The current text could not be saved");
      if (slot.core.getSnapshot().floatingPaste && !slot.core.clipboard.commitFloatingPaste())
        throw new Error("The current pasted image could not be saved");
    }
    try {
      await this.recovery.flush();
    } catch (error) {
      // Optional retained archives may fail after the live workspace was saved.
      if (stillPending()) throw error;
    }
    if (stillPending())
      throw (
        this.recovery.getSnapshot().error ??
        new Error("Workspace changes are still waiting to be saved")
      );
  }

  async saveInBrowser(slotId: string) {
    const slot = this.slots.find((item) => item.id === slotId && !this.closed.has(item.id));
    if (!slot) throw new Error("Document is no longer open");
    await this.saveLocally(slotId);
    const document = slot.core.getSnapshot().document;
    if (!document) throw new Error("Document is no longer available");
    const format =
      document.format ?? (/\.(?:ase|aseprite)$/i.test(document.name) ? "aseprite" : "png");
    slot.core.history.markSaved(document.name, format);
    await this.saveLocally(slotId);
    await slot.session.rememberCurrentDocument(slot.session.getActiveRecentId());
    this.linkRecentFileToWorkspaceProject(slotId);
    await this.saveLocally(slotId);
    this.recordWorkspaceEvent(WorkspaceDiagnosticAction.BrowserProjectSaved, slot);
  }

  async saveAsInBrowser(slotId: string, name: string, format: "png" | "aseprite") {
    const slot = this.slots.find((item) => item.id === slotId && !this.closed.has(item.id));
    if (!slot) throw new Error("Document is no longer open");
    const previousProjectId = this.getRecoveryProjectId(slotId) ?? undefined;
    await this.saveLocally(slotId);
    await this.recovery.forkSlot(slot.documentId, name, format, () =>
      slot.core.history.markSaved(name, format),
    );
    await this.saveLocally(slotId);
    await slot.session.rememberCurrentDocument(null);
    this.linkRecentFileToWorkspaceProject(slotId);
    await this.saveLocally(slotId);
    this.recordWorkspaceEvent(WorkspaceDiagnosticAction.BrowserProjectSavedAs, slot, {
      previousProjectId,
      documentName: name,
    });
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.cancelFileImport();
    this.userPresets.dispose();
    this.disposed = true;
    if (typeof window !== "undefined") {
      if (this.backgroundClosedProjectsTimer !== null)
        window.clearTimeout(this.backgroundClosedProjectsTimer);
    }
    // A normal unmount can drain writes. OS termination still relies on the
    // checkpoints made while the app was active.
    this.disposal = (this.initialization ?? Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (this.ready) return this.recovery.flush();
      })
      .catch(() => {})
      .finally(() => this.recovery.dispose());
    this.unsubscribeRecovery();
    for (const slot of this.slots) slot.unsubscribe();
    for (const session of new Set(this.slots.map((slot) => slot.session))) session.dispose();
    for (const slot of this.slots) slot.core.detachLinkedView();
    this.ports.dispose?.();
    this.listeners.clear();
    return this.disposal;
  }
}
