import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { paintTimelineCelArtwork } from "$/timeline/cel-artwork";
import { paintTimelineThumbnail } from "$/timeline/cel-thumbnail";
import { paintTimelineFrameArtwork } from "$/timeline/frame-artwork";
import { asepriteLayerRows } from "$/timeline/layer-artwork";
import { ReadOnlyLayerRow } from "$/timeline/layer-row";
import { paintTimelineTagArtwork } from "$/timeline/tag-artwork";
import { TIMELINE_TAG_BAND_HEIGHT, useTimelineTagBands } from "$/timeline/tag-bands";
import { workingColorProfile } from "@xprite/editor-core/color";
import { timelineTags, type SpriteTimeline } from "@xprite/editor-core/timeline";
import { CanvasSurface, ScrollArea, useUi } from "@xprite/ui";
import { getUiChecker, measureUiText, paintUiPart, useUiAssets } from "@xprite/ui/assets";
import {
  clientDeltaToLocal,
  layoutSize,
  observeElementSize,
  scrollBy,
  scrollPosition,
  setScrollPosition,
} from "@xprite/ui/utils";

import styles from "$/timeline/timeline.module.css";

const FRAME_WIDTH = 80;
const ROW_HEIGHT = 80;
const FRAME_HEADER_HEIGHT = 24;
const FIRST_FRAME = 1;
const OVERSCAN = 1;
const INITIAL_WIDTH = 1;
const INITIAL_LAYER_WIDTH = 240;
const TAG_LABEL_INSET = 6;
const TAG_LABEL_TOP = 12;
const TAG_LABEL_PADDING = 8;
const TAG_LABEL_HEIGHT = 18;
const ARTWORK_SCALE = 2;

export interface ReadOnlyTimelineProps {
  timeline: SpriteTimeline;
  identity: number;
  frame: number;
  selectedTag?: number;
  selectedLayer: number;
  onFrame: (frame: number) => void;
  onStepFrame: (direction: number) => void;
  onPlayback: () => void;
  onTag: (index: number) => void;
  onLayer: (index: number) => void;
  onVisible: (index: number) => void;
  onCollapsed: (index: number) => void;
  visibilityDisabled?: (index: number) => boolean;
}

