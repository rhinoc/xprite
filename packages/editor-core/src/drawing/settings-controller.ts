import { UINT8_MAX } from "$/base/numeric-constants";
import type { Brush, Rgba } from "$/base/primitives";
import { supportsPixelPerfect } from "$/canvas/raster/pixel-perfect-stroke";
import { libreSpriteWorkingBrushIndex } from "$/color/operations/color-mode";
import type { PaletteController } from "$/color/palette/controller";
import type { EditorDocument } from "$/document/types";
import { getXpriteToolCapabilities } from "$/drawing/capabilities";
import { normalizeCornerRadius } from "$/drawing/shapes/modifiers";
import { DEFAULT_TEXT_FONT_SIZE, normalizeTextFontSize } from "$/drawing/text/font-settings";
import {
  DEFAULT_DYNAMICS_SETTINGS,
  normalizePersistentToolPreferences,
  persistentToolSettings,
  persistentBrush,
  toolParameterPreferences,
  cloneToolParameterPreferences,
  type PersistentToolPreferences,
  type ToolParameterPreferences,
} from "$/drawing/tool-preferences";
import {
  DEFAULT_AUTO_GUIDES_COLOR,
  DEFAULT_LAYER_EDGES_COLOR,
  DEFAULT_SLICE_COLOR,
  FillReference,
  AsepriteInk,
  EditorToolId,
} from "$/drawing/tool-settings";
import type { EditorTool, ToolSettings } from "$/drawing/tool-settings";
import { EyedropperChannel, EyedropperSample } from "$/drawing/types";
import { SelectionMode } from "$/selection/types";
import { SelectionPivotPosition, SelectionRotationAlgorithm } from "$/selection/types";
import { TilemapDisplayMode, TilesetMode } from "$/tilemap/types";

const DEFAULT_VISIBLE_SHAPE_TOOL: EditorTool = "rectangle";
const DEFAULT_SETTINGS: ToolSettings = {
  shareInk: false,
  shareDynamics: true,
  ink: AsepriteInk.Simple,
  dynamics: { ...DEFAULT_DYNAMICS_SETTINGS },
  composeGroups: false,
  sliceUseKeys: false,
  layerEdgesColor: DEFAULT_LAYER_EDGES_COLOR,
  autoGuidesColor: DEFAULT_AUTO_GUIDES_COLOR,
  defaultSliceColor: DEFAULT_SLICE_COLOR,
  tilemapMode: TilemapDisplayMode.Pixels,
  tilesetMode: TilesetMode.Auto,
  selectedTile: 0,
  backgroundTile: 0,
  tool: "pencil",
  sprayWidth: 16,
  spraySpeed: 32,
  selectionMode: SelectionMode.Replace,
  selectionOpaque: false,
  selectionAutoOpaque: true,
  selectionKeepAfterClear: false,
  selectionAutoShowEdges: true,
  selectionMoveEdges: true,
  selectionModifiersDisableHandles: true,
  selectionMoveOnAddMode: true,
  selectionMulticelWhenLayersOrFrames: true,
  selectionTransparentColor: [0, 0, 0, 0],
  selectionRotationAlgorithm: SelectionRotationAlgorithm.Fast,
  selectionPivotPosition: SelectionPivotPosition.Center,
  selectionPivotVisible: false,
  selectionCornerRadius: 0,
  rectangleCornerRadius: 0,
  foreground: [UINT8_MAX, UINT8_MAX, UINT8_MAX, UINT8_MAX],
  background: [0, 0, 0, UINT8_MAX],
  brush: { shape: "circle", size: 1, angle: 0 },
  opacity: UINT8_MAX,
  tolerance: 0,
  contiguous: true,
  fillReference: FillReference.ActiveLayer,
  text: "",
  font: null,
  textFontFamily: "Aseprite",
  textBold: false,
  textItalic: false,
  textAntialias: false,
  textFontSize: DEFAULT_TEXT_FONT_SIZE,
  textFill: true,
  textStrokeWidth: 0,
  textScale: 1,
  pixelPerfect: true,
  autoSelectLayer: false,
  eyedropperChannel: EyedropperChannel.ColorAlpha,
  eyedropperSample: EyedropperSample.AllLayers,
};

