import { createStore } from "zustand/vanilla";

import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import {
  EditorView,
  EditorViewChangeTrigger,
  EditorViewChangeReason,
  type EditorViewTransition,
} from "$/managers/editor/editor-view-transition";
import type { CanvasQuickTool } from "$/managers/input/policies/quick-tool";
import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  normalizePanelLayoutPreferences,
  readPanelLayoutPreferences,
  writePanelLayoutPreferences,
  type PanelLayoutPreferences,
} from "$/managers/preferences/panel-layout-preferences";
import { HelpDocumentTab } from "$/managers/shell/help";
import type { EditorTool } from "@xprite/editor-core";

export type EditorTab = "home" | "document" | HelpDocumentTab;

export function editorSceneForTab(tab: EditorTab): "home" | "document" {
  return tab === "document" ? "document" : "home";
}
type Updater<T> = T | ((current: T) => T);

const LAST_ACTIVE_TAB_STORAGE_KEY = "xse.workspace.active-tab.v1";
const HOME_PAGE_PATH = "/home";
const EDITOR_PAGE_PATH = "/editor";
const INITIAL_VIEW_TRANSITION: EditorViewTransition = {
  trigger: EditorViewChangeTrigger.Initial,
  reason: EditorViewChangeReason.InitialLoad,
};
const TAB_SELECTED_TRANSITION: EditorViewTransition = {
  trigger: EditorViewChangeTrigger.User,
  reason: EditorViewChangeReason.TabSelected,
};
const TAB_CLOSED_TRANSITION: EditorViewTransition = {
  trigger: EditorViewChangeTrigger.User,
  reason: EditorViewChangeReason.TabClosed,
};

function restoreActiveTab(
  fallback: EditorTab,
  storage?: PreferenceStoragePort,
  pathname?: string,
): EditorTab {
  const path = pathname?.replace(/\/+$/, "");
  if (path === HOME_PAGE_PATH) return "home";
  if (path === EDITOR_PAGE_PATH) return "document";
  try {
    const saved = storage?.getItem(LAST_ACTIVE_TAB_STORAGE_KEY);
    if (saved === "home" || saved === "document") return saved;
  } catch {
    // Use the startup preference when stored navigation is unavailable.
  }
  return fallback;
}

export interface EditorUiState {
  touchConstrain: boolean;
  touchDuplicate: boolean;
  touchFromCenter: boolean;
  setTouchConstrain(value: boolean): void;
  setTouchDuplicate(value: boolean): void;
  setTouchFromCenter(value: boolean): void;
  resetTouchModifiers(): void;
  timelineVisible: boolean;
  previewVisible: boolean;
  quickTool: CanvasQuickTool | null;
  autoSelectLayerModifier: boolean;
  workingColorTarget: WorkingColorTarget;
  tilesetEditable: boolean;
  previousTool: EditorTool | null;
  tab: EditorTab;
  recoveryOpen: boolean;
  viewTransition: EditorViewTransition;
  openTabs: EditorTab[];
  notice: string;
  panelLayoutPreferences: PanelLayoutPreferences;
  beginPanelLayoutResize(): () => void;
  setPaletteBoxSize(value: Updater<number>): void;
  setTimelineLayerColumnWidth(value: Updater<number>): void;
  setTimelineVisible(value: Updater<boolean>): void;
  setPreviewVisible(value: Updater<boolean>): void;
  setQuickTool(value: CanvasQuickTool | null): void;
  setAutoSelectLayerModifier(value: boolean): void;
  setWorkingColorTarget(value: WorkingColorTarget): void;
  setTilesetEditable(value: boolean): void;
  rememberToolChange(previous: EditorTool, next: EditorTool): void;
  setTab(value: EditorTab, transition?: EditorViewTransition): void;
  openTab(value: EditorTab, transition?: EditorViewTransition): void;
  closeTab(value: EditorTab, transition?: EditorViewTransition): void;
  setRecoveryOpen(value: boolean, transition?: EditorViewTransition): void;
  setNotice(value: string): void;
}

export function editorViewForState(state: Pick<EditorUiState, "tab" | "recoveryOpen">): EditorView {
  if (state.recoveryOpen && state.tab === "home") return EditorView.Recovery;
  if (state.tab === HelpDocumentTab.Guide) return EditorView.Guide;
  return state.tab === "home" ? EditorView.Home : EditorView.Editor;
}

function viewStateChange(
  state: EditorUiState,
  tab: EditorTab,
  recoveryOpen: boolean,
  transition: EditorViewTransition,
) {
  const next = { tab, recoveryOpen };
  return {
    ...next,
    viewTransition:
      editorViewForState(state) === editorViewForState(next) ? state.viewTransition : transition,
  };
}

function updatePanelLayoutPreferences(
  state: EditorUiState,
  patch: Partial<PanelLayoutPreferences>,
) {
  const next = normalizePanelLayoutPreferences({ ...state.panelLayoutPreferences, ...patch });
  return next.paletteBoxSize === state.panelLayoutPreferences.paletteBoxSize &&
    next.timelineLayerColumnWidth === state.panelLayoutPreferences.timelineLayerColumnWidth
    ? state
    : { panelLayoutPreferences: next };
}

