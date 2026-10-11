import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  AnimalCrossingDownloadKind,
  type AnimalCrossingExportOptions,
} from "$/managers/files/animal-crossing-export-options";
import type { AnimalCrossingExportPort } from "$/managers/ports/animal-crossing-export";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  animalCrossingDocumentSource,
  animalCrossingGrid,
  animalCrossingQrPixels,
  type AnimalCrossingSettings,
  type AnimalCrossingConversionSnapshot,
} from "@xprite/editor-core/import-export";

export type { AnimalCrossingSettings } from "@xprite/editor-core/import-export";
export type AnimalCrossingGrid = ReturnType<typeof animalCrossingGrid>;
export type { AnimalCrossingExportPort } from "$/managers/ports/animal-crossing-export";
export interface AnimalCrossingExportSource {
  name: string;
  pixels: PixelBuffer;
  settings: AnimalCrossingSettings;
}
export function createAnimalCrossingExportSource(
  document: EditorDocument,
): AnimalCrossingExportSource {
  return animalCrossingDocumentSource(document);
}
type AnimalCrossingExportSnapshot = Pick<
  AnimalCrossingConversionSnapshot,
  "settings" | "result" | "selected" | "qr" | "error"
> & {
  busy: boolean;
  pending: boolean;
  grid: AnimalCrossingGrid | null;
};
const PREVIEW_DELAY_MS = 200;
const GEOMETRY_KEYS = [
  "cellWidth",
  "cellHeight",
  "offsetX",
  "offsetY",
  "spacingX",
  "spacingY",
] as const;

