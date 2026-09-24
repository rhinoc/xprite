import assert from "node:assert/strict";
import fs from "node:fs";

import React from "react";
import { renderToString } from "react-dom/server";

import * as ui from "../../../packages/ui/dist/ui.js";

const metadata = JSON.parse(fs.readFileSync("packages/ui/package.json", "utf8"));
assert.equal(metadata.private, undefined, "The primitive package is independently publishable");
assert.equal(metadata.exports["./style.css"], "./dist/style.css");
assert.deepEqual(metadata.peerDependencies, { react: ">=18", "react-dom": ">=18" });
assert.ok(fs.existsSync("packages/ui/dist/style.css"));

const publicExports = [
  "Button",
  "ButtonVariant",
  "Label",
  "Entry",
  "Panel",
  "Text",
  "TextVariant",
  "CanvasSurface",
  "PanSurface",
  "CanvasScaleProvider",
  "useCanvasScale",
  "CanvasRenderer",
  "RASTER_SCALE",
  "UI_SCALE",
  "CSS_PIXEL_SCALE",
  "DEFAULT_SURFACE_VIEWPORT",
  "surfaceLayout",
  "sceneViewport",
  "Tooltip",
  "TooltipGroup",
  "tooltipPosition",
  "tooltipArrow",
  "measurePopoverAnchor",
  "useAnchoredPopover",
  "anchoredPopoverStyle",
  "Checkbox",
  "Scrollbar",
  "Separator",
  "Slider",
  "SliderVariant",
  "TimelineRangeHandle",
  "Combobox",
  "Menu",
  "Menubar",
  "ContextMenu",
  "Overlay",
  "OverlayVariant",
  "PopupClose",
  "Alert",
  "InlineTextEditor",
  "Tabs",
  "KeyboardShortcutsDialog",
  "formatShortcutForPlatform",
  "cn",
];
for (const name of publicExports) assert.ok(ui[name], `Missing public UI export ${name}`);
assert.deepEqual(ui.SliderVariant, {
  Normal: "normal",
  Threshold: "threshold",
  Entry: "entry",
  TimelineRange: "timeline-range",
});
assert.deepEqual(ui.ButtonVariant, {
  Theme: "theme",
  Icon: "icon",
  Color: "color",
  Touch: "touch",
  Tool: "tool",
});
assert.deepEqual(ui.TimelineRangeHandle, { Start: "start", End: "end" });
const publicTypes = fs.readFileSync("packages/ui/dist/types/index.d.ts", "utf8");
for (const name of [
  "LabelProps",
  "EntryProps",
  "SliderProps",
  "TimelineRangeHandle",
  "TimelineRangeSliderProps",
  "OverlayProps",
  "OverlayWindowProps",
  "OverlayPopupProps",
])
  assert.match(publicTypes, new RegExp(`\\b${name}\\b`), `Missing public UI type ${name}`);
for (const name of [
  "FloatingWindow",
  "FloatingWindowProps",
  "Popup",
  "PopupProps",
  "PopupContext",
  "PositionedTooltip",
  "PositionedTooltipProps",
  "PositionedTooltipLayout",
  "OnionSkinRange",
  "OnionSkinRangeProps",
])
  assert.doesNotMatch(
    publicTypes,
    new RegExp(`\\b${name}\\b`),
    `Obsolete overlay API ${name} is still public`,
  );
for (const name of ["ThemeLabel", "ThemeLabelProps", "ThemeEntry", "ThemeEntryProps"])
  assert.doesNotMatch(
    publicTypes,
    new RegExp(`\\b${name}\\b`),
    `Removed UI type ${name} is public`,
  );
for (const name of Object.keys(ui))
  assert.equal(
    name.startsWith("Native"),
    false,
    `Native-prefixed component/API is still public: ${name}`,
  );
for (const name of [
  "PixelArtProvider",
  "TextInput",
  "Select",
  "TabStrip",
  "useTabInteractions",
  "resampleSurface",
  "Dialog",
  "DropdownMenu",
  "ToggleGroup",
  "NumberInput",
  "ListBox",
  "ScrollArea",
  "NativeSurface",
  "NativePresentation",
  "SurfaceBounds",
  "NativeViewport",
  "TooltipPrimitive",
  "NativeTooltip",
  "NativeButton",
  "ButtonSize",
  "NativeSlider",
  "NativeMenu",
  "NativeScrollbar",
  "NativeCheckbox",
  "ThemeButton",
  "ThemeLabel",
  "ThemeLabelProps",
  "ThemeEntry",
  "ThemeEntryProps",
  "TouchButton",
  "ColorButton",
  "IconButton",
  "CheckboxPrimitive",
  "ScrollbarPrimitive",
  "SliderEntry",
  "OnionSkinRange",
  "OnionSkinRangeProps",
  "Cursor",
  "ColorInput",
  "Typography",
  "RasterEditor",
  "EditorCanvas",
  "PaletteSurface",
  "EditorView",
  "PixelText",
  "PixelTextProps",
  "ThemeText",
  "ThemeTextProps",
  "FloatingWindow",
  "FloatingWindowProps",
  "Popup",
  "PopupProps",
  "PopupContext",
  "PositionedTooltip",
  "PositionedTooltipProps",
  "PositionedTooltipLayout",
])
  assert.equal(name in ui, false, `Removed or editor-only API is still public: ${name}`);

const html = renderToString(
  React.createElement(
    ui.CanvasScaleProvider,
    { scale: 1 },
    React.createElement(
      ui.Panel,
      { title: "Controls" },
      React.createElement(ui.Text, { variant: ui.TextVariant.Inline }, "Pixel UI"),
      React.createElement(ui.Button, null, "Save"),
      React.createElement(ui.CanvasSurface, {
        bounds: { x: 0, y: 0, width: 8, height: 8 },
        paint() {},
      }),
    ),
  ),
);
assert.match(html, /Save/);
assert.match(html, /Pixel UI/);
assert.match(html, /<canvas/);

const core = await import("../../../dist/core/index.js");
for (const name of [
  "RasterEditor",
  "renderExportAnimation",
  "encodeAsepriteSync",
  "defaultPlaybackSettings",
  "EditorHistory",
])
  assert.ok(core[name], `Missing core workspace export ${name}`);
console.log(
  `Verified ${publicExports.length} public UI exports and the internal editor-core build.`,
);
