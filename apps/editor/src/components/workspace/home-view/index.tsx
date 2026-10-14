import { HomeView as PrimitiveHomeView } from "$/components/workspace/home-view-base";
import type {
  HomeViewProps as PrimitiveHomeViewProps,
  RecentFile,
} from "$/components/workspace/home-view-base";
import { getEditorHomeAbout } from "$/components/workspace/home-view/about";
import { tUi } from "$/i18n";
import homeIconFrame1 from "$assets/home/icon-frame-1.webp";
import homeIconFrame2 from "$assets/home/icon-frame-2.webp";

export interface EditorHomeViewProps {
  files: readonly RecentFile[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (id: string) => void;
  onAbout: () => void;
  onSupport?: () => void;
  onSettings?: () => void;
  onFeedback?: () => void;
  onRecover?: () => void;
  onPinRecent?: (id: string, pinned: boolean) => void;
  onDownloadRecent?: (id: string) => void;
  downloadRecentDisabled?: boolean;
  onDeleteBrowserCopy?: (id: string) => void;
  deleteBrowserCopyDisabled?: boolean;
}

/** Supplies editor localization, layout preference, and product artwork to the reusable view. */
export function EditorHomeView(props: EditorHomeViewProps) {
  const about = getEditorHomeAbout();
  return (
    <PrimitiveHomeView
      {...props}
      labels={
        {
          home: tUi("ui.home"),
          recentFiles: tUi("ui.recent.files"),
          recentFilesHeading: tUi("ui.recent.files.72d21e25"),
          newFile: tUi("ui.new.file.5e276e91"),
          openFile: tUi("ui.open.file.a6b5af39"),
          recoverFiles: tUi("ui.recover.files.6d880af2"),
          footerSegments: about.footerSegments,
          support: tUi("ui.home.support"),
          settings: tUi("ui.settings"),
          feedback: tUi("feedback.open"),
          about: tUi("ui.about"),
          recentFilesScroll: tUi("ui.recent.files.scroll"),
          pinFile: (name) => tUi("ui.action.name", { action: tUi("ui.pin"), name }),
          downloadFile: (name) => tUi("ui.action.name", { action: tUi("ui.download"), name }),
          unpinFile: (name) => tUi("ui.action.name", { action: tUi("ui.unpin"), name }),
          deleteBrowserCopy: (name) => tUi("ui.home.delete.browser.copy.name", { name }),
          closeBeforeDelete: tUi("ui.home.delete.browser.copy.close.first"),
        } satisfies PrimitiveHomeViewProps["labels"]
      }
      mascot={(hovered) => (
        <img
          src={hovered ? homeIconFrame2 : homeIconFrame1}
          alt=""
          width={64}
          height={64}
          draggable={false}
        />
      )}
    />
  );
}
