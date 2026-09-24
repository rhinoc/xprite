import { Fragment, useEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { Alert } from "$/components/dialogs/alert";
import { CanvasDisplayPreferencesSection } from "$/components/dialogs/canvas-display-preferences";
import { CursorPreferencesSection } from "$/components/dialogs/cursor-preferences";
import { DiagnosticsPreferences } from "$/components/dialogs/diagnostics-preferences";
import { EditorPreferencesSection } from "$/components/dialogs/editor-preferences";
import { ExperimentalPreferences } from "$/components/dialogs/experimental-preferences";
import { FilesPreferences } from "$/components/dialogs/files-preferences";
import { EditorDialog } from "$/components/dialogs/overlay";
import {
  PreferencesLabel,
  PreferencesCheckbox,
  PreferencesDialogLayoutProvider,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { PREFERENCES_SEARCH_LABELS } from "$/components/dialogs/preferences-dialog/preferences-search-catalog";
import { useAppearancePreferences } from "$/components/dialogs/preferences/use-appearance-preferences";
import { ResetPreferences } from "$/components/dialogs/reset-preferences";
import { TouchInputPreferencesSection } from "$/components/dialogs/touch-input-preferences";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { changeUiLanguage, currentUiLanguage, tUi, type UiLanguage, tUiSource } from "$/i18n";
import {
  DEFAULT_UNDO_PREFERENCES,
  type UndoPreferencesView,
} from "$/managers/dialogs/preferences-model";
import {
  matchesPreferencesSearch,
  PREFERENCES_SEARCH_DELAY_MS,
} from "$/managers/dialogs/preferences-search";
import { WheelDevice, type DetectedWheelDevice } from "$/managers/input/wheel-device-context";
import { AppearanceMode } from "$/managers/preferences/appearance-preferences";
import {
  CanvasDisplaySection,
  DEFAULT_CANVAS_DISPLAY_PREFERENCES,
  resetCanvasDisplaySection,
  type CanvasDisplayColorKey,
} from "$/managers/preferences/canvas-display-preferences";
import type { CanvasDisplayPreferences } from "$/managers/preferences/canvas-display-preferences";
import {
  DEFAULT_CURSOR_PREFERENCES,
  type CursorPreferences,
} from "$/managers/preferences/cursor-preferences";
import { CanvasDisplayPreferenceTarget } from "$/managers/preferences/document-preferences";
import {
  DEFAULT_EDITOR_PREFERENCES,
  type EditorPreferences,
} from "$/managers/preferences/editor-preferences";
import { DEFAULT_FILE_PREFERENCES } from "$/managers/preferences/file-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import {
  DEFAULT_GRID_BOUNDS_PREFERENCES,
  type GridBoundsPreferences,
} from "$/managers/preferences/grid-preferences";
import {
  DEFAULT_GUIDE_SLICE_PREFERENCES,
  type GuideSlicePreferences,
} from "$/managers/preferences/guide-slice-preferences";
import {
  DEFAULT_PREFERENCE_RESET_TARGETS,
  type PreferenceResetTarget,
} from "$/managers/preferences/reset-preferences";
import {
  defaultSelectionPreferences,
  type SelectionPreferences,
} from "$/managers/preferences/selection-preferences";
import {
  defaultTimelineInteractionPreferences,
  type TimelineInteractionPreferences,
} from "$/managers/preferences/timeline-interaction-preferences";
import {
  DEFAULT_TOUCH_INPUT_PREFERENCES,
  normalizeTouchInputPreferences,
  type TouchInputPreferences,
} from "$/managers/preferences/touch-input-preferences";
import {
  normalizeUiElementScale,
  UI_ELEMENT_SCALE_OPTIONS,
} from "$/managers/preferences/ui-element-scale";
import { useUiElementScalePreview } from "$/managers/preferences/use-ui-element-scale-preview";
import type { EditorChromePreferences } from "$/managers/shell/editor-chrome-preferences";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import type { RecoverySettings } from "$/managers/workspace/recovery-settings";
import { WorkspaceContextPresentation } from "$/managers/workspace/workspace-panel-layout";
import {
  Button,
  ButtonVariant,
  Combobox,
  Divider,
  Input,
  ListBox,
  Scrollbar,
  type ListBoxItem,
  type SurfaceBounds,
  useUi,
  isDialogPopupTarget,
} from "@xprite/ui";
import { UiIcon, centerUiPixel, useUiAssets } from "@xprite/ui/assets";
import { setScrollPosition, scrollPosition, isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/dialogs/preferences-dialog/preferences-dialog.module.css";

export interface PreferencesDialogProps {
  editorPreferences?: EditorPreferences;
  onEditorPreferencesChange?: (preferences: EditorPreferences) => void;
  cursorPreferences?: CursorPreferences;
  onCursorPreferencesChange?: (preferences: CursorPreferences) => void;
  undoOptions?: UndoPreferencesView;
  onUndoOptionsChange?: (options: UndoPreferencesView) => void;
  sliceUseKeys?: boolean;
  onSliceUseKeysChange?: (value: boolean) => void;
  guideSlicePreferences?: GuideSlicePreferences;
  onGuideSlicePreferencesChange?: (preferences: GuideSlicePreferences) => void;
  canvasDisplayPreferences?: CanvasDisplayPreferences;
  canvasDisplayDefaults?: CanvasDisplayPreferences;
  onCanvasDisplayDefaultsChange?: (preferences: CanvasDisplayPreferences) => void;
  hasActiveDocument?: boolean;
  onCanvasDisplayPreferencesChange?: (preferences: CanvasDisplayPreferences) => void;
  gridBoundsPreferences?: GridBoundsPreferences;
  gridBoundsDefaults?: GridBoundsPreferences;
  onGridBoundsPreferencesChange?: (bounds: GridBoundsPreferences) => void;
  onGridBoundsDefaultsChange?: (bounds: GridBoundsPreferences) => void;
  filePreferences?: FilePreferences;
  onFilePreferencesChange?: (preferences: FilePreferences) => void;
  selectionPreferences?: SelectionPreferences;
  onSelectionPreferencesChange?: (preferences: SelectionPreferences) => void;
  timelineInteractionPreferences?: TimelineInteractionPreferences;
  onTimelineInteractionPreferencesChange?: (preferences: TimelineInteractionPreferences) => void;
  defaultTimelineFirstFrame?: number;
  onDefaultTimelineFirstFrameChange?: (firstFrame: number) => void;
  canClearRecentFiles?: boolean;
  onClearRecentFiles?: () => void;
  composeGroups?: boolean;
  onComposeGroupsChange?: (value: boolean) => void;
  recoverySettings?: RecoverySettings;
  onRecoverySettingsChange?: (settings: RecoverySettings) => void;
  touchInputPreferences?: TouchInputPreferences;
  onTouchInputPreferencesChange?: (value: TouchInputPreferences) => void;
  wheelDevice?: WheelDevice;
  onWheelDeviceChange?: (device: WheelDevice) => void;
  detectedWheelDevice?: DetectedWheelDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appearanceMode?: AppearanceMode;
  onAppearanceModeChange?: (mode: AppearanceMode) => void;
  onApply?: () => void;
  onAccept?: () => void;
  onCancel?: () => void;
  onHelp?: () => void;
  onLanguageHelp?: () => void;
  onReset?: (targets: readonly PreferenceResetTarget[]) => Promise<void>;
  clientBounds?: SurfaceBounds;
}
const DIAGNOSTICS_SECTION = "Diagnostics";
const RESET_SECTION = "Reset";
const sections = [
  "General",
  "Files",
  "Color",
  "Alerts",
  "Editor",
  "Selection",
  "Timeline",
  "Cursors",
  "Background",
  "Grid",
  "Guides & Slices",
  "Undo",
  "Theme",
  "Extensions",
  "Aseprite Format",
  "Experimental",
  "Tablet",
  DIAGNOSTICS_SECTION,
  RESET_SECTION,
];
const SELECTION_BEHAVIOR_OPTIONS: readonly {
  label: string;
  key?: keyof SelectionPreferences;
  checked?: boolean;
}[] = [
  { label: "Allow moving selection edges", key: "moveEdges" },
  {
    label: "Disable transformation handles when key modifiers are pressed",
    key: "modifiersDisableHandles",
  },
  { label: "Move selection on Add mode", key: "moveOnAddMode" },
  { label: "Select a grid tile with double-click", key: "doubleClickSelectTile" },
  { label: "Snap To Grid when the option is enabled", checked: true },
  { label: "Force RotSprite even for right/straight angles", checked: false },
  {
    label: "Transform cels in selected layers or frames on timeline",
    key: "multicelWhenLayersOrFrames",
  },
];
const noop = () => {};
const PREFERENCES_GUI_X_ORIGIN = 263;
const PREFERENCES_X_INSET = 12;
const PREFERENCES_COORDINATE_SCALE = 2;
const PREFERENCES_RIGHT_EDGE = 691;
const PREFERENCES_DEFAULT_WIDTH = 868;
const PREFERENCES_DEFAULT_HEIGHT = 696;
const PREFERENCES_MIN_NARROW_WIDTH = 280;
const PREFERENCES_MIN_NARROW_HEIGHT = 240;
const PREFERENCES_VIEWPORT_INSET = 16;
const PREFERENCES_NARROW_COLUMN_X = 358;
const PREFERENCES_NARROW_PADDING = 12;
const PREFERENCES_NARROW_HEADER_HEIGHT = 80;
const PREFERENCES_NARROW_ACTION_BOTTOM = 8;
const PREFERENCES_NARROW_FOOTER_HEIGHT = 50;
const PREFERENCES_NARROW_BODY_TOP = 102;
const PREFERENCES_NARROW_SCROLLBAR_WIDTH = 12;
const PREFERENCES_NARROW_SCROLLBAR_GAP = 4;
const PREFERENCES_BUTTON_HEIGHT = 17;
const PREFERENCES_ACTION_GAP = 4;
const PREFERENCES_ACTION_WIDTH = 60;
const PREFERENCES_DIALOG_CHROME_HEIGHT = 46;
const PREFERENCES_CLIENT_WIDTH_INSETS = 24;
const PREFERENCES_NARROW_CONTENT_GAP = 8;
const MIN_TIMELINE_FIRST_FRAME = -2147483648;
const MAX_TIMELINE_FIRST_FRAME = 2147483647;
const narrowContentEnds: Record<string, readonly [number, number]> = {
  General: [424, 9],
  Cursors: [416, 17],
  Files: [452, 16],
  Editor: [336, 16],
  "Guides & Slices": [233, 17],
  Undo: [193, 16],
  Experimental: [389, 12],
  Tablet: [394, 18],
  Selection: [269, 16],
  Timeline: [305, 14],
  Background: [255, 17],
  Grid: [449, 17],
  [DIAGNOSTICS_SECTION]: [531, 14],
  [RESET_SECTION]: [358, 12],
};

function preferencesRightEdge(client: SurfaceBounds, narrowLayout: boolean) {
  if (narrowLayout)
    return PREFERENCES_NARROW_COLUMN_X + Math.max(0, client.width - PREFERENCES_NARROW_PADDING * 2);
  return Math.max(
    PREFERENCES_RIGHT_EDGE,
    Math.floor((client.width + PREFERENCES_X_INSET) / PREFERENCES_COORDINATE_SCALE) +
      PREFERENCES_GUI_X_ORIGIN,
  );
}

function preferencesBox(
  client: SurfaceBounds,
  x: number,
  y: number,
  width: number,
  height: number,
  narrowLayout = false,
): SurfaceBounds {
  const rightEdge = preferencesRightEdge(client, narrowLayout);
  if (narrowLayout) {
    const fillsRightEdge = x + width === PREFERENCES_RIGHT_EDGE;
    const availableWidth = Math.max(0, rightEdge - Math.max(x, PREFERENCES_NARROW_COLUMN_X));
    const adaptedWidth = fillsRightEdge ? availableWidth : Math.min(width, availableWidth);
    return {
      x: client.x + PREFERENCES_NARROW_PADDING + Math.max(0, x - PREFERENCES_NARROW_COLUMN_X),
      y: client.y + PREFERENCES_NARROW_HEADER_HEIGHT + (y - 105) * 2,
      width: Math.max(0, adaptedWidth),
      height: height * 2,
    };
  }
  const adaptedWidth = x + width === PREFERENCES_RIGHT_EDGE ? rightEdge - x : width;
  return {
    x:
      client.x -
      PREFERENCES_X_INSET +
      (x - PREFERENCES_GUI_X_ORIGIN) * PREFERENCES_COORDINATE_SCALE,
    y: client.y - 34 + (y - 88) * 2,
    width: adaptedWidth * PREFERENCES_COORDINATE_SCALE,
    height: height * 2,
  };
}
const guideSliceColorRows = [
  { key: "layerEdgesColor", label: "ui.layer.edges.color", y: 123 },
  { key: "autoGuidesColor", label: "ui.auto.guides.color", y: 143 },
  { key: "defaultSliceColor", label: "ui.default.color.aa509e35", y: 190 },
] as const;
type PreferencesColorTarget = keyof GuideSlicePreferences | CanvasDisplayColorKey | "cursorColor";

function isGuideSliceColorTarget(
  target: PreferencesColorTarget,
): target is keyof GuideSlicePreferences {
  return (
    target === "layerEdgesColor" || target === "autoGuidesColor" || target === "defaultSliceColor"
  );
}

const enabledSections = new Set([
  "General",
  "Files",
  "Editor",
  "Selection",
  "Timeline",
  "Cursors",
  "Background",
  "Grid",
  "Guides & Slices",
  "Undo",
  "Tablet",
  "Experimental",
  DIAGNOSTICS_SECTION,
  RESET_SECTION,
]);
function preferencesSectionTitle(section: string): string {
  switch (section) {
    case "Tablet":
      return tUi("ui.preferences.touch.input");
    case "Selection":
      return "Editor Selection";
    case "Cursors":
      return tUi("ui.cursors.ui.mouse");
    case "Guides & Slices":
      return tUi("ui.guides");
    case "Background":
      return "Checkered Background";
    case "Experimental":
      return "User Interface";
    case RESET_SECTION:
      return tUi("ui.reset.preferences.title");
    default:
      return section;
  }
}

function PreferencesChrome({
  client,
  section,
  languageHot,
  onLanguageHelp,
  onLanguageHoverChange,
  onSectionChange,
  search,
  onSearchChange,
  sectionItems,
}: {
  client: SurfaceBounds;
  section: string;
  languageHot: boolean;
  onLanguageHelp?: () => void;
  onLanguageHoverChange: (hot: boolean) => void;
  onSectionChange: (section: string) => void;
  search: string;
  onSearchChange: (query: string) => void;
  sectionItems: ListBoxItem[];
}) {
  const { style: uiStyle } = useUi();
  const narrowLayout = usePreferencesDialogNarrowLayout();
  const colors = uiStyle.colors;
  const box = (x: number, y: number, width: number, height: number) =>
    preferencesBox(client, x, y, width, height, narrowLayout);
  const label = (
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color = colors.text,
  ) => (
    <PreferencesLabel
      key={`${text}-${x}-${y}`}
      bounds={box(x, y, width, height)}
      relativeTo={client}
      text={text}
      color={color}
    />
  );
  const divider = (x: number, y: number, width: number, height: number, text = "") => (
    <Divider
      key={`${text || "divider"}-${x}-${y}`}
      bounds={box(x, y, width, height)}
      relativeTo={client}
      text={text}
    />
  );
  const generalLayout = ![
    "Files",
    "Editor",
    "Selection",
    "Timeline",
    "Cursors",
    "Background",
    "Grid",
    "Guides & Slices",
    "Undo",
    "Experimental",
    "Tablet",
    DIAGNOSTICS_SECTION,
    RESET_SECTION,
  ].includes(section);

  return (
    <>
      {!narrowLayout && (
        <>
          <Input
            aria-label="Search preferences"
            data-preferences-search
            bounds={box(269, 105, 85, 16)}
            relativeTo={client}
            value={search}
            onValueChange={onSearchChange}
            placeholder="Search"
            leading={<UiIcon part="icon_search" scale={2} color="currentColor" />}
          />
          {search && (
            <Button
              aria-label={tUi("ui.clear.search")}
              className={styles.searchClearButton}
              data-preferences-search
              bounds={box(343, 108, 8, 10)}
              relativeTo={client}
              variant={ButtonVariant.FlatIcon}
              fill={colors.textbox_face}
              icon="window_close_icon"
              onClick={() => onSearchChange("")}
            />
          )}
          <ListBox
            data-ui-listbox="preferences-sections"
            aria-label="Preferences sections"
            bounds={box(269, 125, 85, 276)}
            relativeTo={client}
            items={sectionItems}
            value={section}
            onValueChange={onSectionChange}
          />
          {section !== "Background" &&
            section !== "Grid" &&
            divider(358, 105, 333, 11, preferencesSectionTitle(section))}
          {divider(269, 405, 422, 4)}
        </>
      )}
      {section === "Files" && (
        <>
          {label("Default extension for:", 358, 120, 333, 12)}
          {[
            "File > Save:",
            "File > Export (one image):",
            "File > Export (animation):",
            "File > Export Sprite Sheet:",
          ].map((text, index) =>
            label(
              text,
              358,
              136 + index * (narrowLayout ? 36 : 20),
              narrowLayout ? 333 : 165,
              16,
              index === 3 ? colors.disabled : colors.text,
            ),
          )}
          {label(tUi("ui.recent.items"), 358, narrowLayout ? 286 : 220, 100, 16, colors.text)}
          {divider(358, narrowLayout ? 344 : 264, 333, 11, "Recover Files")}
        </>
      )}

      {section === "Undo" && label("MB", 520, 125, 30, 16)}
      {section === "Experimental" && (
        <>
          {divider(358, 303, 333, 11, "Color Quantization")}
          {divider(358, 358, 333, 11, "Performance")}
        </>
      )}
      {generalLayout && (
        <>
          {divider(358, narrowLayout ? 270 : 201, 333, 4)}
          {divider(358, narrowLayout ? 394 : 325, 333, 4)}
          {label("Appearance mode:", 358, 120, narrowLayout ? 333 : 81, narrowLayout ? 12 : 17)}
          {label(
            "Screen Scaling:",
            358,
            narrowLayout ? 158 : 141,
            narrowLayout ? 333 : 81,
            narrowLayout ? 12 : 16,
          )}
          {label(
            "UI Element Scaling:",
            358,
            narrowLayout ? 196 : 161,
            narrowLayout ? 333 : 81,
            narrowLayout ? 12 : 16,
          )}
          {label(
            "Language:",
            358,
            narrowLayout ? 234 : 181,
            narrowLayout ? 333 : 81,
            narrowLayout ? 12 : 16,
            !onLanguageHelp ? colors.disabled : languageHot ? colors.link_hover : colors.link_text,
          )}
          <Button
            aria-label="Language help"
            bounds={box(
              358,
              narrowLayout ? 234 : 181,
              narrowLayout ? 333 : 81,
              narrowLayout ? 12 : 16,
            )}
            relativeTo={client}
            paintArtwork={false}
            disabled={!onLanguageHelp}
            onClick={onLanguageHelp}
            onPointerEnter={() => onLanguageHoverChange(true)}
            onPointerLeave={() => onLanguageHoverChange(false)}
          />
          {label(
            "Locate Configuration File",
            358,
            narrowLayout ? 402 : 333,
            333,
            9,
            colors.disabled,
          )}
          {label("Locate Crash Folder", 358, narrowLayout ? 415 : 346, 333, 9, colors.disabled)}
        </>
      )}
    </>
  );
}

/** Preferences pages use the measured desktop layout and a stacked layout on narrow viewports. */
export function PreferencesDialog({
  open,
  onOpenChange,
  appearanceMode,
  onAppearanceModeChange,
  onApply,
  onAccept,
  onCancel,
  onHelp,
  onLanguageHelp,
  onReset,
  recoverySettings,
  onRecoverySettingsChange,
  editorPreferences = DEFAULT_EDITOR_PREFERENCES,
  onEditorPreferencesChange,
  cursorPreferences = DEFAULT_CURSOR_PREFERENCES,
  onCursorPreferencesChange,
  undoOptions = DEFAULT_UNDO_PREFERENCES,
  onUndoOptionsChange,
  sliceUseKeys = false,
  onSliceUseKeysChange,
  guideSlicePreferences = DEFAULT_GUIDE_SLICE_PREFERENCES,
  onGuideSlicePreferencesChange,
  canvasDisplayPreferences = DEFAULT_CANVAS_DISPLAY_PREFERENCES,
  canvasDisplayDefaults = DEFAULT_CANVAS_DISPLAY_PREFERENCES,
  onCanvasDisplayDefaultsChange,
  hasActiveDocument = false,
  onCanvasDisplayPreferencesChange,
  gridBoundsPreferences = DEFAULT_GRID_BOUNDS_PREFERENCES,
  gridBoundsDefaults = DEFAULT_GRID_BOUNDS_PREFERENCES,
  onGridBoundsPreferencesChange,
  onGridBoundsDefaultsChange,
  filePreferences = DEFAULT_FILE_PREFERENCES,
  onFilePreferencesChange,
  selectionPreferences = defaultSelectionPreferences,
  onSelectionPreferencesChange,
  timelineInteractionPreferences = defaultTimelineInteractionPreferences,
  onTimelineInteractionPreferencesChange,
  defaultTimelineFirstFrame = 1,
  onDefaultTimelineFirstFrameChange,
  canClearRecentFiles = false,
  onClearRecentFiles = noop,
  composeGroups = false,
  onComposeGroupsChange,
  touchInputPreferences = DEFAULT_TOUCH_INPUT_PREFERENCES,
  onTouchInputPreferencesChange,
  wheelDevice = WheelDevice.Auto,
  onWheelDeviceChange,
  detectedWheelDevice = null,
  clientBounds: suppliedClientBounds,
}: PreferencesDialogProps) {
  const sceneBounds = useSceneBounds();
  const chromePreferences = useEditorChromePreferences();
  const elementScaling = useUiElementScalePreview(open);
  const clientBounds = suppliedClientBounds ?? sceneBounds;
  const assets = useUiAssets(),
    host = useRef<HTMLDivElement>(null);
  const dialogRoot = useRef<HTMLDivElement | null>(null);
  const selectedAppearanceMode = appearanceMode ?? AppearanceMode.Light;
  const updateAppearanceMode = (next: AppearanceMode) => {
    onAppearanceModeChange?.(next);
  };
  const [windowBounds, setWindowBounds] = useState<SurfaceBounds | null>(null);
  const [narrowScrollTop, setNarrowScrollTop] = useState(0);
  const narrowScrollViewport = useRef<HTMLDivElement>(null);
  const [languageHot, setLanguageHot] = useState(false);
  const [languageDraft, setLanguageDraft] = useState(currentUiLanguage);
  const [section, setSection] = useState("General");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef(search);
  searchRef.current = search;
  const matchingSections = sections.filter((label) => {
    if (!enabledSections.has(label)) return false;
    const labels = [
      label,
      preferencesSectionTitle(label),
      ...(PREFERENCES_SEARCH_LABELS[label] ?? []),
    ];
    return matchesPreferencesSearch(
      searchQuery,
      labels.flatMap((text) => [text, tUiSource(text)]),
    );
  });
  const sectionItems: ListBoxItem[] = sections.flatMap((label) => [
    ...(label === DIAGNOSTICS_SECTION ? [{ separator: true as const }] : []),
    {
      value: label,
      label: label === "Tablet" ? preferencesSectionTitle(label) : label,
      disabled: !matchingSections.includes(label),
    },
  ]);
  const sectionOptions = sections.map((label) => ({
    value: label,
    label: label === "Tablet" ? preferencesSectionTitle(label) : label,
    disabled: !matchingSections.includes(label),
  }));
  const clearSearch = () => {
    setSearch("");
    setSearchQuery("");
  };
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchQuery(search), PREFERENCES_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const firstMatchingSection = matchingSections[0];
  const selectedSectionMatches = matchingSections.includes(section);
  useEffect(() => {
    if (firstMatchingSection && !selectedSectionMatches) {
      setSection(firstMatchingSection);
      setNarrowScrollTop(0);
      setColorPicker(null);
    }
  }, [firstMatchingSection, selectedSectionMatches]);
  const [resetTargets, setResetTargets] = useState<PreferenceResetTarget[]>(() => [
    ...DEFAULT_PREFERENCE_RESET_TARGETS,
  ]);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const resetConfirmation = useRef(false);
  resetConfirmation.current = resetConfirmationOpen;
  const [recoveryDraft, setRecoveryDraft] = useState<RecoverySettings>(
    recoverySettings ?? { enabled: true, intervalMinutes: 2, retentionDays: 7 },
  );
  const [editorDraft, setEditorDraft] = useState<EditorPreferences>(editorPreferences);
  const editorPreferencesChanged = useRef(false);
  const updateEditorPreferences = (patch: Partial<EditorPreferences>) => {
    editorPreferencesChanged.current = true;
    setEditorDraft((current) => ({ ...current, ...patch }));
  };
  const [cursorDraft, setCursorDraft] = useState<CursorPreferences>(cursorPreferences);
  const cursorChanged = useRef(false);
  const [touchInputDraft, setTouchInputDraft] = useState(touchInputPreferences);
  const [wheelDraft, setWheelDraft] = useState<WheelDevice>(wheelDevice);
  const [chromePreferencesDraft, setChromePreferencesDraft] = useState<EditorChromePreferences>(
    () => ({
      uiElementScale: chromePreferences.uiElementScale,
      showEditorMenuBar: chromePreferences.showEditorMenuBar,
      showShortcutToolbar: chromePreferences.showShortcutToolbar,
      showCanvasScrollbars: chromePreferences.showCanvasScrollbars,
      contextBarPresentation: chromePreferences.contextBarPresentation,
      showHomeTabOnStart: chromePreferences.showHomeTabOnStart,
      expandMenuBarItemsOnMouseover: chromePreferences.expandMenuBarItemsOnMouseover,
    }),
  );
  const [composeDraft, setComposeDraft] = useState(composeGroups);
  const [sliceKeysDraft, setSliceKeysDraft] = useState(sliceUseKeys);
  const [guideSliceDraft, setGuideSliceDraft] = useState(guideSlicePreferences);
  const [documentDisplayDraft, setDocumentDisplayDraft] =
    useState<CanvasDisplayPreferences>(canvasDisplayPreferences);
  const [defaultDisplayDraft, setDefaultDisplayDraft] =
    useState<CanvasDisplayPreferences>(canvasDisplayDefaults);
  const [documentGridDraft, setDocumentGridDraft] =
    useState<GridBoundsPreferences>(gridBoundsPreferences);
  const [defaultGridDraft, setDefaultGridDraft] =
    useState<GridBoundsPreferences>(gridBoundsDefaults);
  const documentGridChanged = useRef(false);
  const defaultGridChanged = useRef(false);
  const [backgroundTarget, setBackgroundTarget] = useState(CanvasDisplayPreferenceTarget.Document);
  const [gridTarget, setGridTarget] = useState(CanvasDisplayPreferenceTarget.Document);
  const displayTarget = section === "Grid" ? gridTarget : backgroundTarget;
  const editingDisplayDefaults = displayTarget === CanvasDisplayPreferenceTarget.Defaults;
  const canvasDisplayDraft = editingDisplayDefaults ? defaultDisplayDraft : documentDisplayDraft;
  const [filePreferencesDraft, setFilePreferencesDraft] =
    useState<FilePreferences>(filePreferences);
  const [selectionPreferencesDraft, setSelectionPreferencesDraft] =
    useState<SelectionPreferences>(selectionPreferences);
  const [timelineInteractionPreferencesDraft, setTimelineInteractionPreferencesDraft] =
    useState<TimelineInteractionPreferences>(timelineInteractionPreferences);
  const [timelineFirstFrameDraft, setTimelineFirstFrameDraft] = useState(defaultTimelineFirstFrame);
  const [timelineFirstFrameText, setTimelineFirstFrameText] = useState(
    String(defaultTimelineFirstFrame),
  );
  const [colorPicker, setColorPicker] = useState<{
    target: PreferencesColorTarget;
    title: string;
    anchor: SurfaceBounds;
  } | null>(null);
  const [undoDraft, setUndoDraft] = useState<UndoPreferencesView>(undoOptions);
  const [undoLimitText, setUndoLimitText] = useState(String(undoOptions.maxBytes / 1048576 || 64));
  const undoLimitMb = useRef(64);
  const undoChanged = useRef(false);
  const sliceKeysChanged = useRef(false);
  const guideSliceChanged = useRef(false);
  const canvasDisplayChanged = useRef(false);
  const defaultDisplayChanged = useRef(false);
  const filePreferencesChanged = useRef(false);
  const selectionPreferencesChanged = useRef(false);
  const timelineInteractionPreferencesChanged = useRef(false);
  const timelineFirstFrameChanged = useRef(false);
  const composeChanged = useRef(false);
  const recoveryChanged = useRef(false);
  const touchInputChanged = useRef(false);
  const wheelChanged = useRef(false);
  const chromePreferencesChanged = useRef(false);
  const retentionDays = useRef(7);
  useEffect(() => {
    if (!open) return;
    setSection("General");
    clearSearch();
    setLanguageDraft(currentUiLanguage());
    setResetTargets([...DEFAULT_PREFERENCE_RESET_TARGETS]);
    setResetConfirmationOpen(false);
    setNarrowScrollTop(0);
    setRecoveryDraft(recoverySettings ?? { enabled: true, intervalMinutes: 2, retentionDays: 7 });
    retentionDays.current = recoverySettings?.retentionDays || 7;
    setEditorDraft(editorPreferences);
    editorPreferencesChanged.current = false;
    setCursorDraft(cursorPreferences);
    cursorChanged.current = false;
    setTouchInputDraft(touchInputPreferences);
    setWheelDraft(wheelDevice);
    setChromePreferencesDraft({
      uiElementScale: chromePreferences.uiElementScale,
      showEditorMenuBar: chromePreferences.showEditorMenuBar,
      showShortcutToolbar: chromePreferences.showShortcutToolbar,
      showCanvasScrollbars: chromePreferences.showCanvasScrollbars,
      contextBarPresentation: chromePreferences.contextBarPresentation,
      showHomeTabOnStart: chromePreferences.showHomeTabOnStart,
      expandMenuBarItemsOnMouseover: chromePreferences.expandMenuBarItemsOnMouseover,
    });
    chromePreferencesChanged.current = false;
    setComposeDraft(composeGroups);
    composeChanged.current = false;
    setSliceKeysDraft(sliceUseKeys);
    sliceKeysChanged.current = false;
    setGuideSliceDraft(guideSlicePreferences);
    guideSliceChanged.current = false;
    setDocumentDisplayDraft(canvasDisplayPreferences);
    setDefaultDisplayDraft(canvasDisplayDefaults);
    setDocumentGridDraft(gridBoundsPreferences);
    setDefaultGridDraft(gridBoundsDefaults);
    documentGridChanged.current = false;
    defaultGridChanged.current = false;
    const initialTarget =
      hasActiveDocument || !onCanvasDisplayDefaultsChange
        ? CanvasDisplayPreferenceTarget.Document
        : CanvasDisplayPreferenceTarget.Defaults;
    setBackgroundTarget(initialTarget);
    setGridTarget(initialTarget);
    canvasDisplayChanged.current = false;
    defaultDisplayChanged.current = false;
    setFilePreferencesDraft(filePreferences);
    filePreferencesChanged.current = false;
    setSelectionPreferencesDraft(selectionPreferences);
    selectionPreferencesChanged.current = false;
    setTimelineInteractionPreferencesDraft(timelineInteractionPreferences);
    timelineInteractionPreferencesChanged.current = false;
    setTimelineFirstFrameDraft(defaultTimelineFirstFrame);
    setTimelineFirstFrameText(String(defaultTimelineFirstFrame));
    timelineFirstFrameChanged.current = false;
    setColorPicker(null);
    setUndoDraft(undoOptions);
    undoChanged.current = false;
    setUndoLimitText(String(undoOptions.maxBytes / 1048576 || undoLimitMb.current));
    recoveryChanged.current = false;
    touchInputChanged.current = false;
    wheelChanged.current = false;
  }, [open]);
  const commitSettings = () => {
    elementScaling.apply();
    if (editorPreferencesChanged.current) onEditorPreferencesChange?.(editorDraft);
    editorPreferencesChanged.current = false;
    if (defaultGridChanged.current) onGridBoundsDefaultsChange?.(defaultGridDraft);
    if (documentGridChanged.current) onGridBoundsPreferencesChange?.(documentGridDraft);
    defaultGridChanged.current = false;
    documentGridChanged.current = false;
    if (languageDraft !== currentUiLanguage()) void changeUiLanguage(languageDraft);
    if (cursorChanged.current) onCursorPreferencesChange?.(cursorDraft);
    cursorChanged.current = false;
    if (chromePreferencesChanged.current)
      chromePreferences.setPreferences({
        ...chromePreferencesDraft,
        uiElementScale: elementScaling.scale,
      });
    chromePreferencesChanged.current = false;
    if (composeChanged.current) onComposeGroupsChange?.(composeDraft);
    composeChanged.current = false;
    if (sliceKeysChanged.current) onSliceUseKeysChange?.(sliceKeysDraft);
    sliceKeysChanged.current = false;
    if (guideSliceChanged.current) onGuideSlicePreferencesChange?.(guideSliceDraft);
    guideSliceChanged.current = false;
    if (canvasDisplayChanged.current) onCanvasDisplayPreferencesChange?.(documentDisplayDraft);
    if (defaultDisplayChanged.current) onCanvasDisplayDefaultsChange?.(defaultDisplayDraft);
    canvasDisplayChanged.current = false;
    defaultDisplayChanged.current = false;
    if (filePreferencesChanged.current) onFilePreferencesChange?.(filePreferencesDraft);
    filePreferencesChanged.current = false;
    if (selectionPreferencesChanged.current)
      onSelectionPreferencesChange?.(selectionPreferencesDraft);
    selectionPreferencesChanged.current = false;
    if (timelineInteractionPreferencesChanged.current)
      onTimelineInteractionPreferencesChange?.(timelineInteractionPreferencesDraft);
    timelineInteractionPreferencesChanged.current = false;
    if (timelineFirstFrameChanged.current)
      onDefaultTimelineFirstFrameChange?.(timelineFirstFrameDraft);
    timelineFirstFrameChanged.current = false;
    if (undoChanged.current) onUndoOptionsChange?.(undoDraft);
    undoChanged.current = false;
    if (recoveryChanged.current) onRecoverySettingsChange?.(recoveryDraft);
    if (touchInputChanged.current) onTouchInputPreferencesChange?.(touchInputDraft);
    if (wheelChanged.current) onWheelDeviceChange?.(wheelDraft);
    recoveryChanged.current = false;
    touchInputChanged.current = false;
    wheelChanged.current = false;
  };
  const updateCursorPreferences = (patch: Partial<CursorPreferences>) => {
    cursorChanged.current = true;
    setCursorDraft((current) => ({ ...current, ...patch }));
  };
  const updateRecovery = (patch: Partial<RecoverySettings>) => {
    recoveryChanged.current = true;
    setRecoveryDraft((current) => ({ ...current, ...patch }));
  };
  const updateCanvasDisplay = (patch: Partial<CanvasDisplayPreferences>) => {
    if (editingDisplayDefaults) {
      defaultDisplayChanged.current = true;
      setDefaultDisplayDraft((current) => ({ ...current, ...patch }));
    } else {
      canvasDisplayChanged.current = true;
      setDocumentDisplayDraft((current) => ({ ...current, ...patch }));
    }
  };
  const updateGridBounds = (patch: Partial<GridBoundsPreferences>) => {
    if (editingDisplayDefaults) {
      defaultGridChanged.current = true;
      setDefaultGridDraft((current) => ({ ...current, ...patch }));
    } else {
      documentGridChanged.current = true;
      setDocumentGridDraft((current) => ({ ...current, ...patch }));
    }
  };
  const updateFilePreferences = (patch: Partial<FilePreferences>) => {
    filePreferencesChanged.current = true;
    setFilePreferencesDraft((current) => ({ ...current, ...patch }));
  };
  const updateSelectionPreferences = (patch: Partial<SelectionPreferences>) => {
    selectionPreferencesChanged.current = true;
    setSelectionPreferencesDraft((current) => ({ ...current, ...patch }));
  };
  const updateTimelineInteractionPreferences = (patch: Partial<TimelineInteractionPreferences>) => {
    timelineInteractionPreferencesChanged.current = true;
    setTimelineInteractionPreferencesDraft((current) => ({ ...current, ...patch }));
  };
  const updateChromePreferences = (patch: Partial<EditorChromePreferences>) => {
    chromePreferencesChanged.current = true;
    setChromePreferencesDraft((current) => ({ ...current, ...patch }));
  };
  const checks = [
    {
      label: "Show editor menu bar",
      checked: chromePreferencesDraft.showEditorMenuBar,
      onCheckedChange: (showEditorMenuBar: boolean) =>
        updateChromePreferences({ showEditorMenuBar }),
      disabled: false,
    },
    {
      label: "Show shortcut toolbar",
      checked: chromePreferencesDraft.showShortcutToolbar,
      onCheckedChange: (showShortcutToolbar: boolean) =>
        updateChromePreferences({ showShortcutToolbar }),
      disabled: false,
    },
    {
      label: "Show tool options in toolbar",
      checked:
        chromePreferencesDraft.contextBarPresentation === WorkspaceContextPresentation.Docked,
      onCheckedChange: (docked: boolean) =>
        updateChromePreferences({
          contextBarPresentation: docked
            ? WorkspaceContextPresentation.Docked
            : WorkspaceContextPresentation.ToolPopup,
        }),
      disabled: false,
    },
    {
      label: "Show editor file dialog",
      checked: false,
      onCheckedChange: noop,
      disabled: true,
    },
    {
      label: "Show Home tab when editor starts",
      checked: chromePreferencesDraft.showHomeTabOnStart,
      onCheckedChange: (showHomeTabOnStart: boolean) =>
        updateChromePreferences({ showHomeTabOnStart }),
      disabled: false,
    },
    {
      label: "Expand menu bar items on mouseover",
      checked: chromePreferencesDraft.expandMenuBarItemsOnMouseover,
      onCheckedChange: (expandMenuBarItemsOnMouseover: boolean) =>
        updateChromePreferences({ expandMenuBarItemsOnMouseover }),
      disabled: false,
    },
    {
      label: "Draw a separation between each palette entry",
      checked: true,
      onCheckedChange: noop,
      disabled: true,
    },
  ];
  const resetTimelineSelectionPreferences = () => {
    timelineInteractionPreferencesChanged.current = true;
    setTimelineInteractionPreferencesDraft((current) => ({
      ...current,
      keepSelection: defaultTimelineInteractionPreferences.keepSelection,
      selectOnClick: defaultTimelineInteractionPreferences.selectOnClick,
      selectOnClickWithKey: defaultTimelineInteractionPreferences.selectOnClickWithKey,
      selectOnDrag: defaultTimelineInteractionPreferences.selectOnDrag,
      dragAndDropFromEdges: defaultTimelineInteractionPreferences.dragAndDropFromEdges,
    }));
  };
  const openColorPicker = (target: PreferencesColorTarget, title: string, anchor: SurfaceBounds) =>
    setColorPicker({ target, title, anchor });
  const transaction = useAppearancePreferences({
    open,
    mode: selectedAppearanceMode,
    onModeChange: updateAppearanceMode,
    onOpenChange,
    onApply: () => {
      commitSettings();
      onApply?.();
    },
    onAccept: () => {
      commitSettings();
      onAccept?.();
    },
    onCancel: () => {
      elementScaling.cancel();
      onCancel?.();
    },
  });
  const { cancel, accept, apply, preview } = transaction;
  const callbacks = useRef(transaction);
  callbacks.current = transaction;
  useEffect(() => {
    if (!open) {
      setWindowBounds(null);
      setNarrowScrollTop(0);
      if (narrowScrollViewport.current) setScrollPosition(narrowScrollViewport.current, { y: 0 });
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = () => dialogRoot.current?.focus({ preventScroll: true });
    focusDialog();
    const focus = (event: FocusEvent) => {
      if (resetConfirmation.current) return;
      const target = event.target;
      if (!host.current?.contains(target as Node) && !isDialogPopupTarget(host.current, target))
        focusDialog();
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (resetConfirmation.current) return;
      if (isDialogPopupTarget(host.current, event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (searchRef.current) {
          clearSearch();
          return;
        }
        callbacks.current.cancel();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(host.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        nodes.length &&
        (index < 0 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === nodes.length - 1))
      ) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  const minimumWidth = Math.min(PREFERENCES_MIN_NARROW_WIDTH, clientBounds.width);
  const minimumHeight = Math.min(PREFERENCES_MIN_NARROW_HEIGHT, clientBounds.height);
  const maximumWidth = Math.max(minimumWidth, clientBounds.width - PREFERENCES_VIEWPORT_INSET);
  const maximumHeight = Math.max(minimumHeight, clientBounds.height - PREFERENCES_VIEWPORT_INSET);
  const width = Math.max(
    minimumWidth,
    Math.min(maximumWidth, windowBounds?.width ?? PREFERENCES_DEFAULT_WIDTH),
  );
  const narrowLayout =
    width < PREFERENCES_DEFAULT_WIDTH ||
    Math.min(maximumHeight, windowBounds?.height ?? PREFERENCES_DEFAULT_HEIGHT) <
      PREFERENCES_DEFAULT_HEIGHT;
  const [lastContentY, lastContentHeight] = narrowContentEnds[section] ?? [105, 11];
  const narrowContentBottom = narrowLayout
    ? PREFERENCES_NARROW_HEADER_HEIGHT + (lastContentY - 105) * 2 + lastContentHeight * 2
    : 0;
  const narrowDefaultHeight =
    narrowContentBottom +
    PREFERENCES_NARROW_CONTENT_GAP +
    PREFERENCES_BUTTON_HEIGHT * 2 +
    PREFERENCES_NARROW_ACTION_BOTTOM +
    PREFERENCES_DIALOG_CHROME_HEIGHT;
  const height = Math.max(
    minimumHeight,
    Math.min(
      maximumHeight,
      windowBounds?.height ?? (narrowLayout ? narrowDefaultHeight : PREFERENCES_DEFAULT_HEIGHT),
    ),
  );
  const bounds = {
    x: Math.max(
      clientBounds.x,
      Math.min(
        clientBounds.x + clientBounds.width - width,
        windowBounds?.x ?? centerUiPixel(clientBounds.x, clientBounds.width, width),
      ),
    ),
    y: Math.max(
      clientBounds.y,
      Math.min(
        clientBounds.y + clientBounds.height - height,
        windowBounds?.y ?? centerUiPixel(clientBounds.y, clientBounds.height, height),
      ),
    ),
    width,
    height,
  };
  return (
    <PreferencesDialogLayoutProvider narrowLayout={narrowLayout}>
      <div
        ref={host}
        className="xse-dialog-backdrop"
        onFocusCapture={(event) => {
          if (event.target === dialogRoot.current) return;
          if (!(event.target instanceof Element)) return;
          if (
            event.target.closest(
              '[data-preferences-search], [data-preferences-navigation], [data-ui-listbox="preferences-sections"]',
            )
          )
            return;
          if (searchRef.current) clearSearch();
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (isImeKeyboardEvent(event.nativeEvent)) return;
          if (resetConfirmationOpen) return;
          if (event.key === "Enter" && event.target instanceof HTMLButtonElement) return;
          if (event.altKey && event.key.toLowerCase() === "c") {
            event.preventDefault();
            cancel();
          } else if (event.altKey && event.key.toLowerCase() === "a") {
            event.preventDefault();
            apply();
          } else if (event.key === "Enter" || (event.altKey && event.key.toLowerCase() === "o")) {
            event.preventDefault();
            accept();
          }
        }}
      >
        <EditorDialog
          open
          title="Preferences"
          bounds={bounds}
          onBoundsChange={setWindowBounds}
          onOpenChange={cancel}
          minSize={{ width: minimumWidth, height: minimumHeight }}
          moveable={!narrowLayout}
          resizable={!narrowLayout}
          autoFocus={false}
          onRootRef={(node) => {
            dialogRoot.current = node;
          }}
          modal
          constrainToViewport={!narrowLayout}
          titlebarActions={({ bounds: b }) => (
            <Button
              aria-label="Preferences Help"
              bounds={{
                x: b.x + b.width - 44,
                y: b.y + 6,
                width: 18,
                height: 22,
              }}
              relativeTo={b}
              part="window_button_normal"
              hotPart="window_button_hot"
              pushedPart="window_button_selected"
              icon="window_help_icon"
              insetContent={false}
              disabled={!onHelp}
              onClick={onHelp}
            />
          )}
        >
          {({ clientBounds: dialogClient }) => {
            const client = {
              ...dialogClient,
              width: Math.max(0, bounds.width - PREFERENCES_CLIENT_WIDTH_INSETS),
              height: Math.max(0, bounds.height - PREFERENCES_DIALOG_CHROME_HEIGHT),
            };
            // Desktop controls follow the measured GUI coordinates; narrow mode maps the
            // content column to the full dialog width and moves section navigation above it.
            const rightEdge = preferencesRightEdge(client, narrowLayout);
            const [lastContentY, lastContentHeight] = narrowContentEnds[section] ?? [105, 11];
            const narrowContentBottom =
              PREFERENCES_NARROW_HEADER_HEIGHT + (lastContentY - 105) * 2 + lastContentHeight * 2;
            const narrowFooterTop = Math.max(
              0,
              client.height - PREFERENCES_NARROW_ACTION_BOTTOM - PREFERENCES_BUTTON_HEIGHT * 2,
            );
            const narrowBodyHeight = Math.max(
              0,
              client.height - PREFERENCES_NARROW_FOOTER_HEIGHT - PREFERENCES_NARROW_BODY_TOP,
            );
            const narrowContentSize = Math.max(
              narrowBodyHeight,
              narrowContentBottom - PREFERENCES_NARROW_BODY_TOP,
            );
            const narrowMaxScroll = Math.max(0, narrowContentSize - narrowBodyHeight);
            const narrowScroll = Math.max(0, Math.min(narrowMaxScroll, narrowScrollTop));
            const contentClient =
              narrowLayout && narrowMaxScroll > 0
                ? {
                    ...client,
                    width: Math.max(
                      0,
                      client.width -
                        PREFERENCES_NARROW_SCROLLBAR_WIDTH -
                        PREFERENCES_NARROW_SCROLLBAR_GAP,
                    ),
                  }
                : client;
            const box = (x: number, y: number, width: number, height: number) =>
              preferencesBox(contentClient, x, y, width, height, narrowLayout);
            const actionY = narrowLayout
              ? 105 + (narrowFooterTop - PREFERENCES_NARROW_HEADER_HEIGHT) / 2
              : 413;
            const appearanceButtons = narrowLayout
              ? [
                  { value: AppearanceMode.Light, label: "Light", x: 443, width: 40 },
                  { value: AppearanceMode.Dark, label: "Dark", x: 486, width: 40 },
                  { value: AppearanceMode.System, label: "System", x: 529, width: 54 },
                ]
              : [
                  { value: AppearanceMode.Light, label: "Light", x: 443, width: 24 },
                  { value: AppearanceMode.Dark, label: "Dark", x: 466, width: 24 },
                  { value: AppearanceMode.System, label: "System", x: 490, width: 36 },
                ];

            return (
              <>
                {narrowLayout && (
                  <>
                    <Input
                      aria-label="Search preferences"
                      data-preferences-search
                      bounds={preferencesBox(client, 358, 69, 333, 16, narrowLayout)}
                      relativeTo={client}
                      value={search}
                      onValueChange={(query) => {
                        if (query) setSearch(query);
                        else clearSearch();
                      }}
                      placeholder="Search"
                      leading={<UiIcon part="icon_search" scale={2} color="currentColor" />}
                    />
                    {search && (
                      <Button
                        aria-label={tUi("ui.clear.search")}
                        className={styles.searchClearButton}
                        data-preferences-search
                        bounds={preferencesBox(
                          client,
                          358 + Math.min(333, client.width - 24) - 20,
                          70,
                          20,
                          14,
                          narrowLayout,
                        )}
                        relativeTo={client}
                        variant={ButtonVariant.FlatIcon}
                        fill={assets?.style.colors.textbox_face}
                        icon="window_close_icon"
                        onClick={clearSearch}
                      />
                    )}
                  </>
                )}
                {narrowLayout && (
                  <div data-preferences-navigation>
                    <Combobox
                      aria-label="Preferences sections"
                      bounds={preferencesBox(client, 358, 85, 333, 16, narrowLayout)}
                      relativeTo={client}
                      value={section}
                      options={sectionOptions}
                      onValueChange={(next) => {
                        setSection(next);
                        setNarrowScrollTop(0);
                        if (narrowScrollViewport.current)
                          setScrollPosition(narrowScrollViewport.current, { y: 0 });
                        setColorPicker(null);
                      }}
                    />
                  </div>
                )}
                {narrowLayout && section !== "Background" && section !== "Grid" && (
                  <Divider
                    bounds={preferencesBox(client, 358, 105, 333, 11, narrowLayout)}
                    relativeTo={client}
                    text={preferencesSectionTitle(section)}
                  />
                )}
                <div
                  ref={narrowLayout ? narrowScrollViewport : undefined}
                  className={narrowLayout ? styles.narrowScrollViewport : undefined}
                  style={
                    narrowLayout
                      ? {
                          position: "absolute",
                          left: 0,
                          top: PREFERENCES_NARROW_BODY_TOP,
                          width: client.width,
                          height: narrowBodyHeight,
                          overflowX: "clip",
                          overflowY: narrowMaxScroll > 0 ? "auto" : "clip",
                        }
                      : undefined
                  }
                  onScroll={
                    narrowLayout
                      ? (event) => setNarrowScrollTop(scrollPosition(event.currentTarget).y)
                      : undefined
                  }
                >
                  <div
                    style={
                      narrowLayout
                        ? {
                            position: "relative",
                            left: 0,
                            top: 0,
                            width: client.width,
                            height: narrowContentSize,
                          }
                        : undefined
                    }
                  >
                    <div
                      style={
                        narrowLayout
                          ? {
                              position: "absolute",
                              left: 0,
                              top: -PREFERENCES_NARROW_BODY_TOP,
                              width: client.width,
                              height: narrowContentBottom,
                            }
                          : undefined
                      }
                    >
                      <PreferencesChrome
                        search={search}
                        onSearchChange={(query) => {
                          if (query) setSearch(query);
                          else clearSearch();
                        }}
                        sectionItems={sectionItems}
                        client={contentClient}
                        section={section}
                        languageHot={languageHot}
                        onLanguageHelp={onLanguageHelp}
                        onLanguageHoverChange={setLanguageHot}
                        onSectionChange={(next) => {
                          setSection(next);
                          setNarrowScrollTop(0);
                          if (narrowScrollViewport.current)
                            setScrollPosition(narrowScrollViewport.current, { y: 0 });
                          setColorPicker(null);
                        }}
                      />
                      {section === "General" && (
                        <>
                          {narrowLayout ? (
                            <Combobox
                              aria-label="Appearance mode:"
                              bounds={box(358, 134, 333, 16)}
                              relativeTo={client}
                              value={selectedAppearanceMode}
                              options={appearanceButtons.map(({ value, label }) => ({
                                value,
                                label,
                                disabled:
                                  value === AppearanceMode.System && !onAppearanceModeChange,
                              }))}
                              onValueChange={(value) => preview(value as AppearanceMode)}
                            />
                          ) : (
                            appearanceButtons.map(({ value, label: text, x, width }) => (
                              <Button
                                key={value}
                                aria-label={text}
                                aria-pressed={selectedAppearanceMode === value}
                                bounds={box(x, 120, width, 17)}
                                relativeTo={client}
                                text={text}
                                selected={selectedAppearanceMode === value}
                                disabled={
                                  value === AppearanceMode.System && !onAppearanceModeChange
                                }
                                color={assets?.style.colors.button_normal_text}
                                onClick={() => preview(value)}
                              />
                            ))
                          )}
                          {(["Screen Scaling", "UI Element Scaling", "Language"] as const).map(
                            (label, index) => (
                              <Combobox
                                key={label}
                                aria-label={label}
                                bounds={
                                  narrowLayout
                                    ? box(358, 172 + index * 38, 333, 16)
                                    : box(443, 141 + index * 20, 146, 16)
                                }
                                relativeTo={client}
                                value={
                                  index === 0
                                    ? "200%"
                                    : index === 1
                                      ? String(elementScaling.scale)
                                      : languageDraft
                                }
                                options={
                                  index === 2
                                    ? [
                                        { value: "en", label: "English" },
                                        { value: "zh-CN", label: "简体中文" },
                                      ]
                                    : index === 1
                                      ? UI_ELEMENT_SCALE_OPTIONS
                                      : [{ value: "200%", label: "200%" }]
                                }
                                onValueChange={(value) => {
                                  if (index === 2) setLanguageDraft(value as UiLanguage);
                                  if (index === 1)
                                    elementScaling.preview(normalizeUiElementScale(Number(value)));
                                }}
                                disabled={index === 0}
                              />
                            ),
                          )}
                          {checks.map(({ label, checked, onCheckedChange, disabled }, index) => (
                            <PreferencesCheckbox
                              key={label}
                              label={label}
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={onCheckedChange}
                              bounds={box(358, (narrowLayout ? 278 : 209) + index * 16, 333, 12)}
                              relativeTo={client}
                            />
                          ))}
                        </>
                      )}
                      {section === "Files" && (
                        <FilesPreferences
                          box={box}
                          client={contentClient}
                          settings={recoveryDraft}
                          onChange={updateRecovery}
                          filePreferences={filePreferencesDraft}
                          onFilePreferencesChange={updateFilePreferences}
                          filePreferencesEnabled={!!onFilePreferencesChange}
                          canClearRecentFiles={canClearRecentFiles}
                          onClearRecentFiles={onClearRecentFiles}
                          enabled={!!onRecoverySettingsChange}
                          retentionDays={retentionDays}
                        />
                      )}
                      {section === "Editor" && (
                        <EditorPreferencesSection
                          box={box}
                          client={contentClient}
                          value={editorDraft}
                          enabled={!!onEditorPreferencesChange}
                          onChange={updateEditorPreferences}
                          showScrollbars={chromePreferencesDraft.showCanvasScrollbars}
                          onShowScrollbarsChange={(showCanvasScrollbars) =>
                            updateChromePreferences({ showCanvasScrollbars })
                          }
                          wheelDevice={wheelDraft}
                          detectedWheelDevice={detectedWheelDevice}
                          onWheelDeviceChange={
                            onWheelDeviceChange
                              ? (device) => {
                                  wheelChanged.current = true;
                                  setWheelDraft(device);
                                }
                              : undefined
                          }
                        />
                      )}
                      {section === "Selection" && (
                        <>
                          <PreferencesCheckbox
                            label="Adjust opaque/transparent mode automatically"
                            checked={selectionPreferencesDraft.autoOpaque}
                            onCheckedChange={(autoOpaque) =>
                              updateSelectionPreferences({ autoOpaque })
                            }
                            disabled={!onSelectionPreferencesChange}
                            bounds={box(358, 125, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label={'Keep selection after "Edit > Delete" command'}
                            checked={selectionPreferencesDraft.keepSelectionAfterClear}
                            onCheckedChange={(keepSelectionAfterClear) =>
                              updateSelectionPreferences({ keepSelectionAfterClear })
                            }
                            disabled={!onSelectionPreferencesChange}
                            bounds={box(358, 141, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Show selection edges automatically when the selection is modified"
                            checked={selectionPreferencesDraft.autoShowSelectionEdges}
                            onCheckedChange={(autoShowSelectionEdges) =>
                              updateSelectionPreferences({ autoShowSelectionEdges })
                            }
                            disabled={!onSelectionPreferencesChange}
                            bounds={box(358, 157, 333, 16)}
                            relativeTo={client}
                          />
                          {SELECTION_BEHAVIOR_OPTIONS.map((option, index) => (
                            <PreferencesCheckbox
                              key={option.label}
                              label={option.label}
                              checked={
                                option.key
                                  ? selectionPreferencesDraft[option.key]
                                  : !!option.checked
                              }
                              onCheckedChange={(checked) => {
                                if (option.key)
                                  updateSelectionPreferences({ [option.key]: checked });
                              }}
                              disabled={!option.key || !onSelectionPreferencesChange}
                              bounds={box(358, 173 + index * 16, 333, 16)}
                              relativeTo={client}
                            />
                          ))}
                        </>
                      )}
                      {section === "Timeline" && (
                        <>
                          <PreferencesCheckbox
                            label="Show timeline automatically"
                            checked={timelineInteractionPreferencesDraft.autoShowTimeline}
                            onCheckedChange={(autoShowTimeline) =>
                              updateTimelineInteractionPreferences({ autoShowTimeline })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 125, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Rewind on Stop"
                            checked={timelineInteractionPreferencesDraft.rewindOnStop}
                            onCheckedChange={(rewindOnStop) =>
                              updateTimelineInteractionPreferences({ rewindOnStop })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 141, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesLabel
                            bounds={box(358, 161, 90, 16)}
                            relativeTo={client}
                            text="Default First Frame:"
                          />
                          <Input
                            aria-label="Default First Frame:"
                            bounds={box(450, 159, 48, 18)}
                            relativeTo={client}
                            inputMode="numeric"
                            value={timelineFirstFrameText}
                            disabled={!onDefaultTimelineFirstFrameChange}
                            onValueChange={(value) => {
                              setTimelineFirstFrameText(value);
                              const firstFrame = Number(value);
                              if (
                                value.trim() &&
                                Number.isSafeInteger(firstFrame) &&
                                firstFrame >= MIN_TIMELINE_FIRST_FRAME &&
                                firstFrame <= MAX_TIMELINE_FIRST_FRAME
                              ) {
                                timelineFirstFrameChanged.current = true;
                                setTimelineFirstFrameDraft(firstFrame);
                              }
                            }}
                            onCommit={(value) => {
                              const firstFrame = Number(value);
                              if (
                                !value.trim() ||
                                !Number.isSafeInteger(firstFrame) ||
                                firstFrame < MIN_TIMELINE_FIRST_FRAME ||
                                firstFrame > MAX_TIMELINE_FIRST_FRAME
                              )
                                setTimelineFirstFrameText(String(timelineFirstFrameDraft));
                            }}
                          />
                          <Divider
                            bounds={box(358, 185, 333, 11)}
                            relativeTo={client}
                            text="Timeline Range Selection"
                          />
                          <PreferencesCheckbox
                            label="Keep selection"
                            checked={timelineInteractionPreferencesDraft.keepSelection}
                            onCheckedChange={(keepSelection) =>
                              updateTimelineInteractionPreferences({ keepSelection })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 201, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Select on Click"
                            checked={timelineInteractionPreferencesDraft.selectOnClick}
                            onCheckedChange={(selectOnClick) =>
                              updateTimelineInteractionPreferences({ selectOnClick })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 217, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Select on Shift + Click"
                            checked={timelineInteractionPreferencesDraft.selectOnClickWithKey}
                            onCheckedChange={(selectOnClickWithKey) =>
                              updateTimelineInteractionPreferences({ selectOnClickWithKey })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 233, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Select on Drag"
                            checked={timelineInteractionPreferencesDraft.selectOnDrag}
                            onCheckedChange={(selectOnDrag) =>
                              updateTimelineInteractionPreferences({ selectOnDrag })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 249, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Drag & drop from edges"
                            checked={timelineInteractionPreferencesDraft.dragAndDropFromEdges}
                            onCheckedChange={(dragAndDropFromEdges) =>
                              updateTimelineInteractionPreferences({ dragAndDropFromEdges })
                            }
                            disabled={!onTimelineInteractionPreferencesChange}
                            bounds={box(358, 265, 333, 16)}
                            relativeTo={client}
                          />
                          <Button
                            text="Reset"
                            bounds={box(631, 285, 60, 17)}
                            relativeTo={client}
                            part="button_normal"
                            hotPart="button_hot"
                            focusedPart="button_focused"
                            pushedPart="button_selected"
                            disabledTextShadow
                            disabled={!onTimelineInteractionPreferencesChange}
                            onClick={resetTimelineSelectionPreferences}
                          />
                        </>
                      )}
                      {(section === "Background" || section === "Grid") && (
                        <CanvasDisplayPreferencesSection
                          box={box}
                          client={contentClient}
                          section={
                            section === "Background"
                              ? CanvasDisplaySection.Background
                              : CanvasDisplaySection.Grid
                          }
                          value={canvasDisplayDraft}
                          gridBounds={editingDisplayDefaults ? defaultGridDraft : documentGridDraft}
                          gridBoundsEnabled={
                            editingDisplayDefaults
                              ? !!onGridBoundsDefaultsChange
                              : !!onGridBoundsPreferencesChange
                          }
                          onGridBoundsChange={updateGridBounds}
                          target={displayTarget}
                          hasActiveDocument={hasActiveDocument}
                          enabled={
                            editingDisplayDefaults
                              ? !!onCanvasDisplayDefaultsChange
                              : !!onCanvasDisplayPreferencesChange
                          }
                          showScope={!!onCanvasDisplayDefaultsChange}
                          onChange={updateCanvasDisplay}
                          onTargetChange={(target) => {
                            setColorPicker(null);
                            if (section === "Background") setBackgroundTarget(target);
                            else setGridTarget(target);
                          }}
                          onColorClick={openColorPicker}
                          onReset={() => {
                            if (section === "Grid")
                              updateGridBounds(
                                editingDisplayDefaults
                                  ? DEFAULT_GRID_BOUNDS_PREFERENCES
                                  : defaultGridDraft,
                              );
                            updateCanvasDisplay(
                              resetCanvasDisplaySection(
                                canvasDisplayDraft,
                                editingDisplayDefaults
                                  ? DEFAULT_CANVAS_DISPLAY_PREFERENCES
                                  : defaultDisplayDraft,
                                section === "Background"
                                  ? CanvasDisplaySection.Background
                                  : CanvasDisplaySection.Grid,
                              ),
                            );
                          }}
                        />
                      )}
                      {section === "Guides & Slices" && (
                        <>
                          {guideSliceColorRows.slice(0, 2).map((row) => {
                            const control = box(520, row.y, 112, 18);
                            return (
                              <Fragment key={row.key}>
                                <PreferencesLabel
                                  bounds={box(358, row.y, 156, 18)}
                                  relativeTo={client}
                                  text={tUi(row.label)}
                                />
                                <EditorColorButton
                                  aria-label={tUi(row.label)}
                                  bounds={control}
                                  relativeTo={client}
                                  value={guideSliceDraft[row.key]}
                                  disabled={!onGuideSlicePreferencesChange}
                                  onClick={() =>
                                    setColorPicker({
                                      target: row.key,
                                      title: tUi(row.label),
                                      anchor: control,
                                    })
                                  }
                                />
                              </Fragment>
                            );
                          })}
                          <Divider
                            bounds={box(358, 168, 333, 11)}
                            relativeTo={client}
                            text={tUi("ui.slices")}
                          />
                          {(() => {
                            const row = guideSliceColorRows[2];
                            const control = box(520, row.y, 112, 18);
                            return (
                              <>
                                <PreferencesLabel
                                  bounds={box(358, row.y, 156, 18)}
                                  relativeTo={client}
                                  text={tUi(row.label)}
                                />
                                <EditorColorButton
                                  aria-label={tUi(row.label)}
                                  bounds={control}
                                  relativeTo={client}
                                  value={guideSliceDraft[row.key]}
                                  disabled={!onGuideSlicePreferencesChange}
                                  onClick={() =>
                                    setColorPicker({
                                      target: row.key,
                                      title: tUi(row.label),
                                      anchor: control,
                                    })
                                  }
                                />
                              </>
                            );
                          })()}
                          <PreferencesCheckbox
                            label={tUi("ui.prefer.slice.keyframes.obsolete.behavior")}
                            checked={sliceKeysDraft}
                            onCheckedChange={(value) => {
                              sliceKeysChanged.current = true;
                              setSliceKeysDraft(value);
                            }}
                            disabled={!onSliceUseKeysChange}
                            bounds={box(358, 213, 333, 17)}
                            relativeTo={client}
                          />
                        </>
                      )}
                      {section === "Cursors" && (
                        <CursorPreferencesSection
                          box={box}
                          client={contentClient}
                          value={cursorDraft}
                          onChange={onCursorPreferencesChange ? updateCursorPreferences : undefined}
                          onColorClick={(anchor) =>
                            openColorPicker("cursorColor", tUi("ui.cursors.color.specific"), anchor)
                          }
                        />
                      )}
                      {section === "Undo" && (
                        <>
                          <PreferencesCheckbox
                            label="Undo Limit:"
                            checked={undoDraft.maxBytes > 0}
                            onCheckedChange={(checked) => {
                              undoChanged.current = true;
                              setUndoDraft((current) => ({
                                ...current,
                                maxBytes: checked ? undoLimitMb.current * 1048576 : 0,
                              }));
                            }}
                            disabled={!onUndoOptionsChange}
                            bounds={box(358, 125, 105, 16)}
                            relativeTo={client}
                          />
                          <Input
                            aria-label="Undo Limit (MB)"
                            bounds={box(465, 125, 52, 16)}
                            relativeTo={client}
                            value={undoDraft.maxBytes ? undoLimitText : "∞"}
                            inputMode="numeric"
                            disabled={!onUndoOptionsChange || undoDraft.maxBytes === 0}
                            onValueChange={(value) => {
                              setUndoLimitText(value);
                              const mb = Number(value);
                              if (Number.isInteger(mb) && mb >= 1 && mb <= 999999) {
                                undoLimitMb.current = mb;
                                undoChanged.current = true;
                                setUndoDraft((current) => ({ ...current, maxBytes: mb * 1048576 }));
                              }
                            }}
                            onCommit={(value) => {
                              const mb = Number(value);
                              if (!Number.isInteger(mb) || mb < 1 || mb > 999999)
                                setUndoLimitText(String(undoDraft.maxBytes / 1048576));
                            }}
                          />
                          <PreferencesCheckbox
                            label="Go to modified frame/layer"
                            checked={undoDraft.gotoModified}
                            onCheckedChange={(gotoModified) => {
                              undoChanged.current = true;
                              setUndoDraft((current) => ({ ...current, gotoModified }));
                            }}
                            disabled={!onUndoOptionsChange}
                            bounds={box(358, 153, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Allow non-linear history"
                            checked={undoDraft.allowNonlinearHistory}
                            onCheckedChange={(allowNonlinearHistory) => {
                              undoChanged.current = true;
                              setUndoDraft((current) => ({ ...current, allowNonlinearHistory }));
                            }}
                            disabled={!onUndoOptionsChange}
                            bounds={box(358, 173, 333, 16)}
                            relativeTo={client}
                          />
                          <PreferencesCheckbox
                            label="Show Undo Tooltip"
                            checked={undoDraft.showTooltip}
                            onCheckedChange={(showTooltip) => {
                              undoChanged.current = true;
                              setUndoDraft((current) => ({ ...current, showTooltip }));
                            }}
                            disabled={!onUndoOptionsChange}
                            bounds={box(358, 193, 333, 16)}
                            relativeTo={client}
                          />
                        </>
                      )}
                      {section === "Experimental" && (
                        <ExperimentalPreferences
                          box={box}
                          client={contentClient}
                          editorPreferences={editorDraft}
                          onEditorPreferencesChange={
                            onEditorPreferencesChange ? updateEditorPreferences : undefined
                          }
                          composeGroups={composeDraft}
                          onComposeGroupsChange={
                            onComposeGroupsChange
                              ? (value) => {
                                  composeChanged.current = true;
                                  setComposeDraft(value);
                                }
                              : undefined
                          }
                        />
                      )}
                      {section === "Tablet" && (
                        <TouchInputPreferencesSection
                          box={box}
                          client={contentClient}
                          value={touchInputDraft}
                          onChange={
                            onTouchInputPreferencesChange
                              ? (patch) => {
                                  touchInputChanged.current = true;
                                  setTouchInputDraft((current) =>
                                    normalizeTouchInputPreferences({ ...current, ...patch }),
                                  );
                                }
                              : undefined
                          }
                        />
                      )}
                      {section === DIAGNOSTICS_SECTION && (
                        <DiagnosticsPreferences box={box} client={contentClient} />
                      )}
                      {section === RESET_SECTION && (
                        <ResetPreferences
                          box={box}
                          client={contentClient}
                          value={resetTargets}
                          onChange={setResetTargets}
                          enabled={!!onReset}
                          onReset={() => setResetConfirmationOpen(true)}
                        />
                      )}
                    </div>
                  </div>
                </div>
                {narrowLayout && narrowMaxScroll > 0 && (
                  <Scrollbar
                    bounds={{
                      x:
                        client.x +
                        client.width -
                        PREFERENCES_NARROW_SCROLLBAR_WIDTH -
                        PREFERENCES_NARROW_SCROLLBAR_GAP,
                      y: client.y + PREFERENCES_NARROW_BODY_TOP,
                      width: PREFERENCES_NARROW_SCROLLBAR_WIDTH,
                      height: narrowBodyHeight,
                    }}
                    relativeTo={client}
                    contentSize={narrowContentSize}
                    visibleSize={narrowBodyHeight}
                    value={narrowScroll}
                    onValueChange={(value) => {
                      setNarrowScrollTop(value);
                      if (narrowScrollViewport.current)
                        setScrollPosition(narrowScrollViewport.current, { y: value });
                    }}
                    variant="mini"
                    aria-label={tUi("ui.preferences.scroll", { value1: tUiSource(section) })}
                  />
                )}
                {narrowLayout && (
                  <Divider
                    bounds={{
                      x: client.x + PREFERENCES_NARROW_PADDING,
                      y: client.y + client.height - PREFERENCES_NARROW_FOOTER_HEIGHT,
                      width: Math.max(0, client.width - PREFERENCES_NARROW_PADDING * 2),
                      height: 4,
                    }}
                    relativeTo={client}
                  />
                )}
                {[
                  ["OK", accept],
                  ["Apply", apply],
                  ["Cancel", cancel],
                ].map(([label, action], index) => {
                  const actionWidth = narrowLayout
                    ? Math.min(
                        PREFERENCES_ACTION_WIDTH,
                        Math.max(
                          0,
                          (client.width -
                            PREFERENCES_NARROW_PADDING * 2 -
                            PREFERENCES_ACTION_GAP * 2) /
                            3,
                        ),
                      )
                    : PREFERENCES_ACTION_WIDTH;
                  const x =
                    rightEdge - actionWidth * (3 - index) - PREFERENCES_ACTION_GAP * (2 - index);
                  return (
                    <Button
                      key={String(label)}
                      aria-label={String(label)}
                      text={String(label)}
                      mnemonicIndex={0}
                      font="default"
                      bounds={preferencesBox(
                        client,
                        Number(x),
                        actionY,
                        actionWidth,
                        PREFERENCES_BUTTON_HEIGHT,
                        narrowLayout,
                      )}
                      relativeTo={client}
                      part="button_normal"
                      hotPart="button_hot"
                      focusedPart="button_focused"
                      pushedPart="button_selected"
                      onClick={action as () => void}
                    />
                  );
                })}
              </>
            );
          }}
        </EditorDialog>
        <Alert
          open={resetConfirmationOpen}
          onOpenChange={setResetConfirmationOpen}
          title={tUi("ui.reset.preferences.title")}
          messageLines={[
            tUi(
              narrowLayout ? "ui.reset.preferences.confirm.short" : "ui.reset.preferences.confirm",
            ),
            tUi(
              narrowLayout
                ? "ui.reset.preferences.discard-draft.short"
                : "ui.reset.preferences.discard-draft",
            ),
          ]}
          actions={[
            {
              label: tUi("ui.yes"),
              onClick: () => {
                setResetConfirmationOpen(false);
                cancel();
                void onReset?.(resetTargets);
              },
            },
            { label: tUi("ui.no"), onClick: () => setResetConfirmationOpen(false) },
          ]}
          cancelActionIndex={1}
        />
        {colorPicker && (
          <ColorPicker
            open
            onOpenChange={(open) => {
              if (!open) setColorPicker(null);
            }}
            title={colorPicker.title}
            anchor={colorPicker.anchor}
            value={
              colorPicker.target === "cursorColor"
                ? cursorDraft.color
                : isGuideSliceColorTarget(colorPicker.target)
                  ? guideSliceDraft[colorPicker.target]
                  : canvasDisplayDraft[colorPicker.target]
            }
            onValueChange={(value) => {
              if (colorPicker.target === "cursorColor") {
                updateCursorPreferences({ color: value });
              } else if (isGuideSliceColorTarget(colorPicker.target)) {
                guideSliceChanged.current = true;
                setGuideSliceDraft((current) => ({
                  ...current,
                  [colorPicker.target as keyof GuideSlicePreferences]: value,
                }));
              } else {
                updateCanvasDisplay({
                  [colorPicker.target as CanvasDisplayColorKey]: value,
                });
              }
            }}
          />
        )}
      </div>
    </PreferencesDialogLayoutProvider>
  );
}
