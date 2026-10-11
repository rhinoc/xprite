import type { FormLayout } from "$/managers/dialogs/form-layout";

const SETTINGS_WIDTH = 368;
const PREVIEW_X = SETTINGS_WIDTH + 16;
const PREVIEW_WIDTH = 432;
const CLIENT_WIDTH = PREVIEW_X + PREVIEW_WIDTH;
const WINDOW_CHROME_WIDTH = 24;
const WINDOW_CHROME_HEIGHT = 46;
const PREVIEW_HEIGHT = 201;
const GRID_TOP = 30;
const GRID_HEIGHT = 220;
const PREVIEW_TOP = 294;
const HELP_TOP = 304;
const ACTION_HEIGHT = 34;

/** Native form controls beside the source grid and selected converted artwork. */
export function animalCrossingExportLayout() {
  const actionY = Math.ceil((PREVIEW_TOP + Math.max(128, PREVIEW_HEIGHT) + 16) / 2) * 2;
  const layout: FormLayout = {
    height: actionY + ACTION_HEIGHT + WINDOW_CHROME_HEIGHT,
    fields: {
      title: { x: 0, y: 30, width: SETTINGS_WIDTH, height: 30, labelWidth: 96, inset: 0 },
      creator: { x: 0, y: 68, width: SETTINGS_WIDTH, height: 30, labelWidth: 96, inset: 0 },
      town: { x: 0, y: 106, width: SETTINGS_WIDTH, height: 30, labelWidth: 96, inset: 0 },
      cellWidth: { x: 0, y: 174, width: 176, height: 30, labelWidth: 88, inset: 0 },
      cellHeight: { x: 184, y: 174, width: 176, height: 30, labelWidth: 88, inset: 0 },
      offsetX: { x: 0, y: 212, width: 176, height: 30, labelWidth: 88, inset: 0 },
      offsetY: { x: 184, y: 212, width: 176, height: 30, labelWidth: 88, inset: 0 },
      spacingX: { x: 0, y: 250, width: 176, height: 30, labelWidth: 88, inset: 0 },
      spacingY: { x: 184, y: 250, width: 176, height: 30, labelWidth: 88, inset: 0 },
    },
    separators: [
      { x: 0, y: 0, width: SETTINGS_WIDTH, height: 22, text: "Pattern details" },
      { x: 0, y: 144, width: SETTINGS_WIDTH, height: 22, text: "Source grid" },
      { x: PREVIEW_X, y: 0, width: PREVIEW_WIDTH, height: 22, text: "Source image and grid" },
      { x: PREVIEW_X, y: 264, width: 200, height: 22, text: "Selected design" },
      { x: PREVIEW_X + 224, y: 264, width: 208, height: 22, text: "Design QR code" },
    ],
    actions: {
      "Download current QR": {
        x: CLIENT_WIDTH - 456,
        y: actionY,
        width: 200,
        height: ACTION_HEIGHT,
      },
      "Download ZIP": { x: CLIENT_WIDTH - 248, y: actionY, width: 120, height: ACTION_HEIGHT },
      "Exporting…": { x: CLIENT_WIDTH - 248, y: actionY, width: 120, height: ACTION_HEIGHT },
      Cancel: { x: CLIENT_WIDTH - 120, y: actionY, width: 120, height: ACTION_HEIGHT },
    },
  };
  return {
    layout,
    width: CLIENT_WIDTH + WINDOW_CHROME_WIDTH,
    settingsWidth: SETTINGS_WIDTH,
    grid: { x: PREVIEW_X, y: GRID_TOP, width: PREVIEW_WIDTH, height: GRID_HEIGHT },
    preview: { x: PREVIEW_X, y: PREVIEW_TOP, width: PREVIEW_WIDTH },
    helpY: HELP_TOP,
  };
}

/** Stable embedded size shared by the export selector and its first render. */
export function animalCrossingExportEmbeddedSize() {
  const { width, layout } = animalCrossingExportLayout();
  return {
    width: width - WINDOW_CHROME_WIDTH,
    height: layout.height! - WINDOW_CHROME_HEIGHT,
  };
}