/** Shared editor artwork with read-only inspection callbacks and synchronized layer rows. */
export function ReadOnlyTimeline({
  timeline,
  identity,
  frame,
  selectedTag = -1,
  selectedLayer,
  onFrame,
  onStepFrame,
  onPlayback,
  onTag,
  onLayer,
  onVisible,
  onCollapsed,
  visibilityDisabled,
}: ReadOnlyTimelineProps) {
  const assets = useUiAssets();
  const { style: theme } = useUi();
  const gridSurface = theme.parts.timeline_normal.surface;
  const selectionBorderPart = assets?.style.controlParts?.timeline?.selectionBorderPart;
  const layerViewport = useRef<HTMLDivElement>(null);
  const layers = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(INITIAL_WIDTH);
  const [layerWidth, setLayerWidth] = useState(INITIAL_LAYER_WIDTH);
  const [visibleHeight, setVisibleHeight] = useState(ROW_HEIGHT);
  const [scroll, setScroll] = useState(0);
  const [verticalScroll, setVerticalScroll] = useState(0);
  const tags = timelineTags(timeline);
  const measureText = useCallback(
    (text: string) => measureUiText(text, "default", ARTWORK_SCALE, assets?.style.typography),
    [assets],
  );
  const bands = useTimelineTagBands(tags, identity, FRAME_WIDTH, measureText);
  const tagHeight = tags.length ? bands.height : 0;
  const headerHeight = tagHeight + FRAME_HEADER_HEIGHT;
  const rows = asepriteLayerRows(timeline);
  const height = headerHeight + rows.length * ROW_HEIGHT;
  const horizontalGutter =
    timeline.frames.length * FRAME_WIDTH > width
      ? theme.dimensions.mini_scrollbar_size * ARTWORK_SCALE
      : 0;
  const dockHeight = height + horizontalGutter;
  const first = Math.max(0, Math.floor(scroll / FRAME_WIDTH) - OVERSCAN);
  const last = Math.min(
    timeline.frames.length,
    Math.ceil((scroll + width) / FRAME_WIDTH) + OVERSCAN,
  );
  const entries = Array.from({ length: Math.max(0, last - first) }, (_, offset) => first + offset);
  const canvasHeight = Math.min(height, visibleHeight);
  const scrollY = Math.min(verticalScroll, Math.max(0, height - canvasHeight));
  const firstRow = Math.max(0, Math.floor((scrollY - headerHeight) / ROW_HEIGHT) - OVERSCAN);
  const lastRow = Math.min(
    rows.length,
    Math.ceil((scrollY + visibleHeight - headerHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleRows = rows.slice(firstRow, Math.max(firstRow, lastRow));
  useEffect(() => {
    if (!viewport.current || !layers.current) return;
    const stopFrames = observeElementSize(viewport.current, (size) => {
      setWidth(Math.max(INITIAL_WIDTH, Math.floor(size.width)));
      setVisibleHeight(size.height);
    });
    const stopLayers = observeElementSize(layers.current, (size) =>
      setLayerWidth(Math.floor(size.width)),
    );
    return () => {
      stopFrames();
      stopLayers();
    };
  }, []);
  useEffect(() => {
    if (viewport.current) setScrollPosition(viewport.current, { x: 0, y: 0 });
    if (layerViewport.current) setScrollPosition(layerViewport.current, { y: 0 });
    setScroll(0);
    setVerticalScroll(0);
  }, [identity]);
  useEffect(() => {
    if (!viewport.current) return;
    const left = frame * FRAME_WIDTH;
    const current = scrollPosition(viewport.current).x;
    if (left < current) setScrollPosition(viewport.current, { x: left });
    else if (left + FRAME_WIDTH > current + width)
      setScrollPosition(viewport.current, { x: left + FRAME_WIDTH - width });
  }, [identity, frame, width]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.deltaX) return;
      // Preserve vertical inspection; a plain wheel navigates frames when rows fit.
      if (!event.shiftKey && height > layoutSize(node).height) return;
      const delta = clientDeltaToLocal(node, { x: event.deltaY, y: 0 });
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? FRAME_HEADER_HEIGHT
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? width
            : 1;
      event.preventDefault();
      scrollBy(node, { x: delta.x * unit });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [height, width]);
  return (
    <div
      className={styles.dock}
      style={
        {
          height: `min(${dockHeight}px, 30svh, 280px)`,
          background: theme.colors.workspace,
          "--timeline-grid-edge": `${gridSurface?.borderWidth ?? 0}px`,
          "--timeline-grid-ink": gridSurface ? theme.colors[gridSurface.borderRole] : "transparent",
        } as CSSProperties
      }
    >
      <div
        ref={layerViewport}
        className={styles.layerViewport}
        style={{ height: visibleHeight }}
        role="region"
        tabIndex={0}
        aria-label="Layers"
        onScroll={(event) => {
          const y = scrollPosition(event.currentTarget).y;
          setVerticalScroll(y);
          if (viewport.current) setScrollPosition(viewport.current, { y });
        }}
      >
        <div ref={layers} className={styles.layers} style={{ height }}>
          {tagHeight > 0 && (
            <div
              className={styles.tagSpacer}
              style={{
                height: tagHeight,
                transform: `translateY(${scrollY}px)`,
                background: theme.colors.workspace,
              }}
              aria-hidden="true"
            />
          )}
          <div
            className={styles.layerHeader}
            style={{
              top: tagHeight,
              height: FRAME_HEADER_HEIGHT,
              transform: `translateY(${scrollY}px)`,
            }}
          >
            <CanvasSurface
              className={styles.headerSkin}
              bounds={{ x: 0, y: 0, width: layerWidth, height: FRAME_HEADER_HEIGHT }}
              dependencies={[assets, layerWidth]}
              paint={(ctx) => {
                if (assets)
                  paintUiPart(
                    ctx,
                    assets,
                    "timeline_normal",
                    0,
                    0,
                    layerWidth,
                    FRAME_HEADER_HEIGHT,
                  );
              }}
            />
          </div>
          {visibleRows.map(({ index, row }) => (
            <div
              key={index}
              className={styles.layerSlot}
              style={{ top: headerHeight + row * ROW_HEIGHT }}
            >
              <ReadOnlyLayerRow
                timeline={timeline}
                index={index}
                width={layerWidth}
                height={ROW_HEIGHT}
                selected={selectedLayer === index}
                visibilityDisabled={visibilityDisabled?.(index)}
                onSelect={onLayer}
                onVisible={onVisible}
                onCollapsed={onCollapsed}
              />
            </div>
          ))}
        </div>
      </div>
      <ScrollArea
        viewportRef={viewport}
        className={styles.timeline}
        viewportProps={{
          role: "region",
          tabIndex: 0,
          "aria-label": "Animation timeline",
          onScroll: (event) => {
            const position = scrollPosition(event.currentTarget);
            setScroll(position.x);
            setVerticalScroll(position.y);
            if (layerViewport.current) setScrollPosition(layerViewport.current, { y: position.y });
          },
          onKeyDown: (event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onStepFrame(event.key === "ArrowLeft" ? -FIRST_FRAME : FIRST_FRAME);
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              onFrame(event.key === "Home" ? 0 : timeline.frames.length - FIRST_FRAME);
            } else if (event.key === " " && event.target === event.currentTarget) {
              event.preventDefault();
              if (!event.repeat) onPlayback();
            }
          },
        }}
      >
        <div
          className={styles.scrollPlane}
          style={{ width: Math.max(width, timeline.frames.length * FRAME_WIDTH), height }}
        >
          <CanvasSurface
            className={styles.surface}
            style={{ transform: `translateY(${scrollY}px)` }}
            bounds={{ x: 0, y: 0, width, height: canvasHeight }}
            dependencies={[
              assets,
              timeline,
              selectedLayer,
              frame,
              scroll,
              scrollY,
              bands.bands,
              width,
              canvasHeight,
            ]}
            paint={(ctx) => {
              if (!assets) return;
              ctx.fillStyle = assets.style.colors.workspace;
              ctx.fillRect(0, 0, width, canvasHeight);
              const lastFrameEnd = Math.max(
                0,
                Math.min(width, timeline.frames.length * FRAME_WIDTH - scroll),
              );
              if (lastFrameEnd < width)
                paintUiPart(
                  ctx,
                  assets,
                  "timeline_padding_tr",
                  lastFrameEnd,
                  tagHeight,
                  width - lastFrameEnd,
                  height - tagHeight,
                );
              tags.forEach((tag, index) => {
                const y = bands.row(index) * TIMELINE_TAG_BAND_HEIGHT;
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, y, width, TIMELINE_TAG_BAND_HEIGHT);
                ctx.clip();
                paintTimelineTagArtwork(ctx, assets, {
                  tag,
                  x: tag.from * FRAME_WIDTH - scroll,
                  y,
                  width: (tag.to - tag.from + 1) * FRAME_WIDTH,
                });
                ctx.restore();
              });
              const headerEdge = assets.style.parts.timeline_normal.surface?.borderWidth ?? 0;
              if (tagHeight > 0 && headerEdge)
                paintUiPart(
                  ctx,
                  assets,
                  "timeline_normal",
                  0,
                  tagHeight - headerEdge,
                  width,
                  headerEdge,
                  { drawCenter: false },
                );
              for (const index of entries)
                paintTimelineFrameArtwork(ctx, assets, {
                  x: index * FRAME_WIDTH - scroll,
                  y: tagHeight,
                  width: FRAME_WIDTH,
                  height: FRAME_HEADER_HEIGHT,
                  label: String(index + FIRST_FRAME),
                  selected: index === frame,
                });
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, headerHeight, width, Math.max(0, canvasHeight - headerHeight));
              ctx.clip();
              for (const { layer, index: layerIndex, row } of visibleRows)
                for (const index of entries) {
                  const cel = timeline.frames[index].cels[layerIndex] ?? null;
                  paintTimelineCelArtwork(ctx, assets, {
                    cel,
                    leftCel: timeline.frames[index - 1]?.cels[layerIndex] ?? null,
                    rightCel: timeline.frames[index + 1]?.cels[layerIndex] ?? null,
                    group: layer.kind === "group",
                    x: index * FRAME_WIDTH - scroll,
                    y: headerHeight + row * ROW_HEIGHT - scrollY,
                    width: FRAME_WIDTH,
                    height: ROW_HEIGHT,
                    selected: layerIndex === selectedLayer && index === frame,
                    active: layerIndex === selectedLayer || index === frame,
                  });
                  if (cel && layer.kind !== "group")
                    paintTimelineThumbnail(
                      ctx,
                      cel,
                      workingColorProfile(timeline),
                      index * FRAME_WIDTH - scroll,
                      headerHeight + row * ROW_HEIGHT - scrollY,
                      FRAME_WIDTH,
                      ROW_HEIGHT,
                      true,
                      true,
                      {
                        checker: getUiChecker(assets),
                        inset: assets.style.controlParts?.timeline?.thumbnailInset,
                      },
                    );
                }
              ctx.restore();
            }}
          />
          {tags.map((tag, index) => (
            <button
              key={`tag-${index}`}
              className={`${styles.hit} ${styles.headerHit}`}
              style={{
                left: tag.from * FRAME_WIDTH + TAG_LABEL_INSET,
                top: bands.row(index) * TIMELINE_TAG_BAND_HEIGHT + TAG_LABEL_TOP + scrollY,
                width: Math.max(FRAME_WIDTH, measureText(tag.name) + TAG_LABEL_PADDING),
                height: TAG_LABEL_HEIGHT,
              }}
              type="button"
              aria-label={`Tag ${tag.name}`}
              title={`${tag.name} · ${tag.from + FIRST_FRAME}–${tag.to + FIRST_FRAME}`}
              aria-pressed={selectedTag === index}
              onClick={() => onTag(index)}
            />
          ))}
          {entries.map((index) => (
            <button
              key={`frame-${index}`}
              className={`${styles.hit} ${styles.headerHit}`}
              style={{
                left: index * FRAME_WIDTH,
                top: tagHeight + scrollY,
                width: FRAME_WIDTH,
                height: FRAME_HEADER_HEIGHT,
              }}
              type="button"
              aria-label={`Frame ${index + FIRST_FRAME}`}
              title={`Frame ${index + FIRST_FRAME} · ${timeline.frames[index].duration} ms`}
              aria-pressed={index === frame}
              onClick={() => onFrame(index)}
            />
          ))}
          {visibleRows.flatMap(({ layer, index: layerIndex, row }) =>
            entries.map((index) => (
              <button
                key={`${layerIndex}-${index}`}
                className={styles.hit}
                style={{
                  left: index * FRAME_WIDTH,
                  top: headerHeight + row * ROW_HEIGHT,
                  clipPath: `inset(${Math.max(0, scrollY - row * ROW_HEIGHT)}px 0 0 0)`,
                  width: FRAME_WIDTH,
                  height: ROW_HEIGHT,
                }}
                type="button"
                aria-label={`${layer.name}, frame ${index + FIRST_FRAME}`}
                aria-pressed={selectedLayer === layerIndex && frame === index}
                onClick={() => {
                  onLayer(layerIndex);
                  onFrame(index);
                }}
              />
            )),
          )}
        </div>
      </ScrollArea>
      {assets && selectionBorderPart && (
        <CanvasSurface
          className={styles.selectionSurface}
          bounds={{ x: 0, y: 0, width: layerWidth + width, height: canvasHeight }}
          dependencies={[
            assets,
            timeline,
            selectedLayer,
            frame,
            scroll,
            scrollY,
            layerWidth,
            width,
            canvasHeight,
            headerHeight,
          ]}
          paint={(ctx) => {
            const part = selectionBorderPart;
            const edge = assets.style.parts[part].surface?.borderWidth ?? 0;
            if (!edge) return;
            const paintBorder = (x: number, y: number, boxWidth: number, boxHeight: number) => {
              if (x + boxWidth <= 0 || y + boxHeight <= 0) return;
              // Each cell owns its right/bottom edges. Top/left belong to its neighbors.
              const left = Math.max(0, x - edge);
              const top = Math.max(0, y - edge);
              paintUiPart(ctx, assets, part, left, top, x + boxWidth - left, y + boxHeight - top, {
                drawCenter: false,
              });
            };
            const frameX = layerWidth + frame * FRAME_WIDTH - scroll;
            const selectedRow = rows.find(({ index }) => index === selectedLayer);
            ctx.save();
            ctx.beginPath();
            ctx.rect(
              layerWidth - edge,
              Math.max(0, tagHeight - edge),
              width + edge,
              FRAME_HEADER_HEIGHT + edge,
            );
            ctx.clip();
            paintBorder(frameX, tagHeight, FRAME_WIDTH, FRAME_HEADER_HEIGHT);
            ctx.restore();
            if (!selectedRow) return;
            const rowY = headerHeight + selectedRow.row * ROW_HEIGHT - scrollY;
            ctx.save();
            ctx.beginPath();
            ctx.rect(
              0,
              headerHeight - edge,
              layerWidth + width,
              Math.max(0, canvasHeight - headerHeight + edge),
            );
            ctx.clip();
            paintBorder(0, rowY, layerWidth, ROW_HEIGHT);
            ctx.save();
            ctx.beginPath();
            ctx.rect(
              layerWidth - edge,
              headerHeight - edge,
              width + edge,
              Math.max(0, canvasHeight - headerHeight + edge),
            );
            ctx.clip();
            paintBorder(frameX, rowY, FRAME_WIDTH, ROW_HEIGHT);
            ctx.restore();
            ctx.restore();
          }}
        />
      )}
    </div>
  );
}
