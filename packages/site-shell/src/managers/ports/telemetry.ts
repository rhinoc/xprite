export enum SiteTelemetryEvent {
  Pageview = "$pageview",
  CtaClick = "site_cta_click",
  FileOpened = "tool_file_opened",
  OutputHandedOff = "tool_output_handed_off",
  OperationFailed = "tool_operation_failed",
}

export enum SitePageType {
  Editor = "editor",
  Showcase = "showcase",
  Gallery = "gallery",
  Article = "article",
  Help = "help",
  Tools = "tools",
  Tool = "tool",
  Other = "other",
}

export enum SiteToolName {
  Viewer = "viewer",
  GifSheet = "gif-to-sprite-sheet",
  AnimalCrossing = "animal-crossing-qr",
}

export type SiteTelemetryProperties = Readonly<Record<string, string | number | boolean | null>>;

/** Product workflows report results; the browser adapter supplies visit context and delivery. */
export interface SiteTelemetryPort {
  readonly enabled: boolean;
  capture(event: SiteTelemetryEvent, properties: SiteTelemetryProperties): void;
}
