import { lazy, Suspense, useCallback, useRef, type ReactNode } from "react";

import { createCanvasCommandContext } from "$/components/canvas/create-canvas-command-context";
import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { Alert } from "$/components/dialogs/alert";
import { useEffectActions } from "$/components/dialogs/effect-actions";
import { FormDialog } from "$/components/dialogs/form-dialog";
import {
  useEditorWorkflowBoundary,
  useEditorWorkflowHandlers,
} from "$/components/shared/editor-workflow-boundary";
import { EditorActionsContext } from "$/components/shell/editor-actions";
import { useAnimationActions } from "$/components/timeline/animation-actions";
import { useTimelineActions } from "$/components/timeline/timeline-actions";
import { TilemapDialog } from "$/components/tools/tilemap-controls";
import { tUi, tUiSource } from "$/i18n";
import { ClipboardRegion } from "$/managers/clipboard";
import { PixelationMethod, PixelArtClassification } from "$/managers/files/import-options";
import { useEditorPreferences } from "$/managers/preferences/use-editor-preferences";
import { formatEditorColor } from "$/managers/tools/color-control";
import {
  MIN_SEQUENCE_FRAME_DURATION_MS,
  MAX_SEQUENCE_FRAME_DURATION_MS,
} from "$/managers/workspace/file-import-plan";
import {
  useEditorWorkflows,
  type EditorWorkflowOptions,
} from "$/managers/workspace/use-editor-workflows";
import { Button, Text, TextVariant, TooltipProvider } from "@xprite/ui";
import { clientPoint, clientRect } from "@xprite/ui/utils";

import styles from "$/components/shell/editor-workflows.module.css";

const NewSpriteDialog = lazy(() =>
  import("$/components/dialogs/new-sprite-dialog").then((module) => ({
    default: module.NewSpriteDialog,
  })),
);
const PreferencesDialog = lazy(() =>
  import("$/components/dialogs/preferences-dialog").then((module) => ({
    default: module.PreferencesDialog,
  })),
);
const SaveAsDialog = lazy(() =>
  import("$/components/dialogs/save-as").then((module) => ({
    default: module.SaveAsDialog,
  })),
);
const AnimalCrossingDialog = lazy(() =>
  import("$/components/dialogs/animal-crossing-dialog").then((module) => ({
    default: module.AnimalCrossingDialog,
  })),
);
const ExportFileDialog = lazy(() =>
  import("$/components/dialogs/export-file-dialog").then((module) => ({
    default: module.ExportFileDialog,
  })),
);
const ShareProjectDialog = lazy(() =>
  import("$/components/dialogs/share-project").then((module) => ({
    default: module.ShareProjectDialog,
  })),
);
const SpriteSheetDialog = lazy(() =>
  import("$/components/dialogs/sprite-sheet-dialog").then((module) => ({
    default: module.SpriteSheetDialog,
  })),
);
const ImportSpriteSheetDialog = lazy(() =>
  import("$/components/dialogs/sprite-sheet-dialog").then((module) => ({
    default: module.ImportSpriteSheetDialog,
  })),
);
const ColorPicker = lazy(() =>
  import("$/components/tools/color-picker").then((module) => ({ default: module.ColorPicker })),
);
const TextDialog = lazy(() =>
  import("$/components/dialogs/text-dialog").then((module) => ({ default: module.TextDialog })),
);
const DuplicateSpriteDialog = lazy(() =>
  import("$/components/dialogs/duplicate-sprite-dialog").then((module) => ({
    default: module.DuplicateSpriteDialog,
  })),
);
const KeyboardShortcutsDialog = lazy(() =>
  import("$/components/dialogs/keyboard-shortcuts").then((module) => ({
    default: module.EditorKeyboardShortcutsDialog,
  })),
);
const AboutDialog = lazy(() =>
  import("$/components/dialogs/about").then((module) => ({ default: module.AboutDialog })),
);
const FeedbackDialog = lazy(() =>
  import("$/components/dialogs/feedback").then((module) => ({ default: module.FeedbackDialog })),
);

type EditorWorkflowsProps = Omit<
  EditorWorkflowOptions,
  | "timelineActions"
  | "animationActions"
  | "effectActions"
  | "sceneBounds"
  | "getCommandContext"
  | "clearPointer"
