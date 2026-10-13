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
import { useToolTranslation } from "$/managers/locale/tool-language";
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

export function BeadSettings({
  manager,
  state,
}: {
  manager: BeadToolManager;
  state: BeadToolSnapshot;
}) {
  const t = useToolTranslation();
  const busy = state.loading || state.downloading;
  const number = (key: "width" | "height", label: string, board = false) => (
    <Field label={t(label)}>
      <Input
        pixelWidth={NUMBER_WIDTH}
        inputMode="numeric"
        aria-label={t(label)}
        value={String(
          board
            ? state.settings.boardSize[key]
            : state.settings[key === "width" ? "targetWidth" : "targetHeight"],
        )}
        min={board ? MIN_BEAD_BOARD_EDGE : MIN_GRID_EDGE}
        max={board ? MAX_BEAD_BOARD_EDGE : MAX_PIXELATION_SIZE}
        step={MIN_GRID_EDGE}
        disabled={busy}
        onCommit={(value) =>
          manager.changeSettings(
            board
              ? { boardSize: { ...state.settings.boardSize, [key]: Number(value) } }
              : { [key === "width" ? "targetWidth" : "targetHeight"]: Number(value) },
          )
        }
      />
    </Field>
  );
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
      title={t("Bead pattern")}
    >
      <Field label={t("Brand")}>
        <Combobox
          pixelWidth={SELECT_WIDTH}
          aria-label={t("Brand")}
          value={state.settings.brand}
          options={manager.brands}
          disabled={busy}
          onValueChange={(brand) =>
            manager.changeSettings({ brand: brand as BeadToolSettings["brand"] })
          }
        />
      </Field>
      {state.frameCount > MIN_GRID_EDGE && (
        <Field label={t("Frame")}>
          <Combobox
            pixelWidth={NUMBER_WIDTH}
            aria-label={t("Source frame")}
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
      {number("width", "Columns")}
      {number("height", "Rows")}
      <Checkbox
        label={t("Keep aspect ratio")}
        checked={state.settings.lockAspectRatio}
        disabled={busy}
        onCheckedChange={(lockAspectRatio) => manager.changeSettings({ lockAspectRatio })}
      />
      <Field label={t("Sampling")}>
        <Combobox
          pixelWidth={SELECT_WIDTH}
          aria-label={t("Sampling")}
          value={state.settings.method}
          options={manager.samplingModes.map((mode) => ({ ...mode, label: t(mode.label) }))}
          disabled={busy}
          onValueChange={(method) =>
            manager.changeSettings({ method: method as BeadToolSettings["method"] })
          }
        />
      </Field>
      {number("width", "Board columns", true)}
      {number("height", "Board rows", true)}
      <Text variant={TextVariant.Reading} wrap>
        {t("Enter the peg counts of one board. Larger patterns span multiple boards.")}
      </Text>
      <Checkbox
        label={t("Color codes in cells")}
        checked={state.settings.showCodes}
        disabled={busy}
        onCheckedChange={(showCodes) => manager.changeSettings({ showCodes })}
      />
      <Field label={t("Output name")}>
        <Input
          pixelWidth={SELECT_WIDTH}
          aria-label={t("Output name")}
          value={state.outputName}
          disabled={busy}
          onValueChange={manager.setOutputName}
        />
      </Field>
      <Text variant={TextVariant.Reading} wrap>
        {t("Each grid cell is one bead. Transparent pixels stay empty.")}
      </Text>
      <Text variant={TextVariant.Reading} wrap>
        {t("Colors are screen references; physical beads may differ.")}
      </Text>
    </Panel>
  );
}