/** UI-only state shared by editor components. Document data stays in RasterEditor. */
export function createEditorUiStore(
  initialTab: EditorTab = "document",
  storage?: PreferenceStoragePort,
  pathname?: string,
) {
  let panelLayoutResizeDepth = 0;
  let previousGuideTab: EditorTab = "document";
  const store = createStore<EditorUiState>((set, get) => ({
    touchConstrain: false,
    touchDuplicate: false,
    touchFromCenter: false,
    setTouchConstrain: (touchConstrain) => set({ touchConstrain }),
    setTouchDuplicate: (touchDuplicate) => set({ touchDuplicate }),
    setTouchFromCenter: (touchFromCenter) => set({ touchFromCenter }),
    resetTouchModifiers: () =>
      set({ touchConstrain: false, touchDuplicate: false, touchFromCenter: false }),
    timelineVisible: true,
    previewVisible: false,
    quickTool: null,
    autoSelectLayerModifier: false,
    workingColorTarget: WorkingColorTarget.Foreground,
    tilesetEditable: false,
    previousTool: null,
    tab: restoreActiveTab(initialTab, storage, pathname),
    recoveryOpen: false,
    viewTransition: INITIAL_VIEW_TRANSITION,
    openTabs: ["home", "document"],
    notice: "",
    panelLayoutPreferences: readPanelLayoutPreferences(storage),
    beginPanelLayoutResize: () => {
      panelLayoutResizeDepth++;
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        panelLayoutResizeDepth--;
        if (!panelLayoutResizeDepth)
          writePanelLayoutPreferences(get().panelLayoutPreferences, storage);
      };
    },
    setPaletteBoxSize: (value) =>
      set((state) =>
        updatePanelLayoutPreferences(state, {
          paletteBoxSize:
            typeof value === "function"
              ? value(state.panelLayoutPreferences.paletteBoxSize)
              : value,
        }),
      ),
    setTimelineLayerColumnWidth: (value) =>
      set((state) =>
        updatePanelLayoutPreferences(state, {
          timelineLayerColumnWidth:
            typeof value === "function"
              ? value(state.panelLayoutPreferences.timelineLayerColumnWidth)
              : value,
        }),
      ),
    setTimelineVisible: (value) =>
      set((state) => ({
        timelineVisible: typeof value === "function" ? value(state.timelineVisible) : value,
      })),
    setPreviewVisible: (value) =>
      set((state) => ({
        previewVisible: typeof value === "function" ? value(state.previewVisible) : value,
      })),
    setQuickTool: (quickTool) =>
      set((state) => (state.quickTool === quickTool ? state : { quickTool })),
    setAutoSelectLayerModifier: (autoSelectLayerModifier) =>
      set((state) =>
        state.autoSelectLayerModifier === autoSelectLayerModifier
          ? state
          : { autoSelectLayerModifier },
      ),
    setWorkingColorTarget: (workingColorTarget) => set({ workingColorTarget }),
    setTilesetEditable: (tilesetEditable) => set({ tilesetEditable }),
    rememberToolChange: (previous, next) => {
      if (previous === next) return;
      set({ previousTool: previous });
    },
    setTab: (tab, transition = TAB_SELECTED_TRANSITION) =>
      set((state) =>
        state.tab === tab
          ? state
          : viewStateChange(state, tab, tab === "home" && state.recoveryOpen, transition),
      ),
    openTab: (tab, transition = TAB_SELECTED_TRANSITION) => {
      const state = get();
      const { openTabs } = state;
      if (state.tab === tab && openTabs.includes(tab)) return;
      if (tab === HelpDocumentTab.Guide && state.tab !== HelpDocumentTab.Guide)
        previousGuideTab = state.tab;
      set({
        openTabs: openTabs.includes(tab) ? openTabs : [...openTabs, tab],
        ...viewStateChange(state, tab, tab === "home" && state.recoveryOpen, transition),
      });
    },
    closeTab: (closing, transition = TAB_CLOSED_TRANSITION) =>
      set((state) => {
        const openTabs = state.openTabs.filter((tab) => tab !== closing);
        const nextTab =
          closing === HelpDocumentTab.Guide && openTabs.includes(previousGuideTab)
            ? previousGuideTab
            : (openTabs[0] ?? "home");
        const tab = state.tab === closing ? nextTab : state.tab;
        return {
          openTabs,
          ...viewStateChange(state, tab, tab === "home" && state.recoveryOpen, transition),
        };
      }),
    setRecoveryOpen: (recoveryOpen, transition) =>
      set((state) =>
        state.recoveryOpen === recoveryOpen
          ? state
          : viewStateChange(
              state,
              state.tab,
              recoveryOpen,
              transition ?? {
                trigger: EditorViewChangeTrigger.User,
                reason: recoveryOpen
                  ? EditorViewChangeReason.RecoveryOpened
                  : EditorViewChangeReason.RecoveryClosed,
              },
            ),
      ),
    setNotice: (notice) => set({ notice }),
  }));
  if (storage) {
    const rememberTab = (tab: EditorTab) => {
      if (tab === HelpDocumentTab.Guide) return;
      try {
        storage.setItem(LAST_ACTIVE_TAB_STORAGE_KEY, tab);
      } catch {
        // Navigation remains available when browser storage cannot be written.
      }
    };
    rememberTab(store.getState().tab);
    store.subscribe((state, previous) => {
      if (state.tab !== previous.tab) rememberTab(state.tab);
      if (
        !panelLayoutResizeDepth &&
        state.panelLayoutPreferences !== previous.panelLayoutPreferences
      )
        writePanelLayoutPreferences(state.panelLayoutPreferences, storage);
    });
  }
  return store;
}
