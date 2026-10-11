export { analyzePixelArt } from "$/import-export/image/import/analyze";
export {
  extractPalette,
  extractPixelationPalette,
  countDistinctColors,
  reduceToPalette,
} from "$/import-export/image/import/palette";
export { pixelateImage } from "$/import-export/image/import/pixelate";
export {
  PixelArtClassification,
  PixelationMethod,
  PixelationMode,
} from "$/import-export/image/import/types";
export type {
  ExtractPaletteOptions,
  PaletteEntry,
  PixelArtAnalysis,
  PixelArtAnalysisOptions,
  PixelArtMetrics,
  PixelateOptions,
  PixelationSize,
  PixelationSettings,
  PixelGridGeometry,
  PixelGridAnalysis,
} from "$/import-export/image/import/types";

export {
  defaultPixelationSettings,
  updatePixelationSettings,
  pixelationSettingsOptions,
  MAX_PIXELATION_SIZE,
  PIXELATION_SIZES,
} from "$/import-export/image/import/settings";

export {
  detectPixelGrid,
  manualPixelGrid,
  MAX_GRID_CELL_SIZE,
} from "$/import-export/image/import/grid";
