import { useState } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUiSource, useUiLanguage } from "$/i18n";
import {
  useBeadExport,
  BEAD_EXPORT_LAYOUT,
  BEAD_EXPORT_SIZE,
  BEAD_PREVIEW_BOUNDS,
  BeadBoardSize,
  BeadOutputFormat,
  type BeadExportSource,
  type BeadExportOptions,
} from "$/managers/files/bead-export";
import type { ExporterViewProps } from "$/managers/files/exporter-registry";
import { CanvasSurface, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/dialogs/bead-export-dialog/bead-export-dialog.module.css";

enum PreviewZoom {
  Fit = "fit",
  Half = "half",
  Full = "full",
  Double = "double",
}

export function BeadExportDialog(props: ExporterViewProps<BeadExportSource, BeadExportOptions>) {
  useUiLanguage();
  const model = useBeadExport(props.source);
  const [zoom, setZoom] = useState(PreviewZoom.Fit);
  const { settings, grid } = model;
  const error = settings.format === BeadOutputFormat.Png ? model.pngError : null;
  const scale =
    zoom === PreviewZoom.Double
      ? 2
      : zoom === PreviewZoom.Full
        ? 1
        : zoom === PreviewZoom.Half
          ? 0.5
          : Math.min(
              BEAD_PREVIEW_BOUNDS.width / model.chart.width,
              BEAD_PREVIEW_BOUNDS.height / model.chart.height,
            );
  const fields: FormField[] = [
    {
      key: "brand",
      label: "Brand",
      type: "select",
      value: settings.brand,
      options: model.palettes.map(({ id, name }) => ({ value: id, label: name })),
      onChange: (brand) => model.changeSettings({ brand: brand as BeadExportOptions["brand"] }),
    },
    {
      key: "boardSize",
      label: "Board size",
      type: "select",
      value: String(settings.boardSize),
      options: [BeadBoardSize.Small, BeadBoardSize.Large].map((size) => ({
        value: String(size),
        label: `${size} × ${size}`,
      })),
      onChange: (size) => model.changeSettings({ boardSize: Number(size) as BeadBoardSize }),
    },
    {
      key: "showCodes",
      label: "Color codes in cells",
      type: "checkbox",
      value: settings.showCodes,
      onChange: (showCodes) => model.changeSettings({ showCodes }),
    },
    {
      key: "format",
      label: "File type",
      type: "select",
      value: settings.format,
      options: [
        { value: BeadOutputFormat.Png, label: "PNG" },
        { value: BeadOutputFormat.Pdf, label: "PDF" },
      ],
      onChange: (format) => model.changeSettings({ format: format as BeadOutputFormat }),
    },
    {
      key: "name",
      label: "Filename",
      type: "text",
      value: settings.name,
      onChange: (name) => model.changeSettings({ name }),
    },
    {
      key: "board",
      label: "Preview board",
      type: "select",
      value: String(model.boardIndex),
      options: model.boards.map((board, index) => ({
        value: String(index),
        label: tUiSource("Row {row}, column {column}", {
          row: board.row + 1,
          column: board.column + 1,
        }),
      })),
      onChange: (value) => model.selectBoard(Number(value)),
    },
    {
      key: "zoom",
      label: "Zoom",
      type: "select",
      value: zoom,
      options: [
        { value: PreviewZoom.Fit, label: "Fit" },
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
      title="Fuse beads"
      width={BEAD_EXPORT_SIZE.width + 24}
      layout={BEAD_EXPORT_LAYOUT}
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
            aria-label={tUiSource("Board preview")}
            style={{
              left: BEAD_PREVIEW_BOUNDS.x,
              top: BEAD_PREVIEW_BOUNDS.y,
              width: BEAD_PREVIEW_BOUNDS.width,
              height: BEAD_PREVIEW_BOUNDS.height,
            }}
          >
            <CanvasSurface
              bounds={{ x: 0, y: 0, width: model.chart.width, height: model.chart.height }}
              viewport={{ sceneWidth: 1, sceneHeight: 1, width: scale, height: scale }}
              pixels={model.chart}
              aria-label={tUiSource("Bead pattern")}
            />
          </div>
          <div className={styles.description}>
            <Text variant={TextVariant.Inline} scale={2} wrap>
              {error
                ? tUiSource(error)
                : tUiSource(
                    "One pixel is one bead. Transparent pixels are empty. Colors are screen references; physical beads may differ.",
                  )}
            </Text>
          </div>
          <div className={styles.materials} tabIndex={0} aria-label={tUiSource("Materials")}>
            <Text variant={TextVariant.Inline} scale={2}>
              {tUiSource("{width} × {height} · Beads: {count} · Colors: {colors}", {
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
                      {tUiSource("Color code")}
                    </Text>
                  </th>
                  <th>
                    <Text variant={TextVariant.Inline} scale={2}>
                      {tUiSource("Quantity")}
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
                        style={{ backgroundColor: `rgb(${color.rgb.join(",")})` }}
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
          label: props.busy ? "Exporting…" : "Export",
          disabled: props.busy || !!error || !settings.name.trim(),
          onClick: () => props.execute(settings),
        },
        { label: "Cancel", disabled: props.busy, onClick: props.onClose },
      ]}
    />
  );
}
