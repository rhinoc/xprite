export { analyzePixelArt } from "$/import-export/image/import/analyze";
export {
  extractPalette,
  extractPixelationPalette,
  countDistinctColors,
  reduceToPalette,
} from "$/import-export/image/import/palette";
export { snapPalette } from "$/import-export/image/import/palette-snap";
export { estimateTilt, straighten, MAX_TILT_DEGREES } from "$/import-export/image/import/deskew";
export { resizeNearest } from "$/import-export/image/import/resize";
export { pixelateImage } from "$/import-export/image/import/pixelate";
export {
  PixelArtClassification,
  PixelationMethod,
  PixelationMode,
  PixelationAlgorithm,
  CellColorPicker,
  ImportDialogChoice,
  LineGuideMode,
} from "$/import-export/image/import/types";
export type {
  ExtractPaletteOptions,
  PaletteEntry,
  PixelArtAnalysis,
  PixelArtAnalysisOptions,
  PixelArtMetrics,
  PaletteSnapOptions,
  PixelateOptions,
  PixelationSize,
  PixelationSettings,
  PixelGridGeometry,
  PixelGridAnalysis,
  ImportDialogPreference,
} from "$/import-export/image/import/types";

export {
  defaultPixelationSettings,
  updatePixelationSettings,
  applyPixelationGrid,
  pixelationSizeFromAxis,
  pixelationSettingsOptions,
  MAX_PIXELATION_SIZE,
  PIXELATION_SIZES,
  MIN_SNAP_COLORS,
  MAX_SNAP_COLORS,
  SNAP_COLOR_PRESETS,
  PIXELATION_METHOD_OPTIONS,
} from "$/import-export/image/import/settings";

export { manualPixelGrid, MAX_GRID_CELL_SIZE } from "$/import-export/image/import/grid";

export {
  getAlgorithmEntry,
  getAllAlgorithms,
  getListedAlgorithms,
  detectWithAlgorithm,
  openingAlgorithm,
  DEFAULT_CONVERT_ALGORITHM,
  type PixelationAlgorithmEntry,
} from "$/import-export/image/import/pixelation-algorithm-registry";

export {
  getAllColorPickers,
  getColorPickerEntry,
  type CellColorPickerEntry,
} from "$/import-export/image/import/cell-color-picker";
