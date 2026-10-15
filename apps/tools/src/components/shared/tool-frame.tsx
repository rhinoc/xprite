import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { useFilesManager, useFilesSnapshot, useFilesText } from "$/components/files/files-context";
import { FilesWindow } from "$/components/files/files-window";
import { FilesEntryPoint } from "$/managers/files/files-manager";
import { decodeFilesDrag, FILES_DRAG_TYPE, FilesFolder } from "$/managers/files/files-model";
import { useToolLanguage } from "$/managers/locale/tool-language";
import type { PublicTool } from "$/managers/tools/tool-catalog";
import { FEATURES_PATH } from "@xprite/growth-content/features";
import {
  localizedSiteHref,
  pickText,
  PUBLIC_LANGUAGE_LABELS,
  PUBLIC_LANGUAGES,
} from "@xprite/growth-content/language";
import { siteApplications, siteFooterGroups } from "@xprite/growth-content/navigation";
import { SiteFooter, SiteMenubar } from "@xprite/site-shell";
import {
  ButtonVariant,
  Button,
  Icon,
  IconKind,
  type MenubarMenu,
  WindowWorkspace,
  PatternId,
  ScrollArea,
  ScrollAreaTarget,
  ScrollbarRendering,
  useUi,
  IconSize,
} from "@xprite/ui";

import styles from "$/components/shared/tool-frame.module.css";

export function ToolFrame({
  tool,
  filename,
  processing = false,
  menus = [],
  children,
  help,
}: {
  tool: PublicTool;
  filename?: string;
  processing?: boolean;
  menus?: readonly MenubarMenu[];
  children: ReactNode;
  help?: ReactNode;
}) {
  const { language, setLanguage, translate: t } = useToolLanguage();
  const guidePath = "guidePath" in tool ? tool.guidePath : undefined;
  const toolPath: string = tool.path;
  const samePageGuide =
    typeof guidePath === "string" &&
    (guidePath.startsWith("#") || guidePath === toolPath || guidePath.startsWith(`${toolPath}#`));
  const helpHref =
    help && typeof guidePath === "string" && !samePageGuide
      ? localizedSiteHref(guidePath, language)
      : undefined;

  const files = useFilesManager();
  const filesState = useFilesSnapshot(files);
  const filesText = useFilesText();
  const [mounted, setMounted] = useState(false);
  const [trashTarget, setTrashTarget] = useState(false);
  useEffect(() => setMounted(true), []);
  const trashFull = (filesState?.entries ?? []).some((entry) => entry.trashedAt);
  const filesItem = {
    label: filesText("files.open.window"),
    separator: true,
    disabled: !files,
    onSelect: () => void files?.openWindow(FilesEntryPoint.Menubar),
  };
  const [firstMenu, ...otherMenus] = menus;
  const frameMenus: MenubarMenu[] = firstMenu
    ? [{ ...firstMenu, items: [...firstMenu.items, filesItem] }, ...otherMenus]
    : [{ label: t("File"), items: [{ ...filesItem, separator: false }] }];

  const { colorScheme } = useUi();
  const variables = {
    colorScheme,
    "--tool-empty-paper": "var(--ui-color-desktop)",
    "--tool-empty-card": "var(--ui-color-paper)",
    "--tool-empty-ink": "var(--ui-color-ink)",
    "--tool-empty-muted": "var(--ui-color-ink)",

    "--tool-empty-accent": "var(--ui-color-ink)",
    "--tool-empty-line": "var(--ui-color-line)",
    "--tool-canvas": "var(--ui-color-canvas)",
    "--tool-link": "var(--ui-color-link)",
  } as CSSProperties;
  return (
    <ScrollArea
      target={ScrollAreaTarget.Page}
      scrollbarRendering={ScrollbarRendering.Browser}
      reserveScrollbarGutter
      className={`${styles.page} xse-global`}
      style={variables}
      aria-label={t("Page scroll")}
    >
      <div
        className={styles.shell}
        data-tool-state={filename ? (processing ? "processing" : "ready") : "empty"}
      >
        <div className={styles.screen}>
          <header className={styles.header}>
            <SiteMenubar
              label={t("Tool navigation")}
              applicationName={t(tool.label)}
              applications={siteApplications(tool.path, language, helpHref)}
              menus={frameMenus}
              help={
                helpHref
                  ? {
                      href: helpHref,
                      label: t("Read Me"),
                      tooltip: [t(tool.summary), t(tool.privacy)].join("\n"),
                    }
                  : undefined
              }
              language={language}
              languages={PUBLIC_LANGUAGES.map((value) => ({
                value,
                label: PUBLIC_LANGUAGE_LABELS[value],
                onSelect: () => setLanguage(value),
              }))}
            />
          </header>
          <WindowWorkspace
            data-ui-desktop-pattern={PatternId.MacOS8CoplandBlue}
            className={styles.desktop}
          >
            <div className={styles.content} data-ui-desktop-layer>
              {children}
            </div>

            <aside className={styles.utilities} data-ui-desktop-layer>
              <nav className={styles.shortcuts} aria-label={t("Desktop shortcuts")}>
                <Button
                  variant={ButtonVariant.Tile}
                  className={styles.filesShortcut}
                  slots={{ leading: <Icon kind={IconKind.Folder} size={IconSize.Large} /> }}
                  text={filesText("files.title")}
                  aria-haspopup="dialog"
                  onClick={() => void files?.openWindow(FilesEntryPoint.DesktopIcon)}
                />
                <Button
                  variant={ButtonVariant.Tile}
                  slots={{
                    leading: <Icon kind={IconKind.ApplicationsFolder} size={IconSize.Large} />,
                  }}
                  text={filesText("files.applications")}
                  href={localizedSiteHref(FEATURES_PATH, language)}
                />
                {helpHref && (
                  <Button
                    variant={ButtonVariant.Tile}
                    slots={{ leading: <Icon kind={IconKind.Document} size={IconSize.Large} /> }}
                    text={t("Read Me")}
                    href={helpHref}
                  />
                )}
                <Button
                  variant={ButtonVariant.Tile}
                  className={styles.filesShortcut}
                  data-drop-target={trashTarget || undefined}
                  slots={{
                    leading: (
                      <Icon
                        kind={trashFull ? IconKind.TrashFull : IconKind.Trash}
                        size={IconSize.Large}
                      />
                    ),
                  }}
                  text={filesText("files.trash")}
                  aria-haspopup="dialog"
                  onClick={() => void files?.openWindow(FilesEntryPoint.Trash, FilesFolder.Trash)}
                  onDragOver={(event) => {
                    if (!files || !event.dataTransfer.types.includes(FILES_DRAG_TYPE)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setTrashTarget(true);
                  }}
                  onDragLeave={() => setTrashTarget(false)}
                  onDrop={(event) => {
                    setTrashTarget(false);
                    const ids = decodeFilesDrag(event.dataTransfer.getData(FILES_DRAG_TYPE));
                    if (!files || !ids.length) return;
                    event.preventDefault();
                    void files.trash(ids);
                  }}
                />
              </nav>
              {help && <div className={styles.helpFrame}>{help}</div>}
            </aside>
            {mounted && <FilesWindow />}
          </WindowWorkspace>
        </div>
        <SiteFooter
          groups={siteFooterGroups(language, helpHref)}
          label={pickText(
            language,
            "Website navigation",
            "网站导航",
            "サイトナビゲーション",
            "사이트 탐색",
            "Навигация по сайту",
            "Navegação do site",
            "Navegación del sitio",
          )}
        />
      </div>
    </ScrollArea>
  );
}
