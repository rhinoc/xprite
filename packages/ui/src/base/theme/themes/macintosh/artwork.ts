import { pixelFrameImage, pixelFocusImage } from "$/base/theme/pixel-frame";
import type { UiThemeArtwork } from "$/base/theme/theme-definition";
import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiAppearance, UiPartDefinition } from "$/base/theme/theme-types";
import {
  folderTabImage,
  classicSliderThumbImage,
  classicSliderTrackImage,
} from "$/base/theme/themes/macintosh/appearance-artwork";
import { macintoshBalloonPointers } from "$/base/theme/themes/macintosh/balloon-artwork";

import "$assets/fonts/macintosh/fonts.css";

import { macintoshBalloonImage } from "$/base/theme/themes/macintosh/balloon-frame";
import { macintoshColorRoles } from "$/base/theme/themes/macintosh/color-roles";
import fontMetrics from "$/base/theme/themes/macintosh/font-metrics.json";
import {
  macintoshGeometry,
  macintoshSheetHashes,
  macintoshPalettes,
} from "$/base/theme/themes/macintosh/geometry";
import { macintoshPublicSurfaceTokens } from "$/base/theme/themes/macintosh/public-surface-tokens";
import {
  macintoshMenuShortcutGlyphs,
  macintoshMenuLabelGlyphs,
} from "$/base/theme/themes/macintosh/shortcut-artwork";
import darkSheetUrl from "$assets/themes/macintosh/macintosh-dark-sheet.webp";
import lightSheetUrl from "$assets/themes/macintosh/macintosh-light-sheet.webp";

const TIMELINE_PART_PREFIX = "timeline_";
const TIMELINE_ARTWORK_SCALE = 0.5;
const TIMELINE_BORDER_WIDTH = 1;
const TIMELINE_SURFACES: Record<string, UiColorRole> = {
  timeline_none: "timeline_normal",
  timeline_normal: "timeline_normal",
  timeline_active: "timeline_active",
  timeline_hover: "timeline_hover",
  timeline_active_hover: "timeline_active_hover",
  timeline_clicked: "timeline_clicked",
  timeline_padding: "timeline_padding",
  timeline_padding_tr: "timeline_padding",
  timeline_padding_bl: "timeline_padding",
  timeline_padding_br: "timeline_padding",
};
// Shared grid edges are painted once, on the right and bottom of each cell.
const TIMELINE_THUMBNAIL_INSET = [0, TIMELINE_BORDER_WIDTH, TIMELINE_BORDER_WIDTH, 0] as const;

