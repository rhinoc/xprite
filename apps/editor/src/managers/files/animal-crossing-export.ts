import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { AnimalCrossingExportPort } from "$/managers/ports/animal-crossing-export";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  AnimalCrossingConversion,
  animalCrossingDocumentSource,
  type AnimalCrossingSettings,
  type AnimalCrossingConversionSnapshot,
} from "@xprite/editor-core/import-export";

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
> & { busy: boolean };

export class AnimalCrossingExportManager {
  private readonly conversion: AnimalCrossingConversion;
  private snapshot: AnimalCrossingExportSnapshot;
  private exportError: string | null = null;
  private busy = false;
  private closed = false;
  private request = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly source: AnimalCrossingExportSource,
    private readonly port: AnimalCrossingExportPort,
  ) {
    this.conversion = new AnimalCrossingConversion(source.settings, source.pixels);
    this.snapshot = this.readSnapshot();
    this.conversion.subscribe(() => this.publish());
  }

  private readSnapshot(): AnimalCrossingExportSnapshot {
    const { settings, result, selected, qr, error } = this.conversion.getSnapshot();
    return { settings, result, selected, qr, error: this.exportError ?? error, busy: this.busy };
  }
  private publish() {
    if (this.closed) return;
    this.snapshot = this.readSnapshot();
    for (const listener of this.listeners) listener();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /** Reconnect after React's effect cleanup without reviving an older async export. */
  connect = () => {
    this.closed = false;
    this.busy = false;
    this.publish();
    return () => {
      this.closed = true;
      this.request++;
    };
  };
  changeSettings = (patch: Partial<AnimalCrossingSettings>) => {
    if (this.closed || this.busy) return;
    this.exportError = null;
    this.conversion.changeSettings(patch);
  };
  generate = () => {
    if (this.closed || this.busy) return;
    this.exportError = null;
    this.conversion.generate();
  };
  select = (index: number) => {
    if (!this.closed) this.conversion.select(index);
  };
  private async save(action: () => Promise<void>) {
    if (this.closed || this.busy) return;
    const request = ++this.request;
    this.busy = true;
    this.exportError = null;
    this.publish();
    try {
      await action();
    } catch (reason) {
      if (!this.closed && request === this.request)
        this.exportError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      if (!this.closed && request === this.request) {
        this.busy = false;
        this.publish();
      }
    }
  }
  download = async () => {
    const { result } = this.conversion.getSnapshot();
    if (result)
      await this.save(() =>
        this.port.save(result, `${this.source.name.replace(/\.[^.]+$/, "")}-animal-crossing.zip`),
      );
  };
  downloadQr = async () => {
    const { result, selected, qr } = this.conversion.getSnapshot();
    const pattern = result?.patterns[selected];
    if (qr && pattern)
      await this.save(() =>
        this.port.saveQr(qr, `r${pattern.row + 1}-c${pattern.column + 1}-qr.png`),
      );
  };
}

export function useAnimalCrossingExport(
  source: AnimalCrossingExportSource,
  port: AnimalCrossingExportPort,
) {
  const manager = useMemo(() => new AnimalCrossingExportManager(source, port), [source, port]);
  useEffect(manager.connect, [manager]);
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  return {
    ...snapshot,
    changeSettings: manager.changeSettings,
    generate: manager.generate,
    select: manager.select,
    download: manager.download,
    downloadQr: manager.downloadQr,
  };
}
