import { useEffect, useState } from "react";

import { useFilesManager, useFilesSnapshot, useFilesText } from "$/components/files/files-context";
import { entryKind, folderName } from "$/components/files/files-window";
import { formatBytes, formatDate, LOOSE_FOLDER } from "$/managers/files/files-model";
import { useToolLanguage } from "$/managers/locale/tool-language";
import { FileEntryKind } from "$/managers/ports/files";
import {
  Dialog,
  Icon,
  IconKind,
  IconSize,
  OverlayContentLayout,
  Text,
  TextArea,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/files/files.module.css";

const INFO_BOUNDS = { x: 0, y: 0, width: 340, height: 400 };

/** Mac OS 8 "Get Info" window for one Files item. */
export function FilesInfoWindow() {
  const manager = useFilesManager();
  const state = useFilesSnapshot(manager);
  const text = useFilesText();
  const { language, translate: t } = useToolLanguage();
  const entry = manager?.entry(state?.infoId ?? null);
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    setComment(entry?.comment ?? "");
    let active = true;
    setPreview(null);
    if (manager && entry)
      void manager.thumbnail(entry).then((url) => {
        if (active) setPreview(url);
      });
    return () => {
      active = false;
    };
  }, [manager, entry]);
  if (!manager || !state || !entry) return null;
  const unknown = text("files.unknown");
  const rows: [string, string][] = [
    [text("files.info.kind"), entryKind(entry, text)],
    [
      text("files.info.size"),
      entry.size
        ? `${formatBytes(entry.size, language)} (${entry.size.toLocaleString(language)} B)`
        : unknown,
    ],
    [
      text("files.info.where"),
      `${
        entry.folder === LOOSE_FOLDER
          ? text("files.title")
          : `${text("files.title")}: ${folderName(entry.folder, text, t)}`
      } (${text("files.info.local")})`,
    ],
    [text("files.info.created"), entry.createdAt ? formatDate(entry.createdAt, language) : unknown],
    [
      text("files.info.modified"),
      entry.modifiedAt ? formatDate(entry.modifiedAt, language) : unknown,
    ],
  ];
  if (entry.width && entry.height)
    rows.push([text("files.info.dimensions"), `${entry.width} × ${entry.height}`]);
  const editable = entry.kind === FileEntryKind.File;
  return (
    <Dialog
      portal
      open
      centerOnOpen
      constrainToViewport
      movable
      title={text("files.info.title", { name: entry.name })}
      closeLabel={text("files.info.close")}
      defaultBounds={INFO_BOUNDS}
      contentLayout={OverlayContentLayout.Flow}
      onOpenChange={(open) => {
        if (!open) {
          if (editable && comment !== entry.comment) void manager.setComment(entry.id, comment);
          manager.showInfo(null);
        }
      }}
    >
      <div className={styles.info}>
        <div className={styles.infoHead}>
          {preview ? (
            <img
              className={styles.thumbnail}
              src={preview}
              alt=""
              width={IconSize.Large}
              height={IconSize.Large}
            />
          ) : (
            <Icon kind={IconKind.Document} size={IconSize.Large} />
          )}
          <Text variant={TextVariant.Reading} wrap>
            {entry.name}
          </Text>
        </div>
        <dl className={styles.infoRows}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <TextArea
          aria-label={text("files.info.comments")}
          value={comment}
          disabled={!editable}
          rows={3}
          onChange={(event) => setComment(event.currentTarget.value)}
          onBlur={() => {
            if (editable && comment !== entry.comment) void manager.setComment(entry.id, comment);
          }}
        />
      </div>
    </Dialog>
  );
}
