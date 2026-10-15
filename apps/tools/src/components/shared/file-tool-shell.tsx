import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

import { useFilesManager, useFilesText } from "$/components/files/files-context";
import { FileToolEmptyState } from "$/components/shared/file-tool-empty-state";
import { ToolAdjustSlot } from "$/components/shared/tool-adjust-slot";
import { ToolFlowEmptyStage } from "$/components/shared/tool-flow-empty-stage";
import { ToolFrame } from "$/components/shared/tool-frame";
import { decodeFilesDrag, FILES_DRAG_TYPE } from "$/managers/files/files-model";
import { useToolTranslation } from "$/managers/locale/tool-language";
import type { PublicTool } from "$/managers/tools/tool-catalog";
import { flowCue } from "$/managers/tools/tool-flow";
import {
  ContentPadding,
  Dialog,
  OverlayContentLayout,
  SurfaceTone,
  Text,
  TextVariant,
  Panel,
  type MenuItem,
} from "@xprite/ui";

import flowStyles from "$/components/shared/tool-flow.module.css";
import styles from "$/components/shared/tool-frame.module.css";

const EXPORT_SHEET_BOUNDS = { x: 0, y: 0, width: 320, height: 120 };

/**
 * Upload → default result → optional adjust → export. A tool that provides `flow` gets the
 * shared adjust slot, the pinned Export button and the export sheet; others keep their layout.
 */
export interface FileToolFlow {
  /** Parameters shown in the floating palette (desktop) or bottom drawer (phone). */
  adjust: ReactNode;
  /** Format choices inside the export sheet. Call `close` once a download starts. */
  exportSheet(close: () => void): ReactNode;
  /** True until the tool has a result to export. */
  exportDisabled: boolean;
}

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
  flow,
}: {
  tool: PublicTool;
  filename: string;
  ready: boolean;
  processing?: boolean;
  busy: boolean;
  error: string | null;
  fileItems?: readonly MenuItem[];
  help?: ReactNode;
  flow?: FileToolFlow;
  children?: ReactNode;
  onOpen(file: File): Promise<void>;
  onExample(): Promise<void>;
}) {
  const t = useToolTranslation();

  const files = useFilesManager();
  const filesText = useFilesText();
  const [fromFiles, setFromFiles] = useState(false);
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
  const [exportOpen, setExportOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const exportDisabled = !flow || !ready || busy || processing || flow.exportDisabled;
  const exportRef = useRef(exportDisabled);
  exportRef.current = exportDisabled;
  useEffect(() => {
    if (!flow) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "e"
      )
        return;
      event.preventDefault();
      if (!exportRef.current) setExportOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [!!flow]);
  useEffect(() => {
    if (exportDisabled) setExportOpen(false);
  }, [exportDisabled]);
  return (
    <ToolFrame
      tool={tool}
      processing={processing}
      help={help}
      actionBar={
        flow
          ? {
              cue: flowCue(t, { ready, processing: processing || busy }),
              detail: ready ? filename : undefined,
              exportDisabled,
              onExport: () => setExportOpen(true),
              adjust: {
                open: drawerOpen && ready,
                disabled: !ready,
                onToggle: () => setDrawerOpen((open) => !open),
              },
            }
          : undefined
      }
      filename={ready ? filename : undefined}
      menus={[
        {
          label: t("File"),
          items: [
            { label: `${tool.openLabel}…`, disabled: busy, onSelect: chooseFile },
            { label: t("Open example"), disabled: busy, onSelect: () => void onExample() },
            ...(flow
              ? [
                  {
                    label: t("Export…"),
                    shortcut: mac ? "Cmd+E" : "Ctrl+E",
                    separator: true,
                    disabled: exportDisabled,
                    onSelect: () => setExportOpen(true),
                  },
                ]
              : []),
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
          data-flow={flow ? (ready ? "ready" : "empty") : undefined}
          data-drawer={flow && drawerOpen && ready ? "open" : undefined}
          onDragEnter={(event) => {
            if (carriesFiles(event)) {
              setFromFiles(event.dataTransfer.types.includes(FILES_DRAG_TYPE));
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
            {!ready && flow && (
              <ToolFlowEmptyStage
                tool={tool}
                busy={busy}
                onChooseFile={chooseFile}
                onExample={onExample}
              />
            )}
            {!ready && !flow && (
              <FileToolEmptyState
                tool={tool}
                busy={busy}
                onChooseFile={chooseFile}
                onExample={onExample}
              />
            )}
            {children}
          </div>
          {flow && (
            <ToolAdjustSlot ready={ready} drawerOpen={drawerOpen}>
              {flow.adjust}
            </ToolAdjustSlot>
          )}
          {dragging && (
            <div className={styles.dropOverlay}>
              <Text variant={TextVariant.Reading}>
                {fromFiles ? filesText("files.drop.load") : t("Drop to open")}
              </Text>
            </div>
          )}
        </section>
        {flow && exportOpen && (
          <Dialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            title={t("Export")}
            portal
            centerOnOpen
            defaultBounds={EXPORT_SHEET_BOUNDS}
            resizable={false}
            contentLayout={OverlayContentLayout.Flow}
          >
            <div className={flowStyles.exportSheet} data-tool-export-sheet="">
              <Text variant={TextVariant.Reading} wrap>
                {t("Choose an export format")}
              </Text>
              {flow.exportSheet(() => setExportOpen(false))}
            </div>
          </Dialog>
        )}
      </main>
    </ToolFrame>
  );
}
