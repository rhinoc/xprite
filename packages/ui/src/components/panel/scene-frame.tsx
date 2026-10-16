import type { CSSProperties, ReactNode, RefObject } from "react";

import { useThemeText } from "$/base/theme/text-metrics";
import { useTheme } from "$/base/theme/theme-context";
import { ThemePart } from "$/base/theme/theme-part";
import { FontRole } from "$/base/theme/theme-types";
import {
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import { ScrollArea } from "$/components/scrollbar";
import { Text, TextVariant } from "$/components/text";
import { windowMetrics } from "$/components/window/metrics";

import styles from "$/components/panel/scene-frame.module.css";

export enum OverlayContentLayout {
  Positioned = "positioned",
  Flow = "flow",
}

export enum ScenePanelSkin {
  Window = "window",
  Popup = "popup",
}

export interface ScenePanelFrameProps {
  skin: ScenePanelSkin;
  bounds: SurfaceBounds;
  clientBounds: SurfaceBounds;
  clientLayoutBounds?: SurfaceBounds;
  viewport: SurfaceViewport;
  label: string;
  clientOverflow?: CSSProperties["overflow"];
  contentLayout?: OverlayContentLayout;
  scrollX?: boolean;
  scrollY?: boolean;
  viewportRef?: RefObject<HTMLDivElement>;
  /** Proxy icon drawn immediately before the centered window title. */
  titleIcon?: ReactNode;
  /** Background window: no title-bar stripes and a muted title, as in classic Mac OS. */
  inactive?: boolean;
  children?: ReactNode;
}

const TITLE_ICON_SIZE = 16;
const TITLE_ICON_GAP = 4;

/** Theme artwork and client layout without floating placement or dialog behavior. */
export function ScenePanelFrame({
  skin,
  bounds,
  clientBounds,
  clientLayoutBounds = clientBounds,
  viewport,
  label,
  clientOverflow = skin === ScenePanelSkin.Popup ? "auto" : "hidden",
  contentLayout = OverlayContentLayout.Positioned,
  scrollX,
  scrollY,
  viewportRef,
  titleIcon,
  inactive = false,
  children,
}: ScenePanelFrameProps) {
  const { definition: theme } = useTheme();
  const { measureThemeText } = useThemeText();
  const layout = surfaceLayout(bounds, viewport);
  const clientLayout = surfaceLayout(clientLayoutBounds, viewport);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const isWindow = skin === ScenePanelSkin.Window;
  const iconWidth = titleIcon ? TITLE_ICON_SIZE + TITLE_ICON_GAP : 0;
  const titleBorder = theme.parts.window.surface?.borderWidth ?? windowMetrics.border;
  const titleBarHeight = theme.parts.window.surface?.titlebar?.height ?? windowMetrics.titlebar;
  const titleLeft = theme.dimensions.window_title_centered
    ? Math.floor(
        (bounds.width -
          iconWidth -
          measureThemeText(
            label,
            FontRole.Primary,
            RASTER_SCALE,
            theme.typography[FontRole.Primary].titleCjkAdvance,
          )) /
          2,
      ) -
      (theme.dimensions.window_title_padding ?? 0) +
      iconWidth
    : undefined;
  // Themes that center the title with CSS (50% and translateX(-50%)) get the proxy icon placed
  // from the measured text width instead.
  const titleTextWidth = titleIcon
    ? measureThemeText(
        label,
        FontRole.Primary,
        RASTER_SCALE,
        theme.typography[FontRole.Primary].titleCjkAdvance,
      )
    : 0;
  const padding = theme.dimensions.window_title_padding ?? 0;
  const cssPadding = 7;
  const iconLeft =
    titleLeft !== undefined
      ? titleLeft - iconWidth
      : `calc(var(--ui-window-title-offset, 0px) - ${(titleTextWidth + cssPadding * 2 + iconWidth) / 2}px)`;
  const textLeft =
    titleLeft ??
    (iconWidth
      ? `calc(var(--ui-window-title-offset, 0px) + ${iconWidth / 2}px)`
      : "var(--ui-window-title-offset, 0px)");
  return (
    <>
      <span aria-hidden="true" className={styles.artwork}>
        <span
          className={styles.artworkScale}
          style={{
            width: bounds.width,
            height: bounds.height,
            transform: `scale(${layout.width / bounds.width}, ${layout.height / bounds.height})`,
          }}
        >
          <ThemePart
            part={isWindow ? "window" : "menu"}
            scale={2}
            drawCenter={isWindow}
            className={styles.skin}
            style={{
              position: "absolute",
              inset: 0,
              width: bounds.width,
              height: bounds.height,
              background: theme.colors.window_face,
            }}
          />
          {isWindow && inactive && (
            <span
              className={styles.inactiveBar}
              style={{
                left: titleBorder,
                top: titleBorder,
                width: bounds.width - titleBorder * 2,
                height: titleBarHeight - titleBorder,
                background: theme.colors.window_face,
              }}
            />
          )}
          {isWindow && titleIcon && (
            <span className={styles.title}>
              <span
                className={styles.titleIcon}
                style={{
                  left: iconLeft,
                  width: iconWidth + padding,
                  paddingLeft: padding || TITLE_ICON_GAP,
                  opacity: inactive ? 0.5 : undefined,
                }}
              >
                {titleIcon}
              </span>
            </span>
          )}
          {isWindow && (
            <span className={styles.title}>
              <Text
                variant={TextVariant.PositionedPixel}
                titleCjk
                text={label}
                x={0}
                y={0}
                color={
                  inactive
                    ? (theme.colors.menuitem_disabled_text ?? "#808080")
                    : theme.colors.window_titlebar_text
                }
                style={{
                  background: "var(--ui-window-title-background, transparent)",
                  left: textLeft,
                  transform: theme.dimensions.window_title_centered
                    ? "none"
                    : "var(--ui-window-title-transform, none)",
                  padding: "var(--ui-window-title-padding, 0px)",
                }}
              />
            </span>
          )}
        </span>
      </span>
      <ScrollArea
        className={styles.client}
        aria-label={label}
        viewport={viewport}
        viewportRef={viewportRef}
        contentClassName={
          contentLayout === OverlayContentLayout.Positioned ? styles.contentPlane : undefined
        }
        contentStyle={
          contentLayout === OverlayContentLayout.Positioned
            ? {
                width: clientBounds.width * sx,
                height: clientBounds.height * sy,
                minWidth: 0,
                minHeight: 0,
              }
            : undefined
        }
        scrollX={scrollX ?? (clientOverflow === "auto" || clientOverflow === "scroll")}
        scrollY={scrollY ?? (clientOverflow === "auto" || clientOverflow === "scroll")}
        viewportProps={{
          "data-window-client": isWindow ? "" : undefined,
          "data-ui-window-client": !isWindow ? "" : undefined,
        }}
        style={{
          left: clientLayout.left - layout.left,
          top: clientLayout.top - layout.top,
          width: clientLayout.width,
          height: clientLayout.height,
        }}
      >
        {contentLayout === OverlayContentLayout.Flow ? (
          <div className={styles.contentPlane} style={{ width: "100%" }}>
            {children}
          </div>
        ) : (
          children
        )}
      </ScrollArea>
    </>
  );
}
