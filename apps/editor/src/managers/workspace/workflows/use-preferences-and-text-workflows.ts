import { useEffect, useState } from "react";

import { changeUiLanguage, type UiLanguage } from "$/i18n";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import { WheelDevice } from "$/managers/input/wheel-device-context";
import type { EditorPlatformPorts } from "$/managers/ports/platform";
import type { CanvasDisplayPreferences } from "$/managers/preferences/canvas-display-preferences";
import type { CursorPreferences } from "$/managers/preferences/cursor-preferences";
import { CanvasDisplayPreferenceTarget } from "$/managers/preferences/document-preferences";
import type { EditorPreferences } from "$/managers/preferences/editor-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import type { GridBoundsPreferences } from "$/managers/preferences/grid-preferences";
import type { GuideSlicePreferences } from "$/managers/preferences/guide-slice-preferences";
import { PreferenceResetTarget } from "$/managers/preferences/reset-preferences";
import { defaultTimelinePanelPreferences } from "$/managers/preferences/timeline-panel-preferences";
import { DEFAULT_EDITOR_CHROME_PREFERENCES } from "$/managers/shell/editor-chrome-preferences";
import type { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import {
  DEFAULT_TEXT_FONT_SIZE,
  editorTextFontOptions,
  normalizeTextFontSize,
  textFontSettings,
} from "$/managers/tools/text-font";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { DEFAULT_RECOVERY_SETTINGS } from "$/managers/workspace/recovery-settings";
import {
  canExecuteEditorAction,
  hexToRgba,
  validateBitmapText,
  type RasterEditor,
} from "@xprite/editor-core";
import { SessionOperation, type EditorSession } from "@xprite/editor-core/session";
import {
  AppearanceMode,
  DEFAULT_APPEARANCE_THEME,
  type AppearanceTheme,
} from "@xprite/editor-ui/appearance";

const PREFERENCE_RESET_LANGUAGE: UiLanguage = "en";

export interface PreferenceResetDeps {
  resetToolPreferences(): void;
  resetEffectPreferences(): void;
  resetDocumentPreferences(): void;
  initializeUserPresets(): Promise<void>;
  resetUserBrushes(): void;
  resetUserShades(): void;
  flushUserPresets(): Promise<void>;
  resetConfigurationPreferences(): void;
  resetChromePreferences(): void;
  resetWheelDevice(): void;
  resetDefaultTimelineFirstFrame(): void;
  resetAppearanceMode(): void;
  resetAppearanceTheme(): void;
  resetUiLanguage(): Promise<void>;
  resetRecoverySettings(): Promise<void>;
  clearRecentFiles(): Promise<void>;
}

/** Pure coordinator for resetting any subset of preference categories in parallel. */
export async function resetEditorPreferences(
  targets: readonly PreferenceResetTarget[],
  deps: PreferenceResetDeps,
): Promise<void> {
  const pendingWrites: Promise<void>[] = [];
  if (targets.includes(PreferenceResetTarget.Tools)) deps.resetToolPreferences();
  if (targets.includes(PreferenceResetTarget.Filters)) deps.resetEffectPreferences();
  if (targets.includes(PreferenceResetTarget.PerFile)) deps.resetDocumentPreferences();
  if (
    targets.includes(PreferenceResetTarget.UserBrushes) ||
    targets.includes(PreferenceResetTarget.UserShades)
  ) {
    await deps.initializeUserPresets();
    if (targets.includes(PreferenceResetTarget.UserBrushes)) deps.resetUserBrushes();
    if (targets.includes(PreferenceResetTarget.UserShades)) deps.resetUserShades();
    pendingWrites.push(deps.flushUserPresets());
  }
  if (targets.includes(PreferenceResetTarget.Configuration)) {
    deps.resetConfigurationPreferences();
    deps.resetChromePreferences();
    deps.resetWheelDevice();
    deps.resetDefaultTimelineFirstFrame();
    deps.resetAppearanceMode();
    deps.resetAppearanceTheme();
    pendingWrites.push(deps.resetUiLanguage());
    pendingWrites.push(deps.resetRecoverySettings());
  }
  if (targets.includes(PreferenceResetTarget.RecentFiles))
    pendingWrites.push(deps.clearRecentFiles());
  await Promise.all(pendingWrites);
}

export interface PreferencesAndTextWorkflowOptions {
  core: RasterEditor;
  session: EditorSession<string>;
  workspace: DocumentWorkspace;
  platform: EditorPlatformPorts;
  editor: ReturnType<typeof useEditor>;
  chromePreferences: ReturnType<typeof useEditorChromePreferences>;
  setWheelDevice(device: WheelDevice): void;
  onAppearanceModeChange(mode: AppearanceMode): void;
  persistAppearanceMode(mode: AppearanceMode): void;
  onAppearanceThemeChange(theme: AppearanceTheme): void;
  persistAppearanceTheme(theme: AppearanceTheme): void;
  setDialog(dialog: "text" | "color" | null): void;
  canStartInteraction(): boolean;
}

/** Owns preference resets/accessors, bitmap text tool preparation/acceptance, and agent preview directory state. */
export function usePreferencesAndTextWorkflows(options: PreferencesAndTextWorkflowOptions) {
  const {
    core,
    session,
    workspace,
    platform,
    editor,
    chromePreferences,
    setWheelDevice,
    onAppearanceModeChange,
    persistAppearanceMode,
    onAppearanceThemeChange,
    persistAppearanceTheme,
    setDialog,
    canStartInteraction,
  } = options;

  const [text, setText] = useState("");
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_FONT_SIZE);
  const [agentPreviewStatus, setAgentPreviewStatus] = useState<{
    state: "connected" | "unavailable" | "disconnected";
    name?: string;
  } | null>(null);

  useEffect(() => {
    const port = platform.agentPreview;
    if (!port) return;
    let cancelled = false;
    void port.status().then((status) => {
      if (!cancelled) setAgentPreviewStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const prepareText = (force = false) => {
    const snapshot = core.getSnapshot();
    if (force || !snapshot.settings.font) {
      const fontOptions = editorTextFontOptions(snapshot.settings);
      core.drawing.settings.setSettings({
        ...textFontSettings(fontOptions),
        font: platform.font.rasterize(
          snapshot.view.appearance,
          snapshot.settings.text,
          fontOptions,
        ),
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

  const resetPreferences = async (targets: readonly PreferenceResetTarget[]) => {
    try {
      await resetEditorPreferences(targets, {
        resetToolPreferences: () => editor.resetToolPreferences(),
        resetEffectPreferences: () => workspace.effectPreferences.reset(),
        resetDocumentPreferences: () => workspace.resetDocumentPreferences(),
        initializeUserPresets: () => workspace.userPresets.initialize(),
        resetUserBrushes: () => workspace.userPresets.resetBrushes(),
        resetUserShades: () => workspace.userPresets.resetShades(),
        flushUserPresets: () => workspace.userPresets.flush(),
        resetConfigurationPreferences: () => workspace.resetConfigurationPreferences(),
        resetChromePreferences: () =>
          chromePreferences.setPreferences({ ...DEFAULT_EDITOR_CHROME_PREFERENCES }),
        resetWheelDevice: () => setWheelDevice(WheelDevice.Auto),
        resetDefaultTimelineFirstFrame: () =>
          editor.setDefaultTimelineFirstFrame(defaultTimelinePanelPreferences.firstFrame),
        resetAppearanceMode: () => {
          onAppearanceModeChange(AppearanceMode.Light);
          persistAppearanceMode(AppearanceMode.Light);
        },
        resetAppearanceTheme: () => {
          onAppearanceThemeChange(DEFAULT_APPEARANCE_THEME);
          persistAppearanceTheme(DEFAULT_APPEARANCE_THEME);
        },
        resetUiLanguage: () => changeUiLanguage(PREFERENCE_RESET_LANGUAGE),
        resetRecoverySettings: () =>
          workspace.recovery.setRecoverySettings({ ...DEFAULT_RECOVERY_SETTINGS }),
        clearRecentFiles: () => workspace.clearRecentFiles(),
      });
    } catch (reason) {
      session.reportError(reason);
    }
  };

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
      const fontOptions = {
        ...editorTextFontOptions(current.settings),
        family,
        bold,
        italic,
        antialias,
        size: normalizeTextFontSize(nextSize),
      };
      const font = platform.font.rasterize(current.view.appearance, nextText, fontOptions);
      core.drawing.settings.setSettings({ ...textFontSettings(fontOptions), font, text: nextText });
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

  const openTextDialog = () => {
    if (!canStartInteraction()) return;
    prepareText();
    if (!canExecuteEditorAction("insert-text", core.getSnapshot(), editorSceneForTab(editor.tab)))
      return;
    setText(core.getSnapshot().settings.text);
    setTextSize(normalizeTextFontSize(core.getSnapshot().settings.textFontSize));
    setDialog("text");
  };

  const connectAgentPreviewDirectory = () => {
    const port = platform.agentPreview;
    if (!port) return;
    void (async () => {
      if (await port.connect()) setAgentPreviewStatus(await port.status());
      else setAgentPreviewStatus({ state: "disconnected" });
    })().catch((error) => session.reportError(error));
  };

  const disconnectAgentPreviewDirectory = () => {
    const port = platform.agentPreview;
    if (!port) return;
    void port
      .disconnect()
      .then(() => setAgentPreviewStatus({ state: "disconnected" }))
      .catch((error) => session.reportError(error));
  };

  return {
    text,
    setText,
    textSize,
    setTextSize,
    prepareText,
    validateText,
    acceptText,
    openTextDialog,
    agentPreviewStatus,
    connectAgentPreviewDirectory,
    disconnectAgentPreviewDirectory,
    resetPreferences,
    getUndoOptions: workspace.getUndoOptions,
    updateUndoOptions: (undoOptions: Parameters<typeof workspace.setUndoOptions>[0]) =>
      workspace.setUndoOptions(undoOptions),
    updateComposeGroups: (composeGroups: boolean) =>
      core.drawing.settings.setSettings({ composeGroups }),
    updateSliceUseKeys: (sliceUseKeys: boolean) =>
      core.drawing.settings.setSettings({ sliceUseKeys }),
    touchInputPreferences: workspace.getTouchInputPreferences(),
    updateTouchInputPreferences: (
      value: Parameters<typeof workspace.setTouchInputPreferences>[0],
    ) => workspace.setTouchInputPreferences(value),
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
  };
}
