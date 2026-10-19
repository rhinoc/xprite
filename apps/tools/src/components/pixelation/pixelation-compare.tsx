import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import {
  clampSplit,
  resultClipLeft,
  splitFromKey,
  splitFromPointer,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_START,
} from "$/components/pixelation/compare-split";
import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { ToolCanvasPane } from "$/components/shared/tool-result-window";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import { useToolTranslation } from "$/managers/locale/tool-language";
import type { ToolViewport } from "$/managers/preview/tool-viewport";
import { CanvasSurface, ScrollbarStyle, ScrollbarThumb, type CanvasPixelSource } from "@xprite/ui";
import { useUiChecker } from "@xprite/ui/assets";
import { clientPoint, clientRect } from "@xprite/ui/utils";

import styles from "$/components/pixelation/pixelation-compare.module.css";

/**
 * Original and result in one preview. Both layers share the original's coordinate space, zoom and
 * pan; the result is drawn crisp (nearest neighbour) from the divider to the right edge. The pixelate
 * and bead tools both use it: they name their result and may draw their own marks over it.
 */
export function PixelationCompare({
  navigation,
  identity,
  source,
  result,
  preparing,
  resultName,
  resultImageLabel,
  status,
  resultOverlay,
}: {
  navigation: ToolViewport;
  identity: number;
  source: CanvasPixelSource;
  result: CanvasPixelSource | null;
  preparing: boolean;
  /** Translated name of the right-hand layer ("Pixelated", "Restored", "Bead pattern"). */
  resultName: string;
  resultImageLabel: string;
  /** A transient message of the owning tool (progress, failures); no size label otherwise. */
  status?: string;
  /** Marks drawn over the result layer only, in that layer's pixel size. */
  resultOverlay?: (size: { width: number; height: number }) => ReactNode;
}) {
  const t = useToolTranslation();
  const checker = useUiChecker();
  const [split, setSplit] = useState(SPLIT_START);
  const [hot, setHot] = useState(false);
  const dragging = useRef<number | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const move = (event: PointerEvent<HTMLElement>) => {
    const rect = clientRect(event.currentTarget.parentElement);
    const next = rect ? splitFromPointer(clientPoint(event).x, rect) : null;
    if (next !== null) setSplit(next);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = splitFromKey(split, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setSplit(next);
  };
  return (
    <ToolCanvasPane status={status} controls={<ToolZoomControl navigation={navigation} />}>
      <ToolCanvasPreview
        navigation={navigation}
        identity={identity}
        pixels={source}
        label="Original image"
        navigationLabel="Comparison"
        overlay={(view) => {
          const layer = {
            left: view.origin.x,
            top: view.origin.y,
            width: source.width * view.zoom,
            height: source.height * view.zoom,
          };
          return (
            <div className={styles.overlay}>
              {result && (
                <CanvasSurface
                  pixels={result}
                  checker={checker}
                  bounds={{ x: 0, y: 0, width: result.width, height: result.height }}
                  aria-label={resultImageLabel}
                  className={styles.layer}
                  style={{
                    ...layer,
                    clipPath: `inset(0 0 0 ${resultClipLeft(split, view.size.width, layer)}px)`,
                  }}
                />
              )}
              {result && resultOverlay && (
                <div
                  className={styles.marks}
                  style={{
                    ...layer,
                    clipPath: `inset(0 0 0 ${resultClipLeft(split, view.size.width, layer)}px)`,
                  }}
                >
                  {resultOverlay(layer)}
                </div>
              )}
              {result ? (
                <>
                  <div className={styles.tags} style={{ left: `${clampSplit(split)}%` }}>
                    <span className={`${styles.tag} ${styles.tagOriginal}`}>{t("Original")}</span>
                    <span className={`${styles.tag} ${styles.tagResult}`}>{resultName}</span>
                  </div>
                  <div
                    ref={handle}
                    className={styles.divider}
                    style={{ left: `${clampSplit(split)}%` }}
                    role="slider"
                    tabIndex={0}
                    aria-label={t("Drag to compare original and result")}
                    aria-valuemin={SPLIT_MIN}
                    aria-valuemax={SPLIT_MAX}
                    aria-valuenow={Math.round(split)}
                    onKeyDown={onKey}
                    onPointerEnter={() => setHot(true)}
                    onPointerLeave={() => setHot(false)}
                    onFocus={() => setHot(true)}
                    onBlur={() => setHot(false)}
                    onPointerDown={(event) => {
                      if (!event.isPrimary || (event.button !== 0 && event.pointerType === "mouse"))
                        return;
                      // Handled here: the pan surface ignores a pointer-down that is already used.
                      event.preventDefault();
                      handle.current?.focus({ preventScroll: true });
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragging.current = event.pointerId;
                      move(event);
                    }}
                    onPointerMove={(event) => {
                      if (dragging.current === event.pointerId) move(event);
                    }}
                    onPointerUp={(event) => {
                      if (dragging.current === event.pointerId) dragging.current = null;
                    }}
                    onPointerCancel={() => {
                      dragging.current = null;
                    }}
                    onLostPointerCapture={() => {
                      dragging.current = null;
                    }}
                  >
                    <ScrollbarThumb
                      scrollbarStyle={ScrollbarStyle.Classic}
                      className={styles.grip}
                      hovered={hot}
                    />
                  </div>
                </>
              ) : (
                <span className={styles.waiting} role="status">
                  {t(preparing ? "Preparing preview…" : "Adjust settings to preview the result.")}
                </span>
              )}
            </div>
          );
        }}
      />
    </ToolCanvasPane>
  );
}
