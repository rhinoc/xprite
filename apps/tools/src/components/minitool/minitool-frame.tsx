import type { CSSProperties } from "react";

import { ToolActionBarProvider } from "$/components/shared/tool-action-bar";
import type { ToolFrameProps } from "$/components/shared/tool-frame";
import { useToolLanguage } from "$/managers/locale/tool-language";
import { PUBLIC_LANGUAGE_LABELS, PUBLIC_LANGUAGES } from "@xprite/growth-content/language";
import menuIconUrl from "@xprite/site-assets/menu-icon.svg?url";
import { SiteMenubar } from "@xprite/site-shell";
import {
  PatternId,
  ScrollArea,
  ScrollAreaTarget,
  ScrollbarRendering,
  useUi,
  WindowWorkspace,
} from "@xprite/ui";

import minitool from "$/components/minitool/minitool-frame.module.css";
import styles from "$/components/shared/tool-frame.module.css";

/**
 * The tool's desktop inside the Xiaohongshu container: the menu bar keeps the tool's own menus,
 * appearance and language, with no website navigation, Files desktop, help or footer links.
 */
export function MiniToolFrame({
  tool,
  title,
  filename,
  processing = false,
  menus = [],
  children,
  actionBar,
}: ToolFrameProps) {
  const { language, setLanguage, translate: t } = useToolLanguage();
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
      className={`${styles.page} ${minitool.page} xse-global`}
      style={variables}
      aria-label={t("Page scroll")}
    >
      <div
        className={`${styles.shell} ${minitool.shell}`}
        data-tool-state={filename ? (processing ? "processing" : "ready") : "empty"}
      >
        <div className={`${styles.screen} ${minitool.screen}`}>
          <header className={styles.header}>
            <SiteMenubar
              label={t("Tool navigation")}
              applicationName={title ?? t(tool.label)}
              applications={[]}
              menus={menus}
              brandImage={menuIconUrl}
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
            className={`${styles.desktop} ${minitool.desktop}`}
          >
            <div className={styles.content} data-ui-desktop-layer>
              <ToolActionBarProvider value={actionBar}>{children}</ToolActionBarProvider>
            </div>
          </WindowWorkspace>
        </div>
      </div>
    </ScrollArea>
  );
}
