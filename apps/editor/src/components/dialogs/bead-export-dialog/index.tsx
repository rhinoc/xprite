import { useState } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUi, useUiLanguage } from "$/i18n";
import type { FormLayout } from "$/managers/dialogs/form-layout";
import {
  useBeadExport,
  useBeadExportProgress,
  beadProgressLabel,
  BEAD_EXPORT_SIZE,
  MIN_BEAD_BOARD_EDGE,
  MAX_BEAD_BOARD_EDGE,
  BeadBoardAxis,
  BeadOutputFormat,
  sanitizeBeadFileStem,
  type BeadExportSource,
  type BeadExportOptions,
} from "$/managers/files/bead-export";
import type { ExporterViewProps } from "$/managers/files/exporter-registry";
import { CanvasSurface, Text, TextVariant } from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";

import styles from "$/components/dialogs/bead-export-dialog/bead-export-dialog.module.css";

enum PreviewZoom {
  Fit = "fit",
  Half = "half",
  Full = "full",
  Double = "double",
}
const ZOOM_SCALE: Readonly<Record<Exclude<PreviewZoom, PreviewZoom.Fit>, number>> = {
  [PreviewZoom.Half]: 0.5,
  [PreviewZoom.Full]: 1,
  [PreviewZoom.Double]: 2,
};

const ROW_HEIGHT = 30;
const ROW_STEP = 38;
const SECTION_HEIGHT = 22;
const SECTION_GAP = 6;
const COLUMN_GAP = 20;
const LABEL_PADDING = 16;
const MIN_CONTROL_WIDTH = 168;
const MIN_SETTINGS_WIDTH = 308;
const MAX_SETTINGS_WIDTH = 440;
const PREVIEW_WIDTH = 424;
const PREVIEW_HEIGHT = 288;
const ACTION_HEIGHT = 34;
const MIN_ACTION_WIDTH = 120;
const ACTION_PADDING = 32;
const DESCRIPTION_GAP = 12;
const CHROME_HEIGHT = 46;
const CHROME_WIDTH = 24;
const FIELD_KEYS = [
  "brand",
  "boardWidth",
  "boardHeight",
  "showCodes",
  "format",
  "name",
  "board",
  "zoom",
] as const;
/** The board selector starts a second group after a small gap. */
const GROUP_BREAK = "board";

interface BeadDialogLayout {
  layout: FormLayout;
  width: number;
  preview: { x: number; y: number; width: number; height: number };
  description: { x: number; y: number; width: number };
  materials: { x: number; y: number; width: number; height: number };
}

/**
 * Columns grow with the longest translated label, so ru, pt-BR and es labels keep their full
 * text instead of being clipped by fixed English widths.
 */
