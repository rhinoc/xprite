import { useState } from "react";

import { boardSizeFailure } from "$/managers/beads/bead-failure";
import type {
  BeadToolManager,
  BeadToolSnapshot,
  BeadToolSettings,
} from "$/managers/beads/bead-tool-manager";
import {
  MAX_PIXELATION_SIZE,
  MIN_BEAD_BOARD_EDGE,
  MAX_BEAD_BOARD_EDGE,
} from "$/managers/beads/bead-tool-manager";
import type { BeadTextKey } from "$/managers/locale/bead-text";
import { useBeadText } from "$/managers/locale/tool-language";
import { PixelationMethod } from "@xprite/editor-core/import-export";
import {
  Panel,
  PanelVariant,
  ContentLayout,
  ContentPadding,
  SurfaceTone,
  Field,
  Input,
  Combobox,
  Checkbox,
  Text,
  TextVariant,
} from "@xprite/ui";

const SETTINGS_GAP = 8;
const NUMBER_WIDTH = 64;
const SELECT_WIDTH = 144;
const MIN_GRID_EDGE = 1;
const SAMPLING_KEYS: Readonly<Record<PixelationMethod, BeadTextKey>> = {
  [PixelationMethod.Structure]: "beads.sampling.structure",
  [PixelationMethod.Dominant]: "beads.sampling.dominant",
  [PixelationMethod.MostFrequent]: "beads.sampling.frequent",
  [PixelationMethod.Box]: "beads.sampling.box",
  [PixelationMethod.Nearest]: "beads.sampling.nearest",
};
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
  const gridEdge = (axis: Axis, label: BeadTextKey) => (
    <Field label={text(label)}>
      <Input
        pixelWidth={NUMBER_WIDTH}
        inputMode="numeric"
        aria-label={text(label)}
        value={String(state.settings[axis === "width" ? "targetWidth" : "targetHeight"])}
        min={MIN_GRID_EDGE}
        max={MAX_PIXELATION_SIZE}
        step={MIN_GRID_EDGE}
        disabled={busy}
        onCommit={(value) =>
          manager.changeSettings({
            [axis === "width" ? "targetWidth" : "targetHeight"]: Number(value),
          })
        }
      />
    </Field>
  );
  const boardEdge = (axis: Axis, label: BeadTextKey) => (
    <Field label={text(label)}>
      <Input
        pixelWidth={NUMBER_WIDTH}
        inputMode="numeric"
        aria-label={text(label)}
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
    </Field>
  );
  const boardError = boardSizeFailure();
  return (
    <Panel
      variant={PanelVariant.Utility}
      emphasized
      collapsible
      scrollable
      tone={SurfaceTone.Accent}
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      contentGap={SETTINGS_GAP}
      title={text("beads.pattern")}
    >
      <Field label={text("beads.brand")}>
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
      </Field>
      {state.frameCount > MIN_GRID_EDGE && (
        <Field label={text("beads.frame")}>
          <Combobox
            pixelWidth={NUMBER_WIDTH}
            aria-label={text("beads.frame.source")}
            value={String(state.frame)}
            disabled={busy}
            options={Array.from({ length: state.frameCount }, (_, index) => ({
              value: String(index),
              label: String(index + MIN_GRID_EDGE),
            }))}
            onValueChange={(value) => manager.setFrame(Number(value))}
          />
        </Field>
      )}
      {gridEdge("width", "beads.columns")}
      {gridEdge("height", "beads.rows")}
      <Checkbox
        label={text("beads.aspect.keep")}
        checked={state.settings.lockAspectRatio}
        disabled={busy}
        onCheckedChange={(lockAspectRatio) => manager.changeSettings({ lockAspectRatio })}
      />
      <Field label={text("beads.sampling")}>
        <Combobox
          pixelWidth={SELECT_WIDTH}
          aria-label={text("beads.sampling")}
          value={state.settings.method}
          options={manager.samplingModes.map((mode) => ({
            value: mode.value,
            label: text(SAMPLING_KEYS[mode.value]),
          }))}
          disabled={busy}
          onValueChange={(method) =>
            manager.changeSettings({
              method: method as BeadToolSettings["method"],
            })
          }
        />
      </Field>
      {boardEdge("width", "beads.board.columns")}
      {boardEdge("height", "beads.board.rows")}
      <Text variant={TextVariant.Reading} wrap role={boardInvalid ? "alert" : undefined}>
        {boardInvalid ? text(boardError.key, boardError.values) : text("beads.board.hint")}
      </Text>
      <Checkbox
        label={text("beads.codes")}
        checked={state.settings.showCodes}
        disabled={busy}
        onCheckedChange={(showCodes) => manager.changeSettings({ showCodes })}
      />
      <Field label={text("beads.output.name")}>
        <Input
          pixelWidth={SELECT_WIDTH}
          aria-label={text("beads.output.name")}
          value={state.outputName}
          disabled={busy}
          onValueChange={manager.setOutputName}
        />
      </Field>
      <Text variant={TextVariant.Reading} wrap>
        {text("beads.help.cells")}
      </Text>
      <Text variant={TextVariant.Reading} wrap>
        {text("beads.help.colors")}
      </Text>
    </Panel>
  );
}
