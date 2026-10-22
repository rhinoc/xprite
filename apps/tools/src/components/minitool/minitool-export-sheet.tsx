import { Button, useText } from "$/components/minitool/minitool-controls";
import { Icon } from "$/components/minitool/minitool-icons";
import { SceneCanvas } from "$/components/minitool/minitool-preview";
import type { MiniToolTextKey } from "$/managers/locale/minitool-text";
import { ExportContent, ExportFrame } from "$/managers/minitool/composition";
import type { MiniToolEditor, MiniToolSnapshot } from "$/managers/minitool/minitool-editor";
import { MiniToolTarget, type MiniToolScene } from "$/managers/ports/minitool";

import styles from "$/components/minitool/minitool.module.css";

const PREVIEW = { width: 300, height: 272 };

/** 导出: preview, size, split or pixels only, then save to the album or post a note. */
export function ExportSheet({
  editor,
  state,
  scene,
  onClose,
  onOutput,
}: {
  editor: MiniToolEditor;
  state: MiniToolSnapshot;
  scene: MiniToolScene;
  onClose(): void;
  onOutput(target: MiniToolTarget): void;
}) {
  const t = useText();
  const { size } = scene.composition;
  const frame = state.layout.frame;
  const frameName = t(
    (frame === ExportFrame.MacOS8 ? "frame.mac-os-8-long" : `frame.${frame}`) as MiniToolTextKey,
  );
  const busy = state.exporting !== null;
  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("export.title")}>
        <div className={styles.grabber} />
        <div className={styles.sheetHead}>
          <span className={styles.placeholder} />
          <h2>{t("export.title")}</h2>
          <Button className={styles.close} aria-label={t("export.close")} onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        <div className={styles.sheetPreview}>
          <SceneCanvas
            scene={{ ...scene, content: state.content }}
            width={PREVIEW.width}
            height={PREVIEW.height}
            label={t("export.title")}
          />
        </div>
        <div className={styles.sheetMeta} data-export-size="">
          <span>
            {size.width} × {size.height}
          </span>
          <span>·</span>
          <span>PNG</span>
          <span>·</span>
          <span>{frameName}</span>
        </div>
        <div className={styles.segmented} role="radiogroup" aria-label={t("export.title")}>
          {(
            [
              [ExportContent.Split, "splitImage", "export.split"],
              [ExportContent.Pixels, "pixelImage", "export.pixels"],
            ] as const
          ).map(([content, icon, label]) => (
            <Button
              key={content}
              role="radio"
              aria-checked={state.content === content}
              onClick={() => editor.setContent(content)}
            >
              <Icon name={icon} />
              {t(label)}
            </Button>
          ))}
        </div>
        <div className={styles.sheetNote}>{t("export.note")}</div>
        <div className={styles.sheetActions}>
          <Button
            className={styles.pill}
            disabled={busy}
            onClick={() => onOutput(MiniToolTarget.Album)}
          >
            <Icon name="save" />
            {t(state.exporting === MiniToolTarget.Album ? "export.saving" : "export.save")}
          </Button>
          <Button
            className={`${styles.pill} ${styles.xhs}`}
            disabled={busy}
            onClick={() => onOutput(MiniToolTarget.Note)}
          >
            <Icon name="post" />
            {t(state.exporting === MiniToolTarget.Note ? "export.posting" : "export.post")}
          </Button>
        </div>
      </div>
    </>
  );
}
