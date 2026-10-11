import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  ExportOutputFormat,
  useImageExportCapabilities,
  type ExportFileDialogOptions,
} from "$/managers/dialogs/export-file-dialog-model";
import type {
  SpriteSheetDialogOptions,
  SpriteSheetPreviewResult,
} from "$/managers/dialogs/sprite-sheet-dialog-model";
import type {
  AnimalCrossingExportSource,
  AnimalCrossingExportPort,
} from "$/managers/files/animal-crossing-export";
import type { AnimalCrossingExportOptions } from "$/managers/files/animal-crossing-export-options";
import { ExportDestination } from "$/managers/files/export-destination";
import { animalCrossingExportEmbeddedSize } from "$/managers/files/policies/animal-crossing-export-geometry";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import {
  Button,
  FontRole,
  Menu,
  MenuCheckType,
  type MenuItem,
  OverlayContentLayout,
  Text,
  TextVariant,
  Icon,
  focusDialogContainer,
  isDialogPopupTarget,
} from "@xprite/ui";
import { centerUiPixel, measureUiText, useUiAssets } from "@xprite/ui/assets";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import { clientRect, dropdownArrowOffsetY, isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/dialogs/export-dialog/export-dialog.module.css";

const ExportFileDialog = lazy(() =>
  import("$/components/dialogs/export-file-dialog").then((module) => ({
    default: module.ExportFileDialog,
  })),
);
const SpriteSheetDialog = lazy(() =>
  import("$/components/dialogs/sprite-sheet-dialog").then((module) => ({
    default: module.SpriteSheetDialog,
  })),
);
const AnimalCrossingDialog = lazy(() =>
  import("$/components/dialogs/animal-crossing-dialog").then((module) => ({
    default: module.AnimalCrossingDialog,
  })),
);
const SELECTOR_HEIGHT = 42;
const CONTROL_HEIGHT = 30;
const CONTROL_GAP = 8;
const WINDOW_CHROME = { width: 24, height: 46 };
const INITIAL_PANEL_SIZES = {
  [ExportDestination.Image]: { width: 456, height: 336 },
  [ExportDestination.SpriteSheet]: { width: 562, height: 282 },
  [ExportDestination.Tileset]: { width: 562, height: 282 },
  [ExportDestination.AnimalCrossing]: animalCrossingExportEmbeddedSize(),
};
const EXPORT_HELP_URLS: Partial<Record<ExportDestination, string>> = {
  [ExportDestination.Image]: "https://www.aseprite.org/docs/exporting/",
  [ExportDestination.SpriteSheet]: "https://www.aseprite.org/docs/sprite-sheet/#export",
  [ExportDestination.Tileset]: "https://www.aseprite.org/docs/sprite-sheet/#export",
};
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

export interface ExportDialogProps {
  destination: ExportDestination;
  onDestinationChange(destination: ExportDestination): void;
  canExportTileset: boolean;
  animalCrossingSource: AnimalCrossingExportSource | null;
  animalCrossingPort?: AnimalCrossingExportPort;
  onAnimalCrossingBusyChange(busy: boolean): void;
  onAnimalCrossingExported(options: AnimalCrossingExportOptions): void;
  documentKey: string;
  filePreferences: FilePreferences;
  busy: boolean;
  onClose(): void;
  onExport(options: ExportFileDialogOptions): void;
  onSheetExport(options: SpriteSheetDialogOptions): void;
  onSheetPreview(result: SpriteSheetPreviewResult | null): void;
}

/** One modal owner; visited output panels keep their drafts until the window closes. */
export function ExportDialog(props: ExportDialogProps) {
  useUiLanguage();
  const scene = useSceneBounds();
  const uiAssets = useUiAssets();
  const imageCapabilities = useImageExportCapabilities();
  const [selectedFormat, setSelectedFormat] = useState(ExportOutputFormat.Png);
  const [formatRequest, setFormatRequest] = useState<{ format: ExportOutputFormat }>();
  const [sizes, setSizes] = useState(INITIAL_PANEL_SIZES);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const [visited, setVisited] = useState(() => new Set([props.destination]));
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    setVisited((previous) =>
      previous.has(props.destination) ? previous : new Set([...previous, props.destination]),
    );
  }, [props.destination]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusDialogContainer(root.current);
    const focus = (event: FocusEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !isDialogPopupTarget(root.current, event.target)
      )
        focusDialogContainer(root.current);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event) || isDialogPopupTarget(root.current, event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        current.current.onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
        (node) =>
          !node.closest("[hidden]") && clientRect(node).width > 0 && clientRect(node).height > 0,
      );
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        !nodes.length ||
        index < 0 ||
        (event.shiftKey && index === 0) ||
        (!event.shiftKey && index === nodes.length - 1)
      ) {
        event.preventDefault();
        if (nodes.length) nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
        else focusDialogContainer(root.current);
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const imageFormats = [
    { format: ExportOutputFormat.Png, label: "PNG image (.png)" },
    { format: ExportOutputFormat.Gif, label: "GIF animation (.gif)" },
    { format: ExportOutputFormat.Apng, label: "Animated PNG (.apng)" },
    {
      format: ExportOutputFormat.Jpeg,
      label: "JPEG current frame (.jpg)",
      disabled: !imageCapabilities.jpeg,
    },
    {
      format: ExportOutputFormat.Webp,
      label: "WebP image/animation (.webp)",
      disabled: !imageCapabilities.webp,
    },
  ];
  const chooseImageFormat = (format: ExportOutputFormat) => {
    setSelectedFormat(format);
    setFormatRequest({ format });
    props.onDestinationChange(ExportDestination.Image);
  };
  const destinationItem = (
    destination: ExportDestination,
    label: string,
    disabled = false,
  ): MenuItem => ({
    label,
    disabled,
    checkType: MenuCheckType.Radio,
    checked: props.destination === destination,
    onSelect: () => props.onDestinationChange(destination),
  });
  const formatMenu: MenuItem[] = [
    ...imageFormats.map((item): MenuItem => ({
      label: item.label,
      disabled: item.disabled,
      checked: props.destination === ExportDestination.Image && selectedFormat === item.format,
      checkType: MenuCheckType.Radio,
      onSelect: () => chooseImageFormat(item.format),
    })),
    {
      label: tUi("ui.export.sheet.group"),
      separator: true,
      children: [
        destinationItem(ExportDestination.SpriteSheet, "Sprite Sheet"),
        destinationItem(ExportDestination.Tileset, "Tileset", !props.canExportTileset),
      ],
    },
    {
      label: tUi("ui.export.games.crafts"),
      children: [
        destinationItem(
          ExportDestination.AnimalCrossing,
          tUi("ui.export.animal.crossing"),
          !props.animalCrossingPort,
        ),
      ],
    },
  ];
  const selectedLabel =
    props.destination === ExportDestination.Image
      ? imageFormats.find((item) => item.format === selectedFormat)!.label
      : props.destination === ExportDestination.SpriteSheet
        ? "Sprite Sheet"
        : props.destination === ExportDestination.Tileset
          ? "Tileset"
          : tUi("ui.export.animal.crossing");
  const panel = (destination: ExportDestination) => {
    const active = props.destination === destination;
    const onLayoutSizeChange = (size: { width: number; height: number }) => {
      if (!active) return;
      setSizes((previous) =>
        previous[destination].width === size.width && previous[destination].height === size.height
          ? previous
          : {
              ...previous,
              [destination]: size,
            },
      );
    };
    if (destination === ExportDestination.Image)
      return (
        <ExportFileDialog
          embedded
          formatRequest={formatRequest}
          imageCapabilities={imageCapabilities}
          onFormatChange={setSelectedFormat}
          onLayoutSizeChange={onLayoutSizeChange}
          documentKey={props.documentKey}
          filePreferences={props.filePreferences}
          busy={props.busy}
          onClose={props.onClose}
          onExport={props.onExport}
        />
      );
    if (destination === ExportDestination.AnimalCrossing)
      return props.animalCrossingSource && props.animalCrossingPort ? (
        <AnimalCrossingDialog
          active={active}
          source={props.animalCrossingSource}
          port={props.animalCrossingPort}
          onClose={props.onClose}
          onBusyChange={props.onAnimalCrossingBusyChange}
          onExported={props.onAnimalCrossingExported}
          onLayoutSizeChange={onLayoutSizeChange}
        />
      ) : null;
    return (
      <SpriteSheetDialog
        embedded
        active={active}
        onLayoutSizeChange={onLayoutSizeChange}
        onPreview={props.onSheetPreview}
        initialSource={destination === ExportDestination.Tileset ? "tilesets" : "sprite"}
        documentKey={props.documentKey}
        busy={props.busy}
        onClose={props.onClose}
        onExport={props.onSheetExport}
      />
    );
  };
  const panelSize = sizes[props.destination];
  const windowWidth = panelSize.width + WINDOW_CHROME.width;
  const windowHeight = panelSize.height + SELECTOR_HEIGHT + WINDOW_CHROME.height;
  const label = tUi("ui.export.format.selector");
  const labelWidth = measureUiText(label) + CONTROL_GAP;
  const arrowY = uiAssets
    ? dropdownArrowOffsetY(
        { y: 0, height: CONTROL_HEIGHT },
        uiAssets.style.parts.combobox_arrow_down.height * RASTER_SCALE,
        !!uiAssets.style.dimensions.combobox_arrow_centered,
      )
    : undefined;
  const bounds = {
    x: position?.x ?? centerUiPixel(scene.x, scene.width, windowWidth),
    y: position?.y ?? centerUiPixel(scene.y, scene.height, windowHeight),
    width: windowWidth,
    height: windowHeight,
  };
  return (
    <div
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <EditorDialog
        open
        modal
        constrainToViewport
        resizable={false}
        title={tUi("ui.export")}
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        contentLayout={OverlayContentLayout.Flow}
        titlebarActions={
          EXPORT_HELP_URLS[props.destination]
            ? ({ bounds: frame }) => (
                <Button
                  bounds={{ x: frame.x + frame.width - 44, y: frame.y + 6, width: 18, height: 22 }}
                  relativeTo={frame}
                  icon="window_help_icon"
                  part="window_button_normal"
                  hotPart="window_button_hot"
                  pushedPart="window_button_selected"
                  insetContent={false}
                  aria-label={tUi("ui.help.for", { value1: tUi("ui.export") })}
                  onClick={() =>
                    window.open(EXPORT_HELP_URLS[props.destination], "_blank", "noopener")
                  }
                />
              )
            : undefined
        }
        onRootRef={(node) => {
          root.current = node;
        }}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <div className={styles.body}>
          <div
            className={styles.selector}
            style={{ width: panelSize.width, height: SELECTOR_HEIGHT }}
          >
            <Text
              variant={TextVariant.Control}
              text={label}
              bounds={{ x: 0, y: 0, width: labelWidth, height: CONTROL_HEIGHT }}
            />
            <Menu
              label={label}
              items={formatMenu}
              renderTrigger={(trigger) => (
                <Button
                  {...trigger}
                  disabled={props.busy}
                  bounds={{
                    x: labelWidth,
                    y: 0,
                    width: panelSize.width - labelWidth,
                    height: CONTROL_HEIGHT,
                  }}
                  font={FontRole.Primary}
                >
                  <Text
                    variant={TextVariant.Control}
                    text={tUiSource(selectedLabel)}
                    bounds={{
                      x: CONTROL_GAP,
                      y: 0,
                      width: panelSize.width - labelWidth - CONTROL_HEIGHT,
                      height: CONTROL_HEIGHT,
                    }}
                  />
                  <span className={styles.menuArrow} style={{ top: arrowY }}>
                    <Icon kind="combobox_arrow_down" scale={RASTER_SCALE} />
                  </span>
                </Button>
              )}
            />
          </div>
          {[...visited].map((destination) => (
            <section
              className={styles.panel}
              key={destination}
              hidden={destination !== props.destination}
            >
              <Suspense fallback={null}>{panel(destination)}</Suspense>
            </section>
          ))}
        </div>
      </EditorDialog>
    </div>
  );
}
