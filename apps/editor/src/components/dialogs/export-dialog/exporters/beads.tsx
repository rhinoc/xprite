import { lazyChunk } from "$/components/shared/lazy-chunk";
import { beadExporterDefinition } from "$/managers/files/bead-export";
import { registerExporter } from "$/managers/files/exporter-registry";

const View = lazyChunk(() =>
  import("$/components/dialogs/bead-export-dialog").then((module) => ({
    default: module.BeadExportDialog,
  })),
);
export const beadExporter = registerExporter(beadExporterDefinition, View);
