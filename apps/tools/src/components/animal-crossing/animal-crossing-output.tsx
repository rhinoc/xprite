import { useState } from "react";

import type {
  AnimalCrossingManager,
  AnimalCrossingSnapshot,
} from "$/managers/animal-crossing/animal-crossing-manager";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  SurfaceTone,
  ContentLayout,
  Dialog,
  OverlayContentLayout,
  RichText,
  Text,
  TextVariant,
  TextTone,
  Button,
  ButtonAppearance,
  ButtonVariant,
  Icon,
  IconKind,
  IconSize,
  Tooltip,
  CanvasSurface,
  Combobox,
  Panel,
  PanelVariant,
} from "@xprite/ui";

import styles from "$/components/animal-crossing/animal-crossing.module.css";
const SELECT_WIDTH = 80;
const QR_VIEWPORT = { sceneWidth: 2, sceneHeight: 2, width: 1, height: 1 };
const FIRST_COORDINATE = 1;
const IMPORT_HELP_BOUNDS = { x: 0, y: 0, width: 420, height: 260 };
const DOWNLOAD_MENU_WIDTH = 20;
const HELP_BUTTON_SIZE = { width: 12, height: 12 };
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
  const busy = snapshot.loading || snapshot.downloading || snapshot.pending;
  const downloadButton =
    result && result.patterns.length > FIRST_COORDINATE
      ? {
          variant: ButtonVariant.Split as const,
          menu: {
            label: t("Download options"),
            expandWidth: DOWNLOAD_MENU_WIDTH,
            items: [
              {
                label: t(`Download all ${result.patterns.length} designs`),
                disabled: busy,
                onSelect: () => void manager.download(),
              },
            ],
          },
        }
      : { variant: ButtonVariant.Push as const };
  return (
    <>
      <Panel
        emphasized
        tone={SurfaceTone.Warning}
        contentLayout={ContentLayout.Fill}
        variant={PanelVariant.Utility}
        collapsible
        className={styles.outputPanel}
        title={t("Design QR code")}
        aria-label={t("Design QR code")}
      >
        {pattern && qr && result ? (
          <div
            className={`${styles.outputContent} ${result.patterns.length > FIRST_COORDINATE ? styles.tiledOutput : ""}`}
          >
            {result.patterns.length > FIRST_COORDINATE && (
              <div className={styles.outputSelection}>
                <Combobox
                  aria-label={t("Design to scan")}
                  pixelWidth={SELECT_WIDTH}
                  value={String(selected)}
                  disabled={busy}
                  title={t(
                    `Row ${pattern.row + FIRST_COORDINATE}, column ${pattern.column + FIRST_COORDINATE}`,
                  )}
                  options={result.patterns.map((item, index) => ({
                    value: String(index),
                    label: t(
                      `Row ${item.row + FIRST_COORDINATE}, column ${item.column + FIRST_COORDINATE}`,
                    ),
                  }))}
                  onValueChange={(value) => manager.select(Number(value))}
                />
              </div>
            )}
            <div
              className={styles.outputArtwork}
              style={{ visibility: snapshot.pending ? "hidden" : undefined }}
            >
              <CanvasSurface
                className={styles.designArtwork}
                bounds={{
                  x: 0,
                  y: 0,
                  width: pattern.pixels.width,
                  height: pattern.pixels.height,
                }}
                style={{ width: 160, height: 160 }}
                pixels={pattern.pixels}
                aria-label={t("Selected converted design")}
              />
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
            </div>
            <div className={styles.outputActions}>
              <Button
                {...downloadButton}
                slots={{}}
                text={t("Download")}
                aria-label={t("Download QR PNG")}
                disabled={busy}
                onClick={() => void manager.downloadQr()}
              />
              <Tooltip text={t("How to import")}>
                <Button
                  appearance={ButtonAppearance.Quiet}
                  pixelSize={HELP_BUTTON_SIZE}
                  insetContent={false}
                  slots={{ leading: <Icon kind={IconKind.Help} size={IconSize.Small} /> }}
                  aria-label={t("How to import")}
                  aria-haspopup="dialog"
                  onClick={() => setHelpOpen(true)}
                />
              </Tooltip>
            </div>
          </div>
        ) : (
          <div className={styles.outputEmpty}>
            <Text variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
              {t(
                snapshot.pending
                  ? "Updating the selected design and QR code…"
                  : "Generate designs to preview and download their QR codes.",
              )}
            </Text>
          </div>
        )}
      </Panel>
      <Dialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title={t("How to import")}
        portal
        centerOnOpen
        defaultBounds={IMPORT_HELP_BOUNDS}
        resizable={false}
        contentLayout={OverlayContentLayout.Flow}
      >
        <RichText className={styles.importHelp}>
          <p>
            {t(
              "In Nintendo Switch App, open NookLink → Designs and scan this QR code. Download it in the game before scanning the next tile. Nintendo Switch Online membership is required.",
            )}
          </p>
        </RichText>
      </Dialog>
    </>
  );
}
