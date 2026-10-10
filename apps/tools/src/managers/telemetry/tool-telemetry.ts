import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import {
  SiteTelemetryEvent,
  SitePageType,
  type SiteTelemetryPort,
  type SiteTelemetryProperties,
} from "@xprite/site-shell/telemetry";

export enum ToolOpenSource {
  File = "file",
  Example = "example",
}
export enum ToolOperation {
  Open = "open",
  Export = "export",
}
export enum ToolOutputFormat {
  Png = "png",
  Gif = "gif",
  Json = "json",
  Zip = "zip",
}
const INPUT_FORMATS = new Set(["ase", "aseprite", "gif", "png", "jpg", "jpeg", "acnl"]);
const UNKNOWN_FORMAT = "unknown";

/** Called only at workflow result boundaries; never receives pixels, names or error messages. */
export class ToolTelemetry {
  constructor(private readonly port?: SiteTelemetryPort) {}

  opened(fileId: number, file: File, source: ToolOpenSource): void {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? UNKNOWN_FORMAT;
    this.capture(SiteTelemetryEvent.FileOpened, {
      file_id: fileId,
      input_format: INPUT_FORMATS.has(extension) ? extension : UNKNOWN_FORMAT,
      open_source: source,
    });
  }

  handedOff(fileId: number, format: ToolOutputFormat): void {
    this.capture(SiteTelemetryEvent.OutputHandedOff, { file_id: fileId, output_format: format });
  }

  failed(operation: ToolOperation, category: ToolFailureCategory, reason?: unknown): void {
    const name = reason instanceof Error ? reason.name : undefined;
    if (name === "AbortError") return;
    const errorCategory =
      name === "NotAllowedError" || name === "SecurityError"
        ? ToolFailureCategory.Permission
        : reason instanceof ToolOperationError
          ? reason.category
          : reason instanceof RangeError
            ? ToolFailureCategory.Limit
            : category;
    this.capture(SiteTelemetryEvent.OperationFailed, { operation, error_category: errorCategory });
  }

  editorEntry(): void {
    this.capture(SiteTelemetryEvent.CtaClick, {
      cta_target: SitePageType.Editor,
      target_page_path: "/editor",
    });
  }

  private capture(event: SiteTelemetryEvent, properties: SiteTelemetryProperties): void {
    try {
      this.port?.capture(event, properties);
    } catch {
      /* Analytics never changes the tool result. */
    }
  }
}
