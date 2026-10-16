import { useEffect, useMemo } from "react";

import { lazyChunk } from "$/components/shared/lazy-chunk";
import {
  useImageExportCapabilities,
  type ExportFileDialogOptions,
} from "$/managers/dialogs/export-file-dialog-model";
import { ExportOutputFormat } from "$/managers/files/export-file-options";
import { registerExporter, type ExporterViewProps } from "$/managers/files/exporter-registry";
import {
  imageExporterDefinition,
  type ImageExporterSource,
} from "$/managers/files/exporters/image";

const Dialog = lazyChunk(() =>
  import("$/components/dialogs/export-file-dialog").then((module) => ({
    default: module.ExportFileDialog,
  })),
);

function ImageExporterView(props: ExporterViewProps<ImageExporterSource, ExportFileDialogOptions>) {
  const capabilities = useImageExportCapabilities();
  const request = useMemo(
    () =>
      props.choiceRequest ? { format: props.choiceRequest.id as ExportOutputFormat } : undefined,
    [props.choiceRequest],
  );
  const onChoicesChange = props.onChoicesChange;
  useEffect(() => {
    onChoicesChange(
      imageExporterDefinition.initialChoices!.map((choice) => ({
        ...choice,
        disabled:
          choice.id === ExportOutputFormat.Jpeg
            ? !capabilities.jpeg
            : choice.id === ExportOutputFormat.Webp
              ? !capabilities.webp
              : false,
      })),
    );
  }, [capabilities.jpeg, capabilities.webp, onChoicesChange]);
  return (
    <Dialog
      embedded
      documentKey={props.source.documentKey}
      filePreferences={props.filePreferences}
      busy={props.busy}
      formatRequest={request}
      imageCapabilities={capabilities}
      onFormatChange={props.onChoiceChange}
      onLayoutSizeChange={props.onLayoutSizeChange}
      onClose={props.onClose}
      onExport={props.execute}
    />
  );
}

export const imageExporter = registerExporter(imageExporterDefinition, ImageExporterView);
