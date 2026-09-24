import { useEditor, useEditorFields } from "$/managers/editor/editor-state-manager";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import { useEditorSnapshot, EditorSnapshotScope } from "$/managers/editor/use-editor-snapshot";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { EditorTextFontOptions } from "$/managers/ports/platform";
import type { UserBrushSettings } from "$/managers/preferences/user-presets";
import {
  DEFAULT_TEXT_FONT_SIZE,
  editorTextFontOptions,
  normalizeTextFontSize,
  textFontSettings,
} from "$/managers/tools/text-font";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import {
  canExecuteEditorAction,
  executeEditorCommand,
  screenToDocument,
  rgbaToHex as formatColor,
} from "@xprite/editor-core";

type EditorState = ReturnType<typeof useEditor>;
type ToolContextState = Pick<
  EditorState,
  | "tool"
  | "quickTool"
  | "autoSelectLayerModifier"
  | "functional"
  | "brushSize"
  | "setBrushSize"
  | "brushShape"
  | "brushAngle"
  | "brushImage"
  | "setBrush"
  | "setBrushAngle"
  | "ink"
  | "setInk"
  | "createBrushImageFromSelection"
  | "setTool"
  | "inkOpacity"
  | "setInkOpacity"
  | "shareInk"
  | "setShareInk"
  | "inkShade"
  | "setInkShade"
  | "dynamics"
  | "setDynamics"
  | "sharedDynamics"
  | "setSharedDynamics"
  | "foreground"
  | "setForeground"
  | "background"
  | "backgroundIndex"
  | "paletteIndex"
  | "paletteEditable"
  | "setPaletteEditable"
  | "paletteAscending"
  | "applyPaletteOperation"
  | "setPaletteAscending"
  | "pixelPerfect"
  | "setPixelPerfect"
  | "pixelPerfectSupported"
  | "selectionMode"
  | "setSelectionMode"
  | "gradientType"
  | "setGradientType"
  | "gradientDither"
  | "setGradientDither"
  | "tolerance"
  | "setTolerance"
  | "fillReference"
  | "setFillReference"
  | "contiguous"
  | "setContiguous"
  | "eyedropperChannel"
  | "setEyedropperChannel"
  | "eyedropperSample"
  | "setEyedropperSample"
  | "autoSelectLayer"
  | "setAutoSelectLayer"
  | "sprayWidth"
  | "setSprayWidth"
  | "spraySpeed"
  | "setSpraySpeed"
  | "zoom"
  | "setZoom"
  | "timelineVisible"
>;

export interface ContextBarEditorModel extends ToolContextState {
  font: (EditorTextFontOptions & { enabled: boolean }) | null;
  canCreateBrushFromSelection: boolean;
  applyBrushSettings(settings: UserBrushSettings): void;
  canFitScreen: boolean;
  centerSprite(): void;
  fitScreen(): void;
  setTextSize(size: number): void;
  setTextAntialias(antialias: boolean): void;
  setTextFontFamily(family: string): void;
  setTextBold(bold: boolean): void;
  setTextItalic(italic: boolean): void;
  setTextFill(fill: boolean): void;
  setTextStrokeWidth(width: number): void;
  symmetry: { enabled: boolean; mode: number };
  setSymmetryMode(mode: number): void;
  resetSymmetryAxes(): void;
  resetSymmetryToViewCenter(): void;
}

