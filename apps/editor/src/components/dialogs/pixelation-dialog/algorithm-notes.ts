import { PixelationAlgorithm } from "$/managers/preferences/file-preferences";

interface AlgorithmCopy {
  /** Dropdown label. */
  readonly label: string;
  /** Inline message when the algorithm found no usable grid; the preview then falls back to a resize. */
  readonly missing: string | null;
}

/** One row per registry algorithm: its dropdown label and what to tell the user when it finds no grid. */
const COPY: Readonly<Record<PixelationAlgorithm, AlgorithmCopy>> = {
  [PixelationAlgorithm.Auto]: {
    label: "import.algorithm.auto",
    missing: "import.note.auto.none",
  },
  [PixelationAlgorithm.UniformGrid]: {
    label: "import.algorithm.uniform-grid",
    missing: "import.note.uniform-grid.none",
  },
  [PixelationAlgorithm.EdgeGrid]: {
    label: "import.algorithm.edge-grid",
    missing: "import.note.edge-grid.none",
  },
  [PixelationAlgorithm.Resize]: { label: "import.algorithm.resize", missing: null },
};

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
