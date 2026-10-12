import { FEATURE_DETAIL_PATH, FEATURES_PATH } from "$content/features";
import { GUIDE_PAGES } from "$content/help/pages";
import {
  SHOWCASE_HERO_COPY,
  SHOWCASE_STORY_COPY,
  SHOWCASE_STORY_FEATURE_SLUGS,
} from "$content/showcase/index";
import { showcaseMedia } from "$content/showcase/media";
import { SHOWCASE_PAGES } from "$content/showcase/pages";
import { localizedSiteHref } from "$content/site/language";
import type { Ref } from "react";

import { PublicNavigation } from "$/components/public/static-ui";
import { ShowcaseDiscovery } from "$/components/showcase/showcase-discovery";
import { ShowcaseFaq } from "$/components/showcase/showcase-faq";
import { ShowcaseIntro } from "$/components/showcase/showcase-intro";
import { ShowcaseOverviewPreview } from "$/components/showcase/showcase-overview-preview";
import { ShowcaseLanguage } from "$/managers/showcase/showcase-language";
import {
  PatternId,
  Button,
  ContentPadding,
  WindowWorkspace,
  IconKind,
  Panel,
  PanelVariant,
  PanelDismissBehavior,
  PanelNoteColor,
  RichText,
  SurfaceTone,
  ButtonVariant,
  Icon,
  IconSize,
} from "@xprite/ui";

import "$/components/showcase/showcase-stories.module.css";
import "$/components/showcase/showcase-typography.module.css";
import styles from "$/components/showcase/showcase.module.css";

const EDITOR_URL = "/editor";
export type ShowcaseContentLanguage = keyof typeof SHOWCASE_HERO_COPY;
/** Shared React composition for server pages and live language changes. */
export function ShowcaseStoryContent({
  language,
  hostRef,
}: {
  language: ShowcaseContentLanguage;
  hostRef?: Ref<HTMLDivElement>;
}) {
  const copy = SHOWCASE_STORY_COPY[language];
  const media = showcaseMedia(language);
  return (
    <div
      ref={hostRef}
      data-showcase-stories
      data-growth-desktop
      data-ui-desktop-pattern={PatternId.MacOS8BlueCord}
      lang={language}
    >
      <section id="create" data-showcase-story="create" aria-labelledby="create-title">
        <WindowWorkspace data-story-layout>
          <Panel
            variant={PanelVariant.NoteWindow}
            dismissBehavior={PanelDismissBehavior.Collapse}
            noteColor={PanelNoteColor.Yellow}
            aria-label={language === "en" ? "Read Me" : "说明"}
            title={language === "en" ? "Read Me" : "说明"}
            data-story-copy
            data-showcase-note
          >
            <RichText>
              <h2 id="create-title">{copy.createTitle}</h2>
              <p>{copy.createDescription}</p>
              <ul data-story-features>
                {copy.features.map((feature, index) => (
                  <li key={feature}>
                    <a
                      href={localizedSiteHref(
                        `${FEATURE_DETAIL_PATH}${SHOWCASE_STORY_FEATURE_SLUGS[index]}/`,
                        language,
                      )}
                    >
                      {feature}
                    </a>
                  </li>
                ))}
              </ul>
            </RichText>
          </Panel>
          <Panel
            variant={PanelVariant.Document}
            emphasized
            tone={SurfaceTone.Success}
            contentPadding={12}
            title="Xprite"
            data-story-image-window
          >
            <figure data-story-editor>
              <img
                data-story-preview
                src={media.animation.src}
                width={media.animation.width}
                height={media.animation.height}
                alt={media.animation.alt}
                loading="lazy"
                decoding="async"
              />
              <RichText>
                <figcaption>{media.animation.caption}</figcaption>
              </RichText>
            </figure>
          </Panel>
        </WindowWorkspace>
      </section>
      <section id="your-canvas" data-showcase-story="browser" aria-labelledby="browser-title">
        <WindowWorkspace data-story-layout>
          <Panel
            variant={PanelVariant.Document}
            emphasized
            tone={SurfaceTone.Success}
            contentPadding={12}
            title={language === "en" ? "Workspace" : "工作区"}
            data-story-image-window
          >
            <figure data-story-artwork>
              <picture>
                <source media="(prefers-reduced-motion: reduce)" srcSet={media.workspace.src} />
                <img
                  src={media.workspace.src}
                  data-showcase-animation-src={media.workspace.animationSrc}
                  width={media.workspace.width}
                  height={media.workspace.height}
                  alt={media.workspace.alt}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <RichText>
                <figcaption>{media.workspace.caption}</figcaption>
              </RichText>
            </figure>
          </Panel>
          <Panel
            variant={PanelVariant.NoteWindow}
            dismissBehavior={PanelDismissBehavior.Collapse}
            noteColor={PanelNoteColor.Lilac}
            aria-label={language === "en" ? "Read Me" : "说明"}
            title={language === "en" ? "Read Me" : "说明"}
            data-story-copy
            data-showcase-note
          >
            <RichText>
              <h2 id="browser-title">{copy.browserTitle}</h2>
              <p>{copy.browserDescription}</p>
              <div data-story-notes>
                <div>
                  <h3>{copy.fileTitle}</h3>
                  <p>{copy.fileDescription}</p>
                </div>
                <div>
                  <h3>{copy.saveTitle}</h3>
                  <p>{copy.saveDescription}</p>
                </div>
              </div>
            </RichText>
          </Panel>
        </WindowWorkspace>
      </section>
      <ShowcaseDiscovery language={language} />
      <ShowcaseFaq language={language} />
    </div>
  );
}