> & { children: ReactNode };

function clipboardRegionAt(target: EventTarget | null): ClipboardRegion | null {
  if (!(target instanceof Element)) return null;
  if (target.closest("[data-tileset-panel]")) return ClipboardRegion.Tileset;
  if (target.closest('[data-ui-region="palette"]')) return ClipboardRegion.Palette;
  if (target.closest('[data-ui-region="timeline"]')) return ClipboardRegion.Timeline;
  if (target.matches("canvas[data-editor-canvas]")) return ClipboardRegion.Canvas;
  return null;
}

export function EditorWorkflows(props: EditorWorkflowsProps) {
  const { children, ...options } = props;
  const editorPreferences = useEditorPreferences();
  const timelineActions = useTimelineActions();
  const animationActions = useAnimationActions();
  const effectActions = useEffectActions();
  const sceneBounds = useSceneBounds();
  const workflowBoundary = useEditorWorkflowBoundary();
  const rootElement = workflowBoundary.root;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const clearPointer = useCallback(() => {
    pointer.current = null;
  }, []);
  const getCommandContext = useCallback(() => {
    const canvas = rootElement.current?.querySelector<HTMLCanvasElement>(
      "canvas[data-editor-canvas]",
    );
    if (!canvas) return undefined;
    const surfaceBounds = {
      x: Number(canvas.dataset.uiX ?? 8),
      y: Number(canvas.dataset.uiY ?? 8),
      width: Number(canvas.dataset.uiWidth ?? 0),
      height: Number(canvas.dataset.uiHeight ?? 0),
    };
    return createCanvasCommandContext(surfaceBounds, clientRect(canvas), pointer.current);
  }, [rootElement]);
  const {
    workspaceSnapshot,
    appearanceMode,
    onAppearanceModeChange,
    persistAppearanceMode,
    wheelDevice,
    setWheelDevice,
    detectedWheelDevice,
    editor,
    workflow,
    input,
    setClipboardRegion,
    newDialog,
    duplicateSpriteOpen,
    setDuplicateSpriteOpen,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    aboutOpen,
    setAboutOpen,
    feedback,
    openHelpLink,
    newTilemapDialog,
    setNewTilemapDialog,
    preferencesOpen,
    setPreferencesOpen,
    resetPreferences,
    exitNotice,
    setExitNotice,
    dialog,
    setDialog,
    colorTarget,
    text,
    textSize,
    animalCrossingSource,
    animalCrossingExportPort,
    setAnimalCrossingSource,
    shareSource,
    setShareSource,
    exportDocument,
    setExportDocument,
    exportBusy,
    exportKey,
    sheetFileIntent,
    showSheetPreview,
    sheetSource,
    sheetExport,
    sheetImport,
    setSheetImport,
    closingSaveBusy,
    deleteRecoveryIds,
    setDeleteRecoveryIds,
    deleteBrowserCopyItem,
    deleteBrowserCopyBusy,
    closeDeleteBrowserCopy,
    recoveryState,
    saveAsOpen,
    saveAsBusy,
    saveAsTarget,
    closeSaveAs,
    saveProjectAs,
    performExport,
    performSheetExport,
    performSheetImport,
    deleteRecovery,
    deleteBrowserCopy,
    state,
    busy,
    replacement,
    pending,
    newSize,
    suggestedNewSpriteBaseName,
    pixelationOptions,
    error,
    canSaveErrorAs,
    saveErrorAs,
    requestImport,
    sequenceImport,
    sequenceDuration,
    setSequenceDuration,
    cancelSequenceImport,
    confirmSequenceImport,
    cancelFileImport,
    actions,
    handleCanvasPointerDown,
    closeSheetExport,
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
    getGuideSlicePreferences,
    setGuideSlicePreferences,
    getEditorPreferences,
    setEditorPreferences,
    getCursorPreferences,
    setCursorPreferences,
    getCanvasDisplayPreferences,
    setCanvasDisplayPreferences,
    getCanvasDisplayDefaults,
    setCanvasDisplayDefaults,
    getGridBoundsPreferences,
    getGridBoundsDefaults,
    setGridBoundsPreferences,
    setGridBoundsDefaults,
    getFilePreferences,
    setFilePreferences,
    touchInputPreferences,
    updateTouchInputPreferences,
    validateText,
    acceptText,
    dismissError,
  } = useEditorWorkflows({
    ...options,
    timelineActions,
    animationActions,
    effectActions,
    sceneBounds,
    getCommandContext,
    clearPointer,
  });
  useEditorWorkflowHandlers({
    onFocusCapture: (event) => {
      const region = clipboardRegionAt(event.target);
      if (region) setClipboardRegion(region);
    },
    onPointerDownCapture: (event) => {
      const region = clipboardRegionAt(event.target);
      if (region) setClipboardRegion(region);
      if (
        event.target instanceof HTMLCanvasElement &&
        event.target.hasAttribute("data-editor-canvas")
      ) {
        handleCanvasPointerDown();
      }
    },
    onPointerMoveCapture: (event) => {
      pointer.current = { x: clientPoint(event).x, y: clientPoint(event).y };
    },
    onDragOver: (e) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDrop: (e) => {
      e.preventDefault();
      if (
        aboutOpen ||
        dialog ||
        preferencesOpen ||
        saveAsOpen ||
        deleteBrowserCopyItem ||
        newDialog ||
        sequenceImport ||
        pending ||
        replacement ||
        error ||
        exitNotice
      )
        return;
      requestImport(Array.from(e.dataTransfer.files));
    },
  });
  return (
    <TooltipProvider delay={editorPreferences.tooltipDelay}>
      <EditorActionsContext.Provider value={actions}>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            requestImport(files);
          }}
        />
        {children}
        <FormDialog
          open={!!sequenceImport}
          onOpenChange={(open) => {
            if (!open) cancelSequenceImport();
          }}
          title={tUi("ui.import.png.sequence.title")}
          message={tUi("ui.import.png.sequence.message", {
            sequences:
              sequenceImport?.groups
                .map((group) => `${group.name} (${group.sources.length})`)
                .join(", ") ?? "",
          })}
          fields={[
            {
              type: "number",
              key: "duration",
              label: tUi("ui.import.png.sequence.duration"),
              value: sequenceDuration,
              min: MIN_SEQUENCE_FRAME_DURATION_MS,
              max: MAX_SEQUENCE_FRAME_DURATION_MS,
              onChange: setSequenceDuration,
            },
          ]}
          actions={[
            { label: tUi("ui.cancel"), onClick: cancelSequenceImport },
            {
              label: tUi("ui.import.files.separately"),
              onClick: () => confirmSequenceImport(false),
            },
            {
              label: tUi("ui.import.png.sequence.as.animation"),
              onClick: () => confirmSequenceImport(true),
            },
          ]}
        />
        {newTilemapDialog && (
          <TilemapDialog convert={false} onClose={() => setNewTilemapDialog(false)} />
        )}
        <Alert
          open={!!deleteRecoveryIds}
          onOpenChange={(open) => {
            if (!open) setDeleteRecoveryIds(null);
          }}
          title="Warning"
          messageLines={[
            tUi("ui.do.you.really.want.to.delete.the.selected.backup.s", {
              value1: deleteRecoveryIds?.length ?? 0,
            }),
          ]}
          actions={[
            {
              label: "Yes",
              onClick: () => {
                void deleteRecovery();
              },
            },
            { label: "No", onClick: () => setDeleteRecoveryIds(null) },
          ]}
        />
        <Alert
          open={!!deleteBrowserCopyItem}
          onOpenChange={(open) => {
            if (!open) closeDeleteBrowserCopy();
          }}
          title={tUi("ui.home.delete.browser.copy")}
          messageLines={[
            tUi("ui.home.delete.browser.copy.confirm", { name: deleteBrowserCopyItem?.name ?? "" }),
            tUi("ui.home.delete.browser.copy.scope"),
            tUi("ui.home.delete.browser.copy.original.file.unchanged"),
          ]}
          defaultActionIndex={1}
          actions={[
            {
              label: tUi("ui.delete"),
              disabled: deleteBrowserCopyBusy,
              onClick: () => {
                void deleteBrowserCopy();
              },
            },
            {
              label: tUi("ui.cancel"),
              disabled: deleteBrowserCopyBusy,
              onClick: closeDeleteBrowserCopy,
            },
          ]}
        />
        {sheetExport && (
          <Suspense fallback={null}>
            <SpriteSheetDialog
              initialSource={sheetSource}
              documentKey={exportKey.current}
              onPreview={showSheetPreview}
              onClose={() => {
                closeSheetExport();
              }}
              busy={exportBusy}
              onExport={(options) => {
                void performSheetExport(options);
              }}
            />
          </Suspense>
        )}
        {sheetImport && (
          <Suspense fallback={null}>
            <ImportSpriteSheetDialog
              image={sheetImport.image}
              onClose={() => setSheetImport(null)}
              onImport={performSheetImport}
              onSelectFile={() => {
                setSheetImport(null);
                sheetFileIntent.current = true;
                if (input.current) input.current.multiple = false;
                input.current?.click();
              }}
            />
          </Suspense>
        )}
        {animalCrossingSource && animalCrossingExportPort && (
          <Suspense fallback={null}>
            <AnimalCrossingDialog
              source={animalCrossingSource}
              port={animalCrossingExportPort}
              onClose={() => setAnimalCrossingSource(null)}
            />
          </Suspense>
        )}
        {shareSource && (
          <Suspense fallback={null}>
            <ShareProjectDialog source={shareSource} onClose={() => setShareSource(null)} />
          </Suspense>
        )}
        {exportDocument && (
          <Suspense fallback={null}>
            <ExportFileDialog
              documentKey={exportKey.current}
              filePreferences={getFilePreferences()}
              busy={exportBusy}
              onClose={() => setExportDocument(null)}
              onExport={(options) => {
                void performExport(options);
              }}
            />
          </Suspense>
        )}
        {newDialog && (
          <Suspense fallback={null}>
            <NewSpriteDialog
              open={newDialog && workflow.prompt === null}
              onOpenChange={(open) => {
                handleNewSpriteOpenChange(open);
              }}
              suggestedBaseName={suggestedNewSpriteBaseName}
              width={newSize.width}
              height={newSize.height}
              onWidthChange={(width) => updateNewSpriteSize({ width })}
              onHeightChange={(height) => updateNewSpriteSize({ height })}
              onAccept={createNewSprite}
              onHelp={() =>
                window.open(
                  "https://www.aseprite.org/docs/new-sprite/",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            />
          </Suspense>
        )}
        {duplicateSpriteOpen && state.document && (
          <Suspense fallback={null}>
            <DuplicateSpriteDialog
              open={duplicateSpriteOpen}
              sourceName={state.document.name}
              suggestedName={tUi("ui.copy.of", { value1: state.document.name })}
              onClose={() => setDuplicateSpriteOpen(false)}
              onDuplicate={duplicateCurrentSprite}
            />
          </Suspense>
        )}
        {aboutOpen && (
          <Suspense fallback={null}>
            <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} onOpenLink={openHelpLink} />
          </Suspense>
        )}
        {feedback.open && (
          <Suspense fallback={null}>
            <FeedbackDialog manager={feedback} />
          </Suspense>
        )}
        {keyboardShortcutsOpen && (
          <Suspense fallback={null}>
            <KeyboardShortcutsDialog
              open={keyboardShortcutsOpen}
              onOpenChange={setKeyboardShortcutsOpen}
            />
          </Suspense>
        )}
        <Alert
          open={!!replacement && !error}
          onOpenChange={(open) => {
            if (!open) {
              cancelReplacement();
            }
          }}
          title="Warning"
          messageLines={[
            "Saving changes to the sprite",
            tUi("ui.before", {
              value1: state.document?.name ?? "Untitled",
              value2: tUiSource(replacement?.kind === "exit" ? "quitting" : "closing"),
            }),
          ]}
          actions={[
            {
              label: "Save",
              mnemonicIndex: 0,
              disabled: workflow.saving || closingSaveBusy,
              onClick: () => {
                saveReplacement();
              },
            },
            {
              label: "Don't Save",
              mnemonicIndex: 2,
              disabled:
                workflow.saving ||
                closingSaveBusy ||
                recoveryState.documents[workspaceSnapshot.activeId]?.status === "saving",
              onClick: () => {
                discardReplacement();
              },
            },
            {
              label: "Cancel",
              mnemonicIndex: 0,
              onClick: () => {
                cancelReplacement();
              },
            },
          ]}
        />
        <FormDialog
          open={!!pending && !error}
          onOpenChange={(open) => {
            if (!open) discardEmptyImport();
          }}
          title="Pixelate Image"
          message={
            pending?.classification === PixelArtClassification.LikelyPhoto
              ? "This image appears to be a photograph. Choose pixelation options or keep the original."
              : "Pixel art detection is uncertain. Choose pixelation options or keep the original."
          }
          fields={[
            {
              type: "number",
              key: "width",
              label: "Width",
              value: pixelationOptions.targetWidth,
              min: 1,
              max: 16384,
              onChange: (targetWidth) => setPixelationOptions({ targetWidth }),
            },
            {
              type: "number",
              key: "height",
              label: "Height",
              value: pixelationOptions.targetHeight,
              min: 1,
              max: 16384,
              onChange: (targetHeight) => setPixelationOptions({ targetHeight }),
            },
            {
              type: "number",
              key: "colors",
              label: "Colors",
              value: pixelationOptions.maxColors,
              min: 2,
              max: 256,
              onChange: (maxColors) => setPixelationOptions({ maxColors }),
            },
            {
              type: "select",
              key: "method",
              label: "Method",
              value: pixelationOptions.method,
              onChange: (method) =>
                setPixelationOptions({
                  method: method as PixelationMethod,
                }),
              options: [
                { label: "Nearest-neighbor", value: PixelationMethod.Nearest },
                { label: "Box average", value: PixelationMethod.Box },
              ],
            },
            {
              type: "checkbox",
              key: "preserve",
              label: "Keep original dimensions",
              value: pixelationOptions.preserveDimensions,
              onChange: (preserveDimensions) => setPixelationOptions({ preserveDimensions }),
            },
          ]}
          actions={[
            {
              label: "Cancel",
              onClick: discardEmptyImport,
            },
            {
              label: "Keep original",
              onClick: acceptOriginalImport,
            },
            {
              label: "Pixelate & Import",
              onClick: acceptPixelatedImport,
              disabled: busy,
            },
          ]}
        />
        {saveAsOpen && (
          <Suspense fallback={null}>
            <SaveAsDialog
              open={saveAsOpen}
              documentName={state.document?.name ?? "xprite.ase"}
              defaultFormat={getFilePreferences().saveDefaultExtension as "aseprite" | "png"}
              saveTarget={saveAsTarget}
              busy={saveAsBusy}
              onOpenChange={(open) => {
                if (!open) closeSaveAs();
              }}
              onSave={saveProjectAs}
            />
          </Suspense>
        )}
        {preferencesOpen && (
          <Suspense fallback={null}>
            <PreferencesDialog
              open={preferencesOpen && workflow.prompt === null}
              onOpenChange={setPreferencesOpen}
              onReset={resetPreferences}
              appearanceMode={appearanceMode}
              onAppearanceModeChange={onAppearanceModeChange}
              onApply={() => persistAppearanceMode(appearanceMode)}
              onAccept={() => persistAppearanceMode(appearanceMode)}
              recoverySettings={recoveryState.settings}
              onRecoverySettingsChange={(settings) => {
                updateRecoverySettings(settings);
              }}
              undoOptions={getUndoOptions()}
              onUndoOptionsChange={updateUndoOptions}
              composeGroups={!!state.settings.composeGroups}
              onComposeGroupsChange={updateComposeGroups}
              sliceUseKeys={!!state.settings.sliceUseKeys}
              onSliceUseKeysChange={updateSliceUseKeys}
              guideSlicePreferences={getGuideSlicePreferences()}
              onGuideSlicePreferencesChange={setGuideSlicePreferences}
              editorPreferences={getEditorPreferences()}
              onEditorPreferencesChange={setEditorPreferences}
              cursorPreferences={getCursorPreferences()}
              onCursorPreferencesChange={setCursorPreferences}
              canvasDisplayPreferences={getCanvasDisplayPreferences()}
              onCanvasDisplayPreferencesChange={setCanvasDisplayPreferences}
              canvasDisplayDefaults={getCanvasDisplayDefaults()}
              onCanvasDisplayDefaultsChange={setCanvasDisplayDefaults}
              gridBoundsPreferences={getGridBoundsPreferences()}
              gridBoundsDefaults={getGridBoundsDefaults()}
              onGridBoundsPreferencesChange={setGridBoundsPreferences}
              onGridBoundsDefaultsChange={setGridBoundsDefaults}
              hasActiveDocument={Boolean(state.document)}
              filePreferences={getFilePreferences()}
              onFilePreferencesChange={setFilePreferences}
              selectionPreferences={editor.selectionPreferences}
              onSelectionPreferencesChange={editor.setSelectionPreferences}
              timelineInteractionPreferences={editor.timelineInteractionPreferences}
              onTimelineInteractionPreferencesChange={editor.setTimelineInteractionPreferences}
              defaultTimelineFirstFrame={editor.timelinePanelDefaults.firstFrame}
              onDefaultTimelineFirstFrameChange={editor.setDefaultTimelineFirstFrame}
              canClearRecentFiles={actions.canClearRecentFiles}
              onClearRecentFiles={actions.clearRecentFiles}
              touchInputPreferences={touchInputPreferences}
              onTouchInputPreferencesChange={updateTouchInputPreferences}
              wheelDevice={wheelDevice}
              onWheelDeviceChange={setWheelDevice}
              detectedWheelDevice={detectedWheelDevice}
              onHelp={() =>
                window.open(
                  "https://www.aseprite.org/docs/preferences/",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              onLanguageHelp={() =>
                window.open("https://www.aseprite.org/languages/", "_blank", "noopener,noreferrer")
              }
            />
          </Suspense>
        )}
        {dialog === "text" && (
          <Suspense fallback={null}>
            <TextDialog
              open={dialog === "text" && workflow.prompt === null}
              onOpenChange={(open) => {
                if (!open) setDialog(null);
              }}
              text={text}
              fontSize={textSize}
              fontName={state.settings.textFontFamily}
              bold={state.settings.textBold}
              italic={state.settings.textItalic}
              antialias={state.settings.textAntialias}
              color={formatEditorColor(state.settings.foreground)}
              disabled={!state.settings.font}
              validateText={validateText}
              onAccept={acceptText}
            />
          </Suspense>
        )}
        {dialog === "color" && (
          <Suspense fallback={null}>
            <ColorPicker
              key={colorTarget}
              anchor={{
                x: 4,
                y: (colorTarget === "foreground" ? 952 : 990) + sceneBounds.height - 1050,
                width: 148,
                height: 30,
              }}
              open={dialog === "color" && workflow.prompt === null}
              onOpenChange={(open) => {
                if (!open) setDialog(null);
              }}
              title={colorTarget === "foreground" ? "Foreground Color" : "Background Color"}
              value={formatEditorColor(state.settings[colorTarget])}
              onValueChange={(value) =>
                colorTarget === "foreground"
                  ? editor.setForeground(value)
                  : editor.setBackground(value)
              }
              onScreenColorChange={(value) => editor.setSampledColor(colorTarget, value)}
            />
          </Suspense>
        )}
        <FormDialog
          open={!!error}
          onOpenChange={(open) => {
            if (!open) {
              dismissError();
            }
          }}
          title="Image Editor"
          message={error}
          fields={[]}
          actions={[
            ...(canSaveErrorAs ? [{ label: "Save As...", onClick: saveErrorAs }] : []),
            {
              label: "OK",
              onClick: () => {
                dismissError();
              },
            },
          ]}
        />
        <FormDialog
          open={exitNotice}
          onOpenChange={setExitNotice}
          title="Exit"
          fields={[]}
          message="Your document is closed. This browser cannot close a user-opened tab; use the browser tab's close control to exit."
          actions={[{ label: "OK", onClick: () => setExitNotice(false) }]}
        />
        {(busy || workspaceSnapshot.importBatch) && (
          <div className={styles.busy}>
            <span role="status">
              <Text variant={TextVariant.Inline} scale={2}>
                {workspaceSnapshot.importBatch
                  ? tUi("ui.import.batch.progress", workspaceSnapshot.importBatch)
                  : tUi("ui.reading.image")}
              </Text>
            </span>
            {workspaceSnapshot.importBatch && (
              <Button onClick={cancelFileImport}>{tUi("ui.import.batch.cancel")}</Button>
            )}
          </div>
        )}
      </EditorActionsContext.Provider>
    </TooltipProvider>
  );
}