export interface EditorToolPreferences {
  settings: ToolSettings;
  brushes: readonly (readonly [EditorTool, Brush])[];
  normalBrushes: readonly (readonly [EditorTool, Brush])[];
  pixelPerfect: readonly (readonly [EditorTool, boolean])[];
  visibleShapeTool: EditorTool;
  parameters?: readonly (readonly [EditorTool, ToolParameterPreferences])[];
}

export interface DrawingSettingsPort {
  document: {
    getDocument(): EditorDocument | null;
    getFallbackPalette(): readonly Rgba[];
  };
  interaction: {
    clearLinePreview(): void;
    hasFloatingPaste(): boolean;
    commitFloatingPaste(): boolean;
    hasInlineText(): boolean;
    commitInlineText(): boolean;
    updateInlineText(patch: { text?: string; scale: number; color: Rgba }): void;
    cancelGesture(): void;
  };
  color: Pick<PaletteController, "forgetChoice" | "resetChoices">;
  publish(): void;
}

function cloneToolSettings(settings: ToolSettings): ToolSettings {
  return {
    ...settings,
    textFontSize: normalizeTextFontSize(settings.textFontSize),
    textStrokeWidth: normalizeTextStrokeWidth(settings.textStrokeWidth),
    selectionOpaque: settings.selectionOpaque ?? false,
    selectionAutoOpaque: settings.selectionAutoOpaque ?? true,
    selectionKeepAfterClear: settings.selectionKeepAfterClear ?? false,
    selectionAutoShowEdges: settings.selectionAutoShowEdges ?? true,
    selectionMoveEdges: settings.selectionMoveEdges ?? true,
    selectionModifiersDisableHandles: settings.selectionModifiersDisableHandles ?? true,
    selectionMoveOnAddMode: settings.selectionMoveOnAddMode ?? true,
    selectionMulticelWhenLayersOrFrames: settings.selectionMulticelWhenLayersOrFrames ?? true,
    selectionTransparentColor: [...(settings.selectionTransparentColor ?? [0, 0, 0, 0])],
    selectionRotationAlgorithm:
      settings.selectionRotationAlgorithm ?? SelectionRotationAlgorithm.Fast,
    selectionPivotPosition: settings.selectionPivotPosition ?? SelectionPivotPosition.Center,
    selectionPivotVisible: settings.selectionPivotVisible ?? false,
    selectionCornerRadius: normalizeCornerRadius(settings.selectionCornerRadius),
    rectangleCornerRadius: normalizeCornerRadius(settings.rectangleCornerRadius),
    foreground: [...settings.foreground],
    background: [...settings.background],
    brush: { ...settings.brush },
    dynamics: settings.dynamics ? { ...settings.dynamics } : undefined,
    font: settings.font
      ? {
          ...settings.font,
          glyphs: Object.fromEntries(
            Object.entries(settings.font.glyphs).map(([key, glyph]) => [
              key,
              { ...glyph, alpha: glyph.alpha.slice() },
            ]),
          ),
        }
      : null,
  };
}

function normalizeTextStrokeWidth(value: number | undefined): number {
  const width = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(10, Math.round(width * 10) / 10));
}

export function chooseShortcutTool(
  tools: readonly EditorTool[],
  current: EditorTool,
  visible?: EditorTool,
): EditorTool {
  const shown = tools.find((tool) => tool !== current && tool === visible);
  if (shown) return shown;
  const index = tools.indexOf(current);
  return index < 0 ? tools[0] : tools[(index + 1) % tools.length];
}

