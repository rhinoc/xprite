import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useWorkspaceLayoutConfiguration } from "$/components/shared/editor-layout-context";
import { PixelArtIcon } from "$/components/shared/pixel-art-icon";
import {
  HomeIdentity,
  type HomeIdentityLabels,
} from "$/components/workspace/home-view-base/home-identity";
import { WorkspaceLink, WorkspaceLinkVariant } from "$/components/workspace/workspace-link";
import { Button, ButtonVariant, ScrollArea, Text, TextVariant, Tooltip, useUi } from "@xprite/ui";
import { measureUiText, UiIcon, UiPart } from "@xprite/ui/assets";
import { UI_SCALE_X, UI_SCALE_Y } from "@xprite/ui/canvas";
import { layoutSize, observeResize } from "@xprite/ui/utils";

import styles from "$/components/workspace/home-view-base/home-view-base.module.css";

const HOME_MASCOT_WIDTH = 64;
const HOME_MASCOT_HEIGHT = 74;
const HOME_HEADER_TOP_PADDING = 8;
const HOME_HEADER_GAP = 8;
const HOME_RECENT_SECTION_GAP = 16;
const HOME_ACTIONS_HEIGHT = 58;
const HOME_ACTIONS_WIDTH = 124;
const HOME_FOOTER_HEIGHT = 30;
const HOME_FOOTER_RESERVE = 15;
const HOME_FILE_ACTION_BUTTON_SIZE = 11;
const HOME_FILE_ACTION_ICON_SIZE = 16;
const HOME_FOOTER_SEPARATOR = "·";

export interface RecentFile {
  id: string;
  name: string;
  detail?: string;
  pinned?: boolean;
  isOpen?: boolean;
}

export interface HomeViewFooterSegment {
  text: string;
  href?: string;
  separator?: boolean;
}

interface HomeViewLabels extends HomeIdentityLabels {
  home: string;
  about: string;
  recentFiles: string;
  recentFilesHeading: string;
  newFile: string;
  openFile: string;
  recoverFiles: string;
  footerSegments: readonly HomeViewFooterSegment[];
  recentFilesScroll: string;
  pinFile: (name: string) => string;
  downloadFile: (name: string) => string;
  unpinFile: (name: string) => string;
  deleteBrowserCopy: (name: string) => string;
  closeBeforeDelete: string;
}

export interface HomeViewProps {
  files: readonly RecentFile[];
  labels: HomeViewLabels;
  mascot?: (hovered: boolean) => ReactNode;
  repositoryHref: string;
  onFeedback?: () => void;
  onAbout: () => void;
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (id: string) => void;
  onRecover?: () => void;
  onPinRecent?: (id: string, pinned: boolean) => void;
  onDownloadRecent?: (id: string) => void;
  downloadRecentDisabled?: boolean;
  onDeleteBrowserCopy?: (id: string) => void;
  deleteBrowserCopyDisabled?: boolean;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Home content uses normal layout flow; only themed artwork sits over its parent panel. */
export function HomeView({
  files,
  labels,
  mascot,
  repositoryHref,
  onFeedback,
  onAbout,
  onNew,
  onOpen,
  onOpenRecent,
  onRecover,
  onPinRecent,
  onDownloadRecent,
  downloadRecentDisabled,
  onDeleteBrowserCopy,
  deleteBrowserCopyDisabled,
}: HomeViewProps) {
  const host = useRef<HTMLElement>(null);
  const { style } = useUi();
  const workspaceLayoutConfiguration = useWorkspaceLayoutConfiguration();
  const homeConfiguration = workspaceLayoutConfiguration.home;
  const [size, setSize] = useState({ width: 2, height: 2 });
  const [mascotHovered, setMascotHovered] = useState(false);
  const [hotFile, setHotFile] = useState<string | null>(null);

  useClientLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => {
      const width = Math.max(2, Math.floor(layoutSize(node).width / UI_SCALE_X));
      const height = Math.max(2, Math.floor(layoutSize(node).height / UI_SCALE_Y));
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    const observer = observeResize([node], measure);

    return () => observer();
  }, []);

