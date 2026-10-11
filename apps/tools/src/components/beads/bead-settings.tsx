import type {
  BeadToolManager,
  BeadToolSnapshot,
  BeadToolSettings,
} from "$/managers/beads/bead-tool-manager";
import { MAX_BEAD_GRID_EDGE } from "$/managers/beads/bead-tool-manager";
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
  const number = (key: "width" | "height", label: string) => (
    <Field label={t(label)}>
      <Input
        pixelWidth={NUMBER_WIDTH}
        inputMode="numeric"
        aria-label={t(label)}
        value={String(state.settings[key])}
        min={MIN_GRID_EDGE}
        max={MAX_BEAD_GRID_EDGE}
        step={MIN_GRID_EDGE}
        disabled={busy}
        onCommit={(value) => manager.changeSettings({ [key]: Number(value) })}
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
        checked={state.settings.lockAspect}
        disabled={busy}
        onCheckedChange={(lockAspect) => manager.changeSettings({ lockAspect })}
      />
      <Field label={t("Board size")}>
        <Combobox
          pixelWidth={SELECT_WIDTH}
          aria-label={t("Board size")}
          value={String(state.settings.boardSize)}
          disabled={busy}
          options={manager.boardSizes.map((size) => ({
            value: String(size),
            label: `${size} × ${size}`,
          }))}
          onValueChange={(value) =>
            manager.changeSettings({ boardSize: Number(value) as BeadToolSettings["boardSize"] })
          }
        />
      </Field>
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
