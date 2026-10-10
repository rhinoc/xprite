import { GUIDE_PAGES } from "$content/help/pages";
import { SHOWCASE_HERO_COPY, SHOWCASE_STORY_COPY } from "$content/showcase/index";
import { SHOWCASE_PAGES } from "$content/showcase/pages";
import type { Ref } from "react";

import { PublicNavigation } from "$/components/public/static-ui";
import { ShowcaseDiscovery } from "$/components/showcase/showcase-discovery";
import { ShowcaseOverviewPreview } from "$/components/showcase/showcase-overview-preview";
import { ShowcaseSoundControl } from "$/components/showcase/showcase-sound-control";
import {
  PatternVariant,
  Button,
  ContentPadding,
  WindowWorkspace,
  IconKind,
  Panel,
  PanelVariant,
  Note,
  NoteVariant,
  NoteDismissBehavior,
  NoteColor,
  PanelWindowChrome,
  RichText,
  SurfaceTone,
  ButtonVariant,
  Icon,
  IconSize,
  Text,
  TextRole,
  TextVariant,
} from "@xprite/ui";

import "$/components/showcase/showcase-stories.module.css";
import "$/components/showcase/showcase-typography.module.css";

const EDITOR_URL = "/editor";
const WORKSPACE_LAYOUT_PATH = "/showcase/workspace-layout";
export type ShowcaseContentLanguage = keyof typeof SHOWCASE_HERO_COPY;
const splitHeading = (title: string) =>
  title.split("<br>").map((line, index) => (
    <span key={line}>
      {index > 0 && <br />}
      {line}
    </span>
  ));