/** Drawing tool state and per-tool preferences. */
export class DrawingSettingsController {
  private settings: ToolSettings = {
    ...DEFAULT_SETTINGS,
    brush: { ...DEFAULT_SETTINGS.brush },
  };
  private brushPreferences = new Map<EditorTool, Brush>();
  private normalBrushPreferences = new Map<EditorTool, Brush>();
  private pixelPerfectPreferences = new Map<EditorTool, boolean>();
  private parameterPreferences = new Map<EditorTool, ToolParameterPreferences>();
  private visibleShapeTool: EditorTool = DEFAULT_VISIBLE_SHAPE_TOOL;
  private pointerTool: EditorTool | null = null;
  private quickTool: EditorTool | null = null;

  constructor(private readonly port: DrawingSettingsPort) {}

  getSettings(): ToolSettings {
    return this.settings;
  }

  /** Temporary pointer tools use their own parameters without changing the selected tool. */
  getInputSettings(): ToolSettings {
    const tool = this.pointerTool ?? this.quickTool;
    if (!tool) return this.settings;
    const parameters = this.parameterPreferences.get(tool);
    return {
      ...this.settings,
      ...toolParameterPreferences(DEFAULT_SETTINGS),
      ...parameters,
      tool,
      brush: this.brushPreferences.get(tool) ?? {
        ...DEFAULT_SETTINGS.brush,
        size: getXpriteToolCapabilities(tool).settings.defaultBrushSize,
      },
      ink: this.settings.shareInk ? this.settings.ink : (parameters?.ink ?? DEFAULT_SETTINGS.ink),
      opacity: this.settings.shareInk
        ? this.settings.opacity
        : (parameters?.opacity ?? DEFAULT_SETTINGS.opacity),
      dynamics: this.settings.shareDynamics
        ? this.settings.dynamics
        : (parameters?.dynamics ?? { ...DEFAULT_DYNAMICS_SETTINGS }),
      pixelPerfect: this.pixelPerfectPreferences.get(tool) ?? supportsPixelPerfect({ tool }),
      autoSelectLayer:
        (this.pointerTool === EditorToolId.Move && !this.quickTool) ||
        this.settings.autoSelectLayer,
    };
  }

  setPointerTool(tool: EditorTool | null): void {
    this.pointerTool = tool;
  }

  setQuickTool(tool: EditorTool | null): void {
    if (this.quickTool === tool) return;
    this.quickTool = tool;
    this.port.interaction.clearLinePreview();
    this.port.publish();
  }

  getQuickTool(): EditorTool | null {
    return this.quickTool;
  }

  getPointerTool(): EditorTool | null {
    return this.pointerTool;
  }

  /** Image brushes are transient; return to this tool's retained standard brush. */
  discardImageBrush(): void {
    if (this.settings.brush.shape !== "image") return;
    this.setSettings({
      brush: this.normalBrushPreferences.get(this.settings.tool) ?? {
        ...DEFAULT_SETTINGS.brush,
        size: getXpriteToolCapabilities(this.settings.tool).settings.defaultBrushSize,
      },
    });
  }

  /** Radius edits belong to the gesture tool, including temporary pointer tools. */
  setInputCornerRadius(radius: number): void {
    const tool = this.pointerTool ?? this.quickTool ?? this.settings.tool;
    const patch =
      tool === "marquee"
        ? { selectionCornerRadius: normalizeCornerRadius(radius) }
        : { rectangleCornerRadius: normalizeCornerRadius(radius) };
    if (tool === this.settings.tool) {
      this.setSettings(patch);
      return;
    }
    this.parameterPreferences.set(tool, {
      ...toolParameterPreferences(DEFAULT_SETTINGS),
      ...this.parameterPreferences.get(tool),
      ...patch,
    });
    this.port.publish();
  }

