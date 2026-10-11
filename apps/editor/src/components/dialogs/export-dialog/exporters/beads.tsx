import { lazy } from "react";

import { beadExporterDefinition } from "$/managers/files/bead-export";
import { registerExporter } from "$/managers/files/exporter-registry";

const View = lazy(() =>
  import("$/components/dialogs/bead-export-dialog").then((module) => ({
    default: module.BeadExportDialog,
  })),
);
export const beadExporter = registerExporter(beadExporterDefinition, View);
