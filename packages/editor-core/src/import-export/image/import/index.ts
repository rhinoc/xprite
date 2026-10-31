export { analyzePixelArt, analyzePixelArtAsync } from "$/import-export/image/import/analyze";
export {
  extractPalette,
  extractPixelationPalette,
  countDistinctColors,
  reduceToPalette,
} from "$/import-export/image/import/color/palette";
export { snapPalette } from "$/import-export/image/import/color/palette-snap";
export {
  estimateTilt,
  straighten,
  MAX_TILT_DEGREES,
} from "$/import-export/image/import/prepass/deskew";
export { resizeNearest } from "$/import-export/image/import/prepass/resize";
export { pixelateImage, pixelateImageAsync } from "$/import-export/image/import/pixelate";
export {
  PixelArtClassification,
  PixelationMethod,
  PixelationMode,
  PixelationAlgorithm,
  CellColorPicker,
  ImportDialogChoice,
  LineGuideMode,
  OutlinePrepass,
  PixelationDither,
  PaletteColorMode,
  PixelGridSamplingAxis,
} from "$/import-export/image/import/types";
export {
  DEFAULT_LINE_GUIDE,
  readOutlinePrepass,
  runsStockPixeloe,
} from "$/import-export/image/import/prepass/outline-prepass";
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
  PixelGridSamplingStage,
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
  PIXELATION_METHOD_OPTIONS,
} from "$/import-export/image/import/settings";

export { manualPixelGrid, MAX_GRID_CELL_SIZE } from "$/import-export/image/import/grid/lattice";

export {
  removeBackground,
  modeBorderColor,
  edgeSeededFloodAlpha,
  colorKeyDistance,
  adaptiveTolerance,
  sampleKeyColor,
  RemoveBackgroundMode,
  DEFAULT_REMOVE_BACKGROUND,
} from "$/import-export/image/import/prepass/remove-background";
export type {
  RemoveBackgroundOptions,
  RemoveBackgroundSettings,
} from "$/import-export/image/import/prepass/remove-background";

export {
  getAlgorithmEntry,
  getAllAlgorithms,
  getListedAlgorithms,
  detectWithAlgorithm,
  detectWithAlgorithmAsync,
  type PixelationAlgorithmEntry,
} from "$/import-export/image/import/grid/registry";

export {
  getAllColorPickers,
  getColorPickerEntry,
  type CellColorPickerEntry,
} from "$/import-export/image/import/color/cell-color-picker";

export {
  preloadWasm,
  beginAcRlConsensusJob,
  finishAcRlConsensusJob,
  beginAcRlConsensusJobAsync,
  finishAcRlConsensusJobAsync,
  setAcRlBrowserWorkerFactory,
  warmAcRlBrowserWorker,
  acRlWorkerOverlapActive,
  acRlBrowserWorkerOverlapActive,
} from "$/import-export/image/import/grid/period/ac-rl-consensus";
