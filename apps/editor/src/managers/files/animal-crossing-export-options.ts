import type { AnimalCrossingSettings } from "@xprite/editor-core/import-export";

export enum AnimalCrossingDownloadKind {
  Archive = "archive",
  Qr = "qr",
}
export interface AnimalCrossingExportOptions {
  settings: AnimalCrossingSettings;
  download: AnimalCrossingDownloadKind;
  selected: number;
}
