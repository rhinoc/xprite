import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { tUi, useUiLanguage } from "$/i18n";
import {
  useBeadExport,
  useBeadExportProgress,
  beadProgressLabel,
  beadBoardAt,
  beadPreviewCell,
  useBeadChart,
  BEAD_BOARD_PRESETS,
  BEAD_EXPORT_SIZE,
  BeadBoardAxis,
  BeadOutputFormat,
  type BeadBoardRect,
  type BeadExportSource,
  type BeadExportOptions,
} from "$/managers/files/bead-export";
import type { ExporterViewProps } from "$/managers/files/exporter-registry";
import {
  Button,
  CanvasSurface,
  Checkbox,
  FontRole,
  Icon,
  Input,
  Menu,
  MenuCheckType,
  Text,
  TextVariant,
  TextAlignment,
  type SurfaceBounds,
} from "@xprite/ui";
import { measureUiText, useUiAssets } from "@xprite/ui/assets";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import {
  clientPoint,
  dropdownArrowOffsetY,
  clientToLocal,
  layoutSize,
  scrollPosition,
  setScrollPosition,
} from "@xprite/ui/utils";

import styles from "$/components/dialogs/bead-export-dialog/bead-export-dialog.module.css";

const ROW = 30;
const STEP = 38;
const GAP = 12;
const SMALL_GAP = 4;
const ICON_BUTTON = 30;
const GLYPH_CENTER = { x: 2, y: 0 };
const ACTION_HEIGHT = 34;
const MIN_ACTION_WIDTH = 120;
const ACTION_PADDING = 32;
const FORMAT_BUTTON_PADDING = 24;
const LABEL_PADDING = 12;
const SIDE_MIN = 232;
const SIDE_MAX = 300;
const MIN_CONTROL_WIDTH = 132;
/** Below this panel width the settings stack above the preview. */
const STACK_BELOW = 600;
const STACKED_MATERIALS_HEIGHT = 84;
const DIALOG_CHROME = { width: 24, height: 46 };
/** Export window chrome around the panel: frame plus the format selector row. */
const HOST_CHROME = { width: 24, height: 46 + 42 };
/** Space left around the window; narrow screens also keep room for the tab and tool bars. */
const SCREEN_MARGIN = { width: 8, height: 32 };
const NARROW_MARGIN = { width: 8, height: 96 };
const MAX_PANEL = { width: 1280, height: 860 };
const MIN_PANEL = { width: 240, height: 420 };
const ZOOM_STEP = Math.SQRT2;
/** Display pixels per bead at the closest zoom. */
const MAX_ZOOM = 64;
const MIN_ZOOM_OF_FIT = 0.5;

