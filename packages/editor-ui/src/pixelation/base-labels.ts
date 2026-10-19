import { CellColorPicker, PixelationAlgorithm } from "@xprite/editor-core/import-export";

/** Source text with the editor's translation key, so each app translates by its own mechanism. */
export interface PixelationLabel {
  text: string;
  key?: string;
}
export const LABELS = {
  algorithm: { text: "Find pixels by:", key: "import.dialog.algorithm" },
  width: { text: "Width:", key: "ui.width.cf45de5f" },
  height: { text: "Height:", key: "ui.height.2256f988" },
  picker: { text: "Pixel color:", key: "import.dialog.color.picker" },
  limitColors: { text: "Limit colors", key: "ui.limit.colors" },
  colors: { text: "Colors:", key: "ui.colors.50dd3bf1" },
  prepass: { text: "PixelOE pre-pass", key: "import.dialog.pixeloe.prepass" },
  preset: { text: "PixelOE preset", key: "import.dialog.pixeloe.preset" },
  advanced: { text: "Advanced", key: "import.dialog.advanced" },
  pixels: { text: "{size} px", key: "ui.dimension.pixels" },
} as const satisfies Record<string, PixelationLabel>;
export const ALGORITHM_LABELS: Readonly<Record<PixelationAlgorithm, PixelationLabel>> = {
  [PixelationAlgorithm.Auto]: { text: "Auto", key: "import.algorithm.auto" },
  [PixelationAlgorithm.UniformGrid]: { text: "Fixed grid", key: "import.algorithm.uniform-grid" },
  [PixelationAlgorithm.EdgeGrid]: { text: "Flexible grid", key: "import.algorithm.edge-grid" },
  [PixelationAlgorithm.CustomSize]: {
    text: "Custom size",
    key: "import.algorithm.custom-size",
  },
  [PixelationAlgorithm.Resize]: { text: "Resize only", key: "import.algorithm.resize" },
};
export const PICKER_LABELS: Readonly<Record<CellColorPicker, PixelationLabel>> = {
  [CellColorPicker.MostCommon]: { text: "Most common", key: "import.picker.most-common" },
  [CellColorPicker.Average]: { text: "Average", key: "import.picker.average" },
  [CellColorPicker.Median]: { text: "Median", key: "import.picker.median" },
  [CellColorPicker.KMeans]: { text: "K-means", key: "import.picker.k-means" },
  [CellColorPicker.Contrast]: { text: "Contrast", key: "import.picker.contrast" },
  [CellColorPicker.Nearest]: { text: "Nearest", key: "import.picker.nearest" },
};
const ALL_LABELS: readonly PixelationLabel[] = [
  ...Object.values(LABELS),
  ...Object.values(ALGORITHM_LABELS),
  ...Object.values(PICKER_LABELS),
];
const KEYS = new Map(ALL_LABELS.map((label) => [label.text, label.key]));

/** The editor's translation key for one of the shared texts; other texts translate as they are. */
export function pixelationLabelKey(text: string): string {
  return KEYS.get(text) ?? text;
}
/** Every shared English text, for the apps that translate by source text. */
export const PIXELATION_BASE_TEXTS: readonly string[] = ALL_LABELS.map((label) => label.text);

/** Title of the collapsible row that holds the PixelOE controls. */
export const pixelationAdvancedLabel = LABELS.advanced;