function beadDialogLayout(
  labels: Readonly<
    Record<(typeof FIELD_KEYS)[number] | "pattern" | "preview" | "materials", string>
  >,
  actions: readonly string[],
): BeadDialogLayout {
  const labelWidth =
    Math.max(
      ...FIELD_KEYS.filter((key) => key !== "showCodes").map((key) => measureUiText(labels[key])),
    ) + LABEL_PADDING;
  const settingsWidth = Math.min(
    MAX_SETTINGS_WIDTH,
    Math.max(
      MIN_SETTINGS_WIDTH,
      labelWidth + MIN_CONTROL_WIDTH,
      measureUiText(labels.showCodes) + LABEL_PADDING * 3,
    ),
  );
  const fields: Record<string, FormLayout["fields"][string]> = {};
  let y = SECTION_HEIGHT + SECTION_GAP;
  for (const key of FIELD_KEYS) {
    if (key === GROUP_BREAK) y += SECTION_GAP * 3;
    fields[key] = {
      x: 0,
      y,
      width: settingsWidth,
      height: ROW_HEIGHT,
      ...(key === "showCodes"
        ? {}
        : {
            labelWidth: Math.min(labelWidth, settingsWidth - MIN_CONTROL_WIDTH),
          }),
    };
    y += ROW_STEP;
  }
  const previewX = settingsWidth + COLUMN_GAP;
  const width = Math.max(BEAD_EXPORT_SIZE.width, previewX + PREVIEW_WIDTH);
  const materialsTop = y + SECTION_GAP;
  const height = BEAD_EXPORT_SIZE.height;
  // Right-aligned like native Aseprite buttons: the last action sits at the right edge.
  const actionBounds: Record<string, { x: number; y: number; width: number; height: number }> = {};
  let actionX = width;
  for (const label of [...actions].reverse()) {
    const actionWidth = Math.max(MIN_ACTION_WIDTH, measureUiText(label) + ACTION_PADDING);
    actionX -= actionWidth;
    actionBounds[label] = {
      x: actionX,
      y: height - ACTION_HEIGHT,
      width: actionWidth,
      height: ACTION_HEIGHT,
    };
    actionX -= SECTION_GAP;
  }
  return {
    width: width + CHROME_WIDTH,
    layout: {
      height: height + CHROME_HEIGHT,
      fields,
      separators: [
        {
          x: 0,
          y: 0,
          width: settingsWidth,
          height: SECTION_HEIGHT,
          text: labels.pattern,
        },
        {
          x: previewX,
          y: 0,
          width: PREVIEW_WIDTH,
          height: SECTION_HEIGHT,
          text: labels.preview,
        },
        {
          x: 0,
          y: materialsTop,
          width: settingsWidth,
          height: SECTION_HEIGHT,
          text: labels.materials,
        },
      ],
      actions: actionBounds,
    },
    preview: {
      x: previewX,
      y: SECTION_HEIGHT + SECTION_GAP,
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
    },
    description: {
      x: previewX,
      y: SECTION_HEIGHT + SECTION_GAP + PREVIEW_HEIGHT + DESCRIPTION_GAP,
      width: PREVIEW_WIDTH,
    },
    materials: {
      x: 0,
      y: materialsTop + SECTION_HEIGHT + SECTION_GAP,
      width: settingsWidth,
      height: height - ACTION_HEIGHT - SECTION_GAP - (materialsTop + SECTION_HEIGHT + SECTION_GAP),
    },
  };
}

