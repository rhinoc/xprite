import { useEffect, useRef, useState } from "react";

import { useDocumentFeatureActions } from "$/components/dialogs/document-feature-dialogs";
import { useEffectActions } from "$/components/dialogs/effect-actions";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { useGridActions } from "$/components/dialogs/grid-settings";
import { UndoHistoryWindow } from "$/components/dialogs/undo-history-window";
import { useEditorLayout } from "$/components/shared/editor-layout-context";
import { PixelArtIcon } from "$/components/shared/pixel-art-icon";
import { useEditorActions } from "$/components/shell/editor-actions";
import { mapMenuCatalog, type MenuCommandCapability } from "$/components/shell/menu-catalog";
import { useAnimationActions } from "$/components/timeline/animation-actions";
import { useLayerCommandActions } from "$/components/timeline/layer-command-actions";
import { useTimelineActions } from "$/components/timeline/timeline-actions";
import { useSelectionActions } from "$/components/tools/selection-actions";
import { TilemapDialog } from "$/components/tools/tilemap-controls";
import { tUi, useUiLanguage } from "$/i18n";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { useInputInteractionMode } from "$/managers/input/input-interaction-context";
import { MenuCheckKind, unsupportedMenuCheck } from "$/managers/menus/menu-checks";
import { usePwaManager, usePwaState } from "$/managers/pwa/pwa-context";
import { PwaInstallMethod } from "$/managers/pwa/pwa-manager";
import { useReplayCommands } from "$/managers/replay/replay-context";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import {
  MenuDocumentShowOption,
  MenuDocumentViewTarget,
  MenuEffectKind,
  MenuFlipOrientation,
  useEditorMenuModel,
  type MenuSelectionModifier,
} from "$/managers/shell/editor-menu-model";
import { SHORTCUT_DEFINITIONS, ShortcutBindingKind } from "$/managers/shortcuts/shortcut-manager";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import { WorkspaceContextPresentation } from "$/managers/workspace/workspace-panel-layout";
import catalog from "$assets/commands/libresprite-main-menu.json";
import { Menu, MenuCheckType, Menubar, Tooltip } from "@xprite/ui";
import { uiFontHeight } from "@xprite/ui/assets";
import { UI_SCALE_Y } from "@xprite/ui/canvas";

import "$/components/shell/editor-menubar.module.css";

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3] as const;
const PLAYBACK_TOGGLES: Readonly<
  Record<string, "playOnce" | "playAll" | "playSubtags" | "rewindOnStop">
> = {
  TogglePlayOnce: "playOnce",
  TogglePlayAll: "playAll",
  TogglePlaySubtags: "playSubtags",
  ToggleRewindOnStop: "rewindOnStop",
};

