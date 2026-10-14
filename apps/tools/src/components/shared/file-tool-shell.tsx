import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

import { useFilesManager } from "$/components/files/files-context";
import { FileToolEmptyState } from "$/components/shared/file-tool-empty-state";
import { ToolFrame } from "$/components/shared/tool-frame";
import { decodeFilesDrag, FILES_DRAG_TYPE } from "$/managers/files/files-model";
import { useToolTranslation } from "$/managers/locale/tool-language";
import type { PublicTool } from "$/managers/tools/tool-catalog";
import { ContentPadding, SurfaceTone, Text, TextVariant, Panel, type MenuItem } from "@xprite/ui";

import styles from "$/components/shared/tool-frame.module.css";

/** Shared file input, drop surface and loaded-file actions for independent tools. */
export function FileToolShell({
  tool,
  filename,
  ready,
  processing = false,
  busy,
  error,
  fileItems = [],
  children,
  onOpen,
  onExample,
  help,
}: {
  tool: PublicTool;
  filename: string;
  ready: boolean;
  processing?: boolean;
  busy: boolean;
  error: string | null;
  fileItems?: readonly MenuItem[];
  help?: ReactNode;
  children?: ReactNode;
  onOpen(file: File): Promise<void>;
  onExample(): Promise<void>;
}) {
  const t = useToolTranslation();

  const files = useFilesManager();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // A file the user imported, kept in Files once the tool has parsed it successfully.
  const pending = useRef<File | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const importFile = (file: File) => {
    pending.current = file;
    return onOpen(file);
  };
  useEffect(() => {
    const file = pending.current;
    if (!file || busy || processing) return;
    if (error) pending.current = null;
    else if (ready) {
      pending.current = null;
      void files?.remember(file, tool.path, "tool").catch(() => undefined);
    }
  }, [files, tool.path, ready, busy, processing, error]);
  useEffect(() => {
    if (!files) return;
    const target = {
      path: tool.path,
      accept: tool.accept,
      open: (file: File) => {
        pending.current = null;
        return openRef.current(file);
      },
    };
    const unregister = files.registerTarget(target);
    void files.takeHandoff(target).catch(() => undefined);
    return unregister;
  }, [files, tool.path, tool.accept]);
  const carriesFiles = (event: DragEvent) =>
    event.dataTransfer.types.includes("Files") ||
    (!!files && event.dataTransfer.types.includes(FILES_DRAG_TYPE));
  const chooseFile = () => input.current?.click();
  return (
    <ToolFrame
      tool={tool}
      processing={processing}
      help={help}
      filename={ready ? filename : undefined}
      menus={[
        {
          label: t("File"),
          items: [
            { label: `${tool.openLabel}…`, disabled: busy, onSelect: chooseFile },
            { label: t("Open example"), disabled: busy, onSelect: () => void onExample() },
            ...fileItems.map((item, index) => ({
              ...item,
              separator: index === 0 || item.separator,
            })),
          ],
        },
      ]}
    >
      <main className={styles.main}>
        <input
          ref={input}
          type="file"
          accept={tool.accept}
          className={styles.fileInput}
          aria-label={t(tool.fileLabel)}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importFile(file);
          }}
        />
        {error && (
          <Panel
            contentPadding={ContentPadding.Compact}
            tone={SurfaceTone.Warning}
            role="alert"
            className={styles.error}
          >
            <Text variant={TextVariant.Reading} wrap>
              {t(error)}
            </Text>
          </Panel>
        )}
        <section
          className={styles.workspace}
          aria-label={t(tool.label)}
          aria-busy={busy}
          onDragEnter={(event) => {
            if (carriesFiles(event)) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const ids = decodeFilesDrag(event.dataTransfer.getData(FILES_DRAG_TYPE));
            const entry = files?.entry(ids[0] ?? null);
            if (files && entry) {
              const target = files.pageTarget();
              if (target && files.accepts(target, entry)) void files.loadInto(target, entry);
              return;
            }
            const file = event.dataTransfer.files[0];
            if (file) void importFile(file);
          }}
        >
          <div className={styles.previewPanel}>
            {!ready && (
              <FileToolEmptyState
                tool={tool}
                busy={busy}
                onChooseFile={chooseFile}
                onExample={onExample}
              />
            )}
            {children}
          </div>
          {dragging && (
            <div className={styles.dropOverlay}>
              <Text variant={TextVariant.Reading}>{t("Drop to open")}</Text>
            </div>
          )}
        </section>
      </main>
    </ToolFrame>
  );
}
