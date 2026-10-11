import { renderToString } from "react-dom/server";

export { articleStyleClasses } from "$/components/articles/article-styles";

import { PublicArticleDiagram } from "$/components/articles/article-diagram";
import { FeatureDirectory } from "$/components/features/feature-directory";
import { PublicNotFound } from "$/components/public/not-found";
import { PublicImage, type PublicImageProps } from "$/components/public/public-image";
import {
  PublicWindow,
  PublicNavigation,
  PublicIcon,
  PublicButton,
  PublicRichText,
  PublicIndex,
  PublicHtml,
  PublicStatus,
  PublicFooter,
  PublicReaderScroll,
  type PublicWindowProps,
  type PublicNavigationProps,
} from "$/components/public/static-ui";
import {
  ShowcaseStaticHero,
  ShowcaseStaticHeader,
  ShowcaseStoryContent,
} from "$/components/showcase/showcase-story-content";
import { DesktopProvider, DesktopManager, DesktopAppearance } from "@xprite/site-shell";
import {
  macintoshTheme,
  ScrollArea,
  ScrollAreaTarget,
  ScrollbarRendering,
  PatternId,
  UiColorScheme,
} from "@xprite/ui";
import { loadUiThemeSnapshot } from "@xprite/ui/assets";
import { cursorScopeStyle } from "@xprite/ui/cursor";

import "$/components/public/desktop.module.css";
import showcaseStyles from "$/components/showcase/showcase.module.css";

function publicImageProps(props: Record<string, unknown>): PublicImageProps {
  const { src, alt, width, height } = props;
  if (
    typeof src !== "string" ||
    typeof alt !== "string" ||
    typeof width !== "number" ||
    typeof height !== "number"
  )
    throw new TypeError("Public image markup requires a source, alt text, width and height.");
  return {
    src,
    alt,
    width,
    height,
    ...(typeof props.displayWidth === "number" ? { displayWidth: props.displayWidth } : {}),
    ...(typeof props.animationSrc === "string" ? { animationSrc: props.animationSrc } : {}),
    ...(typeof props.framed === "boolean" ? { framed: props.framed } : {}),
  };
}

function windowProps(props: Record<string, unknown>): PublicWindowProps {
  if (typeof props.title !== "string" || typeof props.content !== "string")
    throw new TypeError("Public window markup requires a title and content.");
  return { ...props, title: props.title, content: props.content };
}

function navigationLink(value: unknown): PublicNavigationProps["links"][number] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("label" in value) ||
    typeof value.label !== "string" ||
    !("href" in value) ||
    typeof value.href !== "string"
  )
    throw new TypeError("Public navigation links require a label and URL.");
  return { ...value, label: value.label, href: value.href };
}

function navigationProps(props: Record<string, unknown>): PublicNavigationProps {
  if (
    typeof props.label !== "string" ||
    typeof props.brandLabel !== "string" ||
    typeof props.brandHref !== "string" ||
    !Array.isArray(props.links)
  )
    throw new TypeError("Public navigation markup requires labels, a brand URL and links.");
  return {
    ...props,
    label: props.label,
    brandLabel: props.brandLabel,
    brandHref: props.brandHref,
    links: props.links.map(navigationLink),
  };
}

/** Cursor variables for the page stylesheet; fragments omit them so each one stays small. */
export function publicCursorVariables(artworkUrl: (svg: string) => string) {
  return cursorScopeStyle({ theme: macintoshTheme, artworkUrl }) as Record<string, string>;
}

