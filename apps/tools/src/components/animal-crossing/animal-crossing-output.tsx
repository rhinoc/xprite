import type {
  AnimalCrossingManager,
  AnimalCrossingSnapshot,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { CanvasSurface, Combobox, Text, TextTone, TextVariant } from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";

const SELECT_WIDTH = 120;
const QR_VIEWPORT = { sceneWidth: 2, sceneHeight: 2, width: 1, height: 1 };
const FIRST_COORDINATE = 1;

/** The QR tab: the design to scan (when tiled), its QR code and how to import it. */
export function AnimalCrossingQrTab({
  manager,
  snapshot,
}: {
  manager: AnimalCrossingManager;
  snapshot: AnimalCrossingSnapshot;
}) {
  const t = useToolTranslation();
  const { result, qr, selected } = snapshot;
  const pattern = result?.patterns[selected];
  const busy = snapshot.loading || snapshot.downloading || snapshot.pending;
  if (!pattern || !qr || !result)
    return (
      <div className={styles.qrEmpty}>
        <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
          {t(
            snapshot.pending
              ? "Updating the selected design and QR code…"
              : "The QR code of the selected design appears here.",
          )}
        </Text>
      </div>
    );
  return (
    <div className={styles.qrTab}>
      {result.patterns.length > FIRST_COORDINATE && (
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
      )}
      <div className={styles.qrArtwork}>
        <div className={styles.qrImage}>
          <CanvasSurface
            bounds={{ x: 0, y: 0, width: qr.width, height: qr.height }}
            viewport={QR_VIEWPORT}
            pixels={qr}
            style={{ width: "100%", height: "100%" }}
            aria-label={t("Animal Crossing design QR code")}
          />
        </div>
      </div>
      <Text variant={TextVariant.Reading} wrap className={styles.qrHelp}>
        {t(
          "In Nintendo Switch App, open NookLink → Designs and scan this QR code. Download it in the game before scanning the next tile. Nintendo Switch Online membership is required.",
        )}
      </Text>
    </div>
  );
}
