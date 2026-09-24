import type { RuntimeCapabilitySnapshot } from "$/managers/ports/diagnostics";

export enum TechnicalCapability {
  OpenFilePicker = "open-file-picker",
  SaveFilePicker = "save-file-picker",
  Opfs = "opfs",
  IndexedDb = "indexeddb",
  Workers = "workers",
  CompressionStream = "compression-stream",
  OffscreenCanvas = "offscreen-canvas",
  ImageBitmap = "image-bitmap",
}

export interface TechnicalSupportRow {
  readonly capability: TechnicalCapability;
  readonly detected: boolean;
}

/** Lists the browser APIs detected by the compatibility check. */
export function getTechnicalSupportRows(
  capabilities: RuntimeCapabilitySnapshot,
): readonly TechnicalSupportRow[] {
  return [
    {
      capability: TechnicalCapability.OpenFilePicker,
      detected: capabilities.openFilePicker,
    },
    {
      capability: TechnicalCapability.SaveFilePicker,
      detected: capabilities.saveFilePicker,
    },
    {
      capability: TechnicalCapability.Opfs,
      detected: capabilities.opfs,
    },
    {
      capability: TechnicalCapability.IndexedDb,
      detected: capabilities.indexedDb,
    },
    {
      capability: TechnicalCapability.Workers,
      detected: capabilities.workers,
    },
    {
      capability: TechnicalCapability.CompressionStream,
      detected: capabilities.compressionStream,
    },
    {
      capability: TechnicalCapability.OffscreenCanvas,
      detected: capabilities.offscreenCanvas,
    },
    {
      capability: TechnicalCapability.ImageBitmap,
      detected: capabilities.imageBitmap,
    },
  ];
}