/** Selector and command facade for the tool context bar. */
export function useContextBarEditorModel(): ContextBarEditorModel {
  const editor = useEditorFields([
    "applyPaletteOperation",
    "autoSelectLayer",
    "background",
    "backgroundIndex",
    "brushAngle",
    "brushImage",
    "brushShape",
    "brushSize",
    "contiguous",
    "createBrushImageFromSelection",
    "dynamics",
    "eyedropperChannel",
    "eyedropperSample",
    "fillReference",
    "foreground",
    "functional",
    "gradientDither",
    "gradientType",
    "ink",
    "inkOpacity",
    "inkShade",
    "paletteAscending",
    "paletteEditable",
    "paletteIndex",
    "pixelPerfect",
    "pixelPerfectSupported",
    "quickTool",
    "autoSelectLayerModifier",
    "selectionMode",
    "setAutoSelectLayer",
    "setBackground",
    "setBrush",
    "setBrushAngle",
    "setBrushSize",
    "setContiguous",
    "setDynamics",
    "setEyedropperChannel",
    "setEyedropperSample",
    "setFillReference",
    "setForeground",
    "setGradientDither",
    "setGradientType",
    "setInk",
    "setInkOpacity",
    "setInkShade",
    "setPaletteAscending",
    "setPaletteEditable",
    "setPixelPerfect",
    "setSelectionMode",
    "setShareInk",
    "setSharedDynamics",
    "setSpraySpeed",
    "setSprayWidth",
    "setTolerance",
    "setTool",
    "setZoom",
    "shareInk",
    "sharedDynamics",
    "spraySpeed",
    "sprayWidth",
    "tab",
    "timelineVisible",
    "tolerance",
    "tool",
    "zoom",
  ]);
  const { core } = useEditorManagerContext();
  const platform = useEditorPlatformPorts();
  const snapshot = useEditorSnapshot(core, false, EditorSnapshotScope.Chrome);
  const document = snapshot?.document;
  const updateTextFont = (patch: Partial<EditorTextFontOptions>) => {
    if (!core) return;
    const current = core.getSnapshot(),
      settings = current.settings,
      next = { ...editorTextFontOptions(settings), ...patch },
      text = current.inlineText?.text ?? settings.text,
      font = platform?.font.rasterize(current.view.appearance, text, next);
    core.drawing.settings.setSettings({
      ...textFontSettings(next),
      text,
      ...(font ? { font } : {}),
    });
  };
  return {
    applyBrushSettings: (settings) => {
      if (core)
        core.drawing.settings.setSettings({
          ...settings,
          ...(settings.shade
            ? { shadeIndices: settings.shade.map((color) => color.paletteIndex ?? -1) }
            : {}),
        });
      else {
        if (settings.foreground) editor.setForeground(formatColor(settings.foreground));
        if (settings.background) editor.setBackground(formatColor(settings.background));
        if (settings.ink) editor.setInk(settings.ink);
        if (settings.opacity !== undefined) editor.setInkOpacity(settings.opacity);
      }
      if (settings.shade) editor.setInkShade(settings.shade);
    },
    tool: editor.quickTool ?? editor.tool,
    quickTool: editor.quickTool,
    autoSelectLayerModifier: editor.autoSelectLayerModifier,
    functional: editor.functional,
    brushSize: editor.brushSize,
    setBrushSize: editor.setBrushSize,
    brushShape: editor.brushShape,
    brushAngle: editor.brushAngle,
    brushImage: editor.brushImage,
    setBrush: editor.setBrush,
    setBrushAngle: editor.setBrushAngle,
    ink: editor.ink,
    setInk: editor.setInk,
    createBrushImageFromSelection: editor.createBrushImageFromSelection,
    setTool: editor.setTool,
    inkOpacity: editor.inkOpacity,
    setInkOpacity: editor.setInkOpacity,
    shareInk: editor.shareInk,
    setShareInk: editor.setShareInk,
    inkShade: editor.inkShade,
    setInkShade: editor.setInkShade,
    dynamics: editor.dynamics,
    setDynamics: editor.setDynamics,
    sharedDynamics: editor.sharedDynamics,
    setSharedDynamics: editor.setSharedDynamics,
    foreground: editor.foreground,
    setForeground: editor.setForeground,
    background: editor.background,
    backgroundIndex: editor.backgroundIndex,
    paletteIndex: editor.paletteIndex,
    paletteEditable: editor.paletteEditable,
    setPaletteEditable: editor.setPaletteEditable,
    paletteAscending: editor.paletteAscending,
    applyPaletteOperation: editor.applyPaletteOperation,
    setPaletteAscending: editor.setPaletteAscending,
    pixelPerfect: editor.pixelPerfect,
    pixelPerfectSupported: editor.pixelPerfectSupported,
    selectionMode: snapshot?.preview?.selectionMode ?? editor.selectionMode,
    setSelectionMode: editor.setSelectionMode,
    gradientType: editor.gradientType,
    setGradientType: editor.setGradientType,
    gradientDither: editor.gradientDither,
    setGradientDither: editor.setGradientDither,
    tolerance: editor.tolerance,
    setTolerance: editor.setTolerance,
    fillReference: editor.fillReference,
    setFillReference: editor.setFillReference,
    contiguous: editor.contiguous,
    setContiguous: editor.setContiguous,
    eyedropperChannel: editor.eyedropperChannel,
    setEyedropperChannel: editor.setEyedropperChannel,
    eyedropperSample: editor.eyedropperSample,
    setEyedropperSample: editor.setEyedropperSample,
    autoSelectLayer: editor.autoSelectLayerModifier || editor.autoSelectLayer,
    setAutoSelectLayer: editor.setAutoSelectLayer,
    sprayWidth: editor.sprayWidth,
    setSprayWidth: editor.setSprayWidth,
    spraySpeed: editor.spraySpeed,
    setSpraySpeed: editor.setSpraySpeed,
    zoom: editor.zoom,
    setZoom: editor.setZoom,
    timelineVisible: editor.timelineVisible,
    font: core
      ? {
          enabled: Boolean(snapshot?.settings.font),
          family: snapshot?.settings.textFontFamily ?? "Aseprite",
          bold: snapshot?.settings.textBold ?? false,
          italic: snapshot?.settings.textItalic ?? false,
          size: snapshot ? editorTextFontOptions(snapshot.settings).size : DEFAULT_TEXT_FONT_SIZE,
          antialias: snapshot?.settings.textAntialias ?? false,
          fill: snapshot?.settings.textFill ?? true,
          strokeWidth: snapshot?.settings.textStrokeWidth ?? 0,
        }
      : null,
    canCreateBrushFromSelection: Boolean(document?.selection?.data.some(Boolean)),
    canFitScreen: Boolean(
      snapshot && canExecuteEditorAction("fit-screen", snapshot, editorSceneForTab(editor.tab)),
    ),
    centerSprite: () => core?.canvas.setView({ pan: { x: 0, y: 0 } }),
    fitScreen: () => {
      if (!core) return;
      executeEditorCommand(
        core,
        { type: "fit-screen" },
        {
          scene: editorSceneForTab(editor.tab),
          viewport: measuredEditorViewport(core, editor.timelineVisible),
        },
      );
    },
    setTextSize: (size) => updateTextFont({ size: normalizeTextFontSize(size) }),
    setTextAntialias: (antialias) => updateTextFont({ antialias }),
    setTextFontFamily: (family) => updateTextFont({ family }),
    setTextBold: (bold) => updateTextFont({ bold }),
    setTextItalic: (italic) => updateTextFont({ italic }),
    setTextFill: (fill) => updateTextFont({ fill }),
    setTextStrokeWidth: (strokeWidth) =>
      updateTextFont({ strokeWidth: Math.max(0, Math.min(10, Math.round(strokeWidth * 10) / 10)) }),
    setPixelPerfect: (value) => {
      if (!core) {
        editor.setPixelPerfect(value);
        return;
      }
      const current = core.getSnapshot().settings.pixelPerfect;
      core.drawing.settings.setSettings({
        pixelPerfect: typeof value === "function" ? value(current) : value,
      });
    },
    symmetry: {
      enabled: Boolean(snapshot?.settings.symmetryEnabled),
      mode: snapshot?.view.symmetryMode ?? 0,
    },
    setSymmetryMode: (mode) => core?.canvas.setSymmetryMode(mode),
    resetSymmetryAxes: () => core?.canvas.resetSymmetryAxes(),
    resetSymmetryToViewCenter: () => {
      if (!core || !document) return;
      const viewport = measuredEditorViewport(core, editor.timelineVisible);
      core.canvas.resetSymmetryAxes(
        screenToDocument(
          { x: viewport.width / 2, y: viewport.height / 2 },
          viewport,
          { width: document.width, height: document.height },
          snapshot.view,
        ),
      );
    },
  };
}
