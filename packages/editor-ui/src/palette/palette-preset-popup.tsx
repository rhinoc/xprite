import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PaletteBrowserChoice, PaletteTranslate } from "$/palette/model";
import type { Rgba } from "@xprite/editor-core/base";
import {
  createUiPortal,
  Popover,
  type PopoverContext,
  Button,
  Icon,
  Input,
  Text,
  TextVariant,
  Scrollbar,
  CanvasSurface,
  FontRole,
  ScrollbarStyle,
  type SurfaceBounds,
} from "@xprite/ui";
import {
  uiFontHeight,
  paintUiIcon,
  paintUiPart,
  paintUiText,
  useUiAssets,
} from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";

import "$/palette/palette-preset-popup.module.css";
import { measurePopoverAnchor } from "@xprite/ui/popover";
import { clientDeltaToSurface } from "@xprite/ui/utils";
const identity: PaletteTranslate = (source, values) =>
  Object.entries(values ?? {}).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    source,
  );

interface PalettePresetPopupProps {
  choices: readonly PaletteBrowserChoice[];
  activePalette: readonly Rgba[];
  hasDocument: boolean;
  onLoad: (palette: readonly Rgba[], choice: PaletteBrowserChoice) => void;
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  translate?: PaletteTranslate;
  maxColors?: number;
  disabled?: boolean;
  requireVisibleColors?: boolean;
  onRefresh: () => void;
  onOpenFolder?: (choice: PaletteBrowserChoice) => void;
}

const ROW_HEIGHT = 40;
const SCROLLBAR_SIZE = 12;
const SCROLLBAR_INSET = 7;
const SCROLLBAR_WIDTH = SCROLLBAR_SIZE + SCROLLBAR_INSET;
const PIXEL_WHEEL_SCROLL_MULTIPLIER = 2;
const REFRESH_BUTTON_WIDTH = 32;

function samePalette(a: readonly Rgba[], b: readonly Rgba[]) {
  return (
    a.length === b.length &&
    a.every((color, index) => color.every((channel, i) => channel === b[index][i]))
  );
}

