import type { CSSProperties, ReactNode } from "react";

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
              menus={menus}
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
                  slots={{ leading: <Icon kind={IconKind.Folder} size={IconSize.Large} /> }}
                  text={pickText(language, "Features", "功能", "機能", "기능")}
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
              </nav>
              {help && <div className={styles.helpFrame}>{help}</div>}
            </aside>
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
          )}
        />
      </div>
    </ScrollArea>
  );
}
