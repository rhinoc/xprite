/** Each exporter owns the schema and validation of its opaque settings. */
export interface ExportRecord {
  exporter: string;
  options: unknown;
}

export interface DocumentExportPreferences {
  lastExporter?: string;
  options?: Record<string, unknown>;
}

export function normalizeDocumentExportPreferences(value: unknown): DocumentExportPreferences {
  if (!value || typeof value !== "object") return {};
  const source = value as Partial<DocumentExportPreferences>;
  return {
    ...(typeof source.lastExporter === "string" ? { lastExporter: source.lastExporter } : {}),
    ...(source.options && typeof source.options === "object" && !Array.isArray(source.options)
      ? { options: source.options }
      : {}),
  };
}

export function lastDocumentExport(preferences: DocumentExportPreferences): ExportRecord | null {
  const exporter = preferences.lastExporter;
  return exporter && Object.prototype.hasOwnProperty.call(preferences.options ?? {}, exporter)
    ? { exporter, options: preferences.options![exporter] }
    : null;
}