/** Product menu hierarchy with the supported browser editor capabilities attached. */
export function EditorMenubar({ presentation }: { presentation?: "bar" | "rail" } = {}) {
  useUiLanguage();
  const { manager: replay, snapshot: replayCommands } = useReplayCommands();
  const [tilemapDialog, setTilemapDialog] = useState<"new" | "convert" | null>(null);
  const [undoHistoryOpen, setUndoHistoryOpen] = useState(false);
  const [colorModeOptionsOpen, setColorModeOptionsOpen] = useState(false);
  const [targetColorDepth, setTargetColorDepth] = useState<8 | 16 | 32>(8);
  const [conversionDither, setConversionDither] = useState<"none" | "ordered" | "floyd-steinberg">(
    "none",
  );
  const [grayscaleMethod, setGrayscaleMethod] = useState<"luma" | "hsv" | "hsl">("luma");
  const [conversionError, setConversionError] = useState("");
  const layout = useEditorLayout();
  const pwaManager = usePwaManager();
  const pwaState = usePwaState();
  const chromePreferences = useEditorChromePreferences();
  const inputInteractionMode = useInputInteractionMode();
  const menuInRail = presentation ? presentation === "rail" : inputInteractionMode === "touch";
  const menuHeight = uiFontHeight() + 8;
  const gridActions = useGridActions();
  const effectActions = useEffectActions(),
    animationActions = useAnimationActions();
  const editor = useEditorFields([
    "openTab",
    "previewVisible",
    "setFrame",
    "setNotice",
    "setPlaying",
    "setPreviewVisible",
    "setTimelineVisible",
    "tab",
    "timelineVisible",
  ]);
  const menu = useEditorMenuModel();
  const editorCommands = menu.commands;
  const actions = useEditorActions()!;
  const state = menu.snapshot;
  const documentUnavailable = actions.recoveryOpen || editor.tab !== "document" || !state.document;
  const can = menu.can;
  const viewTarget =
    editor.tab === "home" || documentUnavailable
      ? MenuDocumentViewTarget.Defaults
      : MenuDocumentViewTarget.Document;
  const viewOptions =
    viewTarget === MenuDocumentViewTarget.Defaults ? state.defaultDocumentView : state.view;
  const timeline = state.document?.timeline;
  const frameCount = timeline?.frames.length ?? 0;
  const hasDocumentTimeline = !documentUnavailable && !!timeline;
  const playback = menu.playback;
  const activeLayer = timeline?.layers[timeline.activeLayer];
  const activeImageLayer =
    !!state.document && (!timeline || (!!activeLayer && activeLayer.kind !== "group"));
  const canEditActiveImage =
    !documentUnavailable &&
    actions.canStartInteraction &&
    activeImageLayer &&
    !!state.document?.layer.visible &&
    !state.document?.layer.locked &&
    (!timeline || menu.canEditLayer(timeline.activeLayer));
  const selectedFrames = timeline?.range?.frames ?? (timeline ? [timeline.activeFrame] : []);
  const duplicateDestination = selectedFrames.length
    ? Math.max(...selectedFrames) + Math.max(...selectedFrames) - Math.min(...selectedFrames) + 1
    : 4096;
  const timelineActions = useTimelineActions();
  const sizeActions = useDocumentFeatureActions(),
    selectionActions = useSelectionActions();
  const clip = actions.clipboardCapabilities;
  const layerCommands = useLayerCommandActions();
  const commands: Record<string, MenuCommandCapability> = {
    CloseFile: {
      onSelect: actions.closeDocument,
      disabled: (!actions.recoveryOpen && editor.tab === "home") || !actions.canStartInteraction,
    },
    CloseAllFiles: {
      onSelect: actions.closeAllDocuments,
      disabled: !actions.documentTabs.length || !actions.canStartInteraction,
    },
    Exit: { onSelect: actions.exit, disabled: !actions.canStartInteraction },
    NewFile: { onSelect: actions.new, disabled: !actions.canStartInteraction },
    Options: {
      onSelect: actions.preferences,
      disabled: !actions.canStartInteraction,
    },
    OpenFile: {
      onSelect: actions.open,
      disabled: !actions.canStartInteraction,
    },
    ReopenClosedFile: {
      onSelect: actions.reopenClosedFile,
      disabled: !actions.canReopenClosedFile || !actions.canStartInteraction,
    },
    ClearRecentFiles: {
      onSelect: actions.clearRecentFiles,
      disabled: !actions.canClearRecentFiles || !actions.canStartInteraction,
    },
    SaveFile: {
      onSelect: actions.save,
      disabled: !can("save") || !actions.canSave,
    },
    SaveFileAs: {
      onSelect: actions.saveAs,
      disabled: !can("export") || !actions.canSave,
    },
    SaveFileCopyAs: {
      onSelect: actions.exportCopy,
      disabled: !can("export") || !actions.canSave,
    },
    Share: {
      onSelect: actions.share,
      disabled: !can("export") || !actions.canSave || !actions.share,
    },
    Fill: {
      onSelect: () => editorCommands.selection.fillSelection(),
      disabled: !canEditActiveImage,
    },
    Stroke: {
      onSelect: () => editorCommands.selection.strokeSelection(),
      disabled: !canEditActiveImage,
    },
    MaskContent: {
      onSelect: () => editorCommands.selection.selectCelContent(),
      disabled:
        documentUnavailable ||
        !actions.canStartInteraction ||
        !editorCommands.selection.canSelectCelContent(),
    },
    Copy: { onSelect: actions.copy, disabled: !clip?.canCopy || !actions.canStartInteraction },
    CopyMerged: {
      onSelect: actions.copyMerged,
      disabled: !clip?.canCopyMerged || !actions.canStartInteraction,
    },
    Cut: { onSelect: actions.cut, disabled: !clip?.canCut || !actions.canStartInteraction },
    Paste: { onSelect: actions.paste, disabled: !clip?.canPaste || !actions.canStartInteraction },
    NewSpriteFromSelection: {
      onSelect: actions.newSpriteFromSelection,
      disabled: documentUnavailable || !state.document?.selection || !actions.canStartInteraction,
    },
    DuplicateSprite: {
      onSelect: actions.duplicateSprite,
      disabled: documentUnavailable || !actions.canStartInteraction,
    },
    KeyboardShortcuts: { onSelect: actions.keyboardShortcuts },
    SpriteSize: {
      onSelect: () => sizeActions?.openSpriteSize(),
      disabled: documentUnavailable || !sizeActions,
    },
    SpriteProperties: {
      onSelect: () => timelineActions?.openSpritePropertiesDialog?.(),
      disabled: documentUnavailable || !timelineActions?.openSpritePropertiesDialog,
    },
    CanvasSize: {
      onSelect: () => sizeActions?.openCanvasSize(),
      disabled: documentUnavailable || !sizeActions,
    },
    CropSprite: {
      onSelect: () => editorCommands.imageEditing.cropSprite(),
      disabled: documentUnavailable || !state.document?.selection,
    },
    AutocropSprite: {
      onSelect: () => editorCommands.imageEditing.trimSprite(),
      disabled: documentUnavailable,
    },
    ReselectMask: {
      onSelect: () => editorCommands.selection.reselect(),
      disabled: documentUnavailable || !editorCommands.selection.canReselect(),
    },
    MaskByColor: {
      onSelect: () => selectionActions?.openColorRange(),
      disabled:
        documentUnavailable || !editorCommands.selection.canColorRange() || !selectionActions,
    },
    DuplicateLayer: {
      onSelect: () => editorCommands.timeline.duplicateLayer(),
      disabled: !hasDocumentTimeline,
    },
    MergeDownLayer: {
      onSelect: () => editorCommands.timeline.mergeDown(),
      disabled: !hasDocumentTimeline || !menu.canMergeDown(),
    },
    FlattenLayers: {
      onSelect: () => editorCommands.timeline.flattenLayers(false),
      disabled: !hasDocumentTimeline,
    },
    OpenGroup: {
      onSelect: () => editorCommands.timeline.toggleActiveGroup(),
      disabled: !hasDocumentTimeline || timeline?.layers[timeline.activeLayer].kind !== "group",
    },
    Undo: {
      onSelect: () => editorCommands.history.undo(),
      disabled: !can("undo"),
    },
    Redo: { onSelect: () => editorCommands.history.redo(), disabled: !can("redo") },
    UndoHistory: { onSelect: () => setUndoHistoryOpen(true), disabled: documentUnavailable },
    PasteText: {
      onSelect: actions.text,
      disabled: !can("insert-text") || !actions.canStartInteraction,
    },
    MaskAll: { onSelect: () => editorCommands.selection.selectAll(), disabled: !can("select-all") },
    InvertMask: {
      onSelect: () => editorCommands.selection.invert(),
      disabled: !can("invert-selection"),
    },
    Clear: {
      onSelect: () => editorCommands.selection.clearSelectionPixels(),
      disabled: !can("clear"),
    },
    DeselectMask: {
      onSelect: () => editorCommands.selection.deselect(),
      disabled: !can("deselect"),
    },
    LayerVisibility: {
      onSelect: () => editorCommands.timeline.setLayerVisible(!state.document?.layer.visible),
      disabled: !can("layer-visibility"),
      checked: !documentUnavailable && !!state.document?.layer.visible,
      checkType: MenuCheckType.Checkbox,
    },
    LayerLock: {
      onSelect: () => editorCommands.timeline.setLayerLocked(!state.document?.layer.locked),
      disabled: !can("layer-lock"),
      checked: !documentUnavailable && !!state.document?.layer.locked,
      checkType: MenuCheckType.Checkbox,
    },
    LayerProperties: {
      onSelect: () => timelineActions?.openLayerPropertiesDialog(),
      disabled: !hasDocumentTimeline || !timelineActions,
    },
    RemoveLayer: {
      onSelect: () => editorCommands.timeline.deleteLayer(),
      disabled: !hasDocumentTimeline || timeline!.layers.length <= 1,
    },
    NewLayer: {
      onSelect: () => editorCommands.timeline.addLayer(),
      disabled: !hasDocumentTimeline || timeline!.layers.length >= 256,
    },
    NewFrame: {
      onSelect: () => editorCommands.timeline.addFrame(true),
      disabled: !hasDocumentTimeline || frameCount >= 4096,
    },
    RemoveFrame: {
      onSelect: () => editorCommands.timeline.deleteFrame(),
      disabled: !hasDocumentTimeline || frameCount <= 1,
    },
    FrameProperties: {
      onSelect: () => timelineActions?.openFramePropertiesDialog("current"),
      disabled: !hasDocumentTimeline || !timelineActions,
    },
    CelProperties: {
      onSelect: () => timelineActions?.openCelPropertiesDialog?.(),
      disabled:
        !hasDocumentTimeline ||
        !timelineActions?.openCelPropertiesDialog ||
        !timeline?.frames[timeline.activeFrame]?.cels[timeline.activeLayer],
    },
    PlayAnimation: {
      onSelect: () => editor.setPlaying((value) => !value),
      disabled: !hasDocumentTimeline,
    },
    GotoPreviousFrameWithSameTag: {
      onSelect: () => editorCommands.timeline.stepFrame(-1, true),
      disabled: !hasDocumentTimeline,
    },
    GotoNextFrameWithSameTag: {
      onSelect: () => editorCommands.timeline.stepFrame(1, true),
      disabled: !hasDocumentTimeline,
    },
    GotoFirstFrame: {
      onSelect: () => editor.setFrame(1),
      disabled: !hasDocumentTimeline,
    },
    GotoPreviousFrame: {
      onSelect: () => editorCommands.timeline.stepFrame(-1),
      disabled: !hasDocumentTimeline,
    },
    GotoNextFrame: {
      onSelect: () => editorCommands.timeline.stepFrame(1),
      disabled: !hasDocumentTimeline,
    },
    GotoLastFrame: {
      onSelect: () => editor.setFrame(frameCount),
      disabled: !hasDocumentTimeline,
    },
    ExportAnimalCrossing: {
      onSelect: actions.exportAnimalCrossing,
      disabled: documentUnavailable || !actions.exportAnimalCrossing,
    },
    ExportTileset: {
      onSelect: actions.exportTileset,
      disabled:
        documentUnavailable ||
        !actions.exportTileset ||
        timeline?.layers[timeline.activeLayer]?.kind !== "tilemap",
    },
    ExportSpriteSheet: {
      onSelect: actions.exportSpriteSheet,
      disabled: documentUnavailable || !actions.exportSpriteSheet,
    },
    ImportSpriteSheet: {
      onSelect: actions.importSpriteSheet,
      disabled: documentUnavailable || !actions.importSpriteSheet,
    },
    RepeatLastExport: {
      onSelect: actions.repeatLastExport,
      disabled: documentUnavailable || !actions.canRepeatExport,
    },
    GridSettings: {
      onSelect: () => gridActions?.openGridSettings?.(),
      disabled: documentUnavailable || !gridActions,
    },
    SelectionAsGrid: {
      onSelect: () => {
        const m = state.document?.selection;
        if (m)
          editorCommands.canvas.setGridBounds({ x: m.x, y: m.y, width: m.width, height: m.height });
      },
      disabled: documentUnavailable || !state.document?.selection,
    },
    SnapToGrid: {
      onSelect: () =>
        editorCommands.canvas.setDocumentViewOptions({ snapToGrid: !state.view.snapToGrid }),
      checked: !!state.view.snapToGrid,
      checkType: MenuCheckType.Checkbox,
      disabled: documentUnavailable,
    },
    SymmetryMode: {
      onSelect: () => editorCommands.drawing.setSymmetryEnabled(!state.settings.symmetryEnabled),
      checked: !!state.settings.symmetryEnabled,
      checkType: MenuCheckType.Checkbox,
      disabled: documentUnavailable,
    },
    ShowOnionSkin: {
      onSelect: () =>
        editorCommands.timeline.setOnionSkin({ active: !state.view.onionSkin?.active }),
      checked: !!state.view.onionSkin?.active,
      checkType: MenuCheckType.Checkbox,
      disabled: !hasDocumentTimeline,
    },
    TogglePreview: {
      onSelect: () => editor.setPreviewVisible((v) => !v),
      checked: editor.previewVisible,
      checkType: MenuCheckType.Checkbox,
      disabled: documentUnavailable,
    },
    PlayPreviewAnimation: {
      onSelect: () => animationActions?.playPreview(),
      disabled: !hasDocumentTimeline || !animationActions,
    },
    ReverseFrames: {
      onSelect: () => editorCommands.timeline.reverseFrames(),
      disabled: !can("reverse-frames"),
    },
    ShowGrid: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(MenuDocumentShowOption.Grid, viewTarget),
      checked: viewOptions.grid,
      checkType: MenuCheckType.Checkbox,
    },
    ShowAutoGuides: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(MenuDocumentShowOption.Guides, viewTarget),
      checked: viewOptions.guides,
      checkType: MenuCheckType.Checkbox,
    },
    ShowLayerEdges: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(
          MenuDocumentShowOption.LayerEdges,
          viewTarget,
        ),
      checked: viewOptions.layerEdges,
      checkType: MenuCheckType.Checkbox,
    },
    ShowSelectionEdges: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(
          MenuDocumentShowOption.SelectionEdges,
          viewTarget,
        ),
      checked: viewOptions.selectionEdges,
      checkType: MenuCheckType.Checkbox,
    },
    ShowPixelGrid: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(
          MenuDocumentShowOption.PixelGrid,
          viewTarget,
        ),
      checked: viewOptions.pixelGrid,
      checkType: MenuCheckType.Checkbox,
    },
    ShowSlices: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(MenuDocumentShowOption.Slices, viewTarget),
      checked: viewOptions.slices ?? true,
      checkType: MenuCheckType.Checkbox,
    },
    ShowTileNumbers: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(
          MenuDocumentShowOption.TileNumbers,
          viewTarget,
        ),
      checked: viewOptions.tileNumbers ?? true,
      checkType: MenuCheckType.Checkbox,
    },
    ShowBrushPreview: {
      onSelect: () =>
        editorCommands.canvas.toggleDocumentViewOption(
          MenuDocumentShowOption.BrushPreview,
          viewTarget,
        ),
      checked: viewOptions.brushPreview,
      checkType: MenuCheckType.Checkbox,
    },
    Timeline: {
      onSelect: () => editor.setTimelineVisible((value) => !value),
      checked: editor.tab === "document" && editor.timelineVisible,
      checkType: MenuCheckType.Checkbox,
    },
    Home: {
      onSelect: () => {
        actions.leaveRecovery?.();
        editor.openTab("home");
      },
      disabled: editor.tab === "home" && !actions.recoveryOpen,
    },
  };
  const shortcutManager = useShortcutManager();
  const menuCapabilities = new Map<string, MenuCommandCapability>();
  const catalogMenus = mapMenuCatalog(catalog.menus, {
    shortcut: (node) =>
      node.command
        ? (shortcutManager?.formatShortcut(
            node.command,
            node.params as Record<string, string>,
            node.shortcut,
          ) ?? node.shortcut)
        : node.shortcut,
    onResolved: (node, capability) => {
      const definition = SHORTCUT_DEFINITIONS.find(
        (entry) =>
          entry.kind === ShortcutBindingKind.Command &&
          entry.id === node.command &&
          JSON.stringify(entry.params ?? {}) === JSON.stringify(node.params ?? {}),
      );
      if (definition && !definition.command) menuCapabilities.set(definition.key, capability);
    },
    recentFiles: actions.recentFiles,
    openRecent: actions.openRecent,
    resolve: (node) => {
      // A shared command ID does not imply support for a different parameter mode.
      if (node.command === "TiledMode") {
        const modes: Record<string, 0 | 1 | 2 | 3> = { none: 0, both: 3, x: 1, y: 2 };
        const mode = modes[node.params?.axis ?? "none"];
        if (mode === undefined) return undefined;
        return {
          onSelect: () => editorCommands.canvas.setDocumentViewOptions({ tiledMode: mode }),
          disabled: documentUnavailable,
          checked: (state.view.tiledMode ?? 0) === mode,
          checkType: MenuCheckType.Radio,
        };
      }
      if (node.command === "Flip") {
        const orientation = node.params?.orientation;
        if (
          orientation !== MenuFlipOrientation.Horizontal &&
          orientation !== MenuFlipOrientation.Vertical
        )
          return undefined;
        if (node.params?.target === "mask")
          return {
            onSelect: () => editorCommands.selection.flipSelection(orientation),
            disabled:
              documentUnavailable ||
              !state.document?.selection ||
              !!state.document?.layer.locked ||
              (!!timeline && !menu.canEditLayer(timeline.activeLayer)),
          };
        if (node.params?.target !== "canvas") return undefined;
        return {
          onSelect: () => editorCommands.imageEditing.flipCanvas(orientation),
          disabled: documentUnavailable,
        };
      }
      if (node.command === "NewFile" && node.params?.fromClipboard === "true")
        return {
          onSelect: actions.pasteNewSprite,
          disabled: !clip?.canPasteNewSprite || !actions.canStartInteraction,
        };
      if (node.command === "NewFile" && Object.keys(node.params ?? {}).length) return undefined;
      if (node.command === "Rotate") {
        const angle = Number(node.params?.angle);
        if (![90, -90, 180].includes(angle)) return undefined;
        if (node.params?.target === "mask")
          return {
            onSelect: () => editorCommands.selection.rotateSelection(angle),
            disabled:
              documentUnavailable ||
              !actions.canStartInteraction ||
              !editorCommands.selection.canRotateSelection(),
          };
        if (node.params?.target === "canvas")
          return {
            onSelect: () => editorCommands.imageEditing.rotateCanvas(angle as 90 | -90 | 180),
            disabled: documentUnavailable,
          };
        return undefined;
      }
      if (node.command === "MoveMask") {
        const params = node.params ?? {};
        if (
          params.target !== "content" ||
          params.units !== "pixel" ||
          params.quantity !== "1" ||
          params.wrap !== "1"
        )
          return undefined;
        const delta =
          params.direction === "left"
            ? [-1, 0]
            : params.direction === "right"
              ? [1, 0]
              : params.direction === "up"
                ? [0, -1]
                : params.direction === "down"
                  ? [0, 1]
                  : undefined;
        if (!delta) return undefined;
        return {
          onSelect: () => editorCommands.selection.shiftSelectionContents(delta[0], delta[1]),
          disabled:
            documentUnavailable ||
            !actions.canStartInteraction ||
            !editorCommands.selection.canShiftSelectionContents(),
        };
      }
      if (node.command === "ModifySelection")
        return {
          onSelect: () =>
            selectionActions?.openModifySelection(node.params?.modifier as MenuSelectionModifier),
          disabled: documentUnavailable || !state.document?.selection || !selectionActions,
        };
      if (node.command === "FlattenLayers")
        return {
          onSelect: () =>
            editorCommands.timeline.flattenLayers(node.params?.visibleOnly === "true"),
          disabled: !hasDocumentTimeline,
        };
      if (node.command === "ConvertLayer" && node.params?.to === "tilemap")
        return {
          onSelect: () => setTilemapDialog("convert"),
          disabled:
            !hasDocumentTimeline ||
            !timeline ||
            !menu.canEditLayer(timeline.activeLayer) ||
            timeline.layers[timeline.activeLayer].kind === "tilemap" ||
            !!(timeline.layers[timeline.activeLayer].flags & 8),
        };
      if (
        node.command === "ConvertLayer" &&
        node.params?.to === "layer" &&
        timeline?.layers[timeline.activeLayer].kind === "tilemap"
      )
        return {
          onSelect: () => editorCommands.tilemap.convertLayerTilemap(false),
          disabled: !hasDocumentTimeline || !menu.canEditLayer(timeline.activeLayer),
        };
      if (
        node.command === "ConvertLayer" &&
        ["background", "layer"].includes(node.params?.to ?? "")
      )
        return {
          onSelect: () =>
            editorCommands.sprite.convertLayerBackground(node.params?.to === "background"),
          disabled:
            !hasDocumentTimeline || !menu.canConvertBackground(node.params?.to === "background"),
        };
      if (node.command === "ChangePixelFormat") {
        const depths: Record<string, 8 | 16 | 32> = { rgb: 32, grayscale: 16, indexed: 8 };
        const depth = depths[node.params?.format ?? ""];
        if (depth === undefined)
          return {
            onSelect: () => {
              const current = state.document?.timeline?.colorDepth ?? 32;
              setTargetColorDepth(current === 8 ? 32 : 8);
              setConversionError("");
              setColorModeOptionsOpen(true);
            },
            disabled: documentUnavailable,
          };
        return {
          onSelect: () => {
            try {
              editorCommands.imageEditing.convertColorMode(depth);
            } catch (error) {
              editor.setNotice(
                error instanceof Error ? error.message : "Unable to convert color mode",
              );
            }
          },
          disabled: documentUnavailable,
          checked: !documentUnavailable && (state.document?.timeline?.colorDepth ?? 32) === depth,
          checkType: MenuCheckType.Radio,
        };
      }
      if (node.command === "Timeline" && node.params?.switch !== "true") return undefined;
      if (node.command === "NewLayer") {
        const params = node.params ?? {};
        if (params.tilemap === "true")
          return {
            onSelect: () => setTilemapDialog("new"),
            disabled: !hasDocumentTimeline || !actions.canStartInteraction,
          };
        // Parameter variants have distinct product semantics; bind only the
        // supported group, reference-file and clipboard operations.
        if (params.reference === "true" && params.fromFile === "true")
          return {
            onSelect: () => layerCommands?.openReferenceLayer(),
            disabled: !hasDocumentTimeline || !layerCommands,
          };
        if (params.group === "true")
          return {
            onSelect: () => editorCommands.timeline.addGroup(),
            disabled: !hasDocumentTimeline,
          };
        if (params.viaCopy === "true" || params.viaCut === "true")
          return {
            onSelect: () => editorCommands.clipboard.newLayerViaSelection(params.viaCut === "true"),
            disabled:
              !hasDocumentTimeline || !state.document?.selection || !actions.canStartInteraction,
          };
        if (params.reference === "true" && params.fromClipboard === "true")
          return {
            onSelect: actions.pasteNewReferenceLayer,
            disabled: !clip?.canPasteNewLayer || !actions.canStartInteraction,
          };
        if (params.fromClipboard === "true" && !params.reference)
          return {
            onSelect: actions.pasteNewLayer,
            disabled: !clip?.canPasteNewLayer || !actions.canStartInteraction,
          };
        return Object.keys(params).length ? undefined : commands.NewLayer;
      }
      if (node.command === "NewFrame") {
        const content = node.params?.content;
        if (!content) return commands.NewFrame;
        if (content === "empty")
          return {
            onSelect: () => editorCommands.timeline.addFrame(false),
            disabled: !hasDocumentTimeline || frameCount >= 4096,
          };
        if (content === "celcopies" || content === "cellinked")
          return {
            onSelect: () => editorCommands.timeline.duplicateCels(content === "cellinked"),
            disabled:
              !hasDocumentTimeline ||
              !timeline!.layers.some((_, i) => menu.canEditLayer(i)) ||
              duplicateDestination >= 4096,
          };
        return undefined;
      }
      if (node.command === "SetPlaybackSpeed") {
        const speed = Number(node.params?.multiplier);
        if (!PLAYBACK_SPEEDS.includes(speed as (typeof PLAYBACK_SPEEDS)[number])) return undefined;
        return {
          onSelect: () => editorCommands.timeline.setPlaybackOptions({ speed }),
          checked: playback.speed === speed,
          checkType: MenuCheckType.Radio,
          disabled: !hasDocumentTimeline,
        };
      }
      const playbackToggle = node.command ? PLAYBACK_TOGGLES[node.command] : undefined;
      if (playbackToggle) {
        return {
          onSelect: () => {
            const enabled = !playback[playbackToggle];
            if (playbackToggle === "playOnce")
              editorCommands.timeline.setPlaybackOptions({ playOnce: enabled });
            else if (playbackToggle === "playAll")
              editorCommands.timeline.setPlaybackOptions({ playAll: enabled });
            else if (playbackToggle === "playSubtags")
              editorCommands.timeline.setPlaybackOptions({ playSubtags: enabled });
            else editorCommands.timeline.setPlaybackOptions({ rewindOnStop: enabled });
          },
          checked: playback[playbackToggle],
          checkType: MenuCheckType.Checkbox,
          disabled: !hasDocumentTimeline,
        };
      }
      if (node.command === "FrameTagProperties")
        return {
          onSelect: () => timelineActions?.openTagPropertiesDialog?.(),
          disabled: !hasDocumentTimeline || !timelineActions?.openTagPropertiesDialog,
        };
      if (node.command === "NewFrameTag")
        return {
          onSelect: () => timelineActions?.newTagDialog?.(),
          disabled: !hasDocumentTimeline || !timelineActions?.newTagDialog,
        };
      if (node.command === "RemoveFrameTag")
        return {
          onSelect: () => timelineActions?.deleteCurrentTag?.(),
          disabled: !hasDocumentTimeline || !timelineActions?.deleteCurrentTag,
        };
      if (node.command === "GotoFirstFrameInTag" || node.command === "GotoLastFrameInTag")
        return {
          onSelect: () =>
            editorCommands.timeline.goToTagBoundary(node.command === "GotoLastFrameInTag"),
          disabled: !hasDocumentTimeline,
        };
      if (node.command === "GotoFrame")
        return {
          onSelect: () => timelineActions?.openGotoFrameDialog?.(),
          disabled: !hasDocumentTimeline || !timelineActions?.openGotoFrameDialog,
        };
      if (node.command === "SetLoopSection")
        return {
          onSelect: () => {
            if (editorCommands.timeline.setLoopSection())
              timelineActions?.openTagPropertiesDialog?.();
          },
          disabled: !hasDocumentTimeline,
        };
      if (node.command === "FrameProperties") {
        const frame = node.params?.frame;
        if (frame === "current") return commands.FrameProperties;
        if (frame === "all")
          return {
            onSelect: () => timelineActions?.openFramePropertiesDialog("all"),
            disabled: !hasDocumentTimeline || !timelineActions,
          };
        return undefined;
      }
      const effectKinds: Record<string, MenuEffectKind> = {
        ReplaceColor: MenuEffectKind.ReplaceColor,
        HueSaturation: MenuEffectKind.HueSaturation,
        BrightnessContrast: MenuEffectKind.BrightnessContrast,
        InvertColor: MenuEffectKind.Invert,
        Outline: MenuEffectKind.Outline,
        Despeckle: MenuEffectKind.MedianBlur,
        ConvolutionMatrix: MenuEffectKind.ConvolutionMatrix,
        ColorCurve: MenuEffectKind.ColorCurve,
      };
      if (node.command && effectKinds[node.command])
        return {
          onSelect: () => effectActions?.openEffect(effectKinds[node.command!]),
          disabled: documentUnavailable || !menu.canOpenEffect() || !effectActions,
        };
      if (!node.command) return undefined;
      const capability = commands[node.command];
      if (capability) return capability;
      const checked = unsupportedMenuCheck(node.command, node.params);
      return checked
        ? {
            ...checked,
            checkType:
              checked.checkType === MenuCheckKind.Radio
                ? MenuCheckType.Radio
                : MenuCheckType.Checkbox,
            disabled: true,
          }
        : undefined;
    },
  });
  const menus = catalogMenus.map((topMenu) => {
    if (topMenu.label === "Sprite")
      return {
        ...topMenu,
        items: [
          ...topMenu.items,
          {
            label: tUi("replay.menu"),
            separator: true,
            children: [
              {
                label: tUi(
                  replayCommands.recording
                    ? "replay.showBar"
                    : replayCommands.canContinue
                      ? "replay.continue"
                      : "replay.start",
                ),
                onSelect: replay.openRecording,
                disabled:
                  !actions.canStartInteraction || replayCommands.busy || !replayCommands.canRecord,
              },
              {
                label: tUi("replay.stop"),
                onSelect: replay.stop,
                disabled: !actions.canStartInteraction || !replayCommands.recording,
              },
              {
                label: tUi("replay.title"),
                separator: true,
                onSelect: () => replay.setOpen(true),
                disabled:
                  !actions.canStartInteraction || replayCommands.busy || replayCommands.recording,
              },
            ],
          },
        ],
      };
    if (topMenu.label !== "View") return topMenu;
    return {
      ...topMenu,
      items: [
        ...topMenu.items.map((item) =>
          item.label === "Show"
            ? {
                ...item,
                children: [
                  ...(item.children ?? []),
                  {
                    label: "Editor Menu Bar",
                    separator: true,
                    checked: chromePreferences.showEditorMenuBar,
                    checkType: MenuCheckType.Checkbox,
                    onSelect: () =>
                      chromePreferences.patchPreferences({
                        showEditorMenuBar: !chromePreferences.showEditorMenuBar,
                      }),
                  },
                  {
                    label: "Shortcut Toolbar",
                    checked: chromePreferences.showShortcutToolbar,
                    checkType: MenuCheckType.Checkbox,
                    onSelect: () =>
                      chromePreferences.patchPreferences({
                        showShortcutToolbar: !chromePreferences.showShortcutToolbar,
                      }),
                  },
                  {
                    label: "Tool Options Toolbar",
                    checked:
                      chromePreferences.contextBarPresentation ===
                      WorkspaceContextPresentation.Docked,
                    checkType: MenuCheckType.Checkbox,
                    onSelect: () =>
                      chromePreferences.patchPreferences({
                        contextBarPresentation:
                          chromePreferences.contextBarPresentation ===
                          WorkspaceContextPresentation.Docked
                            ? WorkspaceContextPresentation.ToolPopup
                            : WorkspaceContextPresentation.Docked,
                      }),
                  },
                  {
                    label: "Canvas Scrollbars",
                    checked: chromePreferences.showCanvasScrollbars,
                    checkType: MenuCheckType.Checkbox,
                    onSelect: () =>
                      chromePreferences.patchPreferences({
                        showCanvasScrollbars: !chromePreferences.showCanvasScrollbars,
                      }),
                  },
                ],
              }
            : item,
        ),
        {
          label: "Previous Tab",
          separator: true,
          shortcut: shortcutManager?.formatShortcut("GotoPreviousTab"),
          onSelect: actions.previousDocumentTab,
          disabled: !actions.canSelectOtherDocumentTab,
        },
        {
          label: "Next Tab",
          shortcut: shortcutManager?.formatShortcut("GotoNextTab"),
          onSelect: actions.nextDocumentTab,
          disabled: !actions.canSelectOtherDocumentTab,
        },
      ],
    };
  });
  menus.push({
    label: "Help",
    mnemonic: "H",
    mnemonicIndex: 0,
    items: [
      {
        label: tUi("ui.user.guide"),
        onSelect: actions.userGuide,
        disabled: !actions.canStartInteraction,
      },
      ...(pwaManager &&
      pwaState?.supported &&
      !pwaState.installed &&
      pwaState.installMethod === PwaInstallMethod.Prompt
        ? [
            {
              label: tUi("ui.pwa.desktop.add"),
              onSelect: () => void pwaManager.install(),
              disabled: pwaState.installBusy || !actions.canStartInteraction,
            },
          ]
        : []),
      {
        label: tUi("feedback.title"),
        onSelect: actions.feedback,
        disabled: !actions.canStartInteraction,
      },
      {
        label: "Donate",
        separator: true,
        mnemonic: "D",
        mnemonicIndex: 0,
        onSelect: actions.donate,
      },
      {
        label: "About",
        mnemonic: "A",
        mnemonicIndex: 0,
        separator: true,
        onSelect: actions.about,
        disabled: !actions.canStartInteraction,
      },
    ],
  });
  const menuCapabilitiesRef = useRef(menuCapabilities);
  menuCapabilitiesRef.current = menuCapabilities;
  const menuCapabilityKeys = [...menuCapabilities.keys()].sort().join("\n");
  useEffect(() => {
    if (!shortcutManager) return;
    const disposers = menuCapabilityKeys
      .split("\n")
      .filter(Boolean)
      .map((key) =>
        shortcutManager.registerMenuCommand(key, {
          execute: () => menuCapabilitiesRef.current.get(key)?.onSelect?.(),
          canExecute: () => {
            const capability = menuCapabilitiesRef.current.get(key);
            return !!capability?.onSelect && !capability.disabled;
          },
        }),
      );
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [shortcutManager, menuCapabilityKeys]);
  return (
    <>
      {menuInRail ? (
        <Menu
          label="Menu"
          items={menus.map((menu) => ({ label: menu.label, children: menu.items }))}
          onExpandedChange={(open) => {
            if (open) {
              actions.loadRecentFiles?.();
              actions.prepareText?.();
            }
          }}
          renderTrigger={({ buttonRef, ...props }) => (
            <Tooltip text="Menu" placement="auto" disabled={!!props["aria-expanded"]}>
              <button
                {...props}
                ref={buttonRef}
                className="xse-layout-button"
                data-touch-action="Menu"
                data-open={
                  props["aria-expanded"] === true || props["aria-expanded"] === "true"
                    ? "true"
                    : undefined
                }
                aria-label={props["aria-label"] ?? tUi("ui.menu")}
              >
                <span className="xse-menubar-toggle-icon" aria-hidden="true">
                  <PixelArtIcon name="menu" />
                </span>
              </button>
            </Tooltip>
          )}
        />
      ) : (
        <div
          className="xse-editor-menubar"
          style={{
            position: "relative",
            flex: `0 0 ${menuHeight * UI_SCALE_Y}px`,
            height: menuHeight * UI_SCALE_Y,
            width: "100%",
          }}
        >
          <Menubar
            menus={menus}
            bounds={{ x: 0, y: 0, width: layout.sceneWidth, height: menuHeight }}
            expandOnHover={chromePreferences.expandMenuBarItemsOnMouseover}
            onMenuOpen={(index) => {
              if (index === 0) actions.loadRecentFiles?.();
              if (index === 1) actions.prepareText?.();
            }}
          />
        </div>
      )}
      {tilemapDialog && !documentUnavailable && (
        <TilemapDialog
          convert={tilemapDialog === "convert"}
          onClose={() => setTilemapDialog(null)}
        />
      )}
      <UndoHistoryWindow
        open={undoHistoryOpen && !documentUnavailable}
        onOpenChange={setUndoHistoryOpen}
      />
      <FormDialog
        open={colorModeOptionsOpen && !documentUnavailable}
        onOpenChange={setColorModeOptionsOpen}
        title="Color Mode"
        message={conversionError || undefined}
        width={370}
        fields={[
          {
            key: "mode",
            label: "Convert to:",
            type: "select",
            value: String(targetColorDepth),
            onChange: (value) => setTargetColorDepth(Number(value) as 8 | 16 | 32),
            options: [
              { value: "32", label: "RGB Color" },
              { value: "16", label: "Grayscale" },
              { value: "8", label: "Indexed" },
            ],
          },
          ...(targetColorDepth === 8
            ? [
                {
                  key: "dither",
                  label: "Dithering:",
                  type: "select" as const,
                  value: conversionDither,
                  onChange: (value: string) =>
                    setConversionDither(value as typeof conversionDither),
                  options: [
                    { value: "none", label: "None" },
                    { value: "ordered", label: "Ordered" },
                    { value: "floyd-steinberg", label: "Floyd-Steinberg" },
                  ],
                },
              ]
            : []),
          ...(targetColorDepth === 16
            ? [
                {
                  key: "grayscale",
                  label: "To Grayscale:",
                  type: "select" as const,
                  value: grayscaleMethod,
                  onChange: (value: string) => setGrayscaleMethod(value as typeof grayscaleMethod),
                  options: [
                    { value: "luma", label: "Luminance" },
                    { value: "hsv", label: "HSV Value" },
                    { value: "hsl", label: "HSL Lightness" },
                  ],
                },
              ]
            : []),
        ]}
        actions={[
          {
            label: "OK",
            disabled: (state.document?.timeline?.colorDepth ?? 32) === targetColorDepth,
            onClick: () => {
              try {
                editorCommands.imageEditing.convertColorMode(targetColorDepth, {
                  dither: conversionDither,
                  grayscale: grayscaleMethod,
                });
                setConversionError("");
                setColorModeOptionsOpen(false);
              } catch (error) {
                setConversionError(
                  error instanceof Error ? error.message : "Unable to convert color mode",
                );
              }
            },
          },
          { label: "Cancel", onClick: () => setColorModeOptionsOpen(false) },
        ]}
      />
    </>
  );
}
