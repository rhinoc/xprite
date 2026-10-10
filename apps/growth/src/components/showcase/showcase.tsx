import { GUIDE_PAGES } from "$content/help/pages";
import { SHOWCASE_PAGES } from "$content/showcase/pages";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

import { PublicFooter, PublicNavigation } from "$/components/public/static-ui";
import { ShowcaseOverviewPreview } from "$/components/showcase/showcase-overview-preview";
import { ShowcaseSoundControl } from "$/components/showcase/showcase-sound-control";
import { ShowcaseStories } from "$/components/showcase/showcase-stories";
import { useDeviceSwipe } from "$/components/showcase/use-device-swipe";
import type {
  ShowcaseIntroMotion,
  ShowcaseIntroMount,
  ShowcaseTrailMount,
  ShowcaseStoryAnimationsMount,
} from "$/managers/ports/showcase";
import { SHOWCASE_DEVICE_NAMES, SHOWCASE_DEVICES } from "$/managers/showcase/showcase-device";

import "$/components/public/site-preset.module.css";
import "$/components/public/desktop.module.css";

import {
  SHOWCASE_BRAND_NAME,
  SHOWCASE_COPY,
  ShowcaseLanguage,
} from "$/managers/showcase/showcase-language";
import { ShowcaseManager, ShowcaseStatus } from "$/managers/showcase/showcase-manager";
import {
  Button,
  ButtonAppearance,
  WindowWorkspace,
  IconKind,
  PatternVariant,
  Panel,
  PanelVariant,
  Icon,
  PanelWindowChrome,
  ContentPadding,
  SurfaceTone,
  RichText,
  ButtonVariant,
  IconSize,
} from "@xprite/ui";

import styles from "$/components/showcase/showcase.module.css";

