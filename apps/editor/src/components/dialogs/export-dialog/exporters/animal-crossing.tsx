import { lazy } from "react";

import type { AnimalCrossingExportOptions } from "$/managers/files/animal-crossing-export-options";
import { registerExporter, type ExporterViewProps } from "$/managers/files/exporter-registry";
import {
  animalCrossingExporterDefinition,
  type AnimalCrossingExporterSource,
} from "$/managers/files/exporters/animal-crossing";

const Dialog = lazy(() =>
  import("$/components/dialogs/animal-crossing-dialog").then((module) => ({
    default: module.AnimalCrossingDialog,
  })),
);

function AnimalCrossingExporterView(
  props: ExporterViewProps<AnimalCrossingExporterSource, AnimalCrossingExportOptions>,
) {
  return (
    <Dialog
      active={props.active}
      source={props.source.image}
      port={props.source.port}
      onClose={props.onClose}
      onBusyChange={props.onBusyChange}
      onExported={props.onExported}
      onLayoutSizeChange={props.onLayoutSizeChange}
    />
  );
}

export const animalCrossingExporter = registerExporter(
  animalCrossingExporterDefinition,
  AnimalCrossingExporterView,
);
