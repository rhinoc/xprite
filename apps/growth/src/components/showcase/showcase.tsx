import { FEATURES_PATH } from "$content/features";
import { GUIDE_PAGES } from "$content/help/pages";
import { deviceDemosLabel } from "$content/showcase/index";
import { SHOWCASE_PAGES } from "$content/showcase/pages";
import { localizedSiteHref, publicLanguage } from "$content/site/language";
import { languageSwitchLinks } from "$content/site/navigation";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent } from "react";

import { PublicFooter, PublicNavigation } from "$/components/public/static-ui";
import { ShowcaseIntro } from "$/components/showcase/showcase-intro";
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
  PatternId,
  Panel,
  PanelVariant,
  Icon,
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
  const titleEnd = copy.titleEnd[state.device];
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
      data-ui-desktop-pattern={PatternId.MacOS8BlueCord}
    >
      <canvas ref={trail} className={styles.pixelTrail} aria-hidden="true" />
      <header ref={header} className={styles.header}>
        <PublicNavigation
          label="Xprite"
          language={state.language}
          brandLabel={copy.home}
          brandHref={SHOWCASE_PAGES[state.language].path}
          links={[
            { label: copy.features, href: localizedSiteHref(FEATURES_PATH, state.language) },
            { label: copy.goToEditor, href: "/editor" },
            ...languageSwitchLinks(
              publicLanguage(state.language),
              Object.fromEntries(
                Object.values(ShowcaseLanguage).map((value) => [value, SHOWCASE_PAGES[value].path]),
              ),
              true,
            ).map((link) => ({
              ...link,
              onClick: (event: MouseEvent<HTMLAnchorElement>) => {
                if (
                  event.button !== 0 ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.altKey ||
                  event.shiftKey
                )
                  return;
                event.preventDefault();
                manager.setLanguage(link.hrefLang as string as ShowcaseLanguage);
              },
            })),
          ]}
        />
      </header>
      <main>
        <div id="showcase-demo" data-showcase-hero>
          <WindowWorkspace data-showcase-desktop>
            <Panel
              variant={PanelVariant.Document}
              emphasized
              contentPadding={ContentPadding.None}
              title={deviceDemosLabel(state.language)}
              className={styles.heroWindow}
              tone={SurfaceTone.Info}
              data-showcase-screen
              collapsible
              data-ui-window-priority="primary"
              extra={
                state.musicActivated && (
                  <ShowcaseSoundControl
                    language={state.language}
                    muted={state.musicMuted}
                    volume={state.musicVolume}
                    available={state.musicAvailable}
                    onVolumeChange={manager.setMusicVolume}
                  />
                )
              }
            >
              <div className={styles.main}>
                <ShowcaseIntro
                  language={state.language}
                  started={state.started}
                  device={state.device}
                  deviceText={state.deviceText}
                  introRef={intro}
                  titleLineRef={titleLine}
                  subtitleRef={subtitle}
                />
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
                          onClick={() => manager.activateDevice(device)}
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
                      variant={PanelVariant.Document}
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

            <nav data-showcase-shortcuts aria-label={copy.features}>
              <Button
                variant={ButtonVariant.Tile}
                slots={{ leading: <Icon kind={IconKind.Folder} size={IconSize.Large} /> }}
                compactOnSmallScreens
                text={copy.features}
                href={localizedSiteHref(FEATURES_PATH, state.language)}
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
