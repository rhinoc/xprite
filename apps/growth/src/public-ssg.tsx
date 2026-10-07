import { renderToString } from "react-dom/server";

import {
  PublicWindow,
  PublicNavigation,
  PublicIcon,
  PublicButton,
  PublicRichText,
  PublicIndex,
  PublicHtml,
  PublicStatus,
  type PublicWindowProps,
  type PublicNavigationProps,
} from "$/components/public/static-ui";
import {
  ShowcaseStaticHero,
  ShowcaseStoryContent,
} from "$/components/showcase/showcase-story-content";
import { DesktopProvider, DesktopManager } from "@xprite/site-shell";
import { macintoshTheme } from "@xprite/ui";
import { loadUiThemeSnapshot } from "@xprite/ui/assets";

import "$/components/public/desktop.module.css";

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

export async function preparePublicUi() {
  const theme = await loadUiThemeSnapshot("light", macintoshTheme);
  return (
    kind:
      | "window"
      | "icon"
      | "navigation"
      | "button"
      | "showcase-hero"
      | "showcase-stories"
      | "rich-text"
      | "index"
      | "page"
      | "status",
    props: Record<string, unknown>,
  ) => {
    const content =
      kind === "status" ? (
        <PublicStatus {...(props as Parameters<typeof PublicStatus>[0])} />
      ) : kind === "page" ? (
        <PublicHtml html={String(props.content)} />
      ) : kind === "rich-text" ? (
        <PublicRichText {...(props as Parameters<typeof PublicRichText>[0])} />
      ) : kind === "index" ? (
        <PublicIndex {...(props as Parameters<typeof PublicIndex>[0])} />
      ) : kind === "showcase-hero" ? (
        <ShowcaseStaticHero language={props.language as "en" | "zh-CN"} />
      ) : kind === "showcase-stories" ? (
        <ShowcaseStoryContent language={props.language as "en" | "zh-CN"} />
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
        manager={new DesktopManager()}
        theme={macintoshTheme}
        language={typeof props.language === "string" ? props.language : "en"}
        initialTheme={theme}
        preloadArtwork={false}
        scope={kind === "page"}
      >
        {content}
      </DesktopProvider>
    );
    const identifierPrefix = `public-${kind}-${String(props.label ?? "").replace(/[^a-z0-9]/gi, "-")}-`;
    return renderToString(
      kind === "index" || kind === "navigation" ? (
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
