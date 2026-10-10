import { useToolTranslation } from "$/managers/locale/tool-language";
const PANEL_CONTENT_GAP = 8;
import { useState } from "react";

import {
  AnimalCrossingLayout,
  type AnimalCrossingManager,
  type AnimalCrossingSnapshot,
  type AnimalCrossingSettings,
} from "$/managers/animal-crossing/animal-crossing-manager";
import {
  ContentLayout,
  ContentPadding,
  PanelWindowChrome,
  SurfaceTone,
  Text,
  TextVariant,
  Field,
  TextTone,
  Button,
  Combobox,
  Input,
  Panel,
  PanelVariant,
  PanelWindowKind,
} from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const NUMBER_WIDTH = 44;
const TEXT_WIDTH = 104;
const LAYOUT_WIDTH = 104;
const MAX_PARAMETER = 65535;
const MIN_SIZE = 1;
const ZERO = 0;

export function AnimalCrossingSettingsPanel({
  manager,
  snapshot,
}: {
  manager: AnimalCrossingManager;
  snapshot: AnimalCrossingSnapshot;
}) {
  const t = useToolTranslation();

  const [authorOpen, setAuthorOpen] = useState(false);
  const [spacingOpen, setSpacingOpen] = useState(
    !!(
      snapshot.settings.offsetX ||
      snapshot.settings.offsetY ||
      snapshot.settings.spacingX ||
      snapshot.settings.spacingY
    ),
  );
  const busy = snapshot.loading || snapshot.downloading;
  const settings = snapshot.settings;
  const numeric = (
    key: "cellWidth" | "cellHeight" | "offsetX" | "offsetY" | "spacingX" | "spacingY",
    label: string,
  ) => (
    <Field label={t(label)}>
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
    </Field>
  );
  const text = (key: "title" | "creator" | "town", label: string) => (
    <Field label={t(label)}>
      <Input
        aria-label={t(label)}
        pixelWidth={TEXT_WIDTH}
        value={settings[key]}
        disabled={busy}
        onValueChange={(value) =>
          manager.changeSettings({ [key]: value } as Partial<AnimalCrossingSettings>)
        }
      />
    </Field>
  );
  if (snapshot.importedQr)
    return (
      <Panel
        windowChrome={PanelWindowChrome.Emphasized}
        tone={SurfaceTone.Accent}
        contentLayout={ContentLayout.Column}
        contentPadding={ContentPadding.Compact}
        contentGap={PANEL_CONTENT_GAP}
        variant={PanelVariant.Window}
        windowKind={PanelWindowKind.Utility}
        collapsible
        className={styles.settingsPanel}
        title={<Text variant={TextVariant.Reading}>{t("Design information")}</Text>}
        aria-label={t("Design information")}
      >
        <div className={styles.detail}>
          <Text variant={TextVariant.Control} text={t("Title")} />
          <Text variant={TextVariant.Reading} wrap>
            {settings.title}
          </Text>
        </div>
        <div className={styles.detail}>
          <Text variant={TextVariant.Control} text={t("Creator")} />
          <Text variant={TextVariant.Reading} wrap>
            {settings.creator}
          </Text>
        </div>
        <div className={styles.detail}>
          <Text variant={TextVariant.Control} text={t("Island / town")} />
          <Text variant={TextVariant.Reading} wrap>
            {settings.town}
          </Text>
        </div>
        <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
          {t("Ready to export. The original design is preserved.")}
        </Text>
      </Panel>
    );
  return (
    <aside className={styles.settingsColumn} data-ui-desktop-layer>
      <Panel
        windowChrome={PanelWindowChrome.Emphasized}
        tone={SurfaceTone.Accent}
        contentLayout={ContentLayout.Column}
        contentPadding={ContentPadding.Compact}
        contentGap={PANEL_CONTENT_GAP}
        variant={PanelVariant.Window}
        windowKind={PanelWindowKind.Utility}
        collapsible
        className={styles.settingsPanel}
        title={<Text variant={TextVariant.Reading}>{t("Design information")}</Text>}
        aria-label={t("Design information")}
      >
        {text("title", "Title")}
        <Button
          slots={{}}
          text={t("Creator and island")}
          aria-expanded={authorOpen}
          disabled={busy}
          onClick={() => setAuthorOpen(!authorOpen)}
        />
        {authorOpen && (
          <>
            {text("creator", "Creator")}
            {text("town", "Island / town")}
          </>
        )}
        {snapshot.frameCount > MIN_SIZE && (
          <Field label={t("Frame")}>
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
          </Field>
        )}
      </Panel>
      <Panel
        windowChrome={PanelWindowChrome.Emphasized}
        tone={SurfaceTone.Accent}
        contentLayout={ContentLayout.Column}
        contentPadding={ContentPadding.Compact}
        contentGap={PANEL_CONTENT_GAP}
        variant={PanelVariant.Window}
        windowKind={PanelWindowKind.Utility}
        collapsible
        className={styles.settingsPanel}
        title={<Text variant={TextVariant.Reading}>{t("Image layout")}</Text>}
        aria-label={t("Image layout")}
      >
        <Field label={t("Convert as")}>
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
        </Field>
        {snapshot.layout === AnimalCrossingLayout.Tiles && (
          <>
            <div className={styles.pair}>
              {numeric("cellWidth", "Cell width")}
              {numeric("cellHeight", "Cell height")}
            </div>
            <Button
              slots={{}}
              text={t("Offsets and spacing")}
              aria-expanded={spacingOpen}
              disabled={busy}
              onClick={() => setSpacingOpen(!spacingOpen)}
            />
            {spacingOpen && (
              <>
                <div className={styles.pair}>
                  {numeric("offsetX", "Start X")}
                  {numeric("offsetY", "Start Y")}
                </div>
                <div className={styles.pair}>
                  {numeric("spacingX", "Spacing X")}
                  {numeric("spacingY", "Spacing Y")}
                </div>
              </>
            )}
          </>
        )}
        <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
          {t("Each design is 32 × 32 pixels with up to 15 colors and transparency.")}
        </Text>
        <Button
          slots={{}}
          className={styles.wideButton}
          text={t("Generate QR codes")}
          disabled={busy}
          onClick={() => manager.generate()}
        />
      </Panel>
    </aside>
  );
}
