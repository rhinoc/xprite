import { Fragment, type ReactNode } from "react";

import { MiniToolTarget } from "$/shared/bridge/output";
import { Button, useSharedText } from "$/shared/ui/controls";
import { Icon } from "$/shared/ui/icons";

import styles from "$/shared/ui/ui.module.css";

/**
 * 导出: the tool's preview and options, then save to the album or post a note. `meta` is shown
 * under the preview, separated by dots (size, format, frame).
 */
export function ExportSheet({
  preview,
  meta,
  note,
  exporting,
  children,
  onClose,
  onOutput,
}: {
  preview: ReactNode;
  meta: readonly string[];
  note?: string;
  exporting: MiniToolTarget | null;
  children?: ReactNode;
  onClose(): void;
  onOutput(target: MiniToolTarget): void;
}) {
  const t = useSharedText();
  const busy = exporting !== null;
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
        <div className={styles.sheetPreview}>{preview}</div>
        <div className={styles.sheetMeta} data-export-size="">
          {meta.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && <span>·</span>}
              <span>{item}</span>
            </Fragment>
          ))}
        </div>
        {children}
        {note && <div className={styles.sheetNote}>{note}</div>}
        <div className={styles.sheetActions}>
          <Button
            className={styles.pill}
            disabled={busy}
            onClick={() => onOutput(MiniToolTarget.Album)}
          >
            <Icon name="save" />
            {t(exporting === MiniToolTarget.Album ? "export.saving" : "export.save")}
          </Button>
          <Button
            className={`${styles.pill} ${styles.xhs}`}
            disabled={busy}
            onClick={() => onOutput(MiniToolTarget.Note)}
          >
            <Icon name="post" />
            {t(exporting === MiniToolTarget.Note ? "export.posting" : "export.post")}
          </Button>
        </div>
      </div>
    </>
  );
}