export function ShowcaseStaticHeader({ language }: { language: ShowcaseContentLanguage }) {
  const copy = SHOWCASE_HERO_COPY[language];
  const otherLanguage = language === "en" ? "zh-CN" : "en";
  return (
    <header className={styles.header}>
      <PublicNavigation
        label="Xprite"
        language={language}
        brandLabel={copy.home}
        brandHref={SHOWCASE_PAGES[language].path}
        links={[
          { label: copy.features, href: localizedSiteHref(FEATURES_PATH, language) },
          { label: copy.goToEditor, href: EDITOR_URL },
          {
            label: copy.languageSwitch,
            href: SHOWCASE_PAGES[otherLanguage].path,
            hrefLang: otherLanguage,
            end: true,
            icon: "language",
          },
        ]}
      />
    </header>
  );
}

export function ShowcaseStaticHero({ language }: { language: ShowcaseContentLanguage }) {
  const copy = SHOWCASE_HERO_COPY[language];
  return (
    <section id="showcase-demo" data-showcase-hero data-showcase-static-hero>
      <WindowWorkspace data-showcase-desktop>
        <Panel
          variant={PanelVariant.Document}
          emphasized
          title={language === "en" ? "Device demos" : "设备演示"}
          contentPadding={ContentPadding.None}
          tone={SurfaceTone.Info}
          data-showcase-screen
          collapsible
          data-ui-window-priority="primary"
        >
          <ShowcaseIntro
            language={language === "zh-CN" ? ShowcaseLanguage.Chinese : ShowcaseLanguage.English}
          />
          <div data-showcase-static-stage>
            <ShowcaseOverviewPreview alt={copy.titleOverview} />
            <div data-showcase-action>
              <Button href={EDITOR_URL} slots={{}}>
                {copy.open}
              </Button>
            </div>
          </div>
        </Panel>

        <nav data-showcase-shortcuts aria-label={copy.features}>
          <Button
            variant={ButtonVariant.Tile}
            slots={{ leading: <Icon kind={IconKind.Folder} size={IconSize.Large} /> }}
            compactOnSmallScreens
            text={copy.features}
            href={localizedSiteHref(FEATURES_PATH, language)}
          />
          <Button
            variant={ButtonVariant.Tile}
            slots={{ leading: <Icon kind={IconKind.Document} size={IconSize.Large} /> }}
            compactOnSmallScreens
            text={copy.help}
            href={GUIDE_PAGES[language].path}
          />
          <Button
            variant={ButtonVariant.Tile}
            slots={{ leading: <Icon kind={IconKind.Application} size={IconSize.Large} /> }}
            compactOnSmallScreens
            text={copy.goToEditor}
            href={EDITOR_URL}
          />
        </nav>
      </WindowWorkspace>
    </section>
  );
}