export function BeadExportDialog(props: ExporterViewProps<BeadExportSource, BeadExportOptions>) {
  useUiLanguage();
  const model = useBeadExport(props.source);
  const progress = useBeadExportProgress();
  const [zoom, setZoom] = useState(PreviewZoom.Fit);
  const { settings, grid } = model;
  const scale =
    zoom === PreviewZoom.Fit
      ? Math.min(PREVIEW_WIDTH / model.chart.width, PREVIEW_HEIGHT / model.chart.height)
      : ZOOM_SCALE[zoom];
  const labels = {
    brand: tUi("ui.export.beads.brand"),
    boardWidth: tUi("ui.export.beads.board.columns"),
    boardHeight: tUi("ui.export.beads.board.rows"),
    showCodes: tUi("ui.export.beads.codes"),
    format: tUi("ui.export.beads.file.type"),
    name: tUi("ui.filename"),
    board: tUi("ui.export.beads.board.select"),
    zoom: tUi("ui.zoom"),
    pattern: tUi("ui.export.beads.pattern"),
    preview: tUi("ui.export.beads.board.preview"),
    materials: tUi("ui.export.beads.materials"),
  };
  const exportLabel = props.busy
    ? progress === null
      ? tUi("ui.animal.crossing.exporting")
      : beadProgressLabel(progress)
    : tUi("ui.export");
  const cancelLabel = tUi("ui.cancel");
  const dialog = beadDialogLayout(labels, [exportLabel, cancelLabel]);
  const board = (axis: BeadBoardAxis): FormField => ({
    key: axis === BeadBoardAxis.Width ? "boardWidth" : "boardHeight",
    label: axis === BeadBoardAxis.Width ? labels.boardWidth : labels.boardHeight,
    type: "number",
    value: settings.boardSize[axis],
    min: MIN_BEAD_BOARD_EDGE,
    max: MAX_BEAD_BOARD_EDGE,
    step: MIN_BEAD_BOARD_EDGE,
    onDraftChange: (raw) => model.changeBoard(axis, raw),
    onChange: (value) => model.changeBoard(axis, String(Math.round(value))),
  });
  const fields: FormField[] = [
    {
      key: "brand",
      label: labels.brand,
      type: "select",
      value: settings.brand,
      options: model.palettes.map(({ id, name }) => ({
        value: id,
        label: name,
      })),
      onChange: (brand) => model.changeSettings({ brand: brand as BeadExportOptions["brand"] }),
    },
    board(BeadBoardAxis.Width),
    board(BeadBoardAxis.Height),
    {
      key: "showCodes",
      label: labels.showCodes,
      type: "checkbox",
      value: settings.showCodes,
      onChange: (showCodes) => model.changeSettings({ showCodes }),
    },
    {
      key: "format",
      label: labels.format,
      type: "select",
      value: settings.format,
      options: [
        { value: BeadOutputFormat.Png, label: tUi("ui.export.beads.png") },
        { value: BeadOutputFormat.Pdf, label: tUi("ui.export.beads.pdf") },
      ],
      onChange: (format) => model.changeSettings({ format: format as BeadOutputFormat }),
    },
    {
      key: "name",
      label: labels.name,
      type: "text",
      value: settings.name,
      onChange: (name) => model.changeSettings({ name }),
    },
    {
      key: "board",
      label: labels.board,
      type: "select",
      value: String(model.boardIndex),
      options: model.boards.map((item, index) => ({
        value: String(index),
        label: tUi("ui.export.beads.board.coordinates", {
          row: item.row + 1,
          column: item.column + 1,
        }),
      })),
      onChange: (value) => model.selectBoard(Number(value)),
    },
    {
      key: "zoom",
      label: labels.zoom,
      type: "select",
      value: zoom,
      options: [
        { value: PreviewZoom.Fit, label: tUi("ui.export.beads.fit") },
        { value: PreviewZoom.Half, label: "50%" },
        { value: PreviewZoom.Full, label: "100%" },
        { value: PreviewZoom.Double, label: "200%" },
      ],
      onChange: (value) => setZoom(value as PreviewZoom),
    },
  ];
  return (
    <FormDialog
      open
      embedded
      title={tUi("ui.export.beads")}
      width={dialog.width}
      layout={dialog.layout}
      fields={fields.map((field) => ({ ...field, disabled: props.busy }))}
      onLayoutSizeChange={props.onLayoutSizeChange}
      submitOnEnter={false}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      content={() => (
        <>
          <div
            className={styles.preview}
            tabIndex={0}
            aria-label={labels.preview}
            style={{
              left: dialog.preview.x,
              top: dialog.preview.y,
              width: dialog.preview.width,
              height: dialog.preview.height,
            }}
          >
            <CanvasSurface
              bounds={{
                x: 0,
                y: 0,
                width: model.chart.width,
                height: model.chart.height,
              }}
              viewport={{
                sceneWidth: 1,
                sceneHeight: 1,
                width: scale,
                height: scale,
              }}
              pixels={model.chart}
              aria-label={tUi("ui.export.beads.pattern")}
            />
          </div>
          <div
            className={styles.description}
            role={model.blocker ? "alert" : undefined}
            style={{
              left: dialog.description.x,
              top: dialog.description.y,
              width: dialog.description.width,
            }}
          >
            <Text variant={TextVariant.Inline} scale={2} wrap>
              {model.blocker ?? tUi("ui.export.beads.help")}
            </Text>
          </div>
          <div
            className={styles.materials}
            tabIndex={0}
            aria-label={labels.materials}
            style={{
              left: dialog.materials.x,
              top: dialog.materials.y,
              width: dialog.materials.width,
              height: dialog.materials.height,
            }}
          >
            <Text variant={TextVariant.Inline} scale={2}>
              {tUi("ui.export.beads.summary", {
                width: grid.width,
                height: grid.height,
                count: grid.total,
                colors: grid.usage.length,
              })}
            </Text>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    <Text variant={TextVariant.Inline} scale={2}>
                      {tUi("ui.export.beads.code")}
                    </Text>
                  </th>
                  <th>
                    <Text variant={TextVariant.Inline} scale={2}>
                      {tUi("ui.export.beads.quantity")}
                    </Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.usage.map(({ color, quantity }) => (
                  <tr key={color.code}>
                    <td>
                      <span
                        className={styles.swatch}
                        style={{
                          backgroundColor: `rgb(${color.rgb.join(",")})`,
                        }}
                      />
                      <Text variant={TextVariant.Inline} scale={2}>
                        {color.code}
                      </Text>
                    </td>
                    <td>
                      <Text variant={TextVariant.Inline} scale={2}>
                        {String(quantity)}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      actions={[
        {
          label: exportLabel,
          disabled: props.busy || !!model.blocker || !sanitizeBeadFileStem(settings.name),
          onClick: () => props.execute(settings),
        },
        { label: cancelLabel, disabled: props.busy, onClick: props.onClose },
      ]}
    />
  );
}