export function macintoshArtwork(appearance: UiAppearance): UiThemeArtwork {
  const palette = macintoshPalettes[appearance];
  const sourceSheetUrl = appearance === "dark" ? darkSheetUrl : lightSheetUrl;
  const sheetUrl = sourceSheetUrl.startsWith("data:")
    ? sourceSheetUrl
    : `${sourceSheetUrl}${sourceSheetUrl.includes("?") ? "&" : "?"}v=${macintoshSheetHashes[appearance]}`;
  const trackColors = [241, 237, 22, 239, 23, 238, 241, 254];
  const trackPixels = trackColors
    .map((channel, index) => {
      const value = appearance === "dark" ? 255 - channel : channel;
      return `<rect x="${index % 4}" y="${Math.floor(index / 4)}" width="1" height="1" fill="rgb(${value},${value},${value})"/>`;
    })
    .join("");
  const trackImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" shape-rendering="crispEdges">${trackPixels}</svg>`)}")`;
  const tabInactive = appearance === "dark" ? "#222222" : "#cccccc";
  const tabShade = appearance === "dark" ? "#777777" : "#888888";
  const tabSurface = (active: boolean) => ({
    borderRole: "text" as const,
    borderWidth: 0,
    frame: {
      image: folderTabImage(
        palette.ink,
        active ? palette.wash : tabInactive,
        palette.paper,
        tabShade,
      ),
      slice: "22 13 0 13 fill",
      width: "22px 13px 0 13px",
    },
  });
  const timelineParts = Object.fromEntries(
    Object.entries(macintoshGeometry.parts)
      .filter(([name]) => name.startsWith(TIMELINE_PART_PREFIX))
      .map(([name, part]) => {
        const faceRole = TIMELINE_SURFACES[name];
        return [
          name,
          {
            ...part,
            paintScale: TIMELINE_ARTWORK_SCALE,
            ...(!part.slices
              ? {
                  foregroundRole: (name.endsWith("_active")
                    ? "timeline_active_text"
                    : "text") as UiColorRole,
                }
              : {}),
            ...(faceRole
              ? {
                  surface: {
                    faceRole,
                    borderRole: "palette_entries_separator",
                    borderWidth: TIMELINE_BORDER_WIDTH,
                    borderSides: [false, true, true, false],
                  } satisfies NonNullable<UiPartDefinition["surface"]>,
                }
              : {}),
          },
        ];
      }),
  );
  const colors = Object.fromEntries(
    Object.entries(macintoshColorRoles).map(([role, color]) => [role, palette[color]]),
  );
  return {
    definition: {
      ...macintoshGeometry,
      provenance: {
        ...macintoshGeometry.provenance,
        sheetSha256: macintoshSheetHashes[appearance],
      },
      parts: {
        ...macintoshGeometry.parts,
        ...timelineParts,
        timeline_loop_range: {
          ...macintoshGeometry.parts.timeline_loop_range,
          surface: {
            borderRole: "text",
            borderWidth: TIMELINE_BORDER_WIDTH,
            borderSides: [true, true, false, true],
          },
        },
        timeline_focused: {
          ...macintoshGeometry.parts.timeline_focused,
          surface: { borderRole: "text", borderWidth: TIMELINE_BORDER_WIDTH },
        },
        tab_active: { ...macintoshGeometry.parts.tab_active, surface: tabSurface(true) },
        tab_normal: { ...macintoshGeometry.parts.tab_normal, surface: tabSurface(false) },
        tab_filler: {
          ...macintoshGeometry.parts.tab_filler,
          surface: { borderRole: "text", borderWidth: 0 },
        },
        tab_bottom_active: {
          ...macintoshGeometry.parts.tab_bottom_active,
          surface: { borderRole: "text", borderWidth: 0, faceRole: "face" },
        },
        tab_bottom_normal: {
          ...macintoshGeometry.parts.tab_bottom_normal,
          surface: {
            borderRole: "text",
            borderWidth: 1,
            borderSides: [true, false, false, false],
            faceRole: "face",
          },
        },
      },
      colors: {
        ...colors,
        timeline_active: appearance === "dark" ? "#505050" : "#d8d8d8",
        timeline_active_hover: appearance === "dark" ? "#5c5c5c" : "#cccccc",
        timeline_clicked: appearance === "dark" ? "#505050" : "#d8d8d8",
        menuitem_disabled_text: appearance === "dark" ? "#5a5a5a" : "#a5a5a5",
        separator_label: palette.ink,
        textbox_placeholder_text: palette.muted,
        palette_entries_separator: appearance === "dark" ? "#5a5a5a" : "#a5a5a5",
      },
      typography: { default: fontMetrics.chikarego2, mini: fontMetrics.finderskeepers },
      controlParts: {
        timeline: {
          thumbnailInset: TIMELINE_THUMBNAIL_INSET,
          selectionBorderPart: "timeline_focused",
        },
        canvasSurface: {
          checker: {
            cellSize: 1,
            light: appearance === "dark" ? [56, 56, 56] : [238, 238, 238],
            dark: appearance === "dark" ? [44, 44, 44] : [224, 224, 224],
          },
        },
        checkable: { focus: "icon" },
        button: {
          part: "button_normal",
          textOffsetY: { mini: 1 },
          font: "default",
          outline: { radius: 4, minimumWidth: 80, minimumHeight: 20, pixelCorners: true },
        },
        tooltip: {
          balloon: true,
          font: "mini",
          padding: 12,
          pointerSize: 17,
          pointerArtworks: macintoshBalloonPointers,
        },
        alert: {
          minimumWidth: 366,
          messageLeft: 82,
          messageRight: 18,
          messageTop: 18,
          messageHeight: 12,
          buttonGap: 17,
          buttonTopGap: 16,
          buttonRight: 21,
          bottomPadding: 21,
          icon: {
            width: 32,
            height: 32,
            x: 27,
            y: 17,
            path: "M15 0h2v1H15Z M14 1h4v1H14Z M14 2h4v1H14Z M13 3h2v1H13Z M17 3h2v1H17Z M13 4h2v1H13Z M17 4h2v1H17Z M12 5h2v1H12Z M18 5h2v1H18Z M12 6h2v1H12Z M18 6h2v1H18Z M11 7h2v1H11Z M19 7h2v1H19Z M11 8h2v1H11Z M15 8h2v1H15Z M19 8h2v1H19Z M10 9h2v1H10Z M14 9h4v1H14Z M20 9h2v1H20Z M10 10h2v1H10Z M14 10h4v1H14Z M20 10h2v1H20Z M9 11h2v1H9Z M14 11h4v1H14Z M21 11h2v1H21Z M9 12h2v1H9Z M14 12h4v1H14Z M21 12h2v1H21Z M8 13h2v1H8Z M14 13h4v1H14Z M22 13h2v1H22Z M8 14h2v1H8Z M14 14h4v1H14Z M22 14h2v1H22Z M7 15h2v1H7Z M14 15h4v1H14Z M23 15h2v1H23Z M7 16h2v1H7Z M14 16h4v1H14Z M23 16h2v1H23Z M6 17h2v1H6Z M14 17h4v1H14Z M24 17h2v1H24Z M6 18h2v1H6Z M14 18h4v1H14Z M24 18h2v1H24Z M5 19h2v1H5Z M14 19h4v1H14Z M25 19h2v1H25Z M5 20h2v1H5Z M15 20h2v1H15Z M25 20h2v1H25Z M4 21h2v1H4Z M15 21h2v1H15Z M26 21h2v1H26Z M4 22h2v1H4Z M26 22h2v1H26Z M3 23h2v1H3Z M27 23h2v1H27Z M3 24h2v1H3Z M15 24h2v1H15Z M27 24h2v1H27Z M2 25h2v1H2Z M14 25h4v1H14Z M28 25h2v1H28Z M2 26h2v1H2Z M14 26h4v1H14Z M28 26h2v1H28Z M1 27h2v1H1Z M15 27h2v1H15Z M29 27h2v1H29Z M1 28h2v1H1Z M29 28h2v1H29Z M0 29h2v1H0Z M30 29h2v1H30Z M0 30h32v1H0Z M1 31h30v1H1Z",
          },
        },
        panel: { header: "cutout" },
        listBox: {
          borderWidth: 2,
          innerInset: 3,
          contentInset: 4,
          rowHeight: 16,
          textInset: 2,
          font: "mini",
        },
        menu: {
          shortcutGlyphs: macintoshMenuShortcutGlyphs,
          labelGlyphs: macintoshMenuLabelGlyphs,
          selectFirstOnOpen: false,
          pressToOpen: true,
          checkedVector: {
            width: 12,
            height: 12,
            path: "M11 2h1v1h-1Z M10 3h2v1h-2Z M9 4h2v1h-2Z M8 5h2v1h-2Z M3 6h1v1H3Z M7 6h2v1H7Z M3 7h2v1H3Z M6 7h2v1H6Z M4 8h3v1H4Z M5 9h1v1H5Z",
          },
          arrowPart: "combobox_arrow_right",
        },
        scrollbar: { arrowExtent: 16, thumbSize: 16, areaVariant: "regular" },
        splitButton: { arrowOpen: "drop_down_button_right_selected" },
        combobox: {
          popupMenu: true,
          faceNormal: "drop_down_button_left_normal",
          faceHot: "drop_down_button_left_hot",
          faceFocused: "drop_down_button_left_focused",
          arrowNormal: "drop_down_button_right_normal",
          arrowHot: "drop_down_button_right_hot",
          arrowPressed: "drop_down_button_right_selected",
        },
      },
    },
    sheetUrl,
    tokens: {
      ...macintoshPublicSurfaceTokens(palette, appearance),
      "--ui-tooltip-frame-image": macintoshBalloonImage(palette.ink, palette.paper),
      "--ui-text-flow-line-height": "16px",
      "--ui-control-caption-size": "16px",
      "--ui-button-font-smoothing": "none",
      "--ui-button-min-height": "20px",
      "--ui-button-surface-min-height": "20px",
      "--ui-button-surface-min-width": "80px",
      "--ui-button-surface-padding": "0 16px",
      "--ui-panel-header-face": palette.wash,
      "--ui-group-box-border-width": "1px",
      "--ui-group-box-title-size": "16px",
      "--ui-group-box-title-height": "16px",
      "--ui-group-box-font-smoothing": "none",
      "--ui-group-box-primary-edge": palette.line,
      "--ui-alert-frame-light": appearance === "dark" ? "#252500" : "#dadaff",
      "--ui-alert-frame-mid": appearance === "dark" ? "#323232" : "#cdcdcd",
      "--ui-alert-frame-dark": appearance === "dark" ? "#78784c" : "#8787b3",
      "--ui-heading-face": palette.ink,
      "--ui-heading-ink": palette.paper,
      "--ui-input-text-inset": "5px",
      "--ui-button-disabled-opacity": "1",
      "--ui-curve-grid": palette.line,
      "--ui-native-slider-track-face": palette.wash,
      "--ui-native-slider-thumb-image": classicSliderThumbImage(
        palette.ink,
        tabInactive,
        palette.paper,
        tabShade,
      ),
      "--ui-native-slider-thumb-width": "13px",
      "--ui-native-slider-thumb-height": "16px",
      "--ui-native-slider-thumb-offset": "-3px",
      "--ui-native-slider-thumb-border": "0px",
      "--ui-native-slider-track-height": "5px",
      "--ui-native-slider-height": "25px",
      "--ui-native-slider-track-border": "0px",
      "--ui-native-slider-track-paint": "transparent",
      "--ui-native-slider-progress-paint": "transparent",
      "--ui-native-slider-track-image": classicSliderTrackImage(palette.ink, tabInactive),
      "--ui-native-slider-fill": palette.ink,
      "--ui-native-slider-thumb-face": palette.paper,
      "--ui-native-slider-radius": "0px",
      "--ui-native-slider-thumb-shadow": "none",
      "--ui-scrollbar-classic-track-image": trackImage,
      "--ui-scrollbar-track-pattern": `repeating-conic-gradient(${palette.line} 0 25%, ${palette.paper} 0 50%)`,
      "--ui-scrollbar-thumb-grip":
        "repeating-linear-gradient(to bottom, transparent 0 1px, var(--xse-border) 1px 2px, transparent 2px 3px)",
      "--ui-theme-ink": palette.ink,
      "--ui-theme-paper": palette.paper,
      "--ui-theme-wash": palette.wash,
      "--ui-theme-muted": palette.muted,
      "--ui-theme-line": palette.line,
      "--ui-theme-desktop": palette.desktop,
      "--ui-button-surface-face": palette.paper,
      "--ui-button-surface-line": palette.line,
      "--ui-button-surface-hot-ink": palette.ink,
      "--ui-button-surface-hot-face": palette.wash,
      "--ui-button-surface-selected-ink": palette.ink,
      "--ui-button-surface-selected-face": palette.wash,
      "--ui-button-surface-pressed-ink": palette.paper,
      "--ui-button-surface-pressed-face": palette.ink,
      "--ui-button-surface-border-width": "1px",
      "--ui-button-surface-radius": "0px",
      "--ui-button-surface-paint-background": "transparent",
      "--ui-button-surface-edge": "transparent",
      "--ui-button-surface-border-image": pixelFrameImage(palette.ink, palette.paper),
      "--ui-button-surface-hot-image": pixelFrameImage(palette.ink, palette.wash),
      "--ui-button-surface-pressed-image": pixelFrameImage(palette.ink, palette.ink),
      "--ui-button-surface-image-width": "3px",
      "--ui-button-surface-disabled-opacity": "1",
      "--ui-button-surface-disabled-ink": palette.disabled,
      "--ui-button-surface-focus-image": pixelFocusImage(palette.ink),
      "--ui-button-surface-focus-face-image": pixelFrameImage(palette.ink, palette.paper),
      "--ui-button-surface-focus-display": "block",
      "--ui-button-surface-focus-outline-width": "0px",
      "--ui-button-surface-shadow": "none",
      "--ui-button-surface-active-shadow": "none",
      "--ui-button-focus-color": palette.ink,
      "--ui-panel-highlight": palette.paper,
      "--ui-window-artwork-overflow": "visible",
      "--ui-window-title-background": palette.titleFace,
      "--ui-window-title-inset": "0px",
      "--ui-window-title-reserved-width": "0px",
      "--ui-window-title-offset": "50%",
      "--ui-window-title-transform": "translateX(-50%)",
      "--ui-window-title-padding": "2px 7px 1px",
      "--ui-window-title-top": "2px",
      "--ui-window-title-height": "16px",
      "--ui-window-title-max-width": "100%",
      "--ui-window-title-overflow": "hidden",
      "--ui-tab-label-top": "7px",
      "--ui-tab-icon-top": "4px",
      "--ui-tab-close-icon-top": "6px",
      "--ui-tab-focus-outline": `1px dotted ${palette.ink}`,
      "--ui-combobox-disabled-opacity": "0.5",
      "--ui-combobox-control-shadow": "none",
      "--ui-combobox-shadow-display": "block",
      "--ui-combobox-shadow-color": palette.ink,
      "--ui-menu-trigger-face-inset": "1px",
      "--ui-menu-artwork-overflow": "visible",
      "--ui-menu-popup-shadow": `1px 1px 0 ${palette.ink}`,
      "--ui-menu-popup-clip":
        "polygon(0 0, 100% 0, 100% 3px, calc(100% + 1px) 3px, calc(100% + 1px) calc(100% + 1px), 3px calc(100% + 1px), 3px 100%, 0 100%)",
      "--ui-menu-underline-height": "1px",
      "--ui-combobox-popup-shadow": `1px 1px 0 ${palette.ink}`,
      "--ui-overlay-backdrop": "rgba(0, 0, 0, 0.25)",
    },
  };
}
