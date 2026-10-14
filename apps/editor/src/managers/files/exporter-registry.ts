import { createElement, type ComponentType, type ReactNode } from "react";

import { tUi, type UiMessageKey } from "$/i18n";
import type { ExportExecutionPorts } from "$/managers/files/export-animation";
import type { DocumentExportPreferences } from "$/managers/files/export-preferences";
import type { EditorPlatformPorts } from "$/managers/ports/platform";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import type { PixelBuffer, Rgba } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";

export enum ExporterGroup {
  Sheets = "sheets",
  Crafts = "crafts",
}

export interface ExporterContext {
  document: EditorDocument;
  documentKey: string;
  platform: EditorPlatformPorts;
  preferences: DocumentExportPreferences;
  preview(pixels: PixelBuffer | null): void;
}

export interface ExporterResult {
  names: string[];
  generated?: { pixels: PixelBuffer; palette?: Rgba[]; name: string };
}

export interface ExporterChoice {
  id: string;
  /** Readable translation key, resolved with tUi when rendered. */
  label: UiMessageKey;
  disabled?: boolean;
}

export interface ExporterViewProps<Source, Options> {
  source: Source;
  active: boolean;
  busy: boolean;
  filePreferences: FilePreferences;
  choiceRequest?: { id: string };
  onChoiceChange(id: string): void;
  onChoicesChange(choices: readonly ExporterChoice[]): void;
  onLayoutSizeChange(size: { width: number; height: number }): void;
  onBusyChange(busy: boolean): void;
  onExported(options: Options): void;
  onClose(): void;
  execute(options: Options): void;
}

export interface ExporterDefinition<Source, Options> {
  id: string;
  label(): string;
  group?: ExporterGroup;
  initialSize: { width: number; height: number };
  helpUrl?: string;
  initialChoices?: readonly ExporterChoice[];
  resolveChoices?(context: ExporterContext): Promise<readonly ExporterChoice[]>;
  available(context: ExporterContext): boolean;
  normalizeOptions(value: unknown): Options | null;
  canRepeat?(context: ExporterContext, options: Options): boolean;
  createSource(context: ExporterContext, remembered: Options | null): Source;
  execute(
    context: ExporterContext,
    options: Options,
    ports: ExportExecutionPorts,
  ): Promise<ExporterResult>;
}

export interface ExporterPanelProps extends Omit<ExporterViewProps<unknown, unknown>, "source"> {
  context: ExporterContext;
}

export interface RegisteredExporter extends Omit<
  ExporterDefinition<unknown, unknown>,
  "createSource" | "canRepeat"
> {
  canRepeat(context: ExporterContext, value: unknown): boolean;
  createPanel(context: ExporterContext): (props: Omit<ExporterPanelProps, "context">) => ReactNode;
}

/** Erase module types once at registration; source/settings stay typed inside its view. */
export function registerExporter<Source, Options>(
  definition: ExporterDefinition<Source, Options>,
  View: ComponentType<ExporterViewProps<Source, Options>>,
): RegisteredExporter {
  return {
    ...definition,
    canRepeat(context, value) {
      const options = definition.normalizeOptions(value);
      return (
        options !== null &&
        definition.available(context) &&
        (definition.canRepeat?.(context, options) ?? true)
      );
    },
    createPanel(context) {
      const source = definition.createSource(
        context,
        definition.normalizeOptions(context.preferences.options?.[definition.id]),
      );
      return (props) => createElement(View, { ...props, source });
    },
    async execute(context, value, ports) {
      const options = definition.normalizeOptions(value);
      if (!options) throw new Error(tUi("ui.export.invalid.settings"));
      return definition.execute(context, options, ports);
    },
  };
}

export class ExporterRegistry {
  readonly entries: readonly RegisteredExporter[];
  constructor(entries: readonly RegisteredExporter[]) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
      throw new Error(tUi("ui.export.registry.duplicate"));
    this.entries = Object.freeze([...entries]);
  }
  get(id: string | undefined) {
    return this.entries.find((entry) => entry.id === id);
  }
  available(id: string | undefined, context: ExporterContext) {
    return this.get(id)?.available(context) ?? false;
  }
  async execute(id: string, context: ExporterContext, value: unknown, ports: ExportExecutionPorts) {
    const entry = this.get(id);
    if (!entry?.available(context)) throw new Error(tUi("ui.export.unavailable"));
    const options = entry.normalizeOptions(value);
    if (options === null) throw new Error(tUi("ui.export.invalid.settings"));
    const captured = structuredClone(options);
    const result = await entry.execute(context, captured, ports);
    ports.rememberExport?.({ exporter: id, options: captured });
    return result;
  }
  firstAvailable(context: ExporterContext) {
    return this.entries.find((entry) => entry.available(context));
  }
}