  replaceSettings(settings: ToolSettings): void {
    this.rememberNormalBrush(this.settings.tool, this.settings.brush);
    this.rememberNormalBrush(settings.tool, settings.brush);
    this.settings = {
      ...settings,
      textFontSize: normalizeTextFontSize(settings.textFontSize),
      textStrokeWidth: normalizeTextStrokeWidth(settings.textStrokeWidth),
      selectionOpaque: settings.selectionOpaque ?? false,
      selectionAutoOpaque: settings.selectionAutoOpaque ?? true,
      selectionKeepAfterClear: settings.selectionKeepAfterClear ?? false,
      selectionAutoShowEdges: settings.selectionAutoShowEdges ?? true,
      selectionMoveEdges: settings.selectionMoveEdges ?? true,
      selectionModifiersDisableHandles: settings.selectionModifiersDisableHandles ?? true,
      selectionMoveOnAddMode: settings.selectionMoveOnAddMode ?? true,
      selectionMulticelWhenLayersOrFrames: settings.selectionMulticelWhenLayersOrFrames ?? true,
      selectionTransparentColor: [...(settings.selectionTransparentColor ?? [0, 0, 0, 0])],
      selectionRotationAlgorithm:
        settings.selectionRotationAlgorithm ?? SelectionRotationAlgorithm.Fast,
      selectionPivotPosition: settings.selectionPivotPosition ?? SelectionPivotPosition.Center,
      selectionPivotVisible: settings.selectionPivotVisible ?? false,
      selectionCornerRadius: normalizeCornerRadius(settings.selectionCornerRadius),
      rectangleCornerRadius: normalizeCornerRadius(settings.rectangleCornerRadius),
    };
  }

