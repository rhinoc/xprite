import type { PreferenceStoragePort } from "$/managers/ports/platform";
import { normalizeUiElementScale, UiElementScale } from "$/managers/preferences/ui-element-scale";
import { WorkspaceContextPresentation } from "$/managers/workspace/workspace-panel-layout";

export interface EditorChromePreferences {
  uiElementScale: UiElementScale;
  showEditorMenuBar: boolean;
  showShortcutToolbar: boolean;
  showCanvasScrollbars: boolean;
  contextBarPresentation: WorkspaceContextPresentation;
  showHomeTabOnStart: boolean;
  expandMenuBarItemsOnMouseover: boolean;
}

export const DEFAULT_EDITOR_CHROME_PREFERENCES: Readonly<EditorChromePreferences> = Object.freeze({
  uiElementScale: UiElementScale.Standard,
  showEditorMenuBar: true,
  showShortcutToolbar: true,
  showCanvasScrollbars: false,
  contextBarPresentation: WorkspaceContextPresentation.Docked,
  showHomeTabOnStart: true,
  expandMenuBarItemsOnMouseover: false,
});

const EDITOR_CHROME_PREFERENCES_KEY = "xse.shell.chrome-preferences.v1";
const WORKSPACE_CHROME_PREFERENCES_KEY = "xse.layout.chrome-preferences.v1";
type WorkspaceChromePreferences = Pick<
  EditorChromePreferences,
  "showEditorMenuBar" | "showShortcutToolbar" | "showCanvasScrollbars" | "contextBarPresentation"
>;
const layoutChrome = (value: EditorChromePreferences): WorkspaceChromePreferences => ({
  showEditorMenuBar: value.showEditorMenuBar,
  showShortcutToolbar: value.showShortcutToolbar,
  showCanvasScrollbars: value.showCanvasScrollbars,
  contextBarPresentation: value.contextBarPresentation,
});

function normalize(
  value: unknown,
  defaults: Readonly<EditorChromePreferences> = DEFAULT_EDITOR_CHROME_PREFERENCES,
): EditorChromePreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    uiElementScale: normalizeUiElementScale(saved.uiElementScale),
    showEditorMenuBar:
      typeof saved.showEditorMenuBar === "boolean"
        ? saved.showEditorMenuBar
        : DEFAULT_EDITOR_CHROME_PREFERENCES.showEditorMenuBar,
    showShortcutToolbar:
      typeof saved.showShortcutToolbar === "boolean"
        ? saved.showShortcutToolbar
        : defaults.showShortcutToolbar,
    showCanvasScrollbars:
      typeof saved.showCanvasScrollbars === "boolean"
        ? saved.showCanvasScrollbars
        : DEFAULT_EDITOR_CHROME_PREFERENCES.showCanvasScrollbars,
    contextBarPresentation:
      saved.contextBarPresentation === WorkspaceContextPresentation.ToolPopup
        ? WorkspaceContextPresentation.ToolPopup
        : WorkspaceContextPresentation.Docked,
    showHomeTabOnStart:
      typeof saved.showHomeTabOnStart === "boolean"
        ? saved.showHomeTabOnStart
        : DEFAULT_EDITOR_CHROME_PREFERENCES.showHomeTabOnStart,
    expandMenuBarItemsOnMouseover:
      typeof saved.expandMenuBarItemsOnMouseover === "boolean"
        ? saved.expandMenuBarItemsOnMouseover
        : DEFAULT_EDITOR_CHROME_PREFERENCES.expandMenuBarItemsOnMouseover,
  };
}

