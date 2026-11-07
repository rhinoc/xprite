import { HomeView as PrimitiveHomeView } from "$/components/workspace/home-view-base";
import type {
  HomeViewProps as PrimitiveHomeViewProps,
  RecentFile,
} from "$/components/workspace/home-view-base";
import { getEditorHomeAbout } from "$/components/workspace/home-view/about";
import { homeNews } from "$/components/workspace/home-view/news";
import { tUi, useUiLanguage } from "$/i18n";
import homeIconFrame1 from "$assets/home/icon-frame-1.webp";
import homeIconFrame2 from "$assets/home/icon-frame-2.webp";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Render "today", "yesterday", "N days ago", "N weeks ago", or ISO date beyond that. */
function relativeNewsDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) return tUi("ui.home.news.today");
  if (days === 1) return tUi("ui.home.news.yesterday");
  if (days < 7) return tUi("ui.home.news.days.ago", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return tUi("ui.home.news.weeks.ago", { count: weeks });
  return iso;
}

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
  const language = useUiLanguage();
  const news = homeNews(language).map((entry) => ({
    slug: entry.slug,
    date: relativeNewsDate(entry.date),
    title: entry.title,
    hook: entry.hook,
    image: entry.image,
  }));
  return (
    <PrimitiveHomeView
      {...props}
      news={news}
      labels={
        {
          home: tUi("ui.home"),
          recentFiles: tUi("ui.recent.files"),
          recentFilesHeading: tUi("ui.recent.files.label"),
          newsHeading: tUi("ui.home.news"),
          newFile: tUi("ui.new.file.ellipsis"),
          openFile: tUi("ui.open.file.ellipsis"),
          recoverFiles: tUi("ui.recover.files.ellipsis"),
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