export function Showcase({
  manager,
  mountTrail,
  mountIntro,
  mountStoryAnimations,
}: {
  manager: ShowcaseManager;
  mountTrail: ShowcaseTrailMount;
  mountIntro: ShowcaseIntroMount;
  mountStoryAnimations: ShowcaseStoryAnimationsMount;
}) {
  const page = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const stage = useRef<HTMLElement>(null);
  const titleLine = useRef<HTMLSpanElement>(null);
  const subtitle = useRef<HTMLSpanElement>(null);
  const introMotion = useRef<ShowcaseIntroMotion>();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const copy = SHOWCASE_COPY[state.language];
  const targetLanguage =
    state.language === ShowcaseLanguage.Chinese
      ? ShowcaseLanguage.English
      : ShowcaseLanguage.Chinese;
  const titleEnd = copy.titleEnd[state.device];
  const deviceLetters = Array.from(titleEnd.device);
  const deviceGlyphs = Array.from(state.deviceText);
  const overviewLetters = Array.from(copy.titleOverview);
  const { dragging, ...swipe } = useDeviceSwipe(manager);
  const titleDescription = state.started
    ? `${titleEnd.prefix}${titleEnd.device}${titleEnd.suffix}`
    : copy.titleOverview;
  const deviceTitle = `${copy.titleLead} ${SHOWCASE_BRAND_NAME} ${titleDescription}`;

  useLayoutEffect(() => {
    if (
      !intro.current ||
      !titleLine.current ||
      !subtitle.current ||
      !header.current ||
      !stage.current
    )
      return;
    const motion = mountIntro(intro.current, [titleLine.current, subtitle.current]);
    introMotion.current = motion;
    return () => {
      motion.dispose();
      introMotion.current = undefined;
    };
  }, [manager, mountIntro]);

  useLayoutEffect(() => {
    if (host.current) void manager.mount(host.current);
    return () => manager.unmount();
  }, [manager]);

  useEffect(() => {
    if (trail.current && page.current) return mountTrail(trail.current, page.current);
  }, [mountTrail]);

  return (
    <div
      ref={page}
      className={styles.page}
      data-growth-desktop
      lang={state.language}
      data-ui-desktop-pattern={PatternVariant.MacOS8BlueCord}
    >
      <canvas ref={trail} className={styles.pixelTrail} aria-hidden="true" />
      <header ref={header} className={styles.header}>
        <PublicNavigation
          label="Xprite"
          language={state.language}
          trailingContent={
            <ShowcaseSoundControl
              language={state.language}
              muted={state.musicMuted}
              volume={state.musicVolume}
              available={state.musicAvailable}
              onVolumeChange={manager.setMusicVolume}
            />
          }
          brandLabel={copy.home}
          brandHref={SHOWCASE_PAGES[state.language].path}
          links={[
            { label: copy.tools, href: "/tools/" },
            { label: copy.goToEditor, href: "/editor" },
            {
              label: copy.languageSwitch,
              icon: "language",
              href: SHOWCASE_PAGES[targetLanguage].path,
              hrefLang: targetLanguage,
              end: true,
              onClick: (event) => {
                if (
                  event.button !== 0 ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.altKey ||
                  event.shiftKey
                )
                  return;
                event.preventDefault();
                manager.setLanguage(targetLanguage);
              },
            },
            {
              label: copy.help,
              icon: "help",
              href: GUIDE_PAGES[state.language].path,
            },
          ]}
        />
      </header>
      <main>
        <div id="showcase-demo" data-showcase-hero>
          <WindowWorkspace data-showcase-desktop>
            <Panel
              variant={PanelVariant.Window}
              windowChrome={PanelWindowChrome.Emphasized}
              contentPadding={ContentPadding.None}
              title={state.language === ShowcaseLanguage.Chinese ? "设备演示" : "Device demos"}
              className={styles.heroWindow}
              tone={SurfaceTone.Informative}
              data-showcase-screen
              collapsible
              data-ui-window-priority="primary"
            >
              <div className={styles.main}>
                <div ref={intro} className={styles.intro} data-overview={!state.started}>
                  <h1 className={styles.title} aria-label={deviceTitle}>
                    <span ref={titleLine} className={styles.titleLine}>
                      <span className={styles.titleLead} aria-hidden="true">
                        {copy.titleLead}
                      </span>
                      <span
                        className={styles.titleBrand}
                        data-wordmark={SHOWCASE_BRAND_NAME}
                        aria-hidden="true"
                      >
                        {SHOWCASE_BRAND_NAME}
                      </span>
                    </span>
                    <span ref={subtitle} className={styles.titleEnd} aria-hidden="true">
                      {state.started ? (
                        <>
                          {titleEnd.prefix}
                          <span className={styles.deviceName}>
                            {deviceLetters.map((letter, index) => (
                              <span key={index} className={styles.deviceLetter}>
                                <span className={styles.deviceMeasure}>{letter}</span>
                                <span className={styles.deviceWord}>{deviceGlyphs[index]}</span>
                              </span>
                            ))}
                          </span>
                          {titleEnd.suffix}
                        </>
                      ) : (
                        <span key={state.language} className={styles.overviewPrompt}>
                          {overviewLetters.map((letter, index) => (
                            <span
                              key={index}
                              className={styles.overviewLetter}
                              style={{ "--film-letter-index": index } as CSSProperties}
                            >
                              {letter}
                            </span>
                          ))}
                          <span
                            className={styles.overviewCursor}
                            style={
                              { "--film-letter-index": overviewLetters.length } as CSSProperties
                            }
                          >
                            _
                          </span>
                        </span>
                      )}
                    </span>
                  </h1>
                  <RichText className={styles.productDescription}>
                    {copy.productDescription.map((phrase, index) => (
                      <span key={phrase}>
                        {index > 0 ? " " : ""}
                        {phrase}
                      </span>
                    ))}
                  </RichText>
                </div>
                <section
                  ref={stage}
                  className={styles.stage}
                  aria-label={copy.stage}
                  aria-describedby="device-navigation-hint"
                  aria-keyshortcuts="ArrowLeft ArrowRight"
                  data-dragging={dragging}
                  data-overview={!state.started}
                  {...swipe}
                >
                  {state.status !== ShowcaseStatus.Ready && (
                    <ShowcaseOverviewPreview alt={copy.stage} />
                  )}
                  <div
                    ref={host}
                    className={styles.canvas}
                    role="img"
                    aria-label={
                      state.started
                        ? `${SHOWCASE_DEVICE_NAMES[state.device]} — ${copy.screen}`
                        : deviceTitle
                    }
                  />
                  {!state.started && state.status === ShowcaseStatus.Ready && (
                    <div className={styles.overviewChoices}>
                      {SHOWCASE_DEVICES.map((device) => (
                        <Button
                          key={device}
                          appearance={ButtonAppearance.Quiet}
                          className={styles.overviewChoice}
                          aria-label={`${copy.chooseDevice}: ${copy.titleEnd[device].device}`}
                          style={{
                            position: "absolute",
                            width: "auto",
                            height: "auto",
                          }}
                          onFocus={() => manager.previewDevice(device)}
                          onBlur={() => manager.previewDevice()}
                          onClick={() => manager.selectDevice(device)}
                        >
                          {`${copy.chooseDevice}: ${copy.titleEnd[device].device}`}
                        </Button>
                      ))}
                    </div>
                  )}
                  {state.status === ShowcaseStatus.Loading && (
                    <div className={styles.loading} role="status">
                      <span className={styles.loadingSpinner} aria-hidden="true" />
                      {copy.loading}
                    </div>
                  )}
                  {state.status === ShowcaseStatus.Error && (
                    <Panel
                      variant={PanelVariant.Window}
                      title="Xprite"
                      tone={SurfaceTone.Warning}
                      contentPadding={24}
                      className={styles.error}
                      role="alert"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <RichText>
                        <p>{copy.error}</p>
                      </RichText>
                      <Button slots={{}} onClick={() => manager.selectDevice(state.device)}>
                        {copy.retry}
                      </Button>
                      <Button slots={{}} href="/editor" aria-label={copy.direct}>
                        {copy.direct}
                      </Button>
                    </Panel>
                  )}
                  <div
                    className={styles.action}
                    data-highlighted={state.editingHighlighted}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Button href="/editor" slots={{}}>
                      {copy.open}
                    </Button>
                  </div>
                  <span id="device-navigation-hint" className={styles.announcement}>
                    {copy.navigation}
                  </span>
                  <span className={styles.announcement} role="status" aria-live="polite">
                    {deviceTitle}
                  </span>
                </section>
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
                href={GUIDE_PAGES[state.language].path}
              />
              <Button
                variant={ButtonVariant.Tile}
                slots={{ leading: <Icon kind={IconKind.Application} size={IconSize.Large} /> }}
                compactOnSmallScreens
                text={copy.goToEditor}
                href="/editor"
              />
            </nav>
          </WindowWorkspace>
        </div>
        <ShowcaseStories language={state.language} mountAnimations={mountStoryAnimations} />
      </main>
      <PublicFooter language={state.language} />
    </div>
  );
}
