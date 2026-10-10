import { showcaseDiscovery } from "$content/showcase/index";
import { localizedSiteHref } from "$content/site/language";

import {
  WindowWorkspace,
  Panel,
  PanelVariant,
  PanelWindowChrome,
  ContentPadding,
  SurfaceTone,
  Button,
  ButtonVariant,
  ButtonAppearance,
  Icon,
  IconKind,
  IconSize,
  Text,
  TextVariant,
  Tooltip,
} from "@xprite/ui";

import styles from "$/components/showcase/showcase-discovery.module.css";

type DiscoveryLanguage = Parameters<typeof showcaseDiscovery>[0];
const TOOL_ICONS = {
  "/tools/viewer/": IconKind.Search,
  "/tools/gif-to-sprite-sheet/": IconKind.Image,
  "/tools/animal-crossing-qr/": IconKind.Map,
} as const;

/** Applications and documents share a Finder-like desktop, rendered identically by SSG. */
export function ShowcaseDiscovery({ language }: { language: DiscoveryLanguage }) {
  const { copy, tools, fileGuides, comparisons } = showcaseDiscovery(language);
  const documents = [
    { href: `/help/${language}/`, label: copy.userGuide, icon: IconKind.NotePad },
    ...[...fileGuides, ...comparisons].map((article) => ({
      href: localizedSiteHref(article.path, language),
      label: article.shortTitle[language],
      icon: IconKind.Document,
    })),
  ];
  const itemCount = (count: number) => (language === "zh-CN" ? `${count} 项` : `${count} items`);
  return (
    <section className={styles.desktop} aria-label={copy.resources}>
      <WindowWorkspace className={styles.workspace}>
        <Panel
          id="pixel-art-tools"
          variant={PanelVariant.Window}
          windowChrome={PanelWindowChrome.Emphasized}
          tone={SurfaceTone.Neutral}
          contentPadding={ContentPadding.None}
          className={styles.toolsWindow}
          title={<h2>{copy.toolsTitle}</h2>}
          aria-label={copy.toolsTitle}
          data-ui-window-priority="primary"
          footer={
            <>
              <Text variant={TextVariant.Reading}>{itemCount(tools.length)}</Text>
              <Button
                href={localizedSiteHref("/tools/", language)}
                appearance={ButtonAppearance.Quiet}
                slots={{}}
              >
                {copy.allTools}
              </Button>
            </>
          }
        >
          <nav className={styles.applications} aria-label={copy.toolsTitle}>
            {tools.map((tool) => (
              <Tooltip key={tool.href} text={tool.summary} placement="auto">
                <Button
                  variant={ButtonVariant.Tile}
                  slots={{ leading: <Icon kind={TOOL_ICONS[tool.path]} size={IconSize.Large} /> }}
                  compactOnSmallScreens
                  text={tool.label}
                  href={tool.href}
                />
              </Tooltip>
            ))}
          </nav>
        </Panel>
        <Panel
          id="guides-and-comparisons"
          variant={PanelVariant.Window}
          windowChrome={PanelWindowChrome.Emphasized}
          tone={SurfaceTone.Neutral}
          contentPadding={ContentPadding.None}
          className={styles.libraryWindow}
          title={<h2>{copy.resources}</h2>}
          aria-label={copy.resources}
          footer={
            <>
              <Text variant={TextVariant.Reading}>{itemCount(documents.length)}</Text>
              <Button
                href={localizedSiteHref("/learn/", language)}
                appearance={ButtonAppearance.Quiet}
                slots={{}}
              >
                {copy.fileGuides}
              </Button>
              <Button
                href={localizedSiteHref("/compare/", language)}
                appearance={ButtonAppearance.Quiet}
                slots={{}}
              >
                {copy.comparisons}
              </Button>
            </>
          }
        >
          <nav className={styles.documents} aria-label={copy.resources}>
            {documents.map((document) => (
              <Button
                key={document.href}
                variant={ButtonVariant.Tile}
                slots={{ leading: <Icon kind={document.icon} size={IconSize.Large} /> }}
                compactOnSmallScreens
                text={document.label}
                href={document.href}
              />
            ))}
          </nav>
        </Panel>
      </WindowWorkspace>
    </section>
  );
}