  setSettings(patch: Partial<ToolSettings>): void {
    if (patch.tool !== undefined && patch.tool !== this.settings.tool)
      this.port.interaction.clearLinePreview();
    const document = this.port.document.getDocument();
    const palette = document?.palette ?? this.port.document.getFallbackPalette();
    for (const target of ["foreground", "background"] as const) {
      const indexKey = target === "foreground" ? "foregroundIndex" : "backgroundIndex";
      if (patch[target] && !(indexKey in patch)) {
        const index = this.settings[indexKey];
        const entry = index == null ? undefined : palette[index];
        if (!entry || !entry.every((value, channel) => value === patch[target]![channel]))
          patch = { ...patch, [indexKey]: null };
      }
    }

    if (
      patch.tool &&
      ["rectangle", "filled_rectangle", "ellipse", "filled_ellipse"].includes(patch.tool)
    )
      this.visibleShapeTool = patch.tool;
    if (patch.foreground) this.port.color.forgetChoice("foreground");
    if (patch.background) this.port.color.forgetChoice("background");
    if (
      patch.tool &&
      patch.tool !== this.settings.tool &&
      this.port.interaction.hasFloatingPaste() &&
      !this.port.interaction.commitFloatingPaste()
    )
      return;
    if (
      patch.tool &&
      patch.tool !== this.settings.tool &&
      this.port.interaction.hasInlineText() &&
      !this.port.interaction.commitInlineText()
    )
      return;
    if (patch.tool && patch.tool !== this.settings.tool) this.port.interaction.cancelGesture();

    const nextTool = patch.tool ?? this.settings.tool;
    const previous = this.settings;
    const currentParameters = toolParameterPreferences(previous);
    this.parameterPreferences.set(previous.tool, {
      ...currentParameters,
      dynamics: previous.shareDynamics
        ? (this.parameterPreferences.get(previous.tool)?.dynamics ?? {
            ...DEFAULT_DYNAMICS_SETTINGS,
          })
        : previous.dynamics,
    });
    const nextParameters =
      nextTool === previous.tool
        ? currentParameters
        : {
            ...toolParameterPreferences(DEFAULT_SETTINGS),
            ...this.parameterPreferences.get(nextTool),
          };
    const shareInk = patch.shareInk ?? previous.shareInk ?? false;
    const shareDynamics = patch.shareDynamics ?? previous.shareDynamics ?? true;
    if (shareInk) {
      nextParameters.ink = previous.ink;
      nextParameters.opacity = previous.opacity;
    }
    if (shareDynamics || patch.shareDynamics !== undefined)
      nextParameters.dynamics = previous.dynamics;
    patch = { ...nextParameters, ...patch, shareInk, shareDynamics };
    if (shareInk) {
      for (const tool of Object.values(EditorToolId)) {
        this.parameterPreferences.set(tool, {
          ...toolParameterPreferences(DEFAULT_SETTINGS),
          ...this.parameterPreferences.get(tool),
          ink: patch.ink,
          opacity: patch.opacity ?? previous.opacity,
        });
      }
    }
    const requestedBrush =
      patch.brush ??
      (nextTool !== this.settings.tool
        ? (this.brushPreferences.get(nextTool) ?? {
            shape: "circle",
            size: getXpriteToolCapabilities(nextTool).settings.defaultBrushSize,
            angle: 0,
          })
        : this.settings.brush);
    let brush: Brush = {
      ...requestedBrush,
      size: Math.max(1, Math.min(64, Math.round(requestedBrush.size))),
    };
    if (brush.shape === "image" && brush.image && (patch.foreground || patch.background)) {
      const timeline = document?.timeline;
      const activePalette =
        timeline?.frames[timeline.activeFrame]?.palette ?? document?.palette ?? palette;
      const foregroundIndex = patch.foreground
        ? (patch.foregroundIndex ??
          libreSpriteWorkingBrushIndex(patch.foreground, timeline, activePalette))
        : undefined;
      const backgroundIndex = patch.background
        ? (patch.backgroundIndex ??
          libreSpriteWorkingBrushIndex(patch.background, timeline, activePalette))
        : undefined;
      brush = {
        ...brush,
        image: {
          ...brush.image,
          imageColors: {
            ...brush.image.imageColors,
            ...(patch.foreground
              ? {
                  main: [...patch.foreground] as Rgba,
                  ...(foregroundIndex !== undefined && foregroundIndex !== null
                    ? { mainIndex: foregroundIndex }
                    : {}),
                }
              : {}),
            ...(patch.background
              ? {
                  background: [...patch.background] as Rgba,
                  ...(backgroundIndex !== undefined && backgroundIndex !== null
                    ? { backgroundIndex }
                    : {}),
                }
              : {}),
          },
        },
      };
    }

    this.brushPreferences.set(this.settings.tool, this.settings.brush);
    this.brushPreferences.set(nextTool, brush);
    this.rememberNormalBrush(this.settings.tool, this.settings.brush);
    this.rememberNormalBrush(nextTool, brush);
    const pixelPerfect =
      patch.pixelPerfect ??
      (nextTool !== this.settings.tool
        ? (this.pixelPerfectPreferences.get(nextTool) ?? supportsPixelPerfect({ tool: nextTool }))
        : this.settings.pixelPerfect);
    this.pixelPerfectPreferences.set(this.settings.tool, this.settings.pixelPerfect);
    this.pixelPerfectPreferences.set(nextTool, pixelPerfect);
    this.settings = {
      ...this.settings,
      ...patch,
      pixelPerfect,
      brush,
      textFontFamily: patch.textFontFamily?.trim() || this.settings.textFontFamily,
      textBold: patch.textBold ?? this.settings.textBold,
      textItalic: patch.textItalic ?? this.settings.textItalic,
      textAntialias: patch.textAntialias ?? this.settings.textAntialias,
      textFontSize: normalizeTextFontSize(patch.textFontSize ?? this.settings.textFontSize),
      textFill: patch.textFill ?? this.settings.textFill,
      textStrokeWidth: normalizeTextStrokeWidth(
        patch.textStrokeWidth ?? this.settings.textStrokeWidth,
      ),
      opacity: Math.max(0, Math.min(UINT8_MAX, patch.opacity ?? this.settings.opacity)),
      tolerance: Math.max(0, Math.min(UINT8_MAX, patch.tolerance ?? this.settings.tolerance)),
      sprayWidth: Math.max(
        1,
        Math.min(32, Math.round(patch.sprayWidth ?? this.settings.sprayWidth)),
      ),
      spraySpeed: Math.max(
        1,
        Math.min(100, Math.round(patch.spraySpeed ?? this.settings.spraySpeed)),
      ),
      selectionCornerRadius: normalizeCornerRadius(
        patch.selectionCornerRadius ?? this.settings.selectionCornerRadius,
      ),
      rectangleCornerRadius: normalizeCornerRadius(
        patch.rectangleCornerRadius ?? this.settings.rectangleCornerRadius,
      ),
    };
    this.parameterPreferences.set(nextTool, {
      ...toolParameterPreferences(this.settings),
      dynamics: shareDynamics
        ? (this.parameterPreferences.get(nextTool)?.dynamics ?? { ...DEFAULT_DYNAMICS_SETTINGS })
        : this.settings.dynamics,
    });
    if (
      this.port.interaction.hasInlineText() &&
      this.settings.font &&
      (patch.text !== undefined ||
        patch.textScale !== undefined ||
        patch.foreground ||
        patch.font ||
        patch.textFontFamily !== undefined ||
        patch.textBold !== undefined ||
        patch.textItalic !== undefined ||
        patch.textAntialias !== undefined ||
        patch.textFontSize !== undefined ||
        patch.textFill !== undefined ||
        patch.textStrokeWidth !== undefined)
    ) {
      this.port.interaction.updateInlineText({
        ...(patch.text !== undefined ? { text: this.settings.text } : {}),
        scale: this.settings.textScale,
        color: this.settings.foreground,
      });
      return;
    }
    this.port.publish();
  }

