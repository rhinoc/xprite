import type { BeadText, BeadTextKey } from "$/managers/locale/bead-text";
import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import {
  beadErrorCode,
  BeadErrorCode,
  MAX_BEAD_BOARDS,
  MAX_BEAD_BOARD_EDGE,
  MIN_BEAD_BOARD_EDGE,
} from "@xprite/editor-core/import-export";

/** A translatable failure: a readable key plus interpolation values. */
export interface BeadToolFailure {
  key: BeadTextKey;
  values?: Readonly<Record<string, string | number>>;
}

/** Tool failures carry their message key; telemetry still sees only the category. */
export class BeadToolError extends ToolOperationError {
  constructor(
    category: ToolFailureCategory,
    readonly key: BeadTextKey,
  ) {
    super(category, key);
  }
}

const CORE_KEYS: Readonly<Record<BeadErrorCode, BeadTextKey>> = {
  [BeadErrorCode.MissingPalette]: "beads.error.palette",
  [BeadErrorCode.InvalidSource]: "beads.error.source",
  [BeadErrorCode.InvalidBoardSize]: "beads.error.board.size",
  [BeadErrorCode.ChartTooLarge]: "beads.error.png.limit",
  [BeadErrorCode.TooManyBoards]: "beads.error.boards.limit",
};

export function boardSizeFailure(): BeadToolFailure {
  return {
    key: "beads.error.board.size",
    values: { min: MIN_BEAD_BOARD_EDGE, max: MAX_BEAD_BOARD_EDGE },
  };
}

export function boardCountFailure(count: number): BeadToolFailure {
  return {
    key: "beads.error.boards.limit",
    values: { count, max: MAX_BEAD_BOARDS },
  };
}

/** Map any thrown value to a keyed failure; unknown errors use the operation's fallback. */
export function beadToolFailure(reason: unknown, fallback: BeadTextKey): BeadToolFailure {
  if (reason instanceof BeadToolError) return { key: reason.key };
  const code = beadErrorCode(reason);
  if (code === BeadErrorCode.InvalidBoardSize) return boardSizeFailure();
  if (code) return { key: CORE_KEYS[code] };
  return { key: fallback };
}

export function formatBeadFailure(text: BeadText, failure: BeadToolFailure | null): string | null {
  return failure ? text(failure.key, failure.values) : null;
}
