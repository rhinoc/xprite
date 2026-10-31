import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PaletteColorMode,
  PixelationAlgorithm,
  PixelationDither,
} from "@xprite/editor-core/import-export";

/** Source text with the editor's translation key, so each app translates by its own mechanism. */
export interface PixelationLabel {
  text: string;
  key?: string;
}
export const LABELS = {
  algorithm: { text: "Find pixels by:", key: "import.dialog.algorithm" },
  gridSource: { text: "Read grid from:", key: "import.dialog.grid-source" },
  width: { text: "Width:", key: "ui.width.label" },
  height: { text: "Height:", key: "ui.height.label" },
  picker: { text: "Pixel color:", key: "import.dialog.color.picker" },
  limitColors: { text: "Limit colors", key: "ui.limit.colors" },
  colors: { text: "Colors:", key: "ui.colors.label" },
  colorMode: { text: "Color mode", key: "import.dialog.color-mode" },
  prepass: { text: "Outline pre-pass:", key: "import.dialog.outline.prepass" },
  lineGuide: { text: "Line guide:", key: "import.dialog.line.guide" },
  dither: { text: "Dither:", key: "import.dialog.dither" },
  pixels: { text: "{size} px", key: "ui.dimension.pixels" },
} as const satisfies Record<string, PixelationLabel>;
export const ALGORITHM_LABELS: Readonly<Record<PixelationAlgorithm, PixelationLabel>> = {
  [PixelationAlgorithm.Auto]: { text: "Auto", key: "import.algorithm.auto" },
  [PixelationAlgorithm.UniformGrid]: { text: "Fixed grid", key: "import.algorithm.uniform-grid" },
  [PixelationAlgorithm.EdgeGrid]: { text: "Flexible grid", key: "import.algorithm.edge-grid" },
  [PixelationAlgorithm.FrameLattice]: {
    text: "Whole image",
    key: "import.algorithm.frame-lattice",
  },
  [PixelationAlgorithm.PitchLattice]: {
    text: "Pixel pitch",
    key: "import.algorithm.pitch-lattice",
  },
  [PixelationAlgorithm.ColorPeriod]: { text: "Color repeat", key: "import.algorithm.color-period" },
  [PixelationAlgorithm.BorderRuns]: { text: "Border colors", key: "import.algorithm.border-runs" },
  [PixelationAlgorithm.EdgeSpacing]: { text: "Edge spacing", key: "import.algorithm.edge-spacing" },
  [PixelationAlgorithm.CustomSize]: {
    text: "Custom size",
    key: "import.algorithm.custom-size",
  },
  [PixelationAlgorithm.Resize]: { text: "Resize only", key: "import.algorithm.resize" },
};
/** Fixed grid's own edge fit, named as one of its sources; the rest keep their algorithm label. */
export const EDGE_SOURCE_LABEL: PixelationLabel = {
  text: "Edges",
  key: "import.grid-source.edges",
};
export const PREPASS_LABELS: Readonly<Record<OutlinePrepass, PixelationLabel>> = {
  [OutlinePrepass.None]: { text: "None", key: "import.prepass.none" },
  [OutlinePrepass.Pixeloe]: { text: "PixelOE", key: "import.prepass.pixeloe" },
  [OutlinePrepass.PixeloeLines]: { text: "PixelOE + lines", key: "import.prepass.pixeloe-lines" },
};
export const LINE_GUIDE_LABELS: Readonly<Record<LineGuideMode, PixelationLabel>> = {
  [LineGuideMode.Union]: { text: "Add to outlines", key: "import.line-guide.union" },
  [LineGuideMode.Replace]: { text: "Lines only", key: "import.line-guide.replace" },
};
export const DITHER_LABELS: Readonly<Record<PixelationDither, PixelationLabel>> = {
  [PixelationDither.None]: { text: "Off", key: "import.dither.off" },
  [PixelationDither.Ordered]: { text: "Ordered", key: "import.dither.ordered" },
  [PixelationDither.FloydSteinberg]: {
    text: "Floyd–Steinberg",
    key: "import.dither.floyd-steinberg",
  },
};
export const COLOR_MODE_LABELS: Readonly<Record<PaletteColorMode, PixelationLabel>> = {
  [PaletteColorMode.Fixed]: { text: "Fixed count", key: "import.color-mode.fixed" },
  [PaletteColorMode.Adaptive]: { text: "Adaptive", key: "import.color-mode.adaptive" },
};
export const PICKER_LABELS: Readonly<Record<CellColorPicker, PixelationLabel>> = {
  [CellColorPicker.MostCommon]: { text: "Most common", key: "import.picker.most-common" },
  [CellColorPicker.Average]: { text: "Average", key: "import.picker.average" },
  [CellColorPicker.Median]: { text: "Median", key: "import.picker.median" },
  [CellColorPicker.KMeans]: { text: "K-means", key: "import.picker.k-means" },
  [CellColorPicker.Contrast]: { text: "Contrast", key: "import.picker.contrast" },
  [CellColorPicker.Nearest]: { text: "Nearest", key: "import.picker.nearest" },
  [CellColorPicker.Structure]: { text: "Structure", key: "import.picker.structure" },
  [CellColorPicker.TwoStage]: { text: "Two-Stage", key: "import.picker.two-stage" },
  [CellColorPicker.DualRtTwoStage]: {
    text: "Dual RT (Structure vs Two-Stage)",
    key: "import.picker.dual-rt-two-stage",
  },
};
const ALL_LABELS: readonly PixelationLabel[] = [
  ...Object.values(LABELS),
  ...Object.values(ALGORITHM_LABELS),
  EDGE_SOURCE_LABEL,
  ...Object.values(PICKER_LABELS),
  ...Object.values(PREPASS_LABELS),
  ...Object.values(LINE_GUIDE_LABELS),
  ...Object.values(DITHER_LABELS),
  ...Object.values(COLOR_MODE_LABELS),
];
const KEYS = new Map(ALL_LABELS.map((label) => [label.text, label.key]));

/** The editor's translation key for one of the shared texts; other texts translate as they are. */
export function pixelationLabelKey(text: string): string {
  return KEYS.get(text) ?? text;
}
/** Every shared English text, for the apps that translate by source text. */
export const PIXELATION_BASE_TEXTS: readonly string[] = ALL_LABELS.map((label) => label.text);
