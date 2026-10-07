const PANEL_CONTENT_GAP = 8;
import { useState } from "react";

import type {
  AnimalCrossingManager,
  AnimalCrossingSnapshot,
} from "$/managers/animal-crossing/animal-crossing-manager";
import {
  ContentAlign,
  ContentLayout,
  ContentPadding,
  PanelWindowChrome,
  SurfaceTone,
  Field,
  Text,
  TextVariant,
  TextTone,
  Button,
  CanvasSurface,
  Combobox,
  Panel,
  PanelVariant,
  PanelWindowKind,
} from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const SELECT_WIDTH = 134;
const QR_VIEWPORT = { sceneWidth: 2, sceneHeight: 2, width: 1, height: 1 };
const FIRST_COORDINATE = 1;
export function AnimalCrossingOutput({
  manager,
  snapshot,
}: {
  manager: AnimalCrossingManager;
  snapshot: AnimalCrossingSnapshot;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { result, qr, selected } = snapshot;
  const pattern = result?.patterns[selected];
  const busy = snapshot.loading || snapshot.downloading;
  return (
    <Panel
      windowChrome={PanelWindowChrome.Emphasized}
      tone={SurfaceTone.Warning}
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      contentGap={PANEL_CONTENT_GAP}
      contentAlign={ContentAlign.Center}
      variant={PanelVariant.Window}
      windowKind={PanelWindowKind.Utility}
      collapsible
      className={styles.outputPanel}
      title={<Text variant={TextVariant.Reading}>Design QR code</Text>}
      aria-label="Design QR code"
    >
      {pattern && qr && result ? (
        <>
          {result.patterns.length > FIRST_COORDINATE && (
            <Field label="Selected tile">
              <Combobox
                aria-label="Design to scan"
                pixelWidth={SELECT_WIDTH}
                value={String(selected)}
                disabled={busy}
                options={result.patterns.map((item, index) => ({
                  value: String(index),
                  label: `Row ${item.row + FIRST_COORDINATE}, column ${item.column + FIRST_COORDINATE}`,
                }))}
                onValueChange={(value) => manager.select(Number(value))}
              />
            </Field>
          )}
          <Text variant={TextVariant.Reading} wrap>
            {pattern.title}
          </Text>
          <div className={styles.qrArtwork}>
            <CanvasSurface
              bounds={{ x: 0, y: 0, width: qr.width, height: qr.height }}
              viewport={QR_VIEWPORT}
              pixels={qr}
              style={{ maxWidth: "100%", height: "auto", aspectRatio: "1" }}
              aria-label="Animal Crossing design QR code"
            />
          </div>
          {result.patterns.length > FIRST_COORDINATE && (
            <Button
              slots={{}}
              className={styles.wideButton}
              text={`Download all ${result.patterns.length} designs`}
              disabled={busy}
              onClick={() => void manager.download()}
            />
          )}
          <Button
            slots={{}}
            text="How to import"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen(!helpOpen)}
          />
          {helpOpen && (
            <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
              In Nintendo Switch App, open NookLink → Designs and scan this QR code. Download it in
              the game before scanning the next tile. Nintendo Switch Online membership is required.
            </Text>
          )}
        </>
      ) : (
        <div className={styles.outputEmpty}>
          <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
            Generate designs to preview and download their QR codes.
          </Text>
        </div>
      )}
    </Panel>
  );
}
