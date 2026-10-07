import type { CSSProperties, ReactNode } from "react";

import { TOOLS_HOME, type PublicTool } from "$/managers/tools/tool-catalog";
import { siteApplications } from "@xprite/growth-content/navigation";
import { SiteMenubar } from "@xprite/site-shell";
import {
  RichText,
  ButtonVariant,
  Button,
  Icon,
  IconKind,
  type MenubarMenu,
  WindowWorkspace,
  PatternVariant,
  PageScrollArea,
  PageScrollbarMode,
  Note,
  NoteVariant,
  NoteDismissBehavior,
  NoteColor,
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
  readme,
}: {
  tool?: PublicTool;
  filename?: string;
  menus?: readonly MenubarMenu[];
  children: ReactNode;
  reserveGutter?: boolean;
  readme?: ReactNode;
}) {
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
      aria-label="Page scroll"
    >
      <div
        className={styles.shell}
        data-tool-state={tool ? (filename ? "ready" : "empty") : "directory"}
      >
        <header className={styles.header}>
          <SiteMenubar
            label="Tool navigation"
            applicationName={tool?.label ?? "Tools"}

            applications={siteApplications(
              tool?.path ?? TOOLS_HOME.path,
              "en",
              import.meta.env.DEV,
            )}
            menus={menus}
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
            {!filename && (
              <>
                <Note
                  variant={NoteVariant.Window}
                  dismissBehavior={NoteDismissBehavior.Collapse}
                  color={NoteColor.Yellow}
                  aria-label="Read Me"
                  title="Read Me"
                  defaultCollapsed={false}
                  className={styles.readmeWindow}
                  data-ui-window-active="false"
                >
                  <RichText>
                    {readme ?? (
                      <>
                        <p>
                          <strong>{tool?.label ?? TOOLS_HOME.name}</strong>
                        </p>
                        <p>
                          {tool?.summary ?? "Open an application from the Applications folder."}
                        </p>
                      </>
                    )}
                    <p>{tool?.privacy ?? "Files stay on your device. No cloud upload."}</p>
                  </RichText>
                </Note>
              </>
            )}
            <nav className={styles.shortcuts} aria-label="Desktop shortcuts">
              <Button
                variant={ButtonVariant.Tile}
                slots={{ leading: <Icon kind={IconKind.Folder} size={IconSize.Large} /> }}
                text="Applications"
                href="/tools/"
              />
              <Button
                variant={ButtonVariant.Tile}
                slots={{ leading: <Icon kind={IconKind.Document} size={IconSize.Large} /> }}
                text="User guide"

                href={tool?.guidePath ?? "/help/en/"}
              />
            </nav>
          </aside>
        </WindowWorkspace>
      </div>
    </PageScrollArea>
  );
}
