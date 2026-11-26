import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { tUi } from "$/i18n";
import { ClipboardRegion } from "$/managers/clipboard";
import { useDiagnosticsPort } from "$/managers/diagnostics/diagnostics-context";
import { useEditor, useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import {
  automaticViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { useFeedback } from "$/managers/feedback/use-feedback";
import { VideoImportStage } from "$/managers/files/video-import-manager";
import { useWheelDevice } from "$/managers/input/wheel-device-context";
import { useEditorPaletteModel } from "$/managers/palette/editor-palette-model";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { InteractionBlocker, WorkspaceDiagnosticAction } from "$/managers/ports/diagnostics";
import {
  DocumentOpenMethod,
  TelemetryFeature,
  TelemetryFeatureAction,
} from "$/managers/ports/telemetry";
import { usePwaManager } from "$/managers/pwa/pwa-context";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { HELP_LINKS, type HelpLink } from "$/managers/shell/help";
import { useTelemetryFeatures } from "$/managers/telemetry/use-telemetry-features";
import { useTelemetryView } from "$/managers/telemetry/use-telemetry-view";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import { useWorkflowActionSnapshot } from "$/managers/workspace/workflow-action-snapshot";
import { computeWorkflowInteractionState } from "$/managers/workspace/workflows/interaction-blockers";
import { useClipboardWorkflows } from "$/managers/workspace/workflows/use-clipboard-workflows";
import {
  useCommandAndShortcutWorkflows,
  useTabNavigationShortcuts,
  type EditorCommandPresentationContext,
} from "$/managers/workspace/workflows/use-command-and-shortcut-workflows";
import { useDocumentNavigationWorkflows } from "$/managers/workspace/workflows/use-document-navigation-workflows";
import { useDocumentOutputWorkflows } from "$/managers/workspace/workflows/use-document-output-workflows";
import { useDocumentSaveWorkflows } from "$/managers/workspace/workflows/use-document-save-workflows";
import { useFileImportWorkflows } from "$/managers/workspace/workflows/use-file-import-workflows";
import { usePreferencesAndTextWorkflows } from "$/managers/workspace/workflows/use-preferences-and-text-workflows";
import { useRecoveryWorkflows } from "$/managers/workspace/workflows/use-recovery-workflows";
import { canExecuteEditorAction, type EffectKind } from "@xprite/editor-core";
import { SessionOperation } from "@xprite/editor-core/session";
import type { AppearanceMode, AppearanceTheme } from "@xprite/editor-ui/appearance";

type TimelineWorkflowActions = {
  flushPendingLayerProperties?: () => void;
  openLayerPropertiesDialog?: () => void;
  openFramePropertiesDialog?: () => void;
};
type AnimationWorkflowActions = {
  playPreview?: () => void;
  openFullscreenPreview?: () => void;
};
type EffectWorkflowActions = { openEffect?: (kind: EffectKind) => void };

export interface EditorWorkflowOptions {
  appearanceMode: AppearanceMode;
  onAppearanceModeChange: (mode: AppearanceMode) => void;
  persistAppearanceMode: (mode: AppearanceMode) => void;
  appearanceTheme: AppearanceTheme;
  onAppearanceThemeChange: (theme: AppearanceTheme) => void;
  persistAppearanceTheme: (theme: AppearanceTheme) => void;
  timelineActions?: TimelineWorkflowActions | null;
  animationActions?: AnimationWorkflowActions | null;
  effectActions?: EffectWorkflowActions | null;
  sceneBounds: { width: number; height: number };
  getCommandContext?: () => EditorCommandPresentationContext | undefined;
  clearPointer?: () => void;
}

/** Coordinates editor use cases; the shell consumes its state and command view model. */
export function useEditorWorkflows(managerOptions: EditorWorkflowOptions) {
  const pwa = usePwaManager();
  const platform = useEditorPlatformPorts();
  if (!platform) throw new Error("Editor workflow manager requires platform ports");
  const { core } = useEditorManagerContext();
  if (!core) throw new Error("Editor workflow manager requires an active RasterEditor");
  const diagnostics = useDiagnosticsPort();
  const { workspace, active } = useEditorRuntimeManagerContext();
  const workspaceSnapshot = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot,
  );
  const session = active.session;
  const videoImport = useSyncExternalStore(
    workspace.videoImport.subscribe,
    workspace.videoImport.getSnapshot,
    workspace.videoImport.getSnapshot,
  );
  const {
    device: wheelDevice,
    setDevice: setWheelDevice,
    detected: detectedWheelDevice,
  } = useWheelDevice();
  const { timelineActions, animationActions, effectActions, sceneBounds } = managerOptions;

  const editor = useEditor();
  const paletteModel = useEditorPaletteModel();
  const chromePreferences = useEditorChromePreferences();
  const timelineActionsRef = useRef(timelineActions);
  timelineActionsRef.current = timelineActions;
  const flushPendingLayerProperties = useCallback(
    () => timelineActionsRef.current?.flushPendingLayerProperties?.(),
    [],
  );

  const workflow = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const state = useEditorSnapshot(core)!;
  const { busy, replacement, pendingImport: pending, newSize, pixelationOptions } = workflow;
  const error = workflow.error?.message ?? "";

  const [newDialog, setNewDialog] = useState(false);
  const [duplicateSpriteOpen, setDuplicateSpriteOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [newTilemapDialog, setNewTilemapDialog] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [exitNotice, setExitNotice] = useState(false);
  const [dialog, setDialog] = useState<"text" | "color" | null>(null);
  const [colorTarget, setColorTarget] = useState<"foreground" | "background">("foreground");

  const telemetry = useTelemetryFeatures(preferencesOpen, aboutOpen);
  const feedback = useFeedback(telemetry, () => editor.setNotice(tUi("feedback.sent")));
  useTelemetryView();

  const canStartInteractionRef = useRef<() => boolean>(() => false);
  const canDispatchEditorInputRef = useRef<() => boolean>(() => false);
  const canStartInteraction = useCallback(() => canStartInteractionRef.current(), []);
  const canDispatchEditorInput = useCallback(() => canDispatchEditorInputRef.current(), []);

  const recovery = useRecoveryWorkflows({
    workspace,
    session,
    editor,
    workspaceSnapshot,
    canStartInteraction,
  });

  const output = useDocumentOutputWorkflows({
    core,
    session,
    workspace,
    platform,
    telemetry,
    scene: editorSceneForTab(editor.tab),
    canStartInteraction,
    flushPendingLayerProperties,
    openGeneratedDocument: () =>
      editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentGenerated)),
    showNotice: editor.setNotice,
  });

  const fileImport = useFileImportWorkflows({
    core,
    session,
    workspace,
    editor,
    telemetry,
    workflowBusy: workflow.busy,
    documentId: state.document?.id,
    newDialog,
    setNewDialog,
    setDuplicateSpriteOpen,
    setDialog,
    openSheetImport: output.openSheetImport,
    canStartInteraction,
    flushPendingLayerProperties,
  });

  const clipboardWorkflow = useClipboardWorkflows({
    core,
    workspace,
    activeId: workspaceSnapshot.activeId,
    editor,
    paletteModel,
    telemetry,
    recoveryOpen: recovery.recoveryOpen,
    canDispatchEditorInput,
  });

  const save = useDocumentSaveWorkflows({
    core,
    session,
    workspace,
    workspaceSnapshot,
    pwa,
    telemetry,
    replacement,
    canStartInteraction,
    canDispatchEditorInput,
    canExecuteSave: () =>
      canExecuteEditorAction("save", core.getSnapshot(), editorSceneForTab(editor.tab)),
    flushPendingLayerProperties,
  });

  const preferencesAndText = usePreferencesAndTextWorkflows({
    core,
    session,
    workspace,
    platform,
    editor,
    chromePreferences,
    setWheelDevice,
    onAppearanceModeChange: managerOptions.onAppearanceModeChange,
    persistAppearanceMode: managerOptions.persistAppearanceMode,
    onAppearanceThemeChange: managerOptions.onAppearanceThemeChange,
    persistAppearanceTheme: managerOptions.persistAppearanceTheme,
    setDialog,
    canStartInteraction,
  });

  const navigation = useDocumentNavigationWorkflows({
    workspace,
    session,
    editor,
    telemetry,
    workspaceSnapshot,
    workflow,
    editorError: state.error,
    recoveryOpen: recovery.recoveryOpen,
    recoveryTabOpen: recovery.recoveryTabOpen,
    recoveryBusy: recovery.recoveryBusy,
    setRecoveryOpen: recovery.setRecoveryOpen,
    selectRecovery: recovery.selectRecovery,
    closeRecovery: recovery.closeRecovery,
    setDialog,
    setNewDialog,
    setExitNotice,
    canStartInteraction,
    flushPendingLayerProperties,
  });

  // Keep tab pointer capture alive when selecting a document on mouse-down.
  // Reset workflow drafts explicitly rather than remounting all editor chrome.
  useEffect(() => {
    setNewDialog(false);
    setPreferencesOpen(false);
    setExitNotice(false);
    setDialog(null);
    preferencesAndText.setText("");
    managerOptions.clearPointer?.();
  }, [core]);

  const interaction = computeWorkflowInteractionState({
    aboutOpen,
    supportOpen,
    feedbackOpen: feedback.open,
    inputDialogOpen: Boolean(dialog),
    newTilemapDialog,
    preferencesOpen,
    saveAsOpen: save.saveAsOpen,
    newDialog,
    duplicateSpriteOpen,
    keyboardShortcutsOpen,
    outputHasOpenDialog: output.hasOpenDialog,
    deleteRecoveryOpen: Boolean(recovery.deleteRecoveryIds),
    deleteBrowserCopyOpen: Boolean(recovery.deleteBrowserCopyItem),
    sequenceImportOpen: Boolean(fileImport.sequenceImport),
    videoImportOpen: videoImport.stage !== VideoImportStage.Idle,
    pendingImportOpen: Boolean(pending),
    replacementOpen: Boolean(replacement),
    errorOpen: Boolean(error),
    exitNoticeOpen: exitNotice,
    exportBusy: output.exportBusy,
    saveAsBusy: save.saveAsBusy,
    recoveryBusy: recovery.recoveryBusy,
    closingSaveBusy: save.closingSaveBusy,
    importBatchActive: Boolean(workspaceSnapshot.importBatch),
    sessionBusy: busy,
    sessionSaving: workflow.saving,
    sessionPrompt: workflow.prompt,
    sessionCanStartInteraction: session.canStartInteraction(),
  });

  const { modalOpen, operationBusy, interactionBlockerSignature } = interaction;
  canStartInteractionRef.current = () =>
    !modalOpen && !operationBusy && !workspaceSnapshot.importBatch && session.canStartInteraction();
  // Saving keeps ordinary editing available; only starting another workflow
  // consults session.canStartInteraction(), which also protects native pickers.
  canDispatchEditorInputRef.current = () =>
    !modalOpen &&
    !operationBusy &&
    !session.getSnapshot().busy &&
    !workspace.getSnapshot().importBatch;

  const previousInteractionBlockerSignature = useRef("");
  useEffect(() => {
    if (!interactionBlockerSignature) {
      previousInteractionBlockerSignature.current = "";
      return;
    }
    if (previousInteractionBlockerSignature.current === interactionBlockerSignature) return;
    previousInteractionBlockerSignature.current = interactionBlockerSignature;
    diagnostics.recordWorkspaceEvent({
      action: WorkspaceDiagnosticAction.InteractionBlocked,
      blockers: interactionBlockerSignature.split(",") as InteractionBlocker[],
    });
  }, [diagnostics, interactionBlockerSignature]);

  const openKeyboardShortcuts = () => {
    if (!modalOpen) setKeyboardShortcutsOpen(true);
  };
  const openNewDocument = () => {
    if (!canStartInteraction()) return;
    flushPendingLayerProperties();
    telemetry.documentOpenRequested(DocumentOpenMethod.New);
    workspace.prepareNew();
    setNewDialog(true);
  };
  const openPreferences = () => {
    if (!modalOpen) setPreferencesOpen(true);
  };

  const documentScene =
    editor.tab === "document" && workspaceSnapshot.tabs.length > 0 && !recovery.recoveryOpen;

  const { heldSpace, command } = useCommandAndShortcutWorkflows({
    core,
    workspace,
    editor,
    state,
    documentScene,
    dialog,
    colorTarget,
    setDialog,
    setColorTarget,
    clipboardRegionRef: clipboardWorkflow.clipboardRegionRef,
    dismissTimelineCopyRange: () => clipboardWorkflow.clipboard.dismissTimelineCopyRange(),
    canStartInteraction,
    canDispatchEditorInput,
    flushPendingLayerProperties,
    getCommandContext: managerOptions.getCommandContext,
    actionHandlers: {
      keyboardShortcuts: openKeyboardShortcuts,
      newSpriteFromSelection: fileImport.newSpriteFromSelection,
      exportSpriteSheet: output.actions.exportSpriteSheet,
      importSpriteSheet: output.actions.importSpriteSheet,
      canRepeatExport: output.actions.canRepeatExport,
      repeatLastExport: output.actions.repeatLastExport,
      openEffect: effectActions?.openEffect,
      togglePreview: () => editor.setPreviewVisible((v) => !v),
      openFullscreenPreview: animationActions?.openFullscreenPreview,
      toggleTimeline: () => editor.setTimelineVisible((visible) => !visible),
      toggleTimelineThumbnails: () => {
        const current = workspace.getTimelinePanelPreferences();
        editor.setTimelinePanelPreferences({
          thumbnailsEnabled: !current.thumbnailsEnabled,
          ...(!current.thumbnailsEnabled && current.thumbnailZoom <= 1 ? { thumbnailZoom: 2 } : {}),
        });
      },
      playPreview: animationActions?.playPreview,
      copy: clipboardWorkflow.actions.copy,
      copyMerged: clipboardWorkflow.actions.copyMerged,
      cut: clipboardWorkflow.actions.cut,
      paste: clipboardWorkflow.actions.paste,
      pasteNewLayer: clipboardWorkflow.actions.pasteNewLayer,
      pasteNewSprite: clipboardWorkflow.actions.pasteNewSprite,
      closeAllDocuments: navigation.closeAllDocuments,
      reopenClosedFile: navigation.reopenClosedFile,
      openLayerPropertiesDialog: timelineActions?.openLayerPropertiesDialog,
      openNewTilemapDialog: () => setNewTilemapDialog(true),
      openFramePropertiesDialog: timelineActions?.openFramePropertiesDialog,
      newDocument: openNewDocument,
      openDocument: fileImport.open,
      openPreferences,
      closeDocument: navigation.closeDocument,
      saveDocument: save.saveAction,
      saveDocumentAs: save.saveAsAction,
      exportCopy: output.actions.exportCopy,
      insertText: preferencesAndText.openTextDialog,
    },
  });

  const canRunHistory = (direction: "undo" | "redo") =>
    canDispatchEditorInput() &&
    documentScene &&
    (workspace.canTraverseTabDock(direction) ||
      canExecuteEditorAction(direction, core.getSnapshot(), editorSceneForTab(editor.tab)));

  const actions = {
    ...clipboardWorkflow.actions,
    canUndo: canRunHistory("undo"),
    canRedo: canRunHistory("redo"),
    undo: () => command({ type: "undo" }),
    redo: () => command({ type: "redo" }),
    recoveryProblem: recovery.recoveryProblem,
    retryRecovery: recovery.retryRecovery,
    backupActive: recovery.backupActive,
    recoveryOpen: recovery.recoveryOpen,
    recoveryTabOpen: recovery.recoveryTabOpen,
    recoverySelectedIds: recovery.recoverySelectedIds,
    selectRecoveryProjects: recovery.setRecoverySelectedIds,
    selectRecovery: recovery.selectRecovery,
    closeRecovery: recovery.closeRecovery,
    recoveryItems: recovery.recoveryItems,
    recoveryBusy: recovery.recoveryBusy,
    recoveryLoading: recovery.recoveryLoading,
    recoverFiles: recovery.showRecovery,
    refreshRecovery: () => {
      void recovery.refreshRecovery();
    },
    recoverProjects: (ids: readonly string[]) => {
      void recovery.recoverProjects(ids);
    },
    deleteRecoveryProjects: (ids: readonly string[]) => {
      if (canStartInteraction()) recovery.setDeleteRecoveryIds(ids);
    },
    deleteBrowserCopy: recovery.requestDeleteBrowserCopy,
    deleteBrowserCopyBusy: recovery.deleteBrowserCopyBusy,
    leaveRecovery: () => recovery.setRecoveryOpen(false),
    openFromClipboard: fileImport.openFromClipboard,
    newSpriteFromSelection: fileImport.newSpriteFromSelection,
    duplicateSprite: () => {
      if (canStartInteraction() && state.document) setDuplicateSpriteOpen(true);
    },
    keyboardShortcuts: openKeyboardShortcuts,
    userGuide: navigation.userGuide,
    about: () => {
      if (!modalOpen) setAboutOpen(true);
    },
    feedback: () => {
      if (!modalOpen) feedback.show();
    },
    support: () => {
      if (modalOpen) return;
      telemetry.featureUsed(TelemetryFeature.Support, TelemetryFeatureAction.Open);
      setSupportOpen(true);
    },
    closeAllDocuments: navigation.closeAllDocuments,
    closeDocument: navigation.closeDocument,
    exit: navigation.exit,
    canSave: session.canSave(),
    canStartInteraction: canStartInteraction(),
    canOpenModal: !modalOpen,
    new: openNewDocument,
    preferences: openPreferences,
    recentFiles: navigation.recentFiles,
    loadRecentFiles: navigation.loadRecentFiles,
    canClearRecentFiles: navigation.canClearRecentFiles,
    clearRecentFiles: navigation.clearRecentFiles,
    agentPreviewStatus: preferencesAndText.agentPreviewStatus,
    connectAgentPreviewDirectory: preferencesAndText.connectAgentPreviewDirectory,
    disconnectAgentPreviewDirectory: preferencesAndText.disconnectAgentPreviewDirectory,
    canReopenClosedFile: workspaceSnapshot.canReopenClosedFile,
    reopenClosedFile: navigation.reopenClosedFile,
    prepareText: preferencesAndText.prepareText,
    openRecent: navigation.openRecent,
    pinRecent: navigation.pinRecent,
    downloadRecent: recovery.downloadRecent,
    downloadRecentBusy: recovery.downloadRecentBusy,
    documentTabs: workspaceSnapshot.tabs,
    canSelectOtherDocumentTab: canStartInteraction() && navigation.hasAdjacentTab(),
    nextDocumentTab: navigation.nextDocumentTab,
    previousDocumentTab: navigation.previousDocumentTab,
    activeDocumentId: workspaceSnapshot.activeId,
    workspacePanes: workspaceSnapshot.panes,
    workspaceDockTree: workspaceSnapshot.dockTree,
    workspaceRootPaneId: workspace.getRootPaneId(),
    selectDocumentTab: navigation.selectDocumentTab,
    duplicateDocumentView: navigation.duplicateDocumentView,
    selectPaneTab: navigation.selectPaneTab,
    activateWorkspacePane: navigation.activateWorkspacePane,
    reorderDocumentTab: navigation.reorderDocumentTab,
    moveDocumentTab: navigation.moveDocumentTab,
    splitDocumentTab: navigation.splitDocumentTab,
    resizeWorkspaceSplit: navigation.resizeWorkspaceSplit,
    closeDocumentTab: navigation.closeDocumentTab,
    open: fileImport.open,
    save: save.saveAction,
    saveAs: save.saveAsAction,
    ...output.actions,
    color: (target: "foreground" | "background") => {
      if (!canStartInteraction()) return;
      setColorTarget(target);
      setDialog("color");
    },
    text: preferencesAndText.openTextDialog,
  };

  const actionSnapshot = useWorkflowActionSnapshot(actions);
  useTabNavigationShortcuts(
    workspace,
    actionSnapshot.nextDocumentTab,
    actionSnapshot.previousDocumentTab,
    actionSnapshot.canSelectOtherDocumentTab,
  );

  const handleCanvasPointerDown = () => {
    clipboardWorkflow.setClipboardRegion(ClipboardRegion.Canvas);
    flushPendingLayerProperties();
  };

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
    input: fileImport.input,
    setClipboardRegion: clipboardWorkflow.setClipboardRegion,
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
    supportOpen,
    setSupportOpen,
    supportOption: (option: string) =>
      telemetry.featureUsed(TelemetryFeature.Support, TelemetryFeatureAction.Click, { option }),
    openSupportFromAbout: () => {
      setAboutOpen(false);
      telemetry.featureUsed(TelemetryFeature.Support, TelemetryFeatureAction.Open);
      setSupportOpen(true);
    },
    feedback,
    openHelpLink: (link: HelpLink) => platform.navigation.openExternal(HELP_LINKS[link]),
    newTilemapDialog,
    setNewTilemapDialog,
    heldSpace,
    preferencesOpen,
    setPreferencesOpen,
    resetPreferences: preferencesAndText.resetPreferences,
    exitNotice,
    setExitNotice,
    dialog,
    setDialog,
    colorTarget,
    setColorTarget,
    text: preferencesAndText.text,
    setText: preferencesAndText.setText,
    textSize: preferencesAndText.textSize,
    setTextSize: preferencesAndText.setTextSize,
    ...output,
    openSpriteSheetFile: fileImport.openSpriteSheetFile,
    recoveryOpen: recovery.recoveryOpen,
    setRecoveryOpen: recovery.setRecoveryOpen,
    recoveryItems: recovery.recoveryItems,
    setRecoveryItems: recovery.setRecoveryItems,
    recoveryLoading: recovery.recoveryLoading,
    setRecoveryLoading: recovery.setRecoveryLoading,
    recoveryBusy: recovery.recoveryBusy,
    setRecoveryBusy: recovery.setRecoveryBusy,
    closingSaveBusy: save.closingSaveBusy,
    setClosingSaveBusy: save.setClosingSaveBusy,
    deleteRecoveryIds: recovery.deleteRecoveryIds,
    setDeleteRecoveryIds: recovery.setDeleteRecoveryIds,
    deleteBrowserCopyItem: recovery.deleteBrowserCopyItem,
    deleteBrowserCopyBusy: recovery.deleteBrowserCopyBusy,
    closeDeleteBrowserCopy: recovery.closeDeleteBrowserCopy,
    recoveryState: recovery.recoveryState,
    saveAsOpen: save.saveAsOpen,
    saveAsBusy: save.saveAsBusy,
    saveAsTarget: save.saveAsTarget,
    closeSaveAs: save.closeSaveAs,
    saveProjectAs: save.saveProjectAs,
    refreshRecovery: recovery.refreshRecovery,
    showRecovery: recovery.showRecovery,
    recoverProjects: recovery.recoverProjects,
    deleteRecovery: recovery.deleteRecovery,
    deleteBrowserCopy: recovery.deleteBrowserCopy,
    prepareText: preferencesAndText.prepareText,
    state,
    busy,
    replacement,
    pending,
    newSize,
    suggestedNewSpriteBaseName: workspace.suggestNewSpriteBaseName(),
    pixelationOptions,
    pixelationPreview: workflow.pixelationPreview,
    pixelationPalette: workflow.pixelationPalette,
    getPixelationPaletteChoices: fileImport.getPixelationPaletteChoices,
    pixelationPreviewing: workflow.pixelationPreviewing,
    pixelationError: workflow.pixelationError,
    error,
    canSaveErrorAs: workflow.error?.operation === SessionOperation.Save && session.canSave(),
    saveErrorAs: save.saveErrorAs,
    activation: navigation.activation,
    exitCount: navigation.exitCount,
    requestImport: fileImport.requestImport,
    videoImport,
    videoImportManager: workspace.videoImport,
    sequenceImport: fileImport.sequenceImport,
    sequenceDuration: fileImport.sequenceDuration,
    setSequenceDuration: fileImport.setSequenceDuration,
    cancelSequenceImport: fileImport.cancelSequenceImport,
    confirmSequenceImport: fileImport.confirmSequenceImport,
    cancelFileImport: fileImport.cancelFileImport,
    clipboard: clipboardWorkflow.clipboard,
    actions: actionSnapshot,
    command,
    handleCanvasPointerDown,
    handleNewSpriteOpenChange: fileImport.handleNewSpriteOpenChange,
    updateNewSpriteSize: fileImport.updateNewSpriteSize,
    createNewSprite: fileImport.createNewSprite,
    duplicateCurrentSprite: fileImport.duplicateCurrentSprite,
    cancelReplacement: save.cancelReplacement,
    saveReplacement: save.saveReplacement,
    discardReplacement: save.discardReplacement,
    discardEmptyImport: fileImport.discardEmptyImport,
    setPixelationOptions: fileImport.setPixelationOptions,
    setImportAlgorithm: fileImport.setImportAlgorithm,
    setImportPreviewFrame: fileImport.setImportPreviewFrame,
    acceptOriginalImport: fileImport.acceptOriginalImport,
    acceptPixelatedImport: fileImport.acceptPixelatedImport,
    updateRecoverySettings: recovery.updateRecoverySettings,
    getUndoOptions: preferencesAndText.getUndoOptions,
    updateUndoOptions: preferencesAndText.updateUndoOptions,
    updateComposeGroups: preferencesAndText.updateComposeGroups,
    updateSliceUseKeys: preferencesAndText.updateSliceUseKeys,
    getGuideSlicePreferences: preferencesAndText.getGuideSlicePreferences,
    setGuideSlicePreferences: preferencesAndText.setGuideSlicePreferences,
    getEditorPreferences: preferencesAndText.getEditorPreferences,
    setEditorPreferences: preferencesAndText.setEditorPreferences,
    getCursorPreferences: preferencesAndText.getCursorPreferences,
    setCursorPreferences: preferencesAndText.setCursorPreferences,
    getCanvasDisplayPreferences: preferencesAndText.getCanvasDisplayPreferences,
    getCanvasDisplayDefaults: preferencesAndText.getCanvasDisplayDefaults,
    getGridBoundsPreferences: preferencesAndText.getGridBoundsPreferences,
    getGridBoundsDefaults: preferencesAndText.getGridBoundsDefaults,
    setGridBoundsPreferences: preferencesAndText.setGridBoundsPreferences,
    setGridBoundsDefaults: preferencesAndText.setGridBoundsDefaults,
    setCanvasDisplayDefaults: preferencesAndText.setCanvasDisplayDefaults,
    setCanvasDisplayPreferences: preferencesAndText.setCanvasDisplayPreferences,
    getFilePreferences: preferencesAndText.getFilePreferences,
    setFilePreferences: preferencesAndText.setFilePreferences,
    touchInputPreferences: preferencesAndText.touchInputPreferences,
    updateTouchInputPreferences: preferencesAndText.updateTouchInputPreferences,
    validateText: preferencesAndText.validateText,
    acceptText: preferencesAndText.acceptText,
    dismissError: save.dismissError,
  };
}