function read(
  storage: PreferenceStoragePort | undefined,
  defaults: Readonly<EditorChromePreferences>,
): EditorChromePreferences {
  try {
    const stored = storage?.getItem(EDITOR_CHROME_PREFERENCES_KEY);
    return stored ? normalize(JSON.parse(stored), defaults) : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

/** Owns application-wide shell preferences for one editor application instance. */
export class EditorChromePreferencesManager {
  private snapshot: EditorChromePreferences;
  private committedUiElementScale: UiElementScale;
  private readonly listeners = new Set<() => void>();
  private activeLayoutKey: string | null = null;
  private readonly workspaceChrome: Record<string, Partial<WorkspaceChromePreferences>> = {};

  constructor(
    private readonly storage?: PreferenceStoragePort,
    keyboardLikelyAvailable = true,
  ) {
    this.snapshot = read(storage, {
      ...DEFAULT_EDITOR_CHROME_PREFERENCES,
      showShortcutToolbar: !keyboardLikelyAvailable,
    });
    this.committedUiElementScale = this.snapshot.uiElementScale;
    try {
      const saved = JSON.parse(storage?.getItem(WORKSPACE_CHROME_PREFERENCES_KEY) ?? "null");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        for (const [key, value] of Object.entries(saved)) {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            const chrome: Partial<WorkspaceChromePreferences> = layoutChrome(normalize(value));
            if (typeof (value as Record<string, unknown>).showShortcutToolbar !== "boolean")
              delete chrome.showShortcutToolbar;
            if (typeof (value as Record<string, unknown>).showCanvasScrollbars !== "boolean")
              delete chrome.showCanvasScrollbars;
            this.workspaceChrome[key] = chrome;
          }
        }
      }
    } catch {
      // Presets remain available without stored overrides.
    }
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setPreferences = (preferences: EditorChromePreferences) => this.update(preferences);

  patchPreferences = (patch: Partial<EditorChromePreferences>) => this.update(patch);

  previewUiElementScale = (scale: UiElementScale) =>
    this.update({ uiElementScale: normalizeUiElementScale(scale) }, false);

  commitUiElementScale = () => this.update({ uiElementScale: this.snapshot.uiElementScale });

  activateWorkspaceLayout = (key: string, defaults: WorkspaceChromePreferences, reset = false) => {
    const next = reset
      ? defaults
      : {
          ...defaults,
          // Geometry changes must not replace the device default or a user's current choice.
          showShortcutToolbar: this.snapshot.showShortcutToolbar,
          ...this.workspaceChrome[key],
        };
    this.activeLayoutKey = key;
    this.update(next);
    return next;
  };

  private update(patch: Partial<EditorChromePreferences>, commitScale = true) {
    const next = { ...this.snapshot, ...patch };
    next.uiElementScale = normalizeUiElementScale(next.uiElementScale);
    if (commitScale && patch.uiElementScale !== undefined)
      this.committedUiElementScale = next.uiElementScale;
    const changed =
      next.uiElementScale !== this.snapshot.uiElementScale ||
      next.showEditorMenuBar !== this.snapshot.showEditorMenuBar ||
      next.showShortcutToolbar !== this.snapshot.showShortcutToolbar ||
      next.showCanvasScrollbars !== this.snapshot.showCanvasScrollbars ||
      next.contextBarPresentation !== this.snapshot.contextBarPresentation ||
      next.showHomeTabOnStart !== this.snapshot.showHomeTabOnStart ||
      next.expandMenuBarItemsOnMouseover !== this.snapshot.expandMenuBarItemsOnMouseover;
    if (changed) this.snapshot = next;
    if (this.activeLayoutKey) this.workspaceChrome[this.activeLayoutKey] = layoutChrome(next);
    try {
      this.storage?.setItem(
        EDITOR_CHROME_PREFERENCES_KEY,
        JSON.stringify({ ...next, uiElementScale: this.committedUiElementScale }),
      );
      this.storage?.setItem(WORKSPACE_CHROME_PREFERENCES_KEY, JSON.stringify(this.workspaceChrome));
    } catch {
      // Keep the current value for this session when browser storage is unavailable.
    }
    if (changed) this.listeners.forEach((listener) => listener());
  }
}
