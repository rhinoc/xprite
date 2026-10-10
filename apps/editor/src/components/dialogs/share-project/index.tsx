import { useState, type ReactNode } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
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
import { useUiAssets } from "@xprite/ui/assets";

import styles from "$/components/dialogs/share-project/share-project.module.css";

const DIALOG_BOUNDS = { x: 0, y: 0, width: 720, height: 600 };
const DEFAULT_WINDOW_TITLEBAR_HEIGHT = 34;
const DEFAULT_WINDOW_BORDER_WIDTH = 12;
const MIN_DIALOG_WIDTH = 280;
const LINK_HEIGHT = 192;
const URL_ROWS = 6;
const MESSAGE_SCALE = 2;
const MESSAGE_LINE_HEIGHT = 20;

function ShareMessage({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <Text
      variant={TextVariant.Inline}
      scale={MESSAGE_SCALE}
      lineHeight={MESSAGE_LINE_HEIGHT}
      ink={muted ? "var(--ui-color-muted-ink)" : "var(--ui-overlay-text)"}
      wrap
    >
      {children}
    </Text>
  );
}

function ShareSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <Text variant={TextVariant.Control} text={title} />
      {children}
    </section>
  );
}

export function ShareProjectDialog({
  source,
  onClose,
}: {
  source: ShareProjectSource;
  onClose(): void;
}) {
  useUiLanguage();
  const manager = useProjectSharing(source);
  const scene = useSceneBounds();
  const assets = useUiAssets();
  const surface = assets?.style.parts.window.surface;
  const chromeHeight =
    (surface?.titlebar?.height ?? DEFAULT_WINDOW_TITLEBAR_HEIGHT) +
    (surface?.borderWidth ?? DEFAULT_WINDOW_BORDER_WIDTH);
  const width = Math.min(DIALOG_BOUNDS.width, scene.width);
  const height = Math.min(scene.height, DIALOG_BOUNDS.height);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  return (
    <EditorDialog
      open
      modal
      constrainToViewport
      resizable={false}
      title={tUiSource("Share...")}
      bounds={{
        x: position?.x ?? Math.max(0, Math.round((scene.width - width) / 2)),
        y: position?.y ?? Math.max(0, Math.round((scene.height - height) / 2)),
        width,
        height,
      }}
      onBoundsChange={({ x, y }) => setPosition({ x, y })}
      minSize={{
        width: MIN_DIALOG_WIDTH,
        height: chromeHeight,
      }}
      contentLayout={OverlayContentLayout.Flow}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className={styles.body}>
        <header className={styles.summary}>
          <ShareMessage>{source.name}</ShareMessage>
        </header>
        {manager.showReductions && (
          <div className={styles.reductions}>
            <ShareSection title={tUi("share.reduceTitle")}>
              <ShareMessage muted>{tUi("share.reduceHelp")}</ShareMessage>
              <div className={styles.options}>
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
                  checked={
                    manager.reductions.visibleLayers || manager.reductions.flattenVisibleLayers
                  }
                  disabled={
                    !manager.available.visibleLayers || manager.reductions.flattenVisibleLayers
                  }
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
              </div>
              {(manager.reductions.flattenVisibleLayers ||
                manager.reductions.cleanTransparentRgb) && (
                <ShareMessage>{tUi("share.reductionConsequences")}</ShareMessage>
              )}
            </ShareSection>
          </div>
        )}
        <div className={styles.shareContent} aria-busy={manager.busy}>
          {!manager.busy && (manager.artifact || manager.showReductions) && (
            <ShareMessage muted>
              {tUi("share.contentCount", {
                frames: manager.frameCount,
                layers: manager.layerCount,
              })}
            </ShareMessage>
          )}
          {manager.busy ? (
            <div className={styles.pending} role="status">
              <ShareMessage>{tUiSource("Preparing share link…")}</ShareMessage>
            </div>
          ) : manager.artifact?.url ? (
            <div className={styles.columns}>
              <ShareSection title={tUiSource("Share link")}>
                <TextArea
                  aria-label={tUiSource("Share link")}
                  rows={URL_ROWS}
                  height={LINK_HEIGHT}
                  readOnly
                  value={manager.artifact.url}
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <ControlFlow className={styles.linkActions}>
                  <Button
                    text={tUiSource(manager.copied ? "Copied" : "Copy link")}
                    disabled={!manager.canCopy || manager.copyBusy}
                    onClick={() => void manager.copy()}
                  />
                  <ShareMessage muted>
                    {tUi("share.linkLength", { count: manager.artifact.urlCharacters })}
                  </ShareMessage>
                </ControlFlow>
              </ShareSection>
              {manager.artifact.qr && (
                <ShareSection title={tUiSource("QR code")}>
                  <img
                    className={styles.qrImage}
                    src={manager.artifact.qr.preview}
                    alt={tUiSource("Share QR code")}
                  />
                  <ControlFlow>
                    <Button text={tUiSource("Save QR code")} onClick={manager.downloadQr} />
                  </ControlFlow>
                </ShareSection>
              )}
            </div>
          ) : null}
          {!manager.busy && manager.stage === ShareLinkStage.Warning && (
            <div className={styles.notice} role="status">
              <ShareMessage>
                {tUiSource(
                  "This link is long. Some chat apps may truncate it or fail to open it. If that happens, export and send a file.",
                )}
              </ShareMessage>
            </div>
          )}
          {!manager.busy && manager.artifact?.url && !manager.artifact.qr && (
            <ShareMessage muted>
              {tUiSource("This link is too large for a single QR code. Copy the link instead.")}
            </ShareMessage>
          )}
          {!manager.busy && manager.stage === ShareLinkStage.Rejected && manager.artifact && (
            <div className={styles.notice} role="status">
              <ShareMessage>
                {tUi("share.exceedsLimit", {
                  count: manager.artifact.urlCharacters,
                  limit: manager.maxUrlCharacters,
                })}
              </ShareMessage>
            </div>
          )}
          {manager.error && (
            <div className={styles.notice} role="alert">
              <ShareMessage>{tUiSource(manager.error)}</ShareMessage>
            </div>
          )}
        </div>
      </div>
    </EditorDialog>
  );
}
