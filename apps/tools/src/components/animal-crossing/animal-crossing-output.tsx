import { useState } from "react";

import type {
  AnimalCrossingManager,
  AnimalCrossingSnapshot,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  PanelWindowChrome,
  SurfaceTone,
  Field,
  FieldLayout,
  Text,
  TextVariant,
  TextRole,
  TextTone,
  Button,
  CanvasSurface,
  Combobox,
  ControlFlow,
  Panel,
  PanelVariant,
  PanelWindowKind,
} from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const SELECT_WIDTH = 94;
const QR_VIEWPORT = { sceneWidth: 2, sceneHeight: 2, width: 1, height: 1 };
const FIRST_COORDINATE = 1;
export function AnimalCrossingOutput({
  manager,
  snapshot,
}: {
  manager: AnimalCrossingManager;
  snapshot: AnimalCrossingSnapshot;
}) {
  const t = useToolTranslation();

  const [helpOpen, setHelpOpen] = useState(false);
  const { result, qr, selected } = snapshot;
  const pattern = result?.patterns[selected];
  const busy = snapshot.loading || snapshot.downloading;
  return (
    <Panel
      windowChrome={PanelWindowChrome.Emphasized}
      tone={SurfaceTone.Warning}
      variant={PanelVariant.Window}
      windowKind={PanelWindowKind.Utility}
      collapsible
      className={styles.outputPanel}
      title={t("Design QR code")}
      aria-label={t("Design QR code")}
    >
      {pattern && qr && result ? (
        <div className={styles.outputContent}>
          {result.patterns.length > FIRST_COORDINATE && (
            <Field
              layout={FieldLayout.Inline}
              className={styles.outputSelection}
              label={
                <Text variant={TextVariant.Reading} textRole={TextRole.Caption}>
                  {t("Selected tile")}
                </Text>
              }
            >
              <Combobox
                aria-label={t("Design to scan")}
                pixelWidth={SELECT_WIDTH}
                value={String(selected)}
                disabled={busy}
                options={result.patterns.map((item, index) => ({
                  value: String(index),
                  label: t(
                    `Row ${item.row + FIRST_COORDINATE}, column ${item.column + FIRST_COORDINATE}`,
                  ),
                }))}
                onValueChange={(value) => manager.select(Number(value))}
              />
            </Field>
          )}
          <Text
            variant={TextVariant.Reading}
            textRole={TextRole.Caption}
            className={styles.outputTitle}
            wrap
          >
            {pattern.title}
          </Text>
          <div className={styles.qrArtwork}>
            <CanvasSurface
              bounds={{ x: 0, y: 0, width: qr.width, height: qr.height }}
              viewport={QR_VIEWPORT}
              pixels={qr}
              style={{ maxWidth: "100%", height: "auto", aspectRatio: "1" }}
              aria-label={t("Animal Crossing design QR code")}
            />
          </div>
          <ControlFlow className={styles.outputActions}>
            {result.patterns.length > FIRST_COORDINATE && (
              <Button
                slots={{}}
                text={t(`Download all ${result.patterns.length} designs`)}
                disabled={busy}
                onClick={() => void manager.download()}
              />
            )}
            <Button
              slots={{}}
              text={t("How to import")}
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen(!helpOpen)}
            />
          </ControlFlow>
          {helpOpen && (
            <Text
              variant={TextVariant.Reading}
              textRole={TextRole.Caption}
              tone={TextTone.Muted}
              wrap
            >
              {t(
                "In Nintendo Switch App, open NookLink → Designs and scan this QR code. Download it in the game before scanning the next tile. Nintendo Switch Online membership is required.",
              )}
            </Text>
          )}
        </div>
      ) : (
        <div className={styles.outputEmpty}>
          <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
            {t("Generate designs to preview and download their QR codes.")}
          </Text>
        </div>
      )}
    </Panel>
  );
}