  selectShortcut(tools: readonly EditorTool[]): void {
    this.setSettings({
      tool: chooseShortcutTool(tools, this.settings.tool, this.visibleShapeTool),
    });
  }

  capturePreferences(): EditorToolPreferences {
    this.rememberNormalBrush(this.settings.tool, this.settings.brush);
    const brushes = new Map(this.brushPreferences);
    const pixelPerfect = new Map(this.pixelPerfectPreferences);
    brushes.set(this.settings.tool, this.settings.brush);
    pixelPerfect.set(this.settings.tool, this.settings.pixelPerfect);
    return {
      settings: cloneToolSettings(this.settings),
      brushes: [...brushes].map(([tool, brush]) => [tool, { ...brush }] as const),
      normalBrushes: [...this.normalBrushPreferences].map(
        ([tool, brush]) => [tool, { ...brush }] as const,
      ),
      pixelPerfect: [...pixelPerfect],
      visibleShapeTool: this.visibleShapeTool,
      parameters: [...this.parameterPreferences].map(
        ([tool, value]) => [tool, cloneToolParameterPreferences(value)] as const,
      ),
    };
  }

  capturePersistentPreferences(): PersistentToolPreferences {
    this.rememberNormalBrush(this.settings.tool, this.settings.brush);
    const brushes = new Map(this.brushPreferences);
    const pixelPerfect = new Map(this.pixelPerfectPreferences);
    brushes.set(this.settings.tool, this.settings.brush);
    pixelPerfect.set(this.settings.tool, this.settings.pixelPerfect);
    return {
      version: 1,
      settings: persistentToolSettings(this.settings),
      brushes: [...brushes].map(([tool, brush]) => [
        tool,
        persistentBrush(brush.shape === "image" ? this.normalBrushPreferences.get(tool) : brush),
      ]),
      pixelPerfect: [...pixelPerfect],
      parameters: [...this.parameterPreferences].map(([tool, settings]) => [
        tool,
        toolParameterPreferences(persistentToolSettings(settings)),
      ]),
    };
  }

