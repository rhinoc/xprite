import type { CSSProperties, ReactNode } from "react";

import { useToolLanguage } from "$/managers/locale/tool-language";
import { TOOLS_HOME, type PublicTool } from "$/managers/tools/tool-catalog";
import { localizedSiteHref, PublicLanguage } from "@xprite/growth-content/language";
import { siteApplications, siteFooterGroups } from "@xprite/growth-content/navigation";
import { SiteFooter, SiteMenubar } from "@xprite/site-shell";
import {
  ButtonAppearance,
  ButtonVariant,
  Button,
  Icon,
  IconKind,
  type MenubarMenu,
  WindowWorkspace,
  PatternVariant,
  PageScrollArea,
  PageScrollbarMode,
  Tooltip,
  useUi,
  IconSize,
} from "@xprite/ui";

import styles from "$/components/shared/tool-frame.module.css";

export function ToolFrame({
  tool,
  filename,
  menus = [],
  children,
  reserveGutter = true,
}: {
  tool?: PublicTool;
  filename?: string;
  menus?: readonly MenubarMenu[];
  children: ReactNode;
  reserveGutter?: boolean;
}) {
  const { language, setLanguage, translate: t } = useToolLanguage();

  const { appearance } = useUi();
  const variables = {
    colorScheme: appearance,
    "--tool-page-gutter": "0px",
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
    <PageScrollArea
      reserveGutter={reserveGutter}
      scrollbarMode={PageScrollbarMode.Native}
      className={`${styles.page} xse-global`}
      style={variables}
      aria-label={t("Page scroll")}
    >
      <div
        className={styles.shell}
        data-tool-state={tool ? (filename ? "ready" : "empty") : "directory"}
      >
        <header className={styles.header}>
          <SiteMenubar
            label={t("Tool navigation")}
            applicationName={t(tool?.label ?? "Tools")}

            applications={siteApplications(
              tool?.path ?? TOOLS_HOME.path,
              language,
              import.meta.env.DEV,
            )}
            menus={menus}
            leadingContent={
              <Tooltip
                text={[
                  t(tool?.summary ?? "Open an application from the Applications folder."),
                  t(tool?.privacy ?? "Files stay on your device. No cloud upload."),
                ].join("\n")}
                placement="top-left"
              >
                <Button
                  href={localizedSiteHref(tool?.guidePath ?? "/help/", language)}
                  appearance={ButtonAppearance.Quiet}
                  slots={{ leading: <Icon kind={IconKind.Help} size={IconSize.Small} /> }}
                  aria-label={t("Read Me")}
                  role="menuitem"
                />
              </Tooltip>
            }
            language={language}
            languages={[
              {
                value: PublicLanguage.English,
                label: "English",
                onSelect: () => setLanguage(PublicLanguage.English),
              },
              {
                value: PublicLanguage.SimplifiedChinese,
                label: "简体中文",
                onSelect: () => setLanguage(PublicLanguage.SimplifiedChinese),
              },
            ]}
          />
        </header>
        <WindowWorkspace
          data-ui-desktop-pattern={PatternVariant.MacOS8CoplandBlue}
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
                text={t("Applications")}
                href={localizedSiteHref("/tools/", language)}
              />
              <Button
                variant={ButtonVariant.Tile}
                slots={{ leading: <Icon kind={IconKind.Document} size={IconSize.Large} /> }}
                text={t("User guide")}

                href={localizedSiteHref(tool?.guidePath ?? "/help/", language)}
              />
            </nav>
          </aside>
        </WindowWorkspace>
        <SiteFooter
          groups={siteFooterGroups(language)}
          label={language === PublicLanguage.SimplifiedChinese ? "网站导航" : "Website navigation"}
        />
      </div>
    </PageScrollArea>
  );
}
