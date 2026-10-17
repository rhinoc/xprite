import { CellColorPicker, PixelationAlgorithm } from "$/managers/preferences/file-preferences";

interface AlgorithmCopy {
  /** Dropdown label. */
  readonly label: string;
  /** One-line plain-language hint shown under the dropdown. */
  readonly hint: string;
  /** Inline message when the algorithm found no usable grid; the preview then falls back to a resize. */
  readonly missing: string | null;
}

/** One row per registry algorithm: its dropdown label and what to tell the user when it finds no grid. */
const COPY: Readonly<Record<PixelationAlgorithm, AlgorithmCopy>> = {
  [PixelationAlgorithm.Auto]: {
    label: "import.algorithm.auto",
    hint: "import.hint.algorithm.auto",
    missing: "import.note.auto.none",
  },
  [PixelationAlgorithm.UniformGrid]: {
    label: "import.algorithm.uniform-grid",
    hint: "import.hint.algorithm.uniform-grid",
    missing: "import.note.uniform-grid.none",
  },
  [PixelationAlgorithm.EdgeGrid]: {
    label: "import.algorithm.edge-grid",
    hint: "import.hint.algorithm.edge-grid",
    missing: "import.note.edge-grid.none",
  },
  [PixelationAlgorithm.Resize]: {
    label: "import.algorithm.resize",
    hint: "import.hint.algorithm.resize",
    missing: null,
  },
};

export function algorithmHintKey(algorithm: PixelationAlgorithm): string {
  return COPY[algorithm].hint;
}

export function algorithmLabelKey(algorithm: PixelationAlgorithm): string {
  return COPY[algorithm].label;
}

/** The inline note for the chosen algorithm, or null when nothing needs saying. */
export function algorithmNoteKey(
  algorithm: PixelationAlgorithm,
  gridFound: boolean,
): string | null {
  return gridFound ? null : COPY[algorithm].missing;
}

const PICKER_COPY: Readonly<Record<CellColorPicker, { label: string; hint: string }>> = {
  [CellColorPicker.MostCommon]: {
    label: "import.picker.most-common",
    hint: "import.hint.picker.most-common",
  },
  [CellColorPicker.Average]: { label: "import.picker.average", hint: "import.hint.picker.average" },
  [CellColorPicker.Median]: { label: "import.picker.median", hint: "import.hint.picker.median" },
};

export function colorPickerLabelKey(picker: CellColorPicker): string {
  return PICKER_COPY[picker].label;
}

export function colorPickerHintKey(picker: CellColorPicker): string {
  return PICKER_COPY[picker].hint;
}