function PaletteResourceList({
  client,
  bounds,
  choices,
  currentPalette,
  selectedId,
  onSelect,
  onLoad,
  translate,
}: {
  client: SurfaceBounds;
  bounds: SurfaceBounds;
  choices: readonly PaletteBrowserChoice[];
  currentPalette: readonly Rgba[];
  selectedId: string | null;
  onSelect: (choice: PaletteBrowserChoice) => void;
  onLoad: (choice: PaletteBrowserChoice) => void;
  translate: PaletteTranslate;
}) {
  const assets = useUiAssets();
  const list = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const activeIndex = choices.findIndex((choice) => choice.id === selectedId);
  const contentHeight = choices.length * ROW_HEIGHT;
  const visibleHeight = Math.max(0, bounds.height - 27);
  const maxScroll = Math.max(0, contentHeight - visibleHeight);
  const scroll = Math.max(0, Math.min(maxScroll, scrollTop));
  const first = Math.max(0, Math.floor(scroll / ROW_HEIGHT));
  const last = Math.min(choices.length, Math.ceil((scroll + visibleHeight) / ROW_HEIGHT));
  const contentWidth = Math.max(0, bounds.width - SCROLLBAR_WIDTH);
  useEffect(() => {
    const node = list.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = clientDeltaToSurface(
        node,
        { x: event.deltaX, y: event.deltaY },
        { width: bounds.width, height: bounds.height },
      );
      const scrollDelta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * ROW_HEIGHT
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * visibleHeight
            : delta.y * PIXEL_WHEEL_SCROLL_MULTIPLIER;
      setScrollTop((value) => Math.max(0, Math.min(maxScroll, value + Math.round(scrollDelta))));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [bounds.width, bounds.height, maxScroll, visibleHeight]);
  const paint = useCallback(
    (context: CanvasRenderingContext2D) => {
      if (!assets) return;
      const colors = assets.style.colors;
      paintUiPart(
        context,
        assets,
        "sunken_normal",
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        { fill: colors.window_face, drawCenter: false },
      );
      context.fillStyle = colors.listitem_normal_face;
      context.fillRect(bounds.x + 6, bounds.y + 12, bounds.width - 12, bounds.height - 24);
      context.save();
      context.beginPath();
      context.rect(
        bounds.x + 6,
        bounds.y + 12,
        Math.max(0, contentWidth - 6),
        Math.max(0, bounds.height - 24),
      );
      context.clip();
      for (let index = first; index < last; index++) {
        const choice = choices[index];
        const y = bounds.y + 15 + index * ROW_HEIGHT - scroll;
        const selected = choice.id === selectedId;
        if (selected) {
          context.fillStyle = colors.listitem_selected_face;
          context.fillRect(bounds.x + 6, y, contentWidth - 6, ROW_HEIGHT);
        }
        const ink = selected ? colors.listitem_selected_text : colors.listitem_normal_text;
        if (samePalette(choice.colors, currentPalette))
          paintUiIcon(
            context,
            assets,
            "check_selected",
            bounds.x,
            y + Math.floor((ROW_HEIGHT - 16) / 2),
          );
        paintUiText(
          context,
          assets,
          choice.name,
          bounds.x + 26,
          y + Math.floor((ROW_HEIGHT - uiFontHeight(FontRole.Primary)) / 2) + 1,
          { font: FontRole.Primary, color: ink },
        );
        const chipStart = bounds.x + 22;
        const chipY = y + ROW_HEIGHT - 12 + (index === 0 ? 1 : 0);
        context.save();
        context.beginPath();
        context.rect(chipStart, y, Math.max(0, bounds.x + contentWidth - chipStart), ROW_HEIGHT);
        context.clip();
        for (
          let colorIndex = 0;
          colorIndex < Math.min(choice.colors.length, Math.ceil(contentWidth / 8));
          colorIndex++
        ) {
          const color = choice.colors[colorIndex];
          const x = chipStart + colorIndex * 8;
          context.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
          context.fillRect(x, chipY, 8, 8);
        }
        context.restore();
      }
      context.restore();
    },
    [
      assets,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      choices,
      currentPalette,
      selectedId,
      contentWidth,
      first,
      last,
      scroll,
    ],
  );
  const surface = surfaceLayout(bounds),
    parent = surfaceLayout(client);
  const ensureVisible = (index: number) => {
    const top = index * ROW_HEIGHT;
    setScrollTop((current) =>
      Math.max(
        0,
        Math.min(
          maxScroll,
          top < current
            ? top
            : top + ROW_HEIGHT > current + visibleHeight
              ? top + ROW_HEIGHT - visibleHeight
              : current,
        ),
      ),
    );
  };
  const moveSelection = (direction: number) => {
    if (!choices.length) return;
    const next =
      activeIndex < 0 ? 0 : Math.max(0, Math.min(choices.length - 1, activeIndex + direction));
    onSelect(choices[next]);
    ensureVisible(next);
  };
  return (
    <>
      <div
        role="listbox"
        aria-label={translate("Palettes")}
        aria-activedescendant={selectedId ? `palette-option-${selectedId}` : undefined}
        tabIndex={0}
        className="xse-palette-resource-list"
        style={{
          position: "absolute",
          left: surface.left - parent.left,
          top: surface.top - parent.top,
          width: surface.width,
          height: surface.height,
        }}
        ref={list}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            event.key === "PageDown" ||
            event.key === "PageUp" ||
            event.key === "Home" ||
            event.key === "End"
          ) {
            event.preventDefault();
            event.stopPropagation();
            const delta =
              event.key === "Home"
                ? -choices.length
                : event.key === "End"
                  ? choices.length
                  : event.key === "PageDown"
                    ? Math.max(1, Math.floor(visibleHeight / ROW_HEIGHT))
                    : event.key === "PageUp"
                      ? -Math.max(1, Math.floor(visibleHeight / ROW_HEIGHT))
                      : event.key === "ArrowDown"
                        ? 1
                        : -1;
            moveSelection(delta);
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            const choice = choices[activeIndex];
            if (choice) onLoad(choice);
          }
        }}
      >
        <CanvasSurface
          bounds={bounds}
          paint={paint}
          aria-hidden
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
        {Array.from({ length: last - first }, (_, offset) => {
          const index = first + offset,
            choice = choices[index];
          const row = {
            x: bounds.x + 6,
            y: bounds.y + 15 + index * ROW_HEIGHT - scroll,
            width: contentWidth - 6,
            height: ROW_HEIGHT,
          };
          return (
            <Button
              key={choice.id}
              id={`palette-option-${choice.id}`}
              bounds={row}
              relativeTo={bounds}
              viewport={DEFAULT_SURFACE_VIEWPORT}
              paintArtwork={false}
              role="option"
              aria-label={translate("{value1} ({value2} colors)", {
                value1: choice.name,
                value2: choice.colors.length,
              })}
              aria-selected={choice.id === selectedId}
              tabIndex={-1}
              onClick={() => onSelect(choice)}
              onDoubleClick={() => onLoad(choice)}
            />
          );
        })}
      </div>
      {maxScroll > 0 && (
        <Scrollbar
          bounds={{
            x: bounds.x + bounds.width - SCROLLBAR_WIDTH,
            y: bounds.y + 14,
            width: SCROLLBAR_SIZE,
            height: bounds.height - 28,
          }}
          relativeTo={client}
          contentSize={contentHeight}
          visibleSize={visibleHeight}
          value={scroll}
          onValueChange={setScrollTop}
          scrollbarStyle={ScrollbarStyle.Compact}
          aria-label="Palettes scroll"
        />
      )}
    </>
  );
}