function useWheel(node: HTMLDivElement | null, handler: (event: WheelEvent) => void) {
  const current = useRef(handler);
  current.current = handler;
  useEffect(() => {
    if (!node) return;
    const listener = (event: WheelEvent) => current.current(event);
    node.addEventListener("wheel", listener, { passive: false });
    return () => node.removeEventListener("wheel", listener);
  }, [node]);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Preview fills whatever the sidebar and actions leave; settings stack on narrow screens. */
function beadLayout(
  panel: { width: number; height: number },
  labels: readonly string[],
  aspect: number,
) {
  const labelWidth = Math.max(...labels.map((label) => measureUiText(label))) + LABEL_PADDING;
  const stacked = panel.width < STACK_BELOW;
  const side = stacked
    ? panel.width
    : Math.min(SIDE_MAX, Math.max(SIDE_MIN, labelWidth + MIN_CONTROL_WIDTH));
  const controls = { x: labelWidth, width: side - labelWidth };
  const settingsHeight = STEP * 3;
  const footer = panel.height - ACTION_HEIGHT;
  if (stacked) {
    const toolbarY = settingsHeight;
    const previewY = toolbarY + STEP;
    const room = footer - GAP - STACKED_MATERIALS_HEIGHT - GAP - previewY;
    // The preview takes the pattern's own shape; leftover height goes to the materials list.
    const previewHeight = Math.max(ROW * 3, Math.min(room, Math.ceil(panel.width * aspect) + 1));
    const materialsY = previewY + previewHeight + GAP;
    return {
      stacked,
      labelWidth,
      controls,
      toolbar: { x: 0, y: toolbarY, width: panel.width, height: ROW },
      preview: { x: 0, y: previewY, width: panel.width, height: previewHeight },
      materials: { x: 0, y: materialsY, width: panel.width, height: footer - GAP - materialsY },
    };
  }
  const previewX = side + GAP;
  return {
    stacked,
    labelWidth,
    controls,
    toolbar: { x: previewX, y: 0, width: panel.width - previewX, height: ROW },
    preview: {
      x: previewX,
      y: STEP,
      width: panel.width - previewX,
      height: footer - GAP - STEP,
    },
    materials: {
      x: 0,
      y: settingsHeight,
      width: side,
      height: footer - GAP - settingsHeight,
    },
  };
}

export function BeadExportDialog(props: ExporterViewProps<BeadExportSource, BeadExportOptions>) {
  useUiLanguage();
  const scene = useSceneBounds();
  const model = useBeadExport(props.source);
  const uiAssets = useUiAssets();
  const progress = useBeadExportProgress();
  const { settings, grid } = model;
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  /** Display pixels per bead; null fits the whole pattern or the picked board. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ board: BeadBoardRect; size: string } | null>(null);
  const sizeKey = `${settings.boardSize.width}x${settings.boardSize.height}`;
  const focused = focus?.size === sizeKey ? focus.board : null;

  const margin = scene.width > 0 && scene.width < STACK_BELOW ? NARROW_MARGIN : SCREEN_MARGIN;
  const panel = {
    width:
      scene.width > 0
        ? Math.max(
            MIN_PANEL.width,
            Math.min(MAX_PANEL.width, scene.width - HOST_CHROME.width - margin.width),
          )
        : BEAD_EXPORT_SIZE.width,
    height:
      scene.height > 0
        ? Math.max(
            MIN_PANEL.height,
            Math.min(MAX_PANEL.height, scene.height - HOST_CHROME.height - margin.height),
          )
        : BEAD_EXPORT_SIZE.height,
  };
  const labels = {
    brand: tUi("ui.export.beads.brand"),
    board: tUi("ui.export.beads.board"),
    format: tUi("ui.export.beads.file.type"),
  };
  const layout = beadLayout(panel, Object.values(labels), grid.height / grid.width);
  const fitTo = (width: number, height: number) =>
    Math.min((layout.preview.width - 1) / width, (layout.preview.height - 1) / height);
  const fit = fitTo(grid.width, grid.height);
  const scale = zoom ?? (focused ? fitTo(focused.width, focused.height) : fit);
  const chart = useBeadChart(grid, settings, beadPreviewCell(grid, scale));
  const chartScale = (scale * grid.width) / (chart.width - 1);
  const display = { width: chart.width * chartScale, height: chart.height * chartScale };

  const pendingScroll = useRef<{ x: number; y: number } | null>(null);
  const scrollTo = (x: number, y: number) => {
    pendingScroll.current = { x, y };
  };
  // Scroll after the resized chart is in the DOM, otherwise the browser clamps the offset.
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!target || !viewport) return;
    pendingScroll.current = null;
    setScrollPosition(viewport, target);
  });
  const zoomTo = (next: number, anchor?: { x: number; y: number }) => {
    const clamped = Math.max(fit * MIN_ZOOM_OF_FIT, Math.min(MAX_ZOOM, next));
    if (!viewport) return setZoom(clamped);
    const size = layoutSize(viewport);
    const point = anchor ?? { x: size.width / 2, y: size.height / 2 };
    const scroll = scrollPosition(viewport);
    const chartX = (scroll.x + point.x) / scale,
      chartY = (scroll.y + point.y) / scale;
    setZoom(clamped);
    scrollTo(chartX * clamped - point.x, chartY * clamped - point.y);
  };
  useWheel(viewport, (event) => {
    event.preventDefault();
    zoomTo(
      scale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      clientToLocal(viewport!, clientPoint(event)),
    );
  });
  const fitAll = () => {
    setFocus(null);
    setZoom(null);
    scrollTo(0, 0);
  };
  const pickBoard = (offsetX: number, offsetY: number) => {
    const board = beadBoardAt(
      grid,
      settings.boardSize,
      Math.floor(offsetX / scale),
      Math.floor(offsetY / scale),
    );
    if (!board) return;
    const next = fitTo(board.width, board.height);
    setFocus({ board, size: sizeKey });
    setZoom(null);
    scrollTo(board.x * next, board.y * next);
  };

  const exportLabel = props.busy
    ? progress === null
      ? tUi("ui.animal.crossing.exporting")
      : beadProgressLabel(progress)
    : tUi("ui.export");
  const cancelLabel = tUi("ui.cancel");
  const actions: Record<string, Rect> = {};
  let actionX = panel.width;
  for (const label of [cancelLabel, exportLabel]) {
    const width = Math.max(MIN_ACTION_WIDTH, measureUiText(label) + ACTION_PADDING);
    actionX -= width;
    actions[label] = { x: actionX, y: panel.height - ACTION_HEIGHT, width, height: ACTION_HEIGHT };
    actionX -= SMALL_GAP * 2;
  }
  const disabled = props.busy;
  const formats = [
    { value: BeadOutputFormat.Png, label: tUi("ui.export.beads.png") },
    { value: BeadOutputFormat.Pdf, label: tUi("ui.export.beads.pdf") },
  ];
  const presets = BEAD_BOARD_PRESETS.map((size) => ({
    label: tUi("ui.export.beads.size", { width: size.width, height: size.height }),
    disabled,
    onSelect: () => model.choosePreset(size),
  }));
  const brandName = model.palettes.find(({ id }) => id === settings.brand)?.name ?? "";
  const arrowY = uiAssets
    ? dropdownArrowOffsetY(
        { y: 0, height: ROW },
        uiAssets.style.parts.combobox_arrow_down.height * RASTER_SCALE,
        !!uiAssets.style.dimensions.combobox_arrow_centered,
      )
    : undefined;
  const separator = tUi("ui.export.beads.size.by");
  const separatorWidth = measureUiText(separator) + SMALL_GAP * 2;
  const sizeInput = (layout.controls.width - ICON_BUTTON - separatorWidth - SMALL_GAP) / 2;
  const summary = tUi("ui.export.beads.summary", {
    count: grid.total,
    colors: grid.usage.length,
    boards: model.boardCount,
  });

  const row = (client: SurfaceBounds, index: number, label: string) => {
    const y = client.y + index * STEP;
    return {
      y,
      label: (
        <Text
          variant={TextVariant.Control}
          bounds={{ x: client.x, y, width: layout.labelWidth, height: ROW }}
          relativeTo={client}
          text={label}
        />
      ),
    };
  };

  return (
    <FormDialog
      open
      embedded
      title={tUi("ui.export.beads")}
      width={panel.width + DIALOG_CHROME.width}
      layout={{ height: panel.height + DIALOG_CHROME.height, fields: {}, actions }}
      fields={[]}
      onLayoutSizeChange={props.onLayoutSizeChange}
      submitOnEnter={false}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      content={(client) => {
        const brand = row(client, 0, labels.brand);
        const board = row(client, 1, labels.board);
        const format = row(client, 2, labels.format);
        const cx = client.x + layout.controls.x;
        const boardInput = (axis: BeadBoardAxis, x: number) => (
          <Input
            bounds={{ x, y: board.y, width: sizeInput, height: ROW }}
            relativeTo={client}
            aria-label={tUi(axis === BeadBoardAxis.Width ? "ui.width" : "ui.height")}
            disabled={disabled}
            value={model.draft[axis]}
            inputMode="numeric"
            onValueChange={(raw) => model.changeBoard(axis, raw)}
            onCommit={(raw) => model.changeBoard(axis, raw)}
          />
        );
        const toolbar = {
          x: client.x + layout.toolbar.x,
          y: client.y + layout.toolbar.y,
        };
        const toolRight = toolbar.x + layout.toolbar.width;
        return (
          <>
            {brand.label}
            <Menu
              label={labels.brand}
              items={model.palettes.map(({ id, name }) => ({
                label: name,
                disabled,
                checkType: MenuCheckType.Radio,
                checked: settings.brand === id,
                onSelect: () => model.changeSettings({ brand: id as BeadExportOptions["brand"] }),
              }))}
              renderTrigger={(trigger) => (
                // Same trigger as the Export dialog's Format picker, so both rows share padding and font.
                <Button
                  {...trigger}
                  disabled={disabled}
                  bounds={{ x: cx, y: brand.y, width: layout.controls.width, height: ROW }}
                  relativeTo={client}
                  font={FontRole.Primary}
                  aria-label={labels.brand}
                >
                  <Text
                    variant={TextVariant.Control}
                    text={brandName}
                    bounds={{
                      x: SMALL_GAP * 2,
                      y: 0,
                      width: layout.controls.width - ROW - SMALL_GAP * 2,
                      height: ROW,
                    }}
                  />
                  <span className={styles.menuArrow} style={{ top: arrowY }}>
                    <Icon kind="combobox_arrow_down" scale={RASTER_SCALE} />
                  </span>
                </Button>
              )}
            />
            {board.label}
            {boardInput(BeadBoardAxis.Width, cx)}
            <Text
              variant={TextVariant.Control}
              bounds={{ x: cx + sizeInput, y: board.y, width: separatorWidth, height: ROW }}
              relativeTo={client}
              text={separator}
              align={TextAlignment.Center}
            />
            {boardInput(BeadBoardAxis.Height, cx + sizeInput + separatorWidth)}
            <Menu
              label={tUi("ui.export.beads.presets")}
              items={presets}
              renderTrigger={(trigger) => (
                <Button
                  {...trigger}
                  disabled={disabled}
                  bounds={{
                    x: cx + layout.controls.width - ICON_BUTTON,
                    y: board.y,
                    width: ICON_BUTTON,
                    height: ROW,
                  }}
                  relativeTo={client}
                  aria-label={tUi("ui.export.beads.presets")}
                >
                  <span className={styles.arrow}>
                    <Icon kind="combobox_arrow_down" scale={RASTER_SCALE} />
                  </span>
                </Button>
              )}
            />
            {format.label}
            {formats.map((item, index) => {
              const width = layout.controls.width / formats.length;
              return (
                <Button
                  key={item.value}
                  bounds={{
                    x: cx + index * width,
                    y: format.y,
                    // Joined buttonset items overlap by their shared edge, except the last.
                    width: index < formats.length - 1 ? width + 2 : width,
                    height: ROW,
                  }}
                  relativeTo={client}
                  text={item.label}
                  font={FontRole.Primary}
                  selected={settings.format === item.value}
                  part="buttonset_item_normal"
                  hotPart="buttonset_item_hot"
                  pushedPart="buttonset_item_pushed"
                  selectedPart="buttonset_item_pushed"
                  role="radio"
                  aria-checked={settings.format === item.value}
                  aria-label={item.label}
                  disabled={disabled}
                  onClick={() => model.changeSettings({ format: item.value })}
                />
              );
            })}
            <Checkbox
              bounds={{
                x: toolbar.x,
                y: toolbar.y,
                width: Math.max(
                  ROW,
                  measureUiText(tUi("ui.export.beads.codes")) + ROW + FORMAT_BUTTON_PADDING,
                ),
                height: ROW,
              }}
              relativeTo={client}
              label={tUi("ui.export.beads.codes")}
              checked={settings.showCodes}
              disabled={disabled}
              onCheckedChange={(showCodes) => model.changeSettings({ showCodes })}
            />
            {[
              { text: "-", label: tUi("ui.zoom.out"), run: () => zoomTo(scale / ZOOM_STEP) },
              { text: "+", label: tUi("ui.zoom.in"), run: () => zoomTo(scale * ZOOM_STEP) },
            ].map((item, index) => (
              <Button
                key={item.label}
                bounds={{
                  x: toolRight - (2 - index) * (ICON_BUTTON + SMALL_GAP) - fitWidth(),
                  y: toolbar.y,
                  width: ICON_BUTTON,
                  height: ROW,
                }}
                relativeTo={client}
                text={item.text}
                font={FontRole.Primary}
                // The glyph advance carries 2px of trailing space; shift it like the status bar's +.
                textOffset={GLYPH_CENTER}
                aria-label={item.label}
                title={item.label}
                onClick={item.run}
              />
            ))}
            <Button
              bounds={{ x: toolRight - fitWidth(), y: toolbar.y, width: fitWidth(), height: ROW }}
              relativeTo={client}
              text={tUi("ui.export.beads.fit")}
              font={FontRole.Primary}
              aria-label={tUi("ui.fit.to.view")}
              title={tUi("ui.fit.to.view")}
              onClick={fitAll}
            />
            <div
              ref={setViewport}
              className={styles.preview}
              tabIndex={0}
              aria-label={tUi("ui.export.beads")}
              style={{
                left: layout.preview.x,
                top: layout.preview.y,
                width: layout.preview.width,
                height: layout.preview.height,
              }}
            >
              <div
                className={styles.chart}
                style={{ width: display.width, height: display.height }}
                onClick={(event) => {
                  const point = clientToLocal(event.currentTarget, clientPoint(event));
                  pickBoard(point.x, point.y);
                }}
              >
                <CanvasSurface
                  bounds={{ x: 0, y: 0, width: chart.width, height: chart.height }}
                  viewport={{
                    sceneWidth: 1,
                    sceneHeight: 1,
                    width: chartScale,
                    height: chartScale,
                  }}
                  pixels={chart}
                />
                {focused && (
                  <span
                    className={styles.focus}
                    style={{
                      left: focused.x * scale,
                      top: focused.y * scale,
                      width: focused.width * scale + 1,
                      height: focused.height * scale + 1,
                    }}
                  />
                )}
              </div>
            </div>
            <div
              className={layout.stacked ? styles.chips : styles.materials}
              tabIndex={0}
              aria-label={tUi("ui.export.beads.materials")}
              style={{
                left: layout.materials.x,
                top: layout.materials.y,
                width: layout.materials.width,
                height: layout.materials.height,
              }}
            >
              <div className={styles.summary} role={model.blocker ? "alert" : undefined}>
                <Text variant={TextVariant.Inline} scale={2} wrap>
                  {model.blocker ?? summary}
                </Text>
              </div>
              {grid.usage.map(({ color, quantity }) => (
                <div className={styles.material} key={color.code}>
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: `rgb(${color.rgb.join(",")})` }}
                  />
                  <Text variant={TextVariant.Inline} scale={2}>
                    {color.code}
                  </Text>
                  <span className={styles.count}>
                    <Text variant={TextVariant.Inline} scale={2}>
                      {String(quantity)}
                    </Text>
                  </span>
                </div>
              ))}
            </div>
          </>
        );
      }}
      actions={[
        {
          label: exportLabel,
          disabled: props.busy || !!model.blocker,
          onClick: () => props.execute(settings),
        },
        { label: cancelLabel, disabled: props.busy, onClick: props.onClose },
      ]}
    />
  );

  function fitWidth() {
    return Math.max(ICON_BUTTON * 2, measureUiText(tUi("ui.export.beads.fit")) + LABEL_PADDING * 2);
  }
}
