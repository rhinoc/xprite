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
  children?: ReactNode;
}

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
  children,
}: ScenePanelFrameProps) {
  const { definition: theme } = useTheme();
  const { measureThemeText } = useThemeText();
  const layout = surfaceLayout(bounds, viewport);
  const clientLayout = surfaceLayout(clientLayoutBounds, viewport);
  const sx = viewport.width / viewport.sceneWidth;
  const sy = viewport.height / viewport.sceneHeight;
  const isWindow = skin === ScenePanelSkin.Window;
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
          {isWindow && (
            <span className={styles.title}>
              <Text
                variant={TextVariant.PositionedPixel}
                titleCjk
                text={label}
                x={0}
                y={0}
                color={theme.colors.window_titlebar_text}
                style={{
                  background: "var(--ui-window-title-background, transparent)",
                  left: theme.dimensions.window_title_centered
                    ? Math.floor(
                        (bounds.width -
                          measureThemeText(
                            label,
                            FontRole.Primary,
                            RASTER_SCALE,
                            theme.typography[FontRole.Primary].titleCjkAdvance,
                          )) /
                          2,
                      ) - (theme.dimensions.window_title_padding ?? 0)
                    : "var(--ui-window-title-offset, 0px)",
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
