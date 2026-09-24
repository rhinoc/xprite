import { useSyncExternalStore } from "react";

import { useWorkspaceLayoutConfiguration } from "$/components/shared/editor-layout-context";
import { BackupIndicator } from "$/components/shell/backup-indicator";
import { FunctionalStatusText } from "$/components/shell/live-status";
import type { HomeViewFooterSegment } from "$/components/workspace/home-view-base";
import { stepAsepriteZoom } from "$/managers/canvas/canvas-manager";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import { useEditorDocumentView } from "$/managers/shell/editor-document-view";
import { parseEditorColor } from "$/managers/tools/color-control";
import { Button, Input, Label, ScrollArea, Text, TextVariant, useUi } from "@xprite/ui";
import { UiIcon } from "@xprite/ui/assets";

import styles from "$/components/shell/status-bar/status-bar.module.css";

type Editor = ReturnType<typeof useEditor>;

export function StatusBar({
  editor,
  filename,
  directory,
  dimensions,
  backupActive = false,
  about,
}: {
  editor: Editor;
  filename: string;
  directory: string;
  dimensions: string;
  backupActive?: boolean;
  about?: {
    attribution: readonly HomeViewFooterSegment[];
    profile: string;
    profileHref: string;
  };
}) {
  const { style: uiStyle } = useUi();
  const workspaceLayoutConfiguration = useWorkspaceLayoutConfiguration();
  const showDocumentName = workspaceLayoutConfiguration.chrome.showDocumentNameInStatus;
  const documentView = useEditorDocumentView();
  const hasDocument = !!documentView.document;
  const firstFrame = editor.timelinePanelPreferences?.firstFrame ?? 1;
  const hover = useSyncExternalStore(
    editor.colorHover.subscribe,
    editor.colorHover.getSnapshot,
    editor.colorHover.getSnapshot,
  );
  const buttonHoverColor = hover ? parseEditorColor(hover.hex) : null;
  const notice =
    !showDocumentName && filename
      ? editor.notice.replaceAll(filename, "").replace(/\s+/g, " ").trim()
      : editor.notice;
  return (
    <ScrollArea
      className="xse-status"
      contentClassName={styles.row}
      scrollY={false}
      data-about={about ? "true" : undefined}
      style={{ background: uiStyle.colors.status_bar_face, color: uiStyle.colors.status_bar_text }}
      onWheel={(event) => {
        if (about && event.deltaX !== 0) {
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
      }}
    >
      <div className="xse-status-indicators">
        {about ? (
          <div className={styles.about}>
            {about.attribution.map((segment, index) => {
              const label = (
                <Text variant={TextVariant.Inline} scale={2} ink={uiStyle.colors.status_bar_text}>
                  {segment.text}
                </Text>
              );
              const key = `${segment.text}-${index}`;
              return segment.href ? (
                <a
                  key={key}
                  className={styles.aboutLink}
                  href={segment.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={segment.text}
                >
                  {label}
                </a>
              ) : (
                <span key={key}>{label}</span>
              );
            })}
            <a
              className={styles.aboutLink}
              href={about.profileHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={about.profile}
            >
              <Text variant={TextVariant.Inline} scale={2} ink={uiStyle.colors.workspace_link}>
                {about.profile}
              </Text>
            </a>
          </div>
        ) : editor.functional || buttonHoverColor ? (
          <FunctionalStatusText
            active={editor.functional}
            quickTool={editor.quickTool}
            notice={notice}
            buttonHoverColor={buttonHoverColor}
            buttonHoverDescription={hover?.description}
            relativeTo={{ x: 0, y: 0 }}
          />
        ) : (
          <Label
            text={
              notice ||
              (!showDocumentName
                ? `${dimensions} (${directory})`
                : `${filename}  ${dimensions} (${directory})`)
            }
            color={uiStyle.colors.status_bar_text}
          />
        )}
      </div>
      {!about && backupActive && <BackupIndicator active />}
      {!about && (!editor.functional || hasDocument) && (
        <div className="xse-status-actions">
          <span className={styles.frameIcon} aria-hidden="true">
            <UiIcon
              part="icon_frame"
              x={0}
              y={0}
              scale={2}
              color={uiStyle.colors.status_bar_text}
            />
          </span>
          <div className="xse-status-frame-controls">
            <Input
              size={4}
              mini
              pixelSize={{ width: 36, height: 12 }}
              value={String(editor.frame - 1 + firstFrame)}
              aria-label="Current frame"
              onMouseUp={(event) => event.currentTarget.select()}
              disabled={!hasDocument}
              onCommit={(value) =>
                editor.setFrame(
                  Math.max(
                    1,
                    Math.min(editor.frameCount, Math.trunc(Number(value)) - firstFrame + 1 || 1),
                  ),
                )
              }
            />
            <Button
              text="+"
              font="default"
              pixelSize={{ width: 11, height: 12 }}
              textOffset={{ x: 2, y: 1 }}
              aria-label="Add frame"
              disabled={!hasDocument || editor.frameCount >= 4096}
              onClick={editor.addFrame}
            />
          </div>
          <Input
            size={5}
            mini
            pixelSize={{ width: 41, height: 12 }}
            value={editor.zoom.toFixed(1)}
            suffix="%"
            aria-label="Zoom"
            onWheel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const direction = Math.sign(event.deltaX) - Math.sign(event.deltaY);
              if (direction) editor.setZoom(stepAsepriteZoom(editor.zoom, direction));
            }}
            onCommit={(value) =>
              editor.setZoom(Math.max(100 / 64, Math.min(6400, Number(value) || 100)))
            }
          />
        </div>
      )}
    </ScrollArea>
  );
}