/** Export drafts use cancellable background previews; saving owns a separate lock. */
export class AnimalCrossingExportManager {
  private snapshot: AnimalCrossingExportSnapshot;
  private closed = false;
  private active = true;
  private request = 0;
  private gridDraft: { settings: AnimalCrossingSettings; selected: number } | null = null;
  private previewRevision = 0;
  private previewController: AbortController | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly source: AnimalCrossingExportSource,
    private readonly port: AnimalCrossingExportPort,
    private readonly onExported?: (options: AnimalCrossingExportOptions) => void,
  ) {
    this.snapshot = {
      settings: { ...source.settings },
      result: null,
      qr: null,
      selected: 0,
      error: null,
      busy: false,
      pending: true,
      grid: this.gridFor(source.settings),
    };
  }
  private gridFor(settings: AnimalCrossingSettings) {
    try {
      return animalCrossingGrid(this.source.pixels, settings);
    } catch {
      return null;
    }
  }
  beginGridEdit = () => {
    if (this.closed || this.snapshot.busy || this.gridDraft) return;
    this.gridDraft = { settings: { ...this.snapshot.settings }, selected: this.snapshot.selected };
    this.cancelPreview();
  };
  endGridEdit = (cancel = false) => {
    const draft = this.gridDraft;
    if (this.closed) {
      this.gridDraft = null;
      return;
    }
    if (!draft) return;
    this.gridDraft = null;
    if (cancel) this.update({ ...draft, grid: this.gridFor(draft.settings), pending: true });
    if (this.snapshot.pending && this.active) this.schedulePreview(0);
  };
  private update(patch: Partial<AnimalCrossingExportSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private cancelPreview() {
    this.previewRevision++;
    if (this.previewTimer !== undefined) clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.previewController?.abort();
    this.previewController = null;
  }
  private schedulePreview(delay: number) {
    this.cancelPreview();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = undefined;
      void this.generate();
    }, delay);
  }
  connect = () => {
    this.closed = false;
    this.update({ busy: false });
    if (this.snapshot.pending && this.active) this.schedulePreview(0);
    return () => {
      this.closed = true;
      this.gridDraft = null;
      this.request++;
      this.cancelPreview();
      this.port.releasePreview(this.source.pixels);
    };
  };
  setActive = (active: boolean) => {
    this.active = active;
    if (!active) {
      this.endGridEdit(true);
      this.cancelPreview();
      this.port.releasePreview(this.source.pixels);
    } else if (this.snapshot.pending && !this.closed) this.schedulePreview(0);
  };
  changeSettings = (patch: Partial<AnimalCrossingSettings>) => {
    if (this.closed || this.snapshot.busy) return;
    const changed = Object.entries(patch).some(
      ([key, value]) => this.snapshot.settings[key as keyof AnimalCrossingSettings] !== value,
    );
    if (!changed) return;
    const geometryChanged = GEOMETRY_KEYS.some(
      (key) => patch[key] !== undefined && patch[key] !== this.snapshot.settings[key],
    );
    const settings = { ...this.snapshot.settings, ...patch };
    const grid = geometryChanged ? this.gridFor(settings) : this.snapshot.grid;
    const previous = this.snapshot.grid;
    const column = previous ? this.snapshot.selected % previous.columns : 0;
    const row = previous ? Math.floor(this.snapshot.selected / previous.columns) : 0;
    const selected = grid
      ? Math.min(row, grid.rows - 1) * grid.columns + Math.min(column, grid.columns - 1)
      : 0;
    this.update({
      settings,
      grid,
      selected,
      pending: true,
      error: null,
    });
    if (!this.gridDraft && this.active) this.schedulePreview(PREVIEW_DELAY_MS);
  };
  generate = async () => {
    if (this.closed || !this.active || this.snapshot.busy) return;
    this.cancelPreview();
    const revision = this.previewRevision;
    const controller = new AbortController();
    this.previewController = controller;
    this.update({ pending: true, error: null });
    const settings = { ...this.snapshot.settings };
    try {
      const preview = await this.port.preview(
        this.source.pixels,
        settings,
        this.snapshot.selected,
        controller.signal,
      );
      if (this.closed || revision !== this.previewRevision) return;
      this.update({ ...preview, pending: false, error: null });
    } catch (reason) {
      if (!this.closed && revision === this.previewRevision)
        this.update({
          result: null,
          qr: null,
          pending: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
    } finally {
      if (revision === this.previewRevision) this.previewController = null;
    }
  };
  select = (selected: number) => {
    if (
      this.closed ||
      this.snapshot.busy ||
      !Number.isInteger(selected) ||
      selected === this.snapshot.selected
    )
      return;
    if (!this.snapshot.grid?.cells[selected]) return;
    if (this.snapshot.pending) {
      this.update({ selected });
      if (!this.gridDraft && this.active) this.schedulePreview(0);
      return;
    }
    const pattern = this.snapshot.result?.patterns[selected];
    if (pattern) this.update({ selected, qr: animalCrossingQrPixels(pattern.bytes) });
  };
  private async save(action: () => Promise<void>, options: AnimalCrossingExportOptions) {
    if (this.closed || this.snapshot.busy || this.snapshot.pending) return;
    const request = ++this.request;
    this.update({ busy: true, error: null });
    try {
      await action();
      if (!this.closed && request === this.request) this.onExported?.(options);
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.update({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      if (!this.closed && request === this.request) this.update({ busy: false });
    }
  }
  download = async () => {
    const { result, settings, selected } = this.snapshot;
    if (result)
      await this.save(
        () =>
          this.port.save(result, `${this.source.name.replace(/\.[^.]+$/, "")}-animal-crossing.zip`),
        { settings: { ...settings }, selected, download: AnimalCrossingDownloadKind.Archive },
      );
  };
  downloadQr = async () => {
    const { result, selected, qr, settings } = this.snapshot;
    const pattern = result?.patterns[selected];
    if (qr && pattern)
      await this.save(
        () => this.port.saveQr(qr, `r${pattern.row + 1}-c${pattern.column + 1}-qr.png`),
        { settings: { ...settings }, selected, download: AnimalCrossingDownloadKind.Qr },
      );
  };
}
export function useAnimalCrossingExport(
  source: AnimalCrossingExportSource,
  port: AnimalCrossingExportPort,
  onExported?: (options: AnimalCrossingExportOptions) => void,
  active = true,
) {
  const manager = useMemo(
    () => new AnimalCrossingExportManager(source, port, onExported),
    [source, port, onExported],
  );
  useEffect(manager.connect, [manager]);
  useEffect(() => manager.setActive(active), [manager, active]);
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  return {
    ...snapshot,
    changeSettings: manager.changeSettings,
    select: manager.select,
    beginGridEdit: manager.beginGridEdit,
    endGridEdit: manager.endGridEdit,
    download: manager.download,
    downloadQr: manager.downloadQr,
  };
}
