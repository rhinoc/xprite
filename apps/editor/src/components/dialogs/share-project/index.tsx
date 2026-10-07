import { EditorDialog } from "$/components/dialogs/overlay";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  useProjectSharing,
  ShareLinkStage,
  ShareReduction,
  type ShareProjectSource,
} from "$/managers/files/project-sharing";
import {
  Button,
  Checkbox,
  ControlFlow,
  OverlayContentLayout,
  Text,
  TextArea,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/dialogs/share-project/share-project.module.css";

const DIALOG_BOUNDS = { x: 0, y: 0, width: 760, height: 420 };
const EXPANDED_DIALOG_HEIGHT = 610;
const MIN_DIALOG_WIDTH = 240;
const URL_ROWS = 6;
const MESSAGE_SCALE = 2;

export function ShareProjectDialog({
  source,
  onClose,
}: {
  source: ShareProjectSource;
  onClose(): void;
}) {
  useUiLanguage();
  const manager = useProjectSharing(source);
  return (
    <EditorDialog
      open
      modal
      centerOnOpen
      constrainToViewport
      title={tUiSource("Share...")}
      defaultBounds={DIALOG_BOUNDS}
      minSize={{
        width: MIN_DIALOG_WIDTH,
        height: manager.showReductions ? EXPANDED_DIALOG_HEIGHT : DIALOG_BOUNDS.height,
      }}
      contentLayout={OverlayContentLayout.Flow}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className={styles.body}>
        {manager.busy ? (
          <Text variant={TextVariant.Inline} scale={MESSAGE_SCALE} ink="var(--ui-overlay-text)">
            {tUiSource("Preparing share link…")}
          </Text>
        ) : manager.artifact?.url ? (
          <>
            <div className={styles.columns}>
              <div className={styles.link}>
                <Text variant={TextVariant.Control} text={tUiSource("Share link")} />
                <TextArea
                  aria-label={tUiSource("Share link")}
                  rows={URL_ROWS}
                  readOnly
                  value={manager.artifact.url}
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Text
                  variant={TextVariant.Inline}
                  scale={MESSAGE_SCALE}
                  ink="var(--ui-overlay-text)"
                >
                  {tUi("share.linkLength", { count: manager.artifact.urlCharacters })}
                </Text>
                <Button
                  text={tUiSource(manager.copied ? "Copied" : "Copy link")}
                  disabled={!manager.canCopy || manager.copyBusy}
                  onClick={() => void manager.copy()}
                />
              </div>
              <div className={styles.qr}>
                <Text variant={TextVariant.Control} text={tUiSource("QR code")} />
                {manager.artifact.qr ? (
                  <>
                    <img
                      className={styles.qrImage}
                      src={manager.artifact.qr.preview}
                      alt={tUiSource("Share QR code")}
                    />
                    <Button text={tUiSource("Save QR code")} onClick={manager.downloadQr} />
                  </>
                ) : (
                  <Text
                    variant={TextVariant.Inline}
                    scale={MESSAGE_SCALE}
                    ink="var(--ui-overlay-text)"
                    wrap
                  >
                    {tUiSource(
                      "This link is too large for a single QR code. Copy the link instead.",
                    )}
                  </Text>
                )}
              </div>
            </div>
            {manager.stage === ShareLinkStage.Warning && (
              <div role="status">
                <Text
                  variant={TextVariant.Inline}
                  scale={MESSAGE_SCALE}
                  ink="var(--ui-overlay-text)"
                  wrap
                >
                  {tUiSource(
                    "This link is long. Some chat apps may truncate it or fail to open it. If that happens, export and send a file.",
                  )}
                </Text>
              </div>
            )}
          </>
        ) : null}
        {!manager.busy && manager.stage === ShareLinkStage.Rejected && manager.artifact && (
          <div role="status">
            <Text
              variant={TextVariant.Inline}
              scale={MESSAGE_SCALE}
              ink="var(--ui-overlay-text)"
              wrap
            >
              {tUi("share.exceedsLimit", {
                count: manager.artifact.urlCharacters,
                limit: manager.maxUrlCharacters,
              })}
            </Text>
          </div>
        )}
        {!manager.busy && (manager.artifact || manager.showReductions) && (
          <Text variant={TextVariant.Inline} scale={MESSAGE_SCALE} ink="var(--ui-overlay-text)">
            {tUi("share.contentCount", {
              frames: manager.frameCount,
              layers: manager.layerCount,
            })}
          </Text>
        )}
        {manager.showReductions && (
          <div className={styles.reductions} role="group" aria-label={tUi("share.reduceTitle")}>
            <Text variant={TextVariant.Control} text={tUi("share.reduceTitle")} />
            <Text
              variant={TextVariant.Inline}
              scale={MESSAGE_SCALE}
              ink="var(--ui-overlay-text)"
              wrap
            >
              {tUi("share.reduceHelp")}
            </Text>
            <Checkbox
              label={tUi("share.currentFrame")}
              checked={manager.reductions.currentFrame}
              disabled={!manager.available.currentFrame}
              onCheckedChange={(checked) =>
                manager.setReduction(ShareReduction.CurrentFrame, checked)
              }
            />
            <Checkbox
              label={tUi("share.visibleLayers")}
              checked={manager.reductions.visibleLayers || manager.reductions.flattenVisibleLayers}
              disabled={!manager.available.visibleLayers || manager.reductions.flattenVisibleLayers}
              onCheckedChange={(checked) =>
                manager.setReduction(ShareReduction.VisibleLayers, checked)
              }
            />
            <Checkbox
              label={tUi("share.flattenLayers")}
              checked={manager.reductions.flattenVisibleLayers}
              disabled={!manager.available.flattenVisibleLayers}
              onCheckedChange={(checked) =>
                manager.setReduction(ShareReduction.FlattenVisibleLayers, checked)
              }
            />
            <Checkbox
              label={tUi("share.cleanTransparent")}
              checked={manager.reductions.cleanTransparentRgb}
              disabled={!manager.available.cleanTransparentRgb}
              onCheckedChange={(checked) =>
                manager.setReduction(ShareReduction.CleanTransparentRgb, checked)
              }
            />
            {(manager.reductions.flattenVisibleLayers ||
              manager.reductions.cleanTransparentRgb) && (
              <Text
                variant={TextVariant.Inline}
                scale={MESSAGE_SCALE}
                ink="var(--ui-overlay-text)"
                wrap
              >
                {tUi("share.reductionConsequences")}
              </Text>
            )}
          </div>
        )}
        {manager.error && (
          <div role="alert">
            <Text
              variant={TextVariant.Inline}
              scale={MESSAGE_SCALE}
              ink="var(--ui-overlay-text)"
              wrap
            >
              {tUiSource(manager.error)}
            </Text>
          </div>
        )}
        <ControlFlow className={styles.actions}>
          <Button text={tUiSource("Close")} onClick={onClose} />
        </ControlFlow>
      </div>
    </EditorDialog>
  );
}