  restorePersistentPreferences(value: unknown): void {
    const preferences = normalizePersistentToolPreferences(value);
    if (!preferences) return;
    this.brushPreferences = new Map(preferences.brushes);
    this.normalBrushPreferences = new Map(
      preferences.brushes.map(([tool, brush]) => [tool, { ...brush }]),
    );
    this.pixelPerfectPreferences = new Map(preferences.pixelPerfect);
    this.parameterPreferences = new Map(preferences.parameters);
    const tool = this.settings.tool;
    const settings = { ...this.settings, ...preferences.settings };
    const parameters = this.parameterPreferences.get(tool);
    this.settings = {
      ...settings,
      ...parameters,
      ink: settings.shareInk ? settings.ink : (parameters?.ink ?? DEFAULT_SETTINGS.ink),
      opacity: settings.shareInk
        ? settings.opacity
        : (parameters?.opacity ?? DEFAULT_SETTINGS.opacity),
      dynamics: settings.shareDynamics
        ? settings.dynamics
        : (parameters?.dynamics ?? { ...DEFAULT_DYNAMICS_SETTINGS }),
      tool,
      selectionMode: SelectionMode.Replace,
      brush: this.brushPreferences.get(tool) ?? this.settings.brush,
      pixelPerfect: this.pixelPerfectPreferences.get(tool) ?? supportsPixelPerfect({ tool }),
    };
    this.port.publish();
  }

  /** Resets tool parameters while retaining workspace preferences and working colors. */
  resetToolPreferences(): void {
    this.pointerTool = null;
    const current = this.settings;
    this.settings = {
      ...cloneToolSettings(DEFAULT_SETTINGS),
      tool: current.tool,
      foreground: current.foreground,
      foregroundIndex: current.foregroundIndex,
      background: current.background,
      backgroundIndex: current.backgroundIndex,
      tilemapMode: current.tilemapMode,
      tilesetMode: current.tilesetMode,
      selectedTile: current.selectedTile,
      backgroundTile: current.backgroundTile,
      symmetryEnabled: current.symmetryEnabled,
      composeGroups: current.composeGroups,
      sliceUseKeys: current.sliceUseKeys,
      layerEdgesColor: current.layerEdgesColor,
      autoGuidesColor: current.autoGuidesColor,
      defaultSliceColor: current.defaultSliceColor,
      straightLinePreview: current.straightLinePreview,
      discardBrushOnEyedropper: current.discardBrushOnEyedropper,
      rightClickMode: current.rightClickMode,
      selectionAutoOpaque: current.selectionAutoOpaque,
      selectionKeepAfterClear: current.selectionKeepAfterClear,
      selectionAutoShowEdges: current.selectionAutoShowEdges,
      selectionMoveEdges: current.selectionMoveEdges,
      selectionModifiersDisableHandles: current.selectionModifiersDisableHandles,
      selectionMoveOnAddMode: current.selectionMoveOnAddMode,
      selectionMulticelWhenLayersOrFrames: current.selectionMulticelWhenLayersOrFrames,
      brush: {
        ...DEFAULT_SETTINGS.brush,
        size: getXpriteToolCapabilities(current.tool).settings.defaultBrushSize,
      },
      pixelPerfect: supportsPixelPerfect(current),
    };
    this.brushPreferences.clear();
    this.normalBrushPreferences.clear();
    this.pixelPerfectPreferences.clear();
    this.parameterPreferences.clear();
    this.visibleShapeTool = DEFAULT_VISIBLE_SHAPE_TOOL;
    this.port.interaction.clearLinePreview();
    this.port.publish();
  }

  applyPreferences(preferences: EditorToolPreferences): void {
    this.pointerTool = null;
    this.settings = cloneToolSettings(preferences.settings);
    this.brushPreferences = new Map(
      preferences.brushes.map(([tool, brush]) => [tool, { ...brush }]),
    );
    this.normalBrushPreferences = new Map(
      preferences.normalBrushes.map(([tool, brush]) => [tool, { ...brush }]),
    );
    this.pixelPerfectPreferences = new Map(preferences.pixelPerfect);
    this.visibleShapeTool = preferences.visibleShapeTool;
    this.parameterPreferences = new Map(
      (preferences.parameters ?? []).map(([tool, value]) => [
        tool,
        cloneToolParameterPreferences(value),
      ]),
    );
    this.port.color.resetChoices();
    this.port.publish();
  }

  private rememberNormalBrush(tool: EditorTool, brush: Brush): void {
    if (brush.shape !== "image") this.normalBrushPreferences.set(tool, { ...brush });
  }
}