/** Shared React composition for server pages and live language changes. */
export function ShowcaseStoryContent({
  language,
  hostRef,
}: {
  language: ShowcaseContentLanguage;
  hostRef?: Ref<HTMLDivElement>;
}) {
  const copy = SHOWCASE_STORY_COPY[language];
  return (
    <div
      ref={hostRef}
      data-showcase-stories
      data-growth-desktop
      data-ui-desktop-pattern={PatternVariant.MacOS8BlueCord}
      lang={language}
    >
      <section id="create" data-showcase-story="create" aria-labelledby="create-title">
        <WindowWorkspace data-story-layout>
          <Note
            variant={NoteVariant.Window}
            dismissBehavior={NoteDismissBehavior.Collapse}
            color={NoteColor.Yellow}
            aria-label={language === "en" ? "Read Me" : "说明"}
            title={language === "en" ? "Read Me" : "说明"}
            data-story-copy
          >
            <RichText>
              <h2 id="create-title">{splitHeading(copy.createTitle)}</h2>
              <p data-story-description>{copy.createDescription}</p>
              <ul data-story-features>
                {copy.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </RichText>
          </Note>
          <Panel
            variant={PanelVariant.Window}
            windowChrome={PanelWindowChrome.Emphasized}
            tone={SurfaceTone.Positive}
            contentPadding={12}
            title="Xprite"
            data-story-image-window
          >
            <figure data-story-editor>
              <img
                data-story-preview
                src={`/showcase/devices/computer/${language}/animation.png`}
                width={1440}
                height={840}
                alt={copy.screenshot}
                loading="lazy"
                decoding="async"
              />
              <RichText>
                <figcaption>{copy.screenshotCaption}</figcaption>
              </RichText>
            </figure>
          </Panel>
        </WindowWorkspace>
      </section>
      <section id="your-canvas" data-showcase-story="browser" aria-labelledby="browser-title">
        <WindowWorkspace data-story-layout>
          <Panel
            variant={PanelVariant.Window}
            windowChrome={PanelWindowChrome.Emphasized}
            tone={SurfaceTone.Positive}
            contentPadding={12}
            title={language === "en" ? "Workspace" : "工作区"}
            data-story-image-window
          >
            <figure data-story-artwork>
              <picture>
                <source
                  media="(prefers-reduced-motion: reduce)"
                  srcSet={`${WORKSPACE_LAYOUT_PATH}/${language}/poster.png`}
                />
                <img
                  src={`${WORKSPACE_LAYOUT_PATH}/${language}/poster.png`}
                  data-showcase-animation-src={`${WORKSPACE_LAYOUT_PATH}/${language}/layout.gif`}
                  width={1080}
                  height={720}
                  alt={copy.layoutAlt}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <RichText>
                <figcaption>{copy.layoutCaption}</figcaption>
              </RichText>
            </figure>
          </Panel>
          <Note
            variant={NoteVariant.Window}
            dismissBehavior={NoteDismissBehavior.Collapse}
            color={NoteColor.Lilac}
            aria-label={language === "en" ? "Read Me" : "说明"}
            title={language === "en" ? "Read Me" : "说明"}
            data-story-copy
          >
            <RichText>
              <h2 id="browser-title">{splitHeading(copy.browserTitle)}</h2>
              <p data-story-description>{copy.browserDescription}</p>
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
          </Note>
        </WindowWorkspace>
      </section>
      <ShowcaseDiscovery language={language} />
      <section id="faq" data-showcase-faq aria-labelledby="faq-title">
        <Text as="h2" id="faq-title" variant={TextVariant.Reading} textRole={TextRole.Heading}>
          {language === "zh-CN" ? "常见问题" : "FAQ"}
        </Text>
      </section>
    </div>
  );
}

export function ShowcaseStaticHero({ language }: { language: ShowcaseContentLanguage }) {
  const copy = SHOWCASE_HERO_COPY[language];
  const otherLanguage = language === "en" ? "zh-CN" : "en";
  return (
    <div
      data-showcase-static-page
      data-growth-desktop
      data-ui-desktop-pattern={PatternVariant.MacOS8BlueCord}
      lang={language}
    >
      <header data-showcase-static-header>
        <PublicNavigation
          label="Xprite"
          language={language}
          trailingContent={<ShowcaseSoundControl language={language} />}
          brandLabel={copy.home}
          brandHref={SHOWCASE_PAGES[language].path}
          links={[
            { label: copy.tools, href: "/tools/" },
            { label: copy.goToEditor, href: EDITOR_URL },
            {
              label: copy.languageSwitch,
              href: SHOWCASE_PAGES[otherLanguage].path,
              hrefLang: otherLanguage,
              end: true,
              icon: "language",
            },
            {
              label: copy.help,
              href: GUIDE_PAGES[language].path,
              icon: "help",
            },
          ]}
        />
      </header>
      <section id="showcase-demo" data-showcase-hero data-showcase-static-hero>
        <WindowWorkspace data-showcase-desktop>
          <Panel
            variant={PanelVariant.Window}
            windowChrome={PanelWindowChrome.Emphasized}
            title={language === "en" ? "Device demos" : "设备演示"}
            contentPadding={ContentPadding.None}
            tone={SurfaceTone.Informative}
            data-showcase-screen
            collapsible
            data-ui-window-priority="primary"
          >
            <div data-showcase-static-intro>
              <div>
                <h1>{copy.titleLead} Xprite</h1>
                <p data-showcase-static-prompt>{copy.titleOverview}</p>
              </div>
              <RichText>
                <p data-showcase-product-description>{copy.productDescription.join(" ")}</p>
              </RichText>
            </div>
            <div data-showcase-static-stage>
              <ShowcaseOverviewPreview alt={copy.titleOverview} />
              <div data-showcase-action>
                <Button href={EDITOR_URL} slots={{}}>
                  {copy.open}
                </Button>
              </div>
            </div>
          </Panel>

          <nav data-showcase-shortcuts aria-label={copy.tools}>
            <Button
              variant={ButtonVariant.Tile}
              slots={{ leading: <Icon kind={IconKind.Folder} size={IconSize.Large} /> }}
              compactOnSmallScreens
              text={copy.tools}
              href="/tools/"
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
    </div>
  );
}