export function PalettePresetPopup({
  choices,
  activePalette,
  hasDocument,
  onLoad,
  onRefresh,
  onOpenFolder,
  sceneBounds,
  translate = identity,
  maxColors = Infinity,
  disabled = false,
  requireVisibleColors = false,
}: PalettePresetPopupProps) {
  const assets = useUiAssets();
  const trigger = useRef<HTMLButtonElement>(null),
    marker = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [popupScene, setPopupScene] = useState<Pick<SurfaceBounds, "width" | "height">>();
  const [open, setOpen] = useState(false),
    [bounds, setBounds] = useState<SurfaceBounds | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastSearch = useRef(search);
  useEffect(() => {
    const node = marker.current;
    if (node) setPortalTarget(node.closest<HTMLElement>("[data-ui-scene]") ?? document.body);
  }, []);
  const visibleChoices = useMemo(() => {
    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter((choice) => {
      const text = `${choice.name} ${choice.group} ${choice.author ?? ""}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [choices, search]);
  useEffect(() => {
    const changed = lastSearch.current !== search;
    lastSearch.current = search;
    if (changed) {
      setSelectedId(visibleChoices[0]?.id ?? null);
      return;
    }
    if (selectedId && !visibleChoices.some((choice) => choice.id === selectedId))
      setSelectedId(visibleChoices[0]?.id ?? null);
  }, [search, choices, selectedId, visibleChoices]);
  const show = () => {
    const node = trigger.current;
    if (!node) return;
    const anchor = measurePopoverAnchor(node, DEFAULT_SURFACE_VIEWPORT, {
      x: 70,
      y: 0,
      width: 30,
      height: 32,
    });
    setPopupScene({ width: anchor.availableWidth, height: anchor.availableHeight });
    const width = Math.max(1, Math.floor(anchor.availableWidth / 2));
    const height = Math.max(1, Math.floor((anchor.availableHeight * 3) / 4));
    setBounds({
      x: Math.max(0, Math.min(anchor.availableWidth - width, anchor.bounds.x)),
      y: Math.max(0, Math.min(anchor.availableHeight - height, anchor.bottom + 1)),
      width,
      height,
    });
    setSelectedId(visibleChoices[0]?.id ?? null);
    setOpen(true);
  };
  const selected = visibleChoices.find((choice) => choice.id === selectedId) ?? null;
  const renderContents = ({ clientBounds: client }: PopoverContext) => {
    const searchBounds = {
      x: client.x + 2,
      y: client.y + 1,
      width: Math.max(32, client.width - 45),
      height: 38,
    };
    const refreshBounds = {
      x: client.x + client.width - REFRESH_BUTTON_WIDTH,
      y: client.y + 1,
      width: REFRESH_BUTTON_WIDTH,
      height: 36,
    };
    const listBounds = {
      x: client.x + 2,
      y: client.y + 40,
      width: Math.max(32, client.width - 4),
      height: Math.max(32, client.height - 79),
    };
    const loadBounds = {
      x: client.x + 2,
      y: client.y + client.height - 39,
      width: 160,
      height: 38,
    };
    const folderBounds = {
      x: client.x + client.width - 122,
      y: client.y + client.height - 37,
      width: 120,
      height: 34,
    };
    const searchLayout = surfaceLayout(searchBounds),
      clientLayout = surfaceLayout(client);
    return (
      <>
        <Input
          bounds={searchBounds}
          relativeTo={client}
          value={search}
          onValueChange={setSearch}
          aria-label={translate("Search palettes")}
          className="xse-palette-search"
          size={32}
          textInset={26}
          frameScaleTop={2.75}
        />
        {assets && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: searchLayout.left - clientLayout.left,
              top: searchLayout.top - clientLayout.top,
              width: searchLayout.width,
              height: searchLayout.height,
              zIndex: 6,
              pointerEvents: "none",
            }}
          >
            <Icon kind="icon_search" scale={2} x={6} y={12} color={assets.style.colors.text} />
            {!search && (
              <Text
                variant={TextVariant.PositionedPixel}
                text={translate("Search")}
                x={26}
                y={13}
                color={assets.style.colors.entry_suffix}
              />
            )}
          </span>
        )}
        <Button
          bounds={refreshBounds}
          relativeTo={client}
          part="buttonset_item_normal"
          hotPart="buttonset_item_hot"
          pushedPart="buttonset_item_pushed"
          icon="arrow_circle_cw"
          aria-label={translate("Refresh")}
          onClick={() => {
            onRefresh();
            setSelectedId(null);
          }}
        />
        <PaletteResourceList
          translate={translate}
          client={client}
          bounds={listBounds}
          choices={visibleChoices}
          currentPalette={activePalette}
          selectedId={selected?.id ?? null}
          onSelect={(choice) => setSelectedId(choice.id)}
          onLoad={(choice) =>
            hasDocument &&
            choice.colors.length <= maxColors &&
            (!requireVisibleColors || choice.colors.some((color) => color[3] > 0)) &&
            onLoad(choice.colors, choice)
          }
        />
        <Button
          bounds={loadBounds}
          relativeTo={client}
          text={translate("Load")}
          font={FontRole.Primary}
          part="button_normal"
          hotPart="button_hot"
          pushedPart="button_selected"
          mnemonicIndex={0}
          disabled={
            !hasDocument ||
            !selected ||
            selected.colors.length > maxColors ||
            (requireVisibleColors && !selected.colors.some((color) => color[3] > 0))
          }
          onClick={() => selected && onLoad(selected.colors, selected)}
        />
        <Button
          bounds={folderBounds}
          relativeTo={client}
          text={translate("Open Folder")}
          font={FontRole.Primary}
          part="button_normal"
          hotPart="button_hot"
          pushedPart="button_selected"
          mnemonicIndex={0}
          disabled={!hasDocument || !selected || !onOpenFolder}
          onClick={() => selected && onOpenFolder?.(selected)}
        />
      </>
    );
  };
  return (
    <>
      <span ref={marker} aria-hidden="true" style={{ display: "none" }} />
      <Button
        buttonRef={trigger}
        tintDisabledIcon
        disabled={disabled}
        pixelSize={{ width: 15, height: 16 }}
        icon="pal_presets"
        aria-label={translate("Palette presets")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
      />
      {open &&
        bounds &&
        portalTarget &&
        createUiPortal(
          <Popover
            open
            label={translate("Palettes")}
            closeLabel={translate("Close {name}", { name: translate("Palettes") })}
            sceneBounds={sceneBounds ?? popupScene}
            bounds={bounds}
            showCloseButton={false}
            onOpenChange={setOpen}
            autoFocus={false}
            closeOnEnter={false}
            closeOnOutsideClick
          >
            {renderContents}
          </Popover>,
          portalTarget,
        )}
    </>
  );
}
