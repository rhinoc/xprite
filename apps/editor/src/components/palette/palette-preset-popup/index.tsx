import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { EditorPopover, type PopoverContext } from "$/components/dialogs/overlay";
import { tUi } from "$/i18n";
import type { PaletteColor as Rgba } from "$/managers/palette/palette-operations";
import { Button, Input, Text, TextVariant } from "@xprite/ui";
import { Scrollbar } from "@xprite/ui";
import { CanvasSurface, type SurfaceBounds } from "@xprite/ui";
import {
  uiFontHeight,
  UiIcon,
  paintUiIcon,
  paintUiPart,
  paintUiText,
  useUiAssets,
} from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import { measurePopoverAnchor } from "@xprite/ui/popover";

import "$/components/palette/palette-preset-popup/palette-preset-popup.module.css";

export interface PaletteBrowserChoice {
  id: string;
  name: string;
  group: string;
  author: string | null;
  colors: readonly Rgba[];
  source: "builtin" | "saved";
}

interface PalettePresetPopupProps {
  choices: readonly PaletteBrowserChoice[];
  activePalette: readonly Rgba[];
  hasDocument: boolean;
  onLoad: (palette: readonly Rgba[]) => void;
  onRefresh: () => void;
  onOpenFolder: (choice: PaletteBrowserChoice) => void;
}

const ROW_HEIGHT = 40;
const SCROLLBAR_SIZE = 12;
const SCROLLBAR_INSET = 7;
const SCROLLBAR_WIDTH = SCROLLBAR_SIZE + SCROLLBAR_INSET;

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
}: {
  client: SurfaceBounds;
  bounds: SurfaceBounds;
  choices: readonly PaletteBrowserChoice[];
  currentPalette: readonly Rgba[];
  selectedId: string | null;
  onSelect: (choice: PaletteBrowserChoice) => void;
  onLoad: (choice: PaletteBrowserChoice) => void;
}) {
  const assets = useUiAssets();
  const [scrollTop, setScrollTop] = useState(0);
  const activeIndex = choices.findIndex((choice) => choice.id === selectedId);
  const contentHeight = choices.length * ROW_HEIGHT;
  const visibleHeight = Math.max(0, bounds.height - 27);
  const maxScroll = Math.max(0, contentHeight - visibleHeight);
  const scroll = Math.max(0, Math.min(maxScroll, scrollTop));
  const first = Math.max(0, Math.floor(scroll / ROW_HEIGHT));
  const last = Math.min(choices.length, Math.ceil((scroll + visibleHeight) / ROW_HEIGHT));
  const contentWidth = Math.max(0, bounds.width - SCROLLBAR_WIDTH);
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
          y + Math.floor((ROW_HEIGHT - uiFontHeight("default")) / 2) + 1,
          { font: "default", color: ink },
        );
        const chipStart = bounds.x + 22;
        const chipY = y + ROW_HEIGHT - 12 + (index === 0 ? 1 : 0);
        context.save();
        context.beginPath();
        context.rect(chipStart, y, Math.max(0, bounds.x + contentWidth - chipStart), ROW_HEIGHT);
        context.clip();
        for (let colorIndex = 0; colorIndex < choice.colors.length; colorIndex++) {
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
        aria-label={tUi("ui.palettes")}
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
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const factor = DEFAULT_SURFACE_VIEWPORT.sceneHeight / DEFAULT_SURFACE_VIEWPORT.height;
          setScrollTop((value) =>
            Math.max(0, Math.min(maxScroll, value + Math.round(event.deltaY * factor))),
          );
        }}
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
              aria-label={tUi("ui.colors.2", { value1: choice.name, value2: choice.colors.length })}
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
          variant="mini"
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
}: PalettePresetPopupProps) {
  const assets = useUiAssets();
  const trigger = useRef<HTMLButtonElement>(null),
    marker = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false),
    [bounds, setBounds] = useState<SurfaceBounds | null>(null);
  const [searchDraft, setSearchDraft] = useState(""),
    [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastSearch = useRef(search);
  useEffect(() => {
    const node = marker.current;
    if (node) setPortalTarget(node.closest<HTMLElement>("[data-ui-scene]") ?? document.body);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft), 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);
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
    const width = Math.max(1, Math.floor(anchor.availableWidth / 2)),
      height = Math.max(1, Math.floor((anchor.availableHeight * 3) / 4));
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
      y: client.y - 1,
      width: Math.max(32, client.width - 45),
      height: 40,
    };
    const refreshBounds = {
      x: client.x + client.width - 32,
      y: client.y + 1,
      width: 32,
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
          value={searchDraft}
          onValueChange={setSearchDraft}
          aria-label="Search palettes"
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
            <UiIcon part="icon_search" scale={2} x={6} y={12} color={assets.style.colors.text} />
            {!searchDraft && (
              <Text
                variant={TextVariant.PositionedPixel}
                text={tUi("ui.search")}
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
          aria-label="Refresh"
          onClick={() => {
            onRefresh();
            setSelectedId(null);
          }}
        />
        <PaletteResourceList
          client={client}
          bounds={listBounds}
          choices={visibleChoices}
          currentPalette={activePalette}
          selectedId={selected?.id ?? null}
          onSelect={(choice) => setSelectedId(choice.id)}
          onLoad={(choice) => hasDocument && onLoad(choice.colors)}
        />
        <Button
          bounds={loadBounds}
          relativeTo={client}
          text="Load"
          font="default"
          part="button_normal"
          hotPart="button_hot"
          pushedPart="button_selected"
          mnemonicIndex={0}
          disabled={!hasDocument || !selected}
          onClick={() => selected && onLoad(selected.colors)}
        />
        <Button
          bounds={folderBounds}
          relativeTo={client}
          text="Open Folder"
          font="default"
          part="button_normal"
          hotPart="button_hot"
          pushedPart="button_selected"
          mnemonicIndex={0}
          disabled={!hasDocument || !selected}
          onClick={() => selected && onOpenFolder(selected)}
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
        pixelSize={{ width: 15, height: 16 }}
        icon="pal_presets"
        aria-label="Palette presets"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
      />
      {open &&
        bounds &&
        portalTarget &&
        createPortal(
          <EditorPopover
            open
            label="Palettes"
            bounds={bounds}
            onOpenChange={setOpen}
            autoFocus={false}
            closeOnEnter={false}
            closeOnOutsideClick
          >
            {renderContents}
          </EditorPopover>,
          portalTarget,
        )}
    </>
  );
}
