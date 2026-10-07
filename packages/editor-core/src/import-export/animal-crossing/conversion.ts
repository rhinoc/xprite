import type { PixelBuffer } from "$/base";
import {
  animalCrossingQrPixels,
  convertAnimalCrossing,
  importedAnimalCrossingResult,
  type AnimalCrossingResult,
  type AnimalCrossingSettings,
  type ImportedAnimalCrossingPattern,
} from "$/import-export/animal-crossing/codec";

export interface AnimalCrossingConversionSnapshot {
  source: PixelBuffer | null;
  settings: AnimalCrossingSettings;
  importedQr: boolean;
  result: AnimalCrossingResult | null;
  selected: number;
  qr: PixelBuffer | null;
  error: string | null;
}

/** Conversion drafts and results, independent of the importing app and its I/O. */
export class AnimalCrossingConversion {
  private snapshot: AnimalCrossingConversionSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(settings: AnimalCrossingSettings, source: PixelBuffer | null = null) {
    this.snapshot = {
      source,
      settings: { ...settings },
      importedQr: false,
      result: null,
      selected: 0,
      qr: null,
      error: null,
    };
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<AnimalCrossingConversionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  setSource(
    source: PixelBuffer,
    settings = this.snapshot.settings,
    pattern?: ImportedAnimalCrossingPattern,
  ) {
    const result = pattern ? importedAnimalCrossingResult(pattern) : null;
    const qr = result ? animalCrossingQrPixels(result.patterns[0].bytes) : null;
    this.update({
      source,
      settings: { ...settings },
      importedQr: !!pattern,
      result,
      selected: 0,
      qr,
      error: null,
    });
  }

  changeSettings(patch: Partial<AnimalCrossingSettings>) {
    if (this.snapshot.importedQr) return;
    this.update({
      settings: { ...this.snapshot.settings, ...patch },
      result: null,
      selected: 0,
      qr: null,
      error: null,
    });
  }

  clearError() {
    if (this.snapshot.error) this.update({ error: null });
  }

  generate() {
    const { source, settings, importedQr } = this.snapshot;
    if (!source || importedQr) return;
    try {
      const result = convertAnimalCrossing(source, settings);
      const qr = animalCrossingQrPixels(result.patterns[0].bytes);
      this.update({ result, selected: 0, qr, error: null });
    } catch (reason) {
      this.update({
        result: null,
        selected: 0,
        qr: null,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  select(selected: number) {
    if (!Number.isInteger(selected) || selected === this.snapshot.selected) return;
    const pattern = this.snapshot.result?.patterns[selected];
    if (pattern) this.update({ selected, qr: animalCrossingQrPixels(pattern.bytes) });
  }
}
