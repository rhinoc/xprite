import { GUIDE_PAGES } from "$content/help/pages";
import { SHOWCASE_PAGES } from "$content/showcase/pages";
import { PublicLanguage, localizedSiteHref, pickText } from "$content/site/language";

import { PublicIcon } from "$/components/public/static-ui";
import {
  Button,
  ContentPadding,
  Icon,
  IconKind,
  IconSize,
  Panel,
  PanelVariant,
  SurfaceTone,
  Text,
  TextRole,
  TextTone,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/public/not-found.module.css";

export function PublicNotFound({ language }: { language: PublicLanguage }) {
  const text = (en: string, zh: string, ja: string, ko: string) =>
    pickText(language, en, zh, ja, ko);
  return (
    <main className={styles.desktop}>
      <Panel
        className={styles.window}
        variant={PanelVariant.Document}
        emphasized
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
              {text(
                "We couldn't find this page",
                "找不到这个页面",
                "ページが見つかりませんでした",
                "페이지를 찾을 수 없습니다",
              )}
            </Text>
            <Text as="p" variant={TextVariant.Reading} tone={TextTone.Muted} wrap>
              {text(
                "The link may be incorrect, or the page may have moved. Read about Xprite or keep creating in the editor.",
                "链接可能有误，或页面已经移动。可以了解 Xprite，或打开编辑器继续创作。",
                "リンクが間違っているか、ページが移動した可能性があります。Xprite について読むか、エディターで制作を続けましょう。",
                "링크가 잘못되었거나 페이지가 이동했을 수 있습니다. Xprite를 알아보거나 에디터에서 작업을 이어 가세요.",
              )}
            </Text>
            <nav
              className={styles.actions}
              aria-label={text("Continue", "继续使用", "続ける", "계속하기")}
            >
              <Button href={SHOWCASE_PAGES[language].path} slots={{}}>
                {text("About Xprite", "关于 Xprite", "Xprite について", "Xprite 소개")}
              </Button>
              <Button href="/editor" slots={{}}>
                {text("Open editor", "打开编辑器", "エディターを開く", "에디터 열기")}
              </Button>
            </nav>
          </div>
        </div>
      </Panel>
      <nav
        className={styles.shortcuts}
        aria-label={text("Resources", "常用入口", "リソース", "바로 가기")}
      >
        <PublicIcon
          label={text("Features", "功能", "機能", "기능")}
          href={localizedSiteHref("/features/", language)}
          variant={IconKind.Folder}
        />
        <PublicIcon
          label={text("User guide", "使用指南", "使い方ガイド", "사용 가이드")}
          href={GUIDE_PAGES[language].path}
          variant={IconKind.Document}
        />
      </nav>
    </main>
  );
}
