/** Stable failure codes; callers translate them where they are shown. */
export enum BeadErrorCode {
  MissingPalette = "bead.palette.missing",
  InvalidSource = "bead.source.invalid",
  InvalidBoardSize = "bead.board.invalid",
  ChartTooLarge = "bead.chart.too.large",
  TooManyBoards = "bead.boards.too.many",
}

const DEVELOPER_MESSAGES: Readonly<Record<BeadErrorCode, string>> = {
  [BeadErrorCode.MissingPalette]: "Select a bead palette.",
  [BeadErrorCode.InvalidSource]: "Invalid bead source image.",
  [BeadErrorCode.InvalidBoardSize]: "Invalid bead board size.",
  [BeadErrorCode.ChartTooLarge]:
    "The PNG chart is too large. Export a PDF with separate boards instead.",
  [BeadErrorCode.TooManyBoards]: "Too many bead boards. Choose a larger board size.",
};

export class BeadError extends Error {
  override readonly name = "BeadError";
  constructor(readonly code: BeadErrorCode) {
    super(DEVELOPER_MESSAGES[code]);
  }
}

export function beadErrorCode(reason: unknown): BeadErrorCode | null {
  return reason instanceof BeadError ? reason.code : null;
}