  const viewport = {
    sceneWidth: size.width,
    sceneHeight: size.height,
    width: size.width * UI_SCALE_X,
    height: size.height * UI_SCALE_Y,
  };
  const availableHomeHeight = size.height / 2 - HOME_FOOTER_RESERVE;
  const headerVisible = availableHomeHeight > homeConfiguration.headerVisibleThreshold;
  const recentSectionOffset = HOME_RECENT_SECTION_GAP * UI_SCALE_Y;
  const rowHeight = homeConfiguration.fileRowHeight * UI_SCALE_Y;
  const actionHeight = homeConfiguration.actionButtonHeight * UI_SCALE_Y;
  const showRecentScrollbar =
    homeConfiguration.showScrollbar || homeConfiguration.contentHeight === "rows";
  const colors = style.colors;
  const homeStyle = {
    "--ui-home-workspace": colors.workspace,
    "--ui-home-workspace-text": colors.workspace_text,
    "--ui-home-text": `color-mix(in srgb, ${colors.workspace_text} 65%, ${colors.text})`,
    "--ui-home-focus-ring": colors.focus ?? colors.text,
    "--xse-home-row-height": `${rowHeight}px`,
    "--xse-home-action-height": `${actionHeight}px`,
    "--xse-home-actions-height": `${HOME_ACTIONS_HEIGHT * UI_SCALE_Y}px`,
    "--xse-home-actions-width": `${HOME_ACTIONS_WIDTH * UI_SCALE_X}px`,
    "--xse-home-mascot-width": `${HOME_MASCOT_WIDTH * UI_SCALE_X}px`,
    "--xse-home-mascot-height": `${HOME_MASCOT_HEIGHT * UI_SCALE_Y}px`,
    "--xse-home-header-top-padding": `${HOME_HEADER_TOP_PADDING * UI_SCALE_Y}px`,
    "--xse-home-header-gap": `${HOME_HEADER_GAP * UI_SCALE_X}px`,
  } as CSSProperties;

