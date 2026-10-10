import { GUIDE_PAGES } from "$content/help/pages";
import { SHOWCASE_PAGES } from "$content/showcase/pages";
import { PublicLanguage, localizedSiteHref } from "$content/site/language";

import { PublicIcon } from "$/components/public/static-ui";
import {
  Button,
  ContentPadding,
  Icon,
  IconKind,
  IconSize,
  Panel,
  PanelVariant,
  PanelWindowChrome,
  SurfaceTone,
  Text,
  TextRole,
  TextTone,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/public/not-found.module.css";

export function PublicNotFound({ language }: { language: PublicLanguage }) {
  const text = (en: string, zh: string) =>
    language === PublicLanguage.SimplifiedChinese ? zh : en;
  return (
    <main className={styles.desktop}>
      <Panel
        className={styles.window}
        variant={PanelVariant.Window}
        windowChrome={PanelWindowChrome.Emphasized}
        tone={SurfaceTone.Neutral}
        contentPadding={ContentPadding.None}
        collapsible={false}
        title="404"
        aria-labelledby="error-title"
        data-ui-window-priority="primary"
      >
        <div className={styles.content}>
          <Icon kind={IconKind.Search} size={IconSize.Large} className={styles.icon} />
          <div className={styles.message}>
            <Text
              id="error-title"
              as="h1"
              variant={TextVariant.Reading}
              textRole={TextRole.Title}
              wrap
            >
              {text("We couldn't find this page", "找不到这个页面")}
            </Text>
            <Text as="p" variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
              {text(
                "The link may be incorrect, or the page may have moved. You can return home or keep creating in the editor.",
                "链接可能有误，或页面已经移动。你可以返回首页，或打开编辑器继续创作。",
              )}
            </Text>
            <nav className={styles.actions} aria-label={text("Continue", "继续使用")}>
              <Button href={SHOWCASE_PAGES[language].path} slots={{}}>
                {text("Back to home", "返回首页")}
              </Button>
              <Button href="/editor" slots={{}}>
                {text("Open editor", "打开编辑器")}
              </Button>
            </nav>
          </div>
        </div>
      </Panel>
      <nav className={styles.shortcuts} aria-label={text("Resources", "常用入口")}>
        <PublicIcon
          label={text("Applications", "应用程序")}
          href={localizedSiteHref("/tools/", language)}
          variant={IconKind.Folder}
        />
        <PublicIcon
          label={text("User guide", "使用指南")}
          href={GUIDE_PAGES[language].path}
          variant={IconKind.Document}
        />
      </nav>
    </main>
  );
}
