import { lazyChunk } from "$/components/shared/lazy-chunk";
import type { SpriteSheetDialogOptions } from "$/managers/dialogs/sprite-sheet-dialog-model";
import { registerExporter, type ExporterViewProps } from "$/managers/files/exporter-registry";
import {
  sheetExporterDefinition,
  SheetExporterId,
  type SheetExporterSource,
} from "$/managers/files/exporters/sheet";

const Dialog = lazyChunk(() =>
  import("$/components/dialogs/sprite-sheet-dialog").then((module) => ({
    default: module.SpriteSheetDialog,
  })),
);

function SheetExporterView(
  props: ExporterViewProps<SheetExporterSource, SpriteSheetDialogOptions>,
) {
  return (
    <Dialog
      embedded
      active={props.active}
      documentKey={props.source.documentKey}
      initialSource={props.source.initialSource}
      onPreview={props.source.preview}
      busy={props.busy}
      onLayoutSizeChange={props.onLayoutSizeChange}
      onClose={props.onClose}
      onExport={props.execute}
    />
  );
}

export const spriteSheetExporter = registerExporter(
  sheetExporterDefinition(SheetExporterId.SpriteSheet),
  SheetExporterView,
);
export const tilesetExporter = registerExporter(
  sheetExporterDefinition(SheetExporterId.Tileset),
  SheetExporterView,
);