  return (
    <section ref={host} className={styles.root} aria-label={labels.home} style={homeStyle}>
      {headerVisible && (
        <header className={styles.header}>
          <Tooltip text={labels.about}>
            <Button
              className={styles.mascot}
              variant={ButtonVariant.FlatIcon}
              pixelSize={{ width: HOME_MASCOT_WIDTH / 2, height: HOME_MASCOT_HEIGHT / 2 }}
              paintArtwork={false}
              aria-label={labels.about}
              onClick={onAbout}
              onPointerEnter={() => setMascotHovered(true)}
              onPointerLeave={() => setMascotHovered(false)}
              onFocus={() => setMascotHovered(true)}
              onBlur={() => setMascotHovered(false)}
            >
              {mascot?.(mascotHovered)}
            </Button>
          </Tooltip>
          <nav className={styles.actions} aria-label={labels.home}>
            <WorkspaceLink
              layout="flow"
              className={styles.action}
              bounds={{
                x: 0,
                y: 0,
                width: HOME_ACTIONS_WIDTH,
                height: homeConfiguration.actionButtonHeight,
              }}
              style={{ flex: "0 0 auto", height: actionHeight, width: "100%" }}
              variant={WorkspaceLinkVariant.Workspace}
              onClick={onNew}
            >
              {labels.newFile}
            </WorkspaceLink>
            <WorkspaceLink
              layout="flow"
              className={styles.action}
              bounds={{
                x: 0,
                y: 0,
                width: HOME_ACTIONS_WIDTH,
                height: homeConfiguration.actionButtonHeight,
              }}
              style={{ flex: "0 0 auto", height: actionHeight, width: "100%" }}
              variant={WorkspaceLinkVariant.Workspace}
              onClick={onOpen}
            >
              {labels.openFile}
            </WorkspaceLink>
            <WorkspaceLink
              layout="flow"
              className={styles.action}
              bounds={{
                x: 0,
                y: 0,
                width: HOME_ACTIONS_WIDTH,
                height: homeConfiguration.actionButtonHeight,
              }}
              style={{ flex: "0 0 auto", height: actionHeight, width: "100%" }}
              variant={WorkspaceLinkVariant.Workspace}
              onClick={onRecover}
              disabled={!onRecover}
            >
              {labels.recoverFiles}
            </WorkspaceLink>
          </nav>
          <HomeIdentity labels={labels} onFeedback={onFeedback} repositoryHref={repositoryHref} />
        </header>
      )}

      <section
        className={styles.recentSection}
        aria-label={labels.recentFiles}
        style={{ marginTop: recentSectionOffset }}
      >
        <h2 className={styles.recentHeading}>
          <span className={styles.visuallyHidden}>{labels.recentFilesHeading}</span>
          <Text variant={TextVariant.Inline} scale={2} ink={colors.workspace_text}>
            {labels.recentFilesHeading}
          </Text>
        </h2>

        <div className={styles.filesView}>
          <div className={styles.filesFill} style={{ background: colors.background }} />
          <ScrollArea
            className={styles.filesScrollArea}
            scrollX={false}
            scrollY={showRecentScrollbar}
            viewport={viewport}
            viewportProps={{ role: "group", "aria-label": labels.recentFiles }}
            contentClassName={styles.fileScrollContent}
          >
            {files.map((file) => {
              const highlighted = hotFile === file.id;
              return (
                <div
                  key={file.id}
                  className={styles.fileRow}
                  data-highlighted={highlighted}
                  style={{
                    background: highlighted ? colors.menuitem_hot_face : colors.background,
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setHotFile(file.id);
                  }}
                  onPointerLeave={() => setHotFile(null)}
                  onFocus={(event) => {
                    if (event.target.matches(":focus-visible")) setHotFile(file.id);
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setHotFile(null);
                  }}
                >
                  <WorkspaceLink
                    layout="flow"
                    className={styles.recentLink}
                    bounds={{ x: 0, y: 0, width: 1, height: homeConfiguration.fileRowHeight }}
                    style={{ flex: "1 1 auto", width: "100%", height: rowHeight }}
                    variant={WorkspaceLinkVariant.Recent}
                    onClick={() => onOpenRecent(file.id)}
                    highlighted={highlighted}
                  >
                    {file.name}
                  </WorkspaceLink>
                  {onDownloadRecent && (
                    <Button
                      variant={ButtonVariant.FlatIcon}
                      className={`${styles.fileAction} ${styles.downloadAction}`}
                      paintArtwork={false}
                      style={{ color: downloadRecentDisabled ? colors.disabled : colors.text }}
                      pixelSize={{
                        width: HOME_FILE_ACTION_BUTTON_SIZE,
                        height: HOME_FILE_ACTION_BUTTON_SIZE,
                      }}
                      aria-label={labels.downloadFile(file.name)}
                      title={labels.downloadFile(file.name)}
                      disabled={downloadRecentDisabled}
                      onClick={() => onDownloadRecent(file.id)}
                    >
                      <PixelArtIcon name="download" size={HOME_FILE_ACTION_ICON_SIZE} />
                    </Button>
                  )}
                  {(file.pinned || onPinRecent) && (
                    <button
                      type="button"
                      className={styles.pin}
                      data-pinned={!!file.pinned}
                      aria-label={
                        file.pinned ? labels.unpinFile(file.name) : labels.pinFile(file.name)
                      }
                      disabled={!onPinRecent}
                      onClick={() => onPinRecent?.(file.id, !file.pinned)}
                    >
                      <UiIcon
                        part={file.pinned ? "pinned" : "unpinned"}
                        scale={2}
                        color={colors.text}
                        style={{ left: 0, top: 2, pointerEvents: "none" }}
                      />
                    </button>
                  )}
                  {onDeleteBrowserCopy && (
                    <Button
                      variant={ButtonVariant.FlatIcon}
                      className={styles.fileAction}
                      icon="tab_close_icon_normal"
                      paintArtwork={false}
                      pixelSize={{
                        width: HOME_FILE_ACTION_BUTTON_SIZE,
                        height: HOME_FILE_ACTION_BUTTON_SIZE,
                      }}
                      aria-label={labels.deleteBrowserCopy(file.name)}
                      title={
                        file.isOpen ? labels.closeBeforeDelete : labels.deleteBrowserCopy(file.name)
                      }
                      disabled={deleteBrowserCopyDisabled || file.isOpen}
                      onClick={() => onDeleteBrowserCopy(file.id)}
                    >
                      <UiIcon
                        part="tab_close_icon_normal"
                        scale={2}
                        color={colors.text}
                        style={{ position: "relative", pointerEvents: "none" }}
                      />
                    </Button>
                  )}
                </div>
              );
            })}
          </ScrollArea>
          <UiPart
            part="editor_normal"
            scale={2}
            drawCenter={false}
            className={styles.filesFrame}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          {labels.footerSegments.map((segment, index) => {
            const segmentWidth = measureUiText(segment.text) * UI_SCALE_X;
            return (
              <div key={`${segment.text}-${index}`} className={styles.footerSegment}>
                {index > 0 && segment.separator !== false && (
                  <Text variant={TextVariant.Inline} scale={2} ink="var(--ui-home-text)">
                    {HOME_FOOTER_SEPARATOR}
                  </Text>
                )}
                {segment.href ? (
                  <WorkspaceLink
                    layout="flow"
                    className={styles.footerLink}
                    bounds={{ x: 0, y: 0, width: segmentWidth, height: HOME_FOOTER_HEIGHT }}
                    style={{ width: segmentWidth }}
                    variant={WorkspaceLinkVariant.Workspace}
                    href={segment.href}
                    color="var(--ui-home-text)"
                  >
                    {segment.text}
                  </WorkspaceLink>
                ) : (
                  <span className={styles.footerText}>
                    <Text variant={TextVariant.Inline} scale={2} ink="var(--ui-home-text)">
                      {segment.text}
                    </Text>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </footer>
    </section>
  );
}