export async function preparePublicUi() {
  const themes = {
    [UiColorScheme.Light]: await loadUiThemeSnapshot(UiColorScheme.Light, macintoshTheme),
    [UiColorScheme.Dark]: await loadUiThemeSnapshot(UiColorScheme.Dark, macintoshTheme),
  };
  return (
    kind:
      | "window"
      | "not-found"
      | "icon"
      | "image"
      | "navigation"
      | "button"
      | "rich-text"
      | "article-diagram"
      | "index"
      | "page"
      | "reader"
      | "showcase-page"
      | "site-footer"
      | "features"
      | "status",
    props: Record<string, unknown>,
    appearance: "light" | "dark" = "light",
  ) => {
    const colorScheme = appearance === "dark" ? UiColorScheme.Dark : UiColorScheme.Light;
    const content =
      kind === "showcase-page" ? (
        <ScrollArea
          target={ScrollAreaTarget.Page}
          scrollbarRendering={ScrollbarRendering.Browser}
          aria-label={props.language === "zh-CN" ? "页面滚动" : "Page scroll"}
        >
          <div
            className={showcaseStyles.page}
            data-growth-desktop
            data-showcase-static-page
            data-ui-desktop-pattern={PatternId.MacOS8BlueCord}
            lang={String(props.language)}
          >
            <ShowcaseStaticHeader language={props.language as "en" | "zh-CN"} />
            <main>
              <ShowcaseStaticHero language={props.language as "en" | "zh-CN"} />
              <ShowcaseStoryContent language={props.language as "en" | "zh-CN"} />
            </main>
            <PublicFooter language={String(props.language)} />
          </div>
        </ScrollArea>
      ) : kind === "reader" ? (
        <PublicReaderScroll {...(props as Parameters<typeof PublicReaderScroll>[0])} />
      ) : kind === "image" ? (
        <PublicImage {...publicImageProps(props)} />
      ) : kind === "features" ? (
        <FeatureDirectory {...(props as Parameters<typeof FeatureDirectory>[0])} />
      ) : kind === "site-footer" ? (
        <PublicFooter {...(props as Parameters<typeof PublicFooter>[0])} />
      ) : kind === "article-diagram" ? (
        <PublicArticleDiagram {...(props as Parameters<typeof PublicArticleDiagram>[0])} />
      ) : kind === "not-found" ? (
        <PublicNotFound {...(props as Parameters<typeof PublicNotFound>[0])} />
      ) : kind === "status" ? (
        <PublicStatus {...(props as Parameters<typeof PublicStatus>[0])} />
      ) : kind === "page" ? (
        <ScrollArea
          target={ScrollAreaTarget.Page}
          scrollbarRendering={ScrollbarRendering.Browser}
          aria-label={props.language === "zh-CN" ? "页面滚动" : "Page scroll"}
        >
          <PublicHtml html={String(props.content)} />
        </ScrollArea>
      ) : kind === "rich-text" ? (
        <PublicRichText {...(props as Parameters<typeof PublicRichText>[0])} />
      ) : kind === "index" ? (
        <PublicIndex {...(props as Parameters<typeof PublicIndex>[0])} />
      ) : kind === "window" ? (
        <PublicWindow {...windowProps(props)} />
      ) : kind === "icon" ? (
        <PublicIcon {...(props as Parameters<typeof PublicIcon>[0])} />
      ) : kind === "button" ? (
        <PublicButton {...(props as Parameters<typeof PublicButton>[0])} />
      ) : (
        <PublicNavigation {...navigationProps(props)} />
      );
    const scope = (
      <DesktopProvider
        manager={
          new DesktopManager(undefined, {
            appearance: appearance === "dark" ? DesktopAppearance.Dark : DesktopAppearance.Light,
          })
        }
        theme={macintoshTheme}
        language={typeof props.language === "string" ? props.language : "en"}
        initialTheme={themes[colorScheme]}
        preloadArtwork={false}
        scope={kind === "page" || kind === "showcase-page"}
        cursorVariables={false}
      >
        {content}
      </DesktopProvider>
    );
    const identifierPrefix = `public-${kind}-${String(props.label ?? "").replace(/[^a-z0-9]/gi, "-")}-`;
    return renderToString(
      kind === "index" ||
        kind === "navigation" ||
        kind === "site-footer" ||
        kind === "features" ||
        kind === "article-diagram" ? (
        <div
          style={{ display: "contents" }}
          data-public-island={kind}
          data-public-props={JSON.stringify(props)}
          data-public-identifier={identifierPrefix}
        >
          {scope}
        </div>
      ) : (
        scope
      ),
      { identifierPrefix },
    );
  };
}
