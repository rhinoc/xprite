import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { changeUiLanguage, tUi, type UiLanguage } from "$/i18n";
import { ClipboardRegion, createClipboardActions } from "$/managers/clipboard";
import { useEditor, useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import {
  automaticViewTransition,
  userViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { useFeedback } from "$/managers/feedback/use-feedback";
import { useWheelDevice, WheelDevice } from "$/managers/input/wheel-device-context";
import { useEditorPaletteModel } from "$/managers/palette/editor-palette-model";
import { readDefaultPalette } from "$/managers/palette/presets";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import {
  DocumentOpenMethod,
  TelemetryFeature,
  TelemetryFeatureAction,
  TelemetryOperationAction,
  TelemetryOperationOutcome,
  TelemetryOperationTarget,
} from "$/managers/ports/telemetry";
import type { CanvasDisplayPreferences } from "$/managers/preferences/canvas-display-preferences";
import type { CursorPreferences } from "$/managers/preferences/cursor-preferences";
import { CanvasDisplayPreferenceTarget } from "$/managers/preferences/document-preferences";
import type { EditorPreferences } from "$/managers/preferences/editor-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import type { GridBoundsPreferences } from "$/managers/preferences/grid-preferences";
import type { GuideSlicePreferences } from "$/managers/preferences/guide-slice-preferences";
import { PreferenceResetTarget } from "$/managers/preferences/reset-preferences";
import { defaultTimelinePanelPreferences } from "$/managers/preferences/timeline-panel-preferences";
import { usePwaManager } from "$/managers/pwa/pwa-context";
import { DEFAULT_EDITOR_CHROME_PREFERENCES } from "$/managers/shell/editor-chrome-preferences";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { HELP_LINKS, HelpLink, HelpDocumentTab } from "$/managers/shell/help";
import { shortcutContexts } from "$/managers/shortcuts/shortcut-contexts";
import { SHORTCUT_DEFINITIONS } from "$/managers/shortcuts/shortcut-manager";
import { useTelemetryFeatures } from "$/managers/telemetry/use-telemetry-features";
import { useTelemetryView } from "$/managers/telemetry/use-telemetry-view";
import {
  DEFAULT_TEXT_FONT_SIZE,
  editorTextFontOptions,
  normalizeTextFontSize,
  textFontSettings,
} from "$/managers/tools/text-font";
import {
  adjacentWorkspaceTab,
  WorkspaceTabKind,
} from "$/managers/workspace/adjacent-workspace-tab";
import type { DockEdge } from "$/managers/workspace/dock-edge";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import {
  DEFAULT_SEQUENCE_FRAME_DURATION_MS,
  MIN_SEQUENCE_FRAME_DURATION_MS,
  MAX_SEQUENCE_FRAME_DURATION_MS,
  numberedPngGroups,
  fileImportPlan,
  type NumberedPngGroup,
} from "$/managers/workspace/file-import-plan";
import {
  presentRecoveryEntry,
  type RecoveryItem,
} from "$/managers/workspace/recovery-presentation";
import { DEFAULT_RECOVERY_SETTINGS } from "$/managers/workspace/recovery-settings";
import { SaveTarget } from "$/managers/workspace/save-target";
import { useWorkflowActionSnapshot } from "$/managers/workspace/workflow-action-snapshot";
import { useDocumentOutputWorkflows } from "$/managers/workspace/workflows/use-document-output-workflows";
import { normalizeKeyboardEvent } from "@xprite/bedrock/browser/keyboard";
import {
  projectFromClipboardImage,
  EffectKind,
  resolveShortcut,
  canExecuteEditorAction,
  executeEditorCommand,
  hexToRgba,
  validateBitmapText,
} from "@xprite/editor-core";
import type { EditorCommand, RasterEditor } from "@xprite/editor-core";
import {
  SessionSaveIntent,
  SessionOutcome,
  SessionOperation,
  type SessionSource,
} from "@xprite/editor-core/session";
import { AppearanceMode } from "@xprite/editor-ui/appearance";

type TimelineWorkflowActions = {
  flushPendingLayerProperties?: () => void;
  openLayerPropertiesDialog?: () => void;
  openFramePropertiesDialog?: () => void;
};
type AnimationWorkflowActions = { playPreview?: () => void };
type EffectWorkflowActions = { openEffect?: (kind: EffectKind) => void };
export interface EditorWorkflowOptions {
  appearanceMode: AppearanceMode;
  onAppearanceModeChange: (mode: AppearanceMode) => void;
  persistAppearanceMode: (mode: AppearanceMode) => void;
  timelineActions?: TimelineWorkflowActions | null;
  animationActions?: AnimationWorkflowActions | null;
  effectActions?: EffectWorkflowActions | null;
  sceneBounds: { width: number; height: number };
  getCommandContext?: () => EditorCommandPresentationContext | undefined;
  clearPointer?: () => void;
}

interface EditorCommandPresentationContext {
  viewport: { width: number; height: number };
  zoomAnchor?: { x: number; y: number };
}

const PREFERENCE_RESET_LANGUAGE: UiLanguage = "en";
const NEW_SPRITE_FILE_EXTENSION = ".aseprite";
const DELETE_SHORTCUT_WIDGET_SELECTOR =
  '[role="listbox"], [role="option"], [role="grid"], [role="tree"], ' +
  '[role="slider"], [role="separator"], [role="scrollbar"]';
const TAB_FOCUS_WIDGET_SELECTOR =
  'button, a[href], input, textarea, select, [contenteditable="true"], ' +
  '[role="listbox"], [role="grid"], [role="tree"], [role="tablist"], ' +
  '[role="slider"], [role="separator"], [tabindex]:not(canvas)';

/** Coordinates editor use cases; the shell consumes its state and command view model. */
export function useEditorWorkflows(managerOptions: EditorWorkflowOptions) {
  const pwa = usePwaManager();
  const platform = useEditorPlatformPorts();
  if (!platform) throw new Error("Editor workflow manager requires platform ports");
  const { core } = useEditorManagerContext();
  if (!core) throw new Error("Editor workflow manager requires an active RasterEditor");
  const { workspace, active } = useEditorRuntimeManagerContext();
  const workspaceSnapshot = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot,
  );
  const session = active.session;
  const {
    device: wheelDevice,
    setDevice: setWheelDevice,
    detected: detectedWheelDevice,
  } = useWheelDevice();
  const { timelineActions, animationActions, effectActions, sceneBounds } = managerOptions;

  const editor = useEditor();
  const paletteModel = useEditorPaletteModel();
  const paletteModelRef = useRef(paletteModel);
  paletteModelRef.current = paletteModel;
  const chromePreferences = useEditorChromePreferences();
  const timelineActionsRef = useRef(timelineActions);
  timelineActionsRef.current = timelineActions;
  const workflow = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const input = useRef<HTMLInputElement>(null);
  const clipboardRegionRef = useRef(ClipboardRegion.Canvas);
  const [, setClipboardRegionState] = useState(ClipboardRegion.Canvas);
  const setClipboardRegion = (region: ClipboardRegion) => {
    clipboardRegionRef.current = region;
    setClipboardRegionState(region);
  };
  useEffect(() => {
    setClipboardRegion(ClipboardRegion.Canvas);
  }, [workspaceSnapshot.activeId]);
  const [newDialog, setNewDialog] = useState(false);
  const [duplicateSpriteOpen, setDuplicateSpriteOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [newTilemapDialog, setNewTilemapDialog] = useState(false);
  const heldSpace = useRef(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const telemetry = useTelemetryFeatures(preferencesOpen, aboutOpen);
  const feedback = useFeedback(telemetry, () => editor.setNotice(tUi("feedback.sent")));
  const [exitNotice, setExitNotice] = useState(false);
  const [dialog, setDialog] = useState<"text" | "color" | null>(null);
  const [colorTarget, setColorTarget] = useState<"foreground" | "background">("foreground");
  const [text, setText] = useState("");
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_FONT_SIZE);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const sheetFileIntent = useRef(false);
  const [sequenceImport, setSequenceImport] = useState<{
    sources: readonly SessionSource<string>[];
    groups: readonly NumberedPngGroup[];
  } | null>(null);
  const sequenceSources = useRef<readonly SessionSource<string>[]>([]);
  const workflowMounted = useRef(true);
  const [sequenceDuration, setSequenceDuration] = useState(DEFAULT_SEQUENCE_FRAME_DURATION_MS);
  useEffect(() => {
    workflowMounted.current = true;
    return () => {
      workflowMounted.current = false;
      for (const source of sequenceSources.current) workspace.ports.releaseSource?.(source.source);
      sequenceSources.current = [];
      workspace.cancelFileImport();
    };
  }, [workspace]);
  const cancelSequenceImport = () => {
    for (const source of sequenceSources.current) workspace.ports.releaseSource?.(source.source);
    sequenceSources.current = [];
    setSequenceImport(null);
  };
  const confirmSequenceImport = (asSequences: boolean) => {
    if (!sequenceImport) return;
    const durationMs = Number.isFinite(sequenceDuration)
      ? Math.max(
          MIN_SEQUENCE_FRAME_DURATION_MS,
          Math.min(MAX_SEQUENCE_FRAME_DURATION_MS, Math.round(sequenceDuration)),
        )
      : DEFAULT_SEQUENCE_FRAME_DURATION_MS;
    const plan = fileImportPlan(
      sequenceImport.sources,
      asSequences ? sequenceImport.groups : [],
      durationMs,
    );
    sequenceSources.current = [];
    setSequenceImport(null);
    void workspace.openFiles(plan);
  };
  const [sheetFileTarget, setSheetFileTarget] = useState<{
    core: RasterEditor;
    generation: number;
  } | null>(null);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const cancel = () => {
      if (!sheetFileIntent.current) telemetry.documentOpenCancelled(DocumentOpenMethod.Import);
      sheetFileIntent.current = false;
    };
    node.addEventListener("cancel", cancel);
    return () => node.removeEventListener("cancel", cancel);
  }, [telemetry]);
  const { recoveryOpen, setRecoveryOpen } = editor;
  const [recoveryTabOpen, setRecoveryTabOpen] = useState(false);
  const [recoverySelectedIds, setRecoverySelectedIds] = useState<readonly string[]>([]);
  const [recoveryItems, setRecoveryItems] = useState<RecoveryItem[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [closingSaveBusy, setClosingSaveBusy] = useState(false);
  const [deleteRecoveryIds, setDeleteRecoveryIds] = useState<readonly string[] | null>(null);
  const [deleteBrowserCopyItem, setDeleteBrowserCopyItem] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteBrowserCopyBusy, setDeleteBrowserCopyBusy] = useState(false);
  const [downloadRecentBusy, setDownloadRecentBusy] = useState(false);
  const recoveryState = useSyncExternalStore(
    workspace.recovery.subscribe,
    workspace.recovery.getSnapshot,
    workspace.recovery.getSnapshot,
  );
  // Background failures must not prevent drawing, Save As or switching documents.
  // The persistent status indicator remains until storage acknowledges a retry.
  const recoveryFailure =
    recoveryState.error ?? Object.values(recoveryState.documents).find((item) => item.error)?.error;
  const retryRecovery = () => {
    void workspace.recovery.retry().catch(() => {
      // Recovery state retains the failure and the latest unsaved revision.
    });
  };
  const refreshRecovery = async () => {
    if (recoveryLoading) return;
    setRecoveryLoading(true);
    setRecoverySelectedIds([]);
    try {
      const entries = await workspace.recovery.listRecoveryEntries();
      setRecoveryItems(entries.map(presentRecoveryEntry));
      const failure = entries.find((entry) => entry.readError)?.readError;
      if (failure) session.reportError(failure);
    } catch (reason) {
      session.reportError(reason);
    } finally {
      setRecoveryLoading(false);
    }
  };
  const showRecovery = () => {
    if (!canStartInteraction()) return;
    setRecoveryTabOpen(true);
    setRecoveryOpen(true);
    editor.setTab("home", userViewTransition(EditorViewChangeReason.RecoveryOpened));
    void refreshRecovery();
  };
  const selectRecovery = () => {
    if (!canStartInteraction()) return;
    setRecoveryOpen(true);
    editor.setTab("home", userViewTransition(EditorViewChangeReason.RecoveryOpened));
  };
  const closeRecovery = () => {
    if (!canStartInteraction()) return;
    setRecoveryTabOpen(false);
    setRecoverySelectedIds([]);
    if (recoveryOpen) {
      setRecoveryOpen(false);
      if (!editor.openTabs.includes("home") && editor.openTabs.includes("document"))
        editor.setTab("document", userViewTransition(EditorViewChangeReason.RecoveryClosed));
      else editor.openTab("home", userViewTransition(EditorViewChangeReason.RecoveryClosed));
    }
  };
  const recoverProjects = async (ids: readonly string[]) => {
    if (!canStartInteraction()) return;
    setRecoveryBusy(true);
    try {
      for (const id of ids) await workspace.recoverProject(id);
      const transition = automaticViewTransition(EditorViewChangeReason.DocumentRecovered);
      setRecoveryOpen(false, transition);
      editor.openTab("document", transition);
    } catch (reason) {
      session.reportError(reason);
    } finally {
      setRecoveryBusy(false);
    }
  };
  const deleteRecovery = async () => {
    if (!deleteRecoveryIds || recoveryBusy) return;
    const ids = deleteRecoveryIds;
    setDeleteRecoveryIds(null);
    setRecoveryBusy(true);
    try {
      for (const id of ids) await workspace.recovery.deleteRecoveryEntry(id);
      await refreshRecovery();
    } catch (reason) {
      session.reportError(reason);
    } finally {
      setRecoveryBusy(false);
    }
  };
  const deleteBrowserCopy = async () => {
    if (!deleteBrowserCopyItem || deleteBrowserCopyBusy) return;
    setDeleteBrowserCopyBusy(true);
    try {
      await workspace.deleteBrowserCopy(deleteBrowserCopyItem.id);
      if (recoveryOpen) await refreshRecovery();
    } catch (reason) {
      session.reportError(reason, SessionOperation.Recent);
    } finally {
      setDeleteBrowserCopyBusy(false);
      setDeleteBrowserCopyItem(null);
    }
  };
  // Keep tab pointer capture alive when selecting a document on mouse-down.
  // Reset workflow drafts explicitly rather than remounting all editor chrome.
  useEffect(() => {
    setNewDialog(false);
    setPreferencesOpen(false);
    setExitNotice(false);
    setDialog(null);
    setText("");
    managerOptions.clearPointer?.();
  }, [core]);
  const prepareText = (force = false) => {
    const snapshot = core.getSnapshot();
    if (force || !snapshot.settings.font) {
      const options = editorTextFontOptions(snapshot.settings);
      core.drawing.settings.setSettings({
        ...textFontSettings(options),
        font: platform.font.rasterize(snapshot.view.appearance, snapshot.settings.text, options),
      });
    }
  };
  useEffect(() => {
    let prepared = false;
    const prepare = () => {
      if (core.getSnapshot().settings.tool !== "text") return;
      const force = !prepared;
      prepared = true;
      prepareText(force);
    };
    prepare();
    return core.subscribe(prepare);
  }, [core, workspace]);
  useEffect(() => {
    if (editor.tab === "home") void session.restoreRecent();
  }, [editor.tab, session]);
  const state = useEditorSnapshot(core)!;
  const { busy, replacement, pendingImport: pending, newSize, pixelationOptions } = workflow;
  const error = workflow.error?.message ?? "";
  const output = useDocumentOutputWorkflows({
    core,
    session,
    workspace,
    platform,
    telemetry,
    scene: editorSceneForTab(editor.tab),
    canStartInteraction,
    flushPendingLayerProperties: () => timelineActionsRef.current?.flushPendingLayerProperties?.(),
    openGeneratedDocument: () =>
      editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentGenerated)),
  });
  const modalOpen = !!(
    aboutOpen ||
    feedback.open ||
    dialog ||
    newTilemapDialog ||
    preferencesOpen ||
    saveAsOpen ||
    newDialog ||
    duplicateSpriteOpen ||
    keyboardShortcutsOpen ||
    output.hasOpenDialog ||
    deleteRecoveryIds ||
    deleteBrowserCopyItem ||
    sequenceImport ||
    pending ||
    replacement ||
    error ||
    exitNotice
  );
  const operationBusy = output.exportBusy || saveAsBusy || recoveryBusy || closingSaveBusy;
  function canStartInteraction() {
    return (
      !modalOpen &&
      !operationBusy &&
      !workspace.getSnapshot().importBatch &&
      session.canStartInteraction()
    );
  }
  // Saving keeps ordinary editing available; only starting another workflow
  // consults session.canStartInteraction(), which also protects native pickers.
  const canDispatchEditorInput = () =>
    !modalOpen &&
    !operationBusy &&
    !session.getSnapshot().busy &&
    !workspace.getSnapshot().importBatch;
  useEffect(() => {
    if (
      !replacement ||
      closingSaveBusy ||
      (replacement.kind !== "close" && replacement.kind !== "exit")
    )
      return;
    if (!workspace.isDocumentLocallyModified(workspaceSnapshot.activeId))
      void session.confirmReplacement();
  }, [replacement, closingSaveBusy, workspaceSnapshot, workspace, session]);
  useEffect(() => {
    if (state.error)
      session.reportError(
        state.error.operation === "document"
          ? Object.defineProperty(new Error(tUi("ui.sprite.memory.limit.preserved")), "cause", {
              value: state.error,
              writable: true,
              configurable: true,
            })
          : state.error,
      );
  }, [state.error, session]);
  const activation = useRef({
    tabId: workspaceSnapshot.activeId,
    value: workflow.documentActivation,
  });
  useEffect(() => {
    if (activation.current.tabId !== workspaceSnapshot.activeId) {
      const transition = automaticViewTransition(
        workspaceSnapshot.tabs.length
          ? recoveryBusy
            ? EditorViewChangeReason.DocumentRecovered
            : EditorViewChangeReason.DocumentActivated
          : EditorViewChangeReason.LastDocumentClosed,
      );
      setRecoveryOpen(false, transition);
      activation.current = {
        tabId: workspaceSnapshot.activeId,
        value: workflow.documentActivation,
      };
      editor.openTab(workspaceSnapshot.tabs.length ? "document" : "home", transition);
      return;
    }
    if (activation.current.value === workflow.documentActivation) return;
    activation.current.value = workflow.documentActivation;
    if (workflow.documentActivationKind === "replace") {
      editor.setPaletteSelection([]);
      editor.setPaletteIndex(null);
      editor.setBackgroundIndex(null);
    }
    if (workflow.documentActivationKind === "close") {
      const closingId = workspaceSnapshot.activeId;
      workspace.close(closingId);
      const empty = workspace.getSnapshot().tabs.length === 0;
      editor.openTab(
        empty ? "home" : "document",
        automaticViewTransition(
          empty ? EditorViewChangeReason.LastDocumentClosed : EditorViewChangeReason.DocumentClosed,
        ),
      );
    } else
      editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentOpened));
    setDialog(null);
    setNewDialog(false);
  }, [
    workflow.documentActivation,
    editor,
    workspace,
    workspaceSnapshot.activeId,
    workspaceSnapshot.tabs.length,
    recoveryBusy,
  ]);
  useTelemetryView();
  const exitCount = useRef(workspaceSnapshot.exitRequests);
  useEffect(() => {
    if (exitCount.current !== workspaceSnapshot.exitRequests) {
      exitCount.current = workspaceSnapshot.exitRequests;
      setExitNotice(true);
    }
  }, [workspaceSnapshot.exitRequests]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      timelineActionsRef.current?.flushPendingLayerProperties?.();
      if (workspace.needsBeforeUnloadWarning()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [workspace]);
  useEffect(() => {
    if (!workflow.notice) return;
    editor.setNotice(workflow.notice);
    session.clearNotice();
  }, [workflow.notice, editor, session]);
  useEffect(() => {
    if (!editor.notice) return;
    const timer = setTimeout(() => editor.setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [editor.notice, editor.setNotice]);
  useEffect(() => {
    if (!sheetFileTarget || sheetFileTarget.core !== core) return;
    const imported = core.getSnapshot().document;
    if (imported && !workflow.busy) {
      output.openSheetImport();
      setSheetFileTarget(null);
    }
  }, [core, workflow.busy, state.document?.id, sheetFileTarget]);
  const requestSources = (sources: readonly SessionSource<string>[]) => {
    if (!sources.length) return;
    if (!workflowMounted.current || sequenceSources.current.length || !canStartInteraction()) {
      for (const source of sources) workspace.ports.releaseSource?.(source.source);
      return;
    }
    timelineActions?.flushPendingLayerProperties?.();
    setDialog(null);
    const groups = numberedPngGroups(sources);
    if (groups.length) {
      sequenceSources.current = sources;
      setSequenceDuration(DEFAULT_SEQUENCE_FRAME_DURATION_MS);
      setSequenceImport({ sources, groups });
    } else {
      void workspace.openFiles(fileImportPlan(sources));
    }
  };
  const requestImport = (files: readonly File[]) => {
    if (!files.length) return;
    const isSheet = sheetFileIntent.current;
    sheetFileIntent.current = false;
    if (isSheet) {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      const operation = workspace.openSource(workspace.ports.registerFile(files[0]));
      setSheetFileTarget({ core: workspace.active.core, generation: Date.now() });
      void operation;
      return;
    }
    requestSources(files.map((file) => workspace.ports.registerFile(file)));
  };
  const clipboard = createClipboardActions({
    clipboard: workspace.clipboard,
    getCore: () => workspace.active.core,
    getRegion: () => clipboardRegionRef.current,
    palette: {
      getOwnerCore: () => core,
      getSelection: () => paletteModelRef.current.getPaletteSelection(),
      deleteSelection: () => paletteModelRef.current.deleteSelectedPaletteColors(),
      getWorkingIndices: () => ({
        foreground: paletteModelRef.current.paletteIndex,
        background: paletteModelRef.current.backgroundIndex,
      }),
    },
    isDocumentActive: () => editor.tab === "document" && !recoveryOpen,
    createDocument: (payload) =>
      payload.asepriteSamples || payload.sourceProfile
        ? workspace.createDocumentFromProject(projectFromClipboardImage(payload))
        : workspace.createDocumentFromImage(payload.pixels, payload.palette),
    getViewport: () => measuredEditorViewport(workspace.active.core, editor.timelineVisible),
    onError: (message) => workspace.active.session.reportError(message),
  });
  useSyncExternalStore(clipboard.subscribe, clipboard.getVersion, clipboard.getVersion);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (!canDispatchEditorInput() || recoveryOpen) return;
      clipboard.handlePasteEvent(event);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });
  const currentSaveTarget = () => workspace.getSaveTarget();
  const saveWithTelemetry = (
    intent: SessionSaveIntent,
    target: SaveTarget,
    saving: () => Promise<SessionOutcome>,
  ): Promise<SessionOutcome> => {
    const finish = telemetry.beginSave(
      intent === SessionSaveIntent.SaveAs
        ? TelemetryOperationAction.SaveAs
        : TelemetryOperationAction.Save,
      target === SaveTarget.Browser
        ? TelemetryOperationTarget.Browser
        : TelemetryOperationTarget.FileSystem,
      workspaceSnapshot.activeId,
    );
    try {
      // Invoke synchronously so a native picker retains the user's activation.
      return saving().then(
        (outcome) => {
          finish(
            outcome === SessionOutcome.Created
              ? TelemetryOperationOutcome.Success
              : outcome === SessionOutcome.Cancelled
                ? TelemetryOperationOutcome.Cancelled
                : outcome === SessionOutcome.Error
                  ? TelemetryOperationOutcome.Failed
                  : TelemetryOperationOutcome.Ignored,
          );
          return outcome;
        },
        (reason) => {
          finish(TelemetryOperationOutcome.Failed);
          throw reason;
        },
      );
    } catch (reason) {
      finish(TelemetryOperationOutcome.Failed);
      throw reason;
    }
  };
  const saveCurrentDocument = async (
    intent: SessionSaveIntent,
    target: SaveTarget,
    requestedName?: string,
  ): Promise<SessionOutcome> => {
    if (!session.canSave()) return SessionOutcome.Ignored;
    return saveWithTelemetry(intent, target, async () => {
      if (intent === SessionSaveIntent.Save && target === SaveTarget.Browser) {
        await workspace.saveInBrowser(workspaceSnapshot.activeId);
        pwa?.markSuccessfulSave();
        return SessionOutcome.Created;
      }
      const suggestedName =
        target === SaveTarget.FileSystem
          ? requestedName?.trim() ||
            workspace.suggestedSaveName(core.getSnapshot().document?.name ?? "Untitled")
          : undefined;
      const outcome = await session.save(intent, suggestedName);
      if (outcome === SessionOutcome.Created) {
        await workspace.saveLocally(workspaceSnapshot.activeId);
        workspace.linkRecentFileToWorkspaceProject(workspaceSnapshot.activeId);
        pwa?.markSuccessfulSave();
      }
      return outcome;
    });
  };
  const saveThenClose = (target: SaveTarget) => {
    setClosingSaveBusy(true);
    void saveCurrentDocument(SessionSaveIntent.Save, target)
      .then((outcome) => {
        if (outcome === SessionOutcome.Created) return session.confirmReplacement();
      })
      .catch((reason) => session.reportError(reason, SessionOperation.Save))
      .finally(() => setClosingSaveBusy(false));
  };
  const performDocumentSave = (intent: SessionSaveIntent, target = currentSaveTarget()) => {
    if (intent === SessionSaveIntent.SaveAs) {
      telemetry.featureUsed(TelemetryFeature.SaveAs, TelemetryFeatureAction.Open);
      setSaveAsOpen(true);
      return;
    }
    void saveCurrentDocument(intent, target).catch((reason) =>
      session.reportError(reason, SessionOperation.Save),
    );
  };
  const saveProjectAs = (name: string, format: "png" | "aseprite", target: SaveTarget) => {
    workspace.setSaveTarget(target);
    setSaveAsBusy(true);
    void (async () => {
      if (target === SaveTarget.Browser) {
        return saveWithTelemetry(SessionSaveIntent.SaveAs, target, async () => {
          await workspace.saveAsInBrowser(workspaceSnapshot.activeId, name, format);
          pwa?.markSuccessfulSave();
          return SessionOutcome.Created;
        });
      }
      return saveCurrentDocument(SessionSaveIntent.SaveAs, target, name);
    })()
      .then((outcome) => {
        if (outcome === SessionOutcome.Created) setSaveAsOpen(false);
      })
      .catch((reason) => session.reportError(reason, SessionOperation.Save))
      .finally(() => setSaveAsBusy(false));
  };
  const recentFiles = workspace.getRecentFiles();
  const canClearRecentFiles = recentFiles.length > 0;
  const adjacentTab = (direction: -1 | 1) =>
    adjacentWorkspaceTab(
      workspace.getSnapshot(),
      workspace.getRootPaneId(),
      editor.tab,
      editor.openTabs.includes("home"),
      recoveryTabOpen,
      recoveryOpen,
      direction,
      editor.openTabs.includes(HelpDocumentTab.Guide),
    );
  const selectAdjacentTab = (direction: -1 | 1) => {
    if (!canStartInteraction()) return;
    const target = adjacentTab(direction);
    if (!target) return;
    timelineActionsRef.current?.flushPendingLayerProperties?.();
    if (target.kind === WorkspaceTabKind.Recovery) selectRecovery();
    else {
      setRecoveryOpen(false);
      if (target.kind === WorkspaceTabKind.Home) editor.openTab("home");
      else if (target.kind === WorkspaceTabKind.Guide) editor.openTab(HelpDocumentTab.Guide);
      else {
        workspace.selectPaneTab(target.paneId, target.id);
        editor.openTab("document");
      }
    }
  };
  const actions = {
    clipboardCapabilities: clipboard.getCapabilities(),
    recoveryProblem: recoveryFailure
      ? tUi(
          workspace.recovery.hasUnpersistedWorkspaceChanges()
            ? "ui.recovery.save.failed.status"
            : "ui.recovery.backup.failed.status",
        )
      : undefined,
    retryRecovery,
    backupActive:
      recoveryState.backingUp ||
      Object.values(recoveryState.documents).some((item) => item.status === "saving"),
    recoveryOpen,
    recoveryTabOpen,
    recoverySelectedIds,
    selectRecoveryProjects: setRecoverySelectedIds,
    selectRecovery,
    closeRecovery,
    recoveryItems,
    recoveryBusy,
    recoveryLoading,
    recoverFiles: showRecovery,
    refreshRecovery: () => {
      void refreshRecovery();
    },
    recoverProjects: (ids: readonly string[]) => {
      void recoverProjects(ids);
    },
    deleteRecoveryProjects: (ids: readonly string[]) => {
      if (canStartInteraction()) setDeleteRecoveryIds(ids);
    },
    deleteBrowserCopy: (id: string) => {
      if (!canStartInteraction() || downloadRecentBusy) return;
      const file = workspace.getRecentFiles().find((item) => item.id === id);
      if (file && !file.isOpen) setDeleteBrowserCopyItem({ id: file.id, name: file.name });
    },
    deleteBrowserCopyBusy,
    leaveRecovery: () => setRecoveryOpen(false),
    copy: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.copy();
    },
    copyMerged: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.copyMerged();
    },
    cut: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.cut();
    },
    paste: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.paste();
    },
    pasteNewLayer: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.pasteNewLayer();
    },
    pasteNewReferenceLayer: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.pasteNewReferenceLayer();
    },
    pasteNewSprite: () => {
      if (!canDispatchEditorInput()) return;
      void clipboard.pasteNewSprite();
    },
    newSpriteFromSelection: () => {
      if (!canStartInteraction()) return;
      const result = core.clipboard.createSpriteFromSelection();
      if (!result) return;
      const { image, name } = result;
      if (image.asepriteSamples || image.sourceProfile)
        workspace.createDocumentFromProject(projectFromClipboardImage(image), name);
      else workspace.createDocumentFromImage(image.pixels, image.palette, name);
      editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentGenerated));
    },
    duplicateSprite: () => {
      if (canStartInteraction() && state.document) setDuplicateSpriteOpen(true);
    },
    keyboardShortcuts: () => {
      if (canStartInteraction()) setKeyboardShortcutsOpen(true);
    },
    userGuide: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      setRecoveryOpen(false);
      editor.openTab(HelpDocumentTab.Guide);
    },
    about: () => {
      if (canStartInteraction()) setAboutOpen(true);
    },
    feedback: () => {
      if (canStartInteraction()) feedback.show();
    },
    donate: () => {
      telemetry.featureUsed(TelemetryFeature.Donate, TelemetryFeatureAction.Click);
      platform.navigation.openExternal(HELP_LINKS[HelpLink.Donate]);
    },
    closeAllDocuments: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      workspace.closeAll();
    },
    closeDocument: () => {
      if (!canStartInteraction()) return;
      if (editor.tab === HelpDocumentTab.Guide) {
        editor.closeTab(HelpDocumentTab.Guide);
        return;
      }
      if (recoveryOpen) {
        closeRecovery();
        return;
      }
      timelineActions?.flushPendingLayerProperties?.();
      workspace.requestClose();
    },
    exit: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      workspace.closeAll(true);
    },
    canSave: session.canSave(),
    canStartInteraction: canStartInteraction(),
    new: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      telemetry.documentOpenRequested(DocumentOpenMethod.New);
      workspace.prepareNew();
      setNewDialog(true);
    },
    preferences: () => {
      if (canStartInteraction()) setPreferencesOpen(true);
    },
    recentFiles,
    loadRecentFiles: () => {
      void session.restoreRecent();
    },
    canClearRecentFiles,
    clearRecentFiles: () => {
      if (!canStartInteraction()) return;
      void workspace.clearRecentFiles();
    },
    canReopenClosedFile: workspaceSnapshot.canReopenClosedFile,
    reopenClosedFile: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      void (async () => {
        if (await workspace.reopenClosedFile()) {
          const transition = automaticViewTransition(EditorViewChangeReason.DocumentOpened);
          setRecoveryOpen(false, transition);
          editor.openTab("document", transition);
        }
      })().catch((error) => session.reportError(error));
    },
    prepareText,
    openRecent: (id: string) => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      telemetry.recentOpenRequested(id);
      void workspace.openRecent(id).then((opened) => {
        if (opened) {
          const transition = automaticViewTransition(EditorViewChangeReason.DocumentOpened);
          setRecoveryOpen(false, transition);
          editor.openTab("document", transition);
        }
      });
    },
    pinRecent: (id: string, pinned: boolean) => workspace.setRecentFilePinned(id, pinned),
    downloadRecent: (id: string) => {
      if (!canStartInteraction() || downloadRecentBusy) return;
      setDownloadRecentBusy(true);
      void workspace
        .downloadRecentFile(id)
        .catch((reason) => session.reportError(reason, SessionOperation.Recent))
        .finally(() => setDownloadRecentBusy(false));
    },
    downloadRecentBusy,
    documentTabs: workspaceSnapshot.tabs,
    canSelectOtherDocumentTab: canStartInteraction() && !!adjacentTab(1),
    nextDocumentTab: () => selectAdjacentTab(1),
    previousDocumentTab: () => selectAdjacentTab(-1),
    activeDocumentId: workspaceSnapshot.activeId,
    workspacePanes: workspaceSnapshot.panes,
    workspaceDockTree: workspaceSnapshot.dockTree,
    workspaceRootPaneId: workspace.getRootPaneId(),
    selectDocumentTab: (id: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      timelineActions?.flushPendingLayerProperties?.();
      workspace.select(id);
      editor.openTab("document");
    },
    duplicateDocumentView: (id: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      timelineActions?.flushPendingLayerProperties?.();
      if (workspace.duplicateView(id)) editor.openTab("document");
    },
    selectPaneTab: (paneId: string, id: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      timelineActions?.flushPendingLayerProperties?.();
      workspace.selectPaneTab(paneId, id);
      editor.openTab("document");
    },
    activateWorkspacePane: (paneId: string) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      workspace.activatePane(paneId);
      editor.openTab("document");
    },
    reorderDocumentTab: (id: string, targetId: string, paneId?: string) =>
      paneId ? workspace.reorderInPane(paneId, id, targetId) : workspace.reorder(id, targetId),
    moveDocumentTab: (id: string, paneId: string, targetId?: string, before?: boolean) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      workspace.moveTabToPane(id, paneId, targetId, before);
      editor.openTab("document");
    },
    splitDocumentTab: (id: string, paneId: string, edge: DockEdge) => {
      if (!canStartInteraction()) return;
      setRecoveryOpen(false);
      workspace.splitTab(id, paneId, edge);
      editor.openTab("document");
    },
    resizeWorkspaceSplit: (splitId: string, ratio: number) => workspace.resizeSplit(splitId, ratio),
    closeDocumentTab: (id: string) => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      workspace.requestClose(id);
    },

    open: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      if (sequenceSources.current.length) return;
      telemetry.documentOpenRequested(DocumentOpenMethod.Import);
      const picking = workspace.ports.pickFiles();
      if (!picking) {
        if (input.current) input.current.multiple = true;
        input.current?.click();
        return;
      }
      void picking
        .then((sources) => {
          if (!sources.length) telemetry.documentOpenCancelled(DocumentOpenMethod.Import);
          requestSources(sources);
        })
        .catch((reason) => {
          if (
            typeof reason === "object" &&
            reason !== null &&
            "name" in reason &&
            reason.name === "AbortError"
          ) {
            telemetry.documentOpenCancelled(DocumentOpenMethod.Import);
            return;
          }
          session.reportError(reason, SessionOperation.Import);
        });
    },
    save: () => {
      if (!canDispatchEditorInput()) return;
      timelineActions?.flushPendingLayerProperties?.();
      if (
        canExecuteEditorAction("save", core.getSnapshot(), editorSceneForTab(editor.tab)) &&
        session.canSave()
      ) {
        performDocumentSave(SessionSaveIntent.Save);
      }
    },
    saveAs: () => {
      if (!canStartInteraction()) return;
      timelineActions?.flushPendingLayerProperties?.();
      if (session.canSave()) performDocumentSave(SessionSaveIntent.SaveAs);
    },
    ...output.actions,
    color: (target: "foreground" | "background") => {
      if (!canStartInteraction()) return;
      setColorTarget(target);
      setDialog("color");
    },
    text: () => {
      if (!canStartInteraction()) return;
      prepareText();
      if (!canExecuteEditorAction("insert-text", core.getSnapshot(), editorSceneForTab(editor.tab)))
        return;
      setText(core.getSnapshot().settings.text);
      setTextSize(normalizeTextFontSize(core.getSnapshot().settings.textFontSize));
      setDialog("text");
    },
  };
  const command = (
    cmd: EditorCommand,
    presentationContext = managerOptions.getCommandContext?.(),
  ) => {
    if (!canDispatchEditorInput()) return;
    if (cmd.type === "cancel") clipboard.dismissTimelineCopyRange();
    const viewport =
      presentationContext?.viewport.width && presentationContext.viewport.height
        ? presentationContext.viewport
        : measuredEditorViewport(core, editor.timelineVisible);
    const result = executeEditorCommand(core, cmd, {
      scene: editorSceneForTab(editor.tab),
      viewport,
      zoomAnchor: presentationContext?.zoomAnchor,
    });
    if (result.kind === "handled" && result.paletteIndex !== undefined) {
      editor.setPaletteIndex(result.paletteIndex);
    }
    if (result.kind !== "request") return;
    switch (result.action) {
      case "keyboard-shortcuts":
        actions.keyboardShortcuts();
        break;
      case "new-sprite-from-selection":
        actions.newSpriteFromSelection();
        break;
      case "export-sheet":
        actions.exportSpriteSheet?.();
        break;
      case "import-sheet":
        actions.importSpriteSheet?.();
        break;
      case "repeat-export":
        if (actions.canRepeatExport) actions.repeatLastExport?.();
        break;
      case "effect-hue-saturation":
        effectActions?.openEffect?.(EffectKind.HueSaturation);
        break;
      case "effect-replace-color":
        effectActions?.openEffect?.(EffectKind.ReplaceColor);
        break;
      case "effect-outline":
        effectActions?.openEffect?.(EffectKind.Outline);
        break;
      case "toggle-preview":
        editor.setPreviewVisible((v) => !v);
        break;
      case "toggle-timeline":
        editor.setTimelineVisible((visible) => !visible);
        break;
      case "toggle-timeline-thumbnails": {
        const current = workspace.getTimelinePanelPreferences();
        editor.setTimelinePanelPreferences({
          thumbnailsEnabled: !current.thumbnailsEnabled,
          ...(!current.thumbnailsEnabled && current.thumbnailZoom <= 1 ? { thumbnailZoom: 2 } : {}),
        });
        break;
      }
      case "play-preview":
        animationActions?.playPreview?.();
        break;
      case "copy":
        actions.copy();
        break;
      case "copy-merged":
        actions.copyMerged();
        break;
      case "cut":
        actions.cut();
        break;
      case "paste":
        actions.paste();
        break;
      case "paste-new-layer":
        actions.pasteNewLayer();
        break;
      case "paste-new-sprite":
        actions.pasteNewSprite();
        break;
      case "close-all":
        actions.closeAllDocuments();
        break;
      case "reopen-closed-file":
        actions.reopenClosedFile();
        break;
      case "layer-properties":
        timelineActions?.openLayerPropertiesDialog?.();
        break;
      case "new-tilemap-layer":
        setNewTilemapDialog(true);
        break;
      case "frame-properties":
        timelineActions?.openFramePropertiesDialog?.();
        break;
      case "new":
        actions.new();
        break;
      case "open":
        actions.open();
        break;
      case "preferences":
        actions.preferences();
        break;
      case "close":
        actions.closeDocument();
        break;
      case "save":
        actions.save();
        break;
      case "save-as":
        actions.saveAs();
        break;
      case "export":
        actions.exportCopy();
        break;
      case "insert-text":
        actions.text();
        break;
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const keyboard = normalizeKeyboardEvent(event);
      const normalizedKey = keyboard.key.toLowerCase();
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.matches("input,textarea,select") || target.isContentEditable);
      if (
        event.defaultPrevented ||
        !canDispatchEditorInput() ||
        (event.target instanceof Element &&
          (event.target.closest('[role="dialog"]') ||
            (event.target.closest('[role="menu"]') && !event.ctrlKey && !event.metaKey)))
      )
        return;
      const deleteInKeyboardWidget =
        !keyboard.alt &&
        !keyboard.ctrl &&
        !keyboard.meta &&
        !keyboard.shift &&
        (normalizedKey === "delete" || normalizedKey === "backspace") &&
        target instanceof Element &&
        !!target.closest(DELETE_SHORTCUT_WIDGET_SELECTOR);
      if (deleteInKeyboardWidget) {
        event.preventDefault();
        return;
      }
      const shortcutInput = {
        ...keyboard,
        editingText,
        space: heldSpace.current,
      };
      const contexts = shortcutContexts(state);
      if (
        workspace.shortcuts.executeMenuShortcut(shortcutInput, contexts.command, contexts.actions)
      ) {
        event.preventDefault();
        return;
      }
      const fallback = resolveShortcut(shortcutInput);
      const cmd = workspace.shortcuts.resolve(
        shortcutInput,
        fallback,
        contexts.command,
        contexts.actions,
      );
      // Removed bindings also suppress browser commands such as native Paste.
      if (!cmd && fallback) event.preventDefault();
      // Controls retain Tab focus navigation; the canvas and un-focused editor
      // regions use the native timeline toggle.
      if (
        cmd?.type === "toggle-timeline" &&
        normalizedKey === "tab" &&
        target instanceof Element &&
        !(target instanceof HTMLCanvasElement) &&
        target.closest(TAB_FOCUS_WIDGET_SELECTOR)
      )
        return;
      // Let the trusted ClipboardEvent deliver OS image bytes without an
      // additional navigator.clipboard.read permission request.
      if (
        cmd?.type === "paste" &&
        (keyboard.ctrl || keyboard.meta) &&
        normalizedKey === "v" &&
        !keyboard.alt &&
        !keyboard.shift &&
        clipboardRegionRef.current !== ClipboardRegion.Palette &&
        clipboardRegionRef.current !== ClipboardRegion.Tileset
      )
        return;
      if (cmd) {
        event.preventDefault();
        if (
          !event.repeat ||
          ![
            "new",
            "preferences",
            "open",
            "save",
            "save-as",
            "export",
            "reopen-closed-file",
          ].includes(cmd.type)
        )
          command(cmd);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space") heldSpace.current = false;
      workspace.shortcuts.setPressedKey(event.key, false);
    };
    const captureKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.matches("input,textarea,select") || target.isContentEditable);
      if (event.code === "Space" && !editingText) heldSpace.current = true;
      workspace.shortcuts.setPressedKey(event.key, true, editingText);
    };
    const blur = () => {
      heldSpace.current = false;
      workspace.shortcuts.clearPressedKeys();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", captureKey, true);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", captureKey, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  });

  useEffect(() => {
    if (!state.playing) return;
    let frame = 0,
      previous: number | null = performance.now();
    const tick = (now: number) => {
      if (previous !== null) core.timeline.advancePlayback(now - previous);
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [core, state.playing]);

  const handleCanvasPointerDown = () => {
    setClipboardRegion(ClipboardRegion.Canvas);
    timelineActionsRef.current?.flushPendingLayerProperties?.();
  };
  const handleNewSpriteOpenChange = (open: boolean) => {
    if (!open) {
      if (newDialog) telemetry.documentOpenCancelled(DocumentOpenMethod.New);
      session.resetNewSizeDraft();
    }
    setNewDialog(open);
  };
  const updateNewSpriteSize = (size: Parameters<typeof session.setNewSize>[0]) =>
    session.setNewSize(size);
  const createNewSprite = (
    width: number,
    height: number,
    colorDepth: 8 | 16 | 32,
    background: "transparent" | "white" | "black",
    fileBaseName: string,
  ) => {
    const normalizedBaseName = fileBaseName
      .trim()
      .replace(/\.(?:aseprite|ase)$/i, "")
      .trim();
    if (!normalizedBaseName) return;
    if (
      workspace.createDocument(
        {
          width,
          height,
          colorDepth,
          background,
          palette: readDefaultPalette(),
        },
        `${normalizedBaseName}${NEW_SPRITE_FILE_EXTENSION}`,
      ) !== SessionOutcome.Error
    )
      setNewDialog(false);
  };
  const duplicateCurrentSprite = ({ name, flatten }: { name: string; flatten: boolean }) => {
    const project = core.clipboard.duplicateProject(flatten);
    if (!project) return;
    workspace.createDocumentFromProject(project, name);
    editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentGenerated));
    setDuplicateSpriteOpen(false);
  };
  const cancelReplacement = () => {
    workspace.cancelCloseAll();
    session.cancelReplacement();
  };
  const saveReplacement = () => {
    saveThenClose(currentSaveTarget());
  };
  const discardReplacement = () => {
    if (!workspace.discardLocalChanges(workspaceSnapshot.activeId)) return;
    void session.confirmReplacement();
  };
  const discardEmptyImport = () => workspace.discardEmptyImport();
  const setPixelationOptions = (patch: Parameters<typeof session.setPixelationOptions>[0]) =>
    session.setPixelationOptions(patch);
  const acceptOriginalImport = () => session.acceptOriginal();
  const acceptPixelatedImport = () => void session.pixelate();
  const updateRecoverySettings = (
    settings: Parameters<typeof workspace.recovery.setRecoverySettings>[0],
  ) => {
    void workspace.recovery
      .setRecoverySettings(settings)
      .catch((reason) => session.reportError(reason));
  };
  const resetPreferences = async (targets: readonly PreferenceResetTarget[]) => {
    try {
      const pendingWrites: Promise<void>[] = [];
      if (targets.includes(PreferenceResetTarget.Tools)) editor.resetToolPreferences();
      if (targets.includes(PreferenceResetTarget.Filters)) workspace.effectPreferences.reset();
      if (targets.includes(PreferenceResetTarget.PerFile)) workspace.resetDocumentPreferences();
      if (
        targets.includes(PreferenceResetTarget.UserBrushes) ||
        targets.includes(PreferenceResetTarget.UserShades)
      ) {
        await workspace.userPresets.initialize();
        if (targets.includes(PreferenceResetTarget.UserBrushes))
          workspace.userPresets.resetBrushes();
        if (targets.includes(PreferenceResetTarget.UserShades)) workspace.userPresets.resetShades();
        pendingWrites.push(workspace.userPresets.flush());
      }
      if (targets.includes(PreferenceResetTarget.Configuration)) {
        workspace.resetConfigurationPreferences();
        chromePreferences.setPreferences({ ...DEFAULT_EDITOR_CHROME_PREFERENCES });
        setWheelDevice(WheelDevice.Auto);
        editor.setDefaultTimelineFirstFrame(defaultTimelinePanelPreferences.firstFrame);
        managerOptions.onAppearanceModeChange(AppearanceMode.Light);
        managerOptions.persistAppearanceMode(AppearanceMode.Light);
        pendingWrites.push(changeUiLanguage(PREFERENCE_RESET_LANGUAGE));
        pendingWrites.push(
          workspace.recovery.setRecoverySettings({ ...DEFAULT_RECOVERY_SETTINGS }),
        );
      }
      if (targets.includes(PreferenceResetTarget.RecentFiles))
        pendingWrites.push(workspace.clearRecentFiles());
      await Promise.all(pendingWrites);
    } catch (reason) {
      session.reportError(reason);
    }
  };
  const getUndoOptions = workspace.getUndoOptions;
  const updateUndoOptions = (options: Parameters<typeof workspace.setUndoOptions>[0]) =>
    workspace.setUndoOptions(options);
  const updateComposeGroups = (composeGroups: boolean) =>
    core.drawing.settings.setSettings({ composeGroups });
  const updateSliceUseKeys = (sliceUseKeys: boolean) =>
    core.drawing.settings.setSettings({ sliceUseKeys });
  const touchInputPreferences = workspace.getTouchInputPreferences();
  const updateTouchInputPreferences = (
    value: Parameters<typeof workspace.setTouchInputPreferences>[0],
  ) => workspace.setTouchInputPreferences(value);
  const validateText = (
    value: string,
    family = core.getSnapshot().settings.textFontFamily,
    bold = core.getSnapshot().settings.textBold,
    italic = core.getSnapshot().settings.textItalic,
    size = normalizeTextFontSize(core.getSnapshot().settings.textFontSize),
    antialias = core.getSnapshot().settings.textAntialias,
  ) => {
    const current = core.getSnapshot();
    try {
      const font = platform.font.rasterize(current.view.appearance, value, {
        family,
        bold,
        italic,
        size,
        antialias,
        fill: current.settings.textFill,
        strokeWidth: current.settings.textStrokeWidth,
      });
      return validateBitmapText(value, font);
    } catch (reason) {
      return reason instanceof Error ? reason.message : "Could not render text with this font.";
    }
  };
  const acceptText = (
    nextText: string,
    nextSize: number,
    color: string,
    family: string,
    bold: boolean,
    italic: boolean,
    antialias: boolean,
  ) => {
    const current = core.getSnapshot();
    try {
      const options = {
        ...editorTextFontOptions(current.settings),
        family,
        bold,
        italic,
        antialias,
        size: normalizeTextFontSize(nextSize),
      };
      const font = platform.font.rasterize(current.view.appearance, nextText, options);
      core.drawing.settings.setSettings({ ...textFontSettings(options), font, text: nextText });
    } catch (reason) {
      session.reportError(reason, SessionOperation.Text);
      return;
    }
    const accepted = session.acceptText(
      nextText,
      1,
      hexToRgba(color),
      measuredEditorViewport(core, editor.timelineVisible),
    );
    if (accepted) {
      setText(nextText);
      setTextSize(nextSize);
      setDialog(null);
    }
  };
  const dismissError = () => {
    session.clearError();
    if (!core.getSnapshot().document) workspace.discardEmptyImport();
  };

  const actionSnapshot = useWorkflowActionSnapshot(actions);
  useEffect(() => {
    const disposers = (
      [
        ["GotoNextTab", actionSnapshot.nextDocumentTab],
        ["GotoPreviousTab", actionSnapshot.previousDocumentTab],
      ] as const
    ).map(([id, execute]) => {
      const definition = SHORTCUT_DEFINITIONS.find((candidate) => candidate.id === id);
      return (
        definition &&
        workspace.shortcuts.registerMenuCommand(definition.key, {
          execute,
          canExecute: () => actionSnapshot.canSelectOtherDocumentTab,
        })
      );
    });
    return () => {
      for (const dispose of disposers) dispose?.();
    };
  }, [
    workspace,
    actionSnapshot.nextDocumentTab,
    actionSnapshot.previousDocumentTab,
    actionSnapshot.canSelectOtherDocumentTab,
  ]);
  return {
    ...managerOptions,
    wheelDevice,
    setWheelDevice,
    detectedWheelDevice,
    editor,
    timelineActions,
    animationActions,
    effectActions,
    timelineActionsRef,
    workflow,
    input,
    setClipboardRegion,
    sceneBounds,
    workspaceSnapshot,
    newDialog,
    setNewDialog,
    duplicateSpriteOpen,
    setDuplicateSpriteOpen,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    aboutOpen,
    setAboutOpen,
    feedback,
    openHelpLink: (link: HelpLink) => platform.navigation.openExternal(HELP_LINKS[link]),
    newTilemapDialog,
    setNewTilemapDialog,
    heldSpace,
    preferencesOpen,
    setPreferencesOpen,
    resetPreferences,
    exitNotice,
    setExitNotice,
    dialog,
    setDialog,
    colorTarget,
    setColorTarget,
    text,
    setText,
    textSize,
    setTextSize,
    ...output,
    sheetFileIntent,
    animalCrossingExportPort: platform.files.animalCrossingExport,
    recoveryOpen,
    setRecoveryOpen,
    recoveryItems,
    setRecoveryItems,
    recoveryLoading,
    setRecoveryLoading,
    recoveryBusy,
    setRecoveryBusy,
    closingSaveBusy,
    setClosingSaveBusy,
    deleteRecoveryIds,
    setDeleteRecoveryIds,
    deleteBrowserCopyItem,
    deleteBrowserCopyBusy,
    closeDeleteBrowserCopy: () => {
      if (!deleteBrowserCopyBusy) setDeleteBrowserCopyItem(null);
    },
    recoveryState,
    saveAsOpen,
    saveAsBusy,
    saveAsTarget: SaveTarget.FileSystem,
    closeSaveAs: () => {
      if (saveAsOpen && !saveAsBusy)
        telemetry.featureUsed(TelemetryFeature.SaveAs, TelemetryFeatureAction.Cancel);
      setSaveAsOpen(false);
    },
    saveProjectAs,
    refreshRecovery,
    showRecovery,
    recoverProjects,
    deleteRecovery,
    deleteBrowserCopy,
    prepareText,
    state,
    busy,
    replacement,
    pending,
    newSize,
    suggestedNewSpriteBaseName: workspace.suggestNewSpriteBaseName(),
    pixelationOptions,
    error,
    canSaveErrorAs: workflow.error?.operation === SessionOperation.Save && session.canSave(),
    saveErrorAs: () => {
      dismissError();
      cancelReplacement();
      performDocumentSave(SessionSaveIntent.SaveAs, SaveTarget.FileSystem);
    },
    activation,
    exitCount,
    requestImport,
    sequenceImport,
    sequenceDuration,
    setSequenceDuration,
    cancelSequenceImport,
    confirmSequenceImport,
    cancelFileImport: () => workspace.cancelFileImport(),
    clipboard,
    actions: actionSnapshot,
    command,
    handleCanvasPointerDown,
    handleNewSpriteOpenChange,
    updateNewSpriteSize,
    createNewSprite,
    duplicateCurrentSprite,
    cancelReplacement,
    saveReplacement,
    discardReplacement,
    discardEmptyImport,
    setPixelationOptions,
    acceptOriginalImport,
    acceptPixelatedImport,
    updateRecoverySettings,
    getUndoOptions,
    updateUndoOptions,
    updateComposeGroups,
    updateSliceUseKeys,
    getGuideSlicePreferences: () => workspace.getGuideSlicePreferences(),
    setGuideSlicePreferences: (preferences: GuideSlicePreferences) =>
      workspace.setGuideSlicePreferences(preferences),
    getEditorPreferences: () => workspace.getEditorPreferences(),
    setEditorPreferences: (preferences: EditorPreferences) =>
      workspace.setEditorPreferences(preferences),
    getCursorPreferences: () => workspace.getCursorPreferences(),
    setCursorPreferences: (preferences: CursorPreferences) =>
      workspace.setCursorPreferences(preferences),
    getCanvasDisplayPreferences: () => workspace.getCanvasDisplayPreferences(),
    getCanvasDisplayDefaults: () => workspace.getCanvasDisplayDefaults(),
    getGridBoundsPreferences: () => workspace.getGridBoundsPreferences(),
    getGridBoundsDefaults: () =>
      workspace.getGridBoundsPreferences(CanvasDisplayPreferenceTarget.Defaults),
    setGridBoundsPreferences: (bounds: GridBoundsPreferences) =>
      workspace.setGridBoundsPreferences(bounds),
    setGridBoundsDefaults: (bounds: GridBoundsPreferences) =>
      workspace.setGridBoundsPreferences(bounds, CanvasDisplayPreferenceTarget.Defaults),
    setCanvasDisplayDefaults: (preferences: CanvasDisplayPreferences) =>
      workspace.setCanvasDisplayPreferences(preferences, CanvasDisplayPreferenceTarget.Defaults),
    setCanvasDisplayPreferences: (preferences: CanvasDisplayPreferences) =>
      workspace.setCanvasDisplayPreferences(preferences),
    getFilePreferences: () => workspace.getFilePreferences(),
    setFilePreferences: (preferences: FilePreferences) => workspace.setFilePreferences(preferences),
    touchInputPreferences,
    updateTouchInputPreferences,
    validateText,
    acceptText,
    dismissError,
  };
}
