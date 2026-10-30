import { useState } from "react";

import { ToolField, ToolGroup } from "$/components/shared/tool-group";
import { boardSizeFailure } from "$/managers/beads/bead-failure";
import type {
  BeadToolManager,
  BeadToolSnapshot,
  BeadToolSettings,
} from "$/managers/beads/bead-tool-manager";
import { MIN_BEAD_BOARD_EDGE, MAX_BEAD_BOARD_EDGE } from "$/managers/beads/bead-tool-manager";
import type { BeadTextKey } from "$/managers/locale/bead-text";
import { useBeadText } from "$/managers/locale/tool-language";
import {
  BEAD_BOARD_PRESETS,
  OutlinePrepass,
  PIXELATION_METHOD_OPTIONS,
} from "@xprite/editor-core/import-export";
import {
  ControlFlow,
  Input,
  Combobox,
  Checkbox,
  Button,
  Menu,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/beads/beads.module.css";

const NUMBER_WIDTH = 40;
const GRID_WIDTH = 64;
const SELECT_WIDTH = 108;
const MIN_GRID_EDGE = 1;
type BeadSamplingMethod = (typeof PIXELATION_METHOD_OPTIONS)[number]["value"];

/** Beads only offers PIXELATION_METHOD_OPTIONS (not internal TwoStage). */
const SAMPLING_KEYS = {
  structure: "beads.sampling.structure",
  dominant: "beads.sampling.dominant",
  "most-frequent": "beads.sampling.frequent",
  box: "beads.sampling.box",
  nearest: "beads.sampling.nearest",
} as const satisfies Readonly<Record<BeadSamplingMethod, BeadTextKey>>;
type Axis = "width" | "height";

function parseBoardEdge(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() &&
    Number.isSafeInteger(value) &&
    value >= MIN_BEAD_BOARD_EDGE &&
    value <= MAX_BEAD_BOARD_EDGE
    ? value
    : null;
}

/** Board group (brand, board, codes): the fields of the shared adjust slot. Export lives in the export sheet. */
export function BeadSettings({
  manager,
  state,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
}) {
  const text = useBeadText();
  const busy = state.loading || state.downloading;
  // Raw board text stays local so partial or invalid input is shown and explained, not dropped.
  const [boardDraft, setBoardDraft] = useState<Partial<Record<Axis, string>>>({});
  const boardInvalid = (["width", "height"] as const).some(
    (axis) => boardDraft[axis] !== undefined && parseBoardEdge(boardDraft[axis]!) === null,
  );
  const changeBoard = (axis: Axis, raw: string) => {
    const value = parseBoardEdge(raw);
    setBoardDraft((previous) => ({ ...previous, [axis]: raw }));
    if (value !== null)
      manager.changeSettings({
        boardSize: { ...state.settings.boardSize, [axis]: value },
      });
  };
  const boardEdge = (axis: Axis) => (
    <Input
      pixelWidth={NUMBER_WIDTH}
      inputMode="numeric"
      aria-label={text(axis === "width" ? "beads.board.columns" : "beads.board.rows")}
      aria-invalid={boardDraft[axis] !== undefined && parseBoardEdge(boardDraft[axis]!) === null}
      value={boardDraft[axis] ?? String(state.settings.boardSize[axis])}
      min={MIN_BEAD_BOARD_EDGE}
      max={MAX_BEAD_BOARD_EDGE}
      step={MIN_GRID_EDGE}
      disabled={busy}
      onValueChange={(value) => changeBoard(axis, value)}
      onCommit={(value) => {
        changeBoard(axis, value);
        if (parseBoardEdge(value) !== null)
          setBoardDraft((previous) => ({ ...previous, [axis]: undefined }));
      }}
    />
  );
  const boardError = boardSizeFailure();
  return (
    <ToolGroup title={text("beads.board")}>
      <ToolField label={text("beads.brand")}>
        <Combobox
          pixelWidth={SELECT_WIDTH}
          aria-label={text("beads.brand")}
          value={state.settings.brand}
          options={manager.brands}
          disabled={busy}
          onValueChange={(brand) =>
            manager.changeSettings({
              brand: brand as BeadToolSettings["brand"],
            })
          }
        />
      </ToolField>
      <ToolField label={text("beads.board")}>
        <ControlFlow className={styles.boardRow}>
          {boardEdge("width")}
          <Text variant={TextVariant.Reading}>×</Text>
          {boardEdge("height")}
          <Menu
            label={text("beads.presets")}
            items={BEAD_BOARD_PRESETS.map((size) => ({
              label: text("beads.size", { width: size.width, height: size.height }),
              disabled: busy,
              onSelect: () => {
                setBoardDraft({});
                manager.changeSettings({ boardSize: size });
              },
            }))}
            renderTrigger={(trigger) => (
              <Button
                {...trigger}
                icon="combobox_arrow_down"
                aria-label={text("beads.presets")}
                disabled={busy}
              />
            )}
          />
        </ControlFlow>
      </ToolField>
      {boardInvalid && (
        <Text variant={TextVariant.Reading} wrap role="alert">
          {text(boardError.key, boardError.values)}
        </Text>
      )}
      <Checkbox
        label={text("beads.codes")}
        checked={state.settings.showCodes}
        disabled={busy}
        onCheckedChange={(showCodes) => manager.changeSettings({ showCodes })}
      />
    </ToolGroup>
  );
}

/**
 * Bead-specific source settings that sit on top of the shared pixelation controls: which frame of a
 * project to use and how the plain convert samples. Sampling only shapes the convert, so it is
 * disabled while a recovered grid decides the beads.
 */
export function BeadSourceSettings({
  manager,
  state,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
}) {
  const text = useBeadText();
  const busy = state.loading || state.downloading;
  return (
    <ToolGroup title={text("beads.sampling")}>
      {state.frameCount > MIN_GRID_EDGE && (
        <ToolField label={text("beads.frame")}>
          <Combobox
            pixelWidth={GRID_WIDTH}
            aria-label={text("beads.frame.source")}
            value={String(state.frame)}
            disabled={busy}
            options={Array.from({ length: state.frameCount }, (_, index) => ({
              value: String(index),
              label: String(index + MIN_GRID_EDGE),
            }))}
            onValueChange={(value) => manager.setFrame(Number(value))}
          />
        </ToolField>
      )}
      <Combobox
        pixelWidth={SELECT_WIDTH}
        aria-label={text("beads.sampling")}
        value={state.settings.method}
        options={manager.samplingModes.map((mode) => ({
          value: mode.value,
          label: text(SAMPLING_KEYS[mode.value]),
        }))}
        // A recovered grid or an outline pre-pass (sampled by the colour picker) decides the colours.
        disabled={
          busy || !!state.detected?.reliable || state.settings.prepass !== OutlinePrepass.None
        }
        onValueChange={(method) =>
          manager.changeSettings({
            method: method as BeadToolSettings["method"],
          })
        }
      />
    </ToolGroup>
  );
}
