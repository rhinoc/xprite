import type { ReactNode } from "react";

import { ToolField, ToolGroup } from "$/components/shared/tool-group";
import {
  AnimalCrossingLayout,
  type AnimalCrossingManager,
  type AnimalCrossingSnapshot,
  type AnimalCrossingSettings,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { Combobox, Input } from "@xprite/ui";

const NUMBER_WIDTH = 44;
const TEXT_WIDTH = 104;
const LAYOUT_WIDTH = 104;
const MAX_PARAMETER = 65535;
const MIN_SIZE = 1;
const ZERO = 0;

/** Adjust groups: design information, image layout and (for tiles) offsets and spacing. */
export function AnimalCrossingAdjust({
  manager,
  snapshot,
}: {
  manager: AnimalCrossingManager;
  snapshot: AnimalCrossingSnapshot;
}): ReactNode {
  const t = useToolTranslation();
  const busy = snapshot.loading || snapshot.downloading;
  const settings = snapshot.settings;
  const numeric = (
    key: "cellWidth" | "cellHeight" | "offsetX" | "offsetY" | "spacingX" | "spacingY",
    label: string,
  ) => (
    <ToolField label={t(label)}>
      <Input
        aria-label={t(label)}
        pixelWidth={NUMBER_WIDTH}
        value={String(settings[key])}
        inputMode="numeric"
        min={key.startsWith("cell") ? MIN_SIZE : ZERO}
        max={MAX_PARAMETER}
        step={MIN_SIZE}
        disabled={busy}
        onCommit={(value) => manager.changeSettings({ [key]: Number(value) })}
      />
    </ToolField>
  );
  const text = (key: "title" | "creator" | "town", label: string) => (
    <ToolField label={t(label)}>
      <Input
        aria-label={t(label)}
        pixelWidth={TEXT_WIDTH}
        value={settings[key]}
        disabled={busy}
        onValueChange={(value) =>
          manager.changeSettings({ [key]: value } as Partial<AnimalCrossingSettings>)
        }
      />
    </ToolField>
  );
  const tiles = snapshot.layout === AnimalCrossingLayout.Tiles;
  return (
    <>
      <ToolGroup title={t("Design information")}>
        {text("title", "Title")}
        {text("creator", "Creator")}
        {text("town", "Island / town")}
        {snapshot.frameCount > MIN_SIZE && (
          <ToolField label={t("Frame")}>
            <Combobox
              aria-label={t("Source frame")}
              pixelWidth={TEXT_WIDTH}
              value={String(snapshot.frame)}
              disabled={busy}
              options={Array.from({ length: snapshot.frameCount }, (_, frame) => ({
                value: String(frame),
                label: String(frame + MIN_SIZE),
              }))}
              onValueChange={(value) => manager.setFrame(Number(value))}
            />
          </ToolField>
        )}
      </ToolGroup>
      <ToolGroup title={t("Image layout")}>
        <ToolField label={t("Convert as")}>
          <Combobox
            aria-label={t("Image layout")}
            pixelWidth={LAYOUT_WIDTH}
            value={snapshot.layout}
            disabled={busy}
            options={[
              { value: AnimalCrossingLayout.Single, label: t("One design") },
              { value: AnimalCrossingLayout.Tiles, label: t("Split into tiles") },
            ]}
            onValueChange={(layout) => manager.setLayout(layout as AnimalCrossingLayout)}
          />
        </ToolField>
        {tiles && (
          <>
            {numeric("cellWidth", "Cell width")}
            {numeric("cellHeight", "Cell height")}
          </>
        )}
      </ToolGroup>
      {tiles && (
        <ToolGroup title={t("Offsets and spacing")}>
          {numeric("offsetX", "Start X")}
          {numeric("offsetY", "Start Y")}
          {numeric("spacingX", "Spacing X")}
          {numeric("spacingY", "Spacing Y")}
        </ToolGroup>
      )}
    </>
  );
}
