import type { PreferenceStoragePort } from "$/managers/ports/platform";

const SPRITE_NAME_SEQUENCE_KEY = "xse.workspace.sprite-name-sequence.v1";
const SPRITE_NAME_PREFIX = "Sprite_";
const DATE_PART_WIDTH = 2;
const FIRST_SPRITE_INDEX = 1;

interface SpriteNameSequence {
  date: string;
  index: number;
}

/** Daily default names keep their sequence after documents close or the app reloads. */
export class SpriteNames {
  private sequence: SpriteNameSequence = { date: "", index: 0 };

  constructor(private readonly storage: PreferenceStoragePort) {}

  private currentDay() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(DATE_PART_WIDTH, "0");
    const day = String(now.getDate()).padStart(DATE_PART_WIDTH, "0");
    const date = `${now.getFullYear()}${month}${day}`;
    if (this.sequence.date !== date) this.sequence = { date, index: 0 };
    try {
      const saved = JSON.parse(
        this.storage.getItem(SPRITE_NAME_SEQUENCE_KEY) ?? "null",
      ) as Partial<SpriteNameSequence> | null;
      if (
        saved?.date === date &&
        typeof saved.index === "number" &&
        Number.isSafeInteger(saved.index) &&
        saved.index >= 0
      )
        this.sequence.index = Math.max(this.sequence.index, saved.index);
    } catch {
      // Keep the daily sequence in memory when storage is unavailable.
    }
    return `${SPRITE_NAME_PREFIX}${month}${day}`;
  }

  private indexForName(name: string, baseName: string): number {
    const stem = name.replace(/\.(?:png|aseprite|ase)$/i, "");
    if (stem === baseName) return FIRST_SPRITE_INDEX;
    if (!stem.startsWith(`${baseName}_`)) return 0;
    const suffix = stem.slice(baseName.length + 1);
    if (!/^[1-9]\d*$/.test(suffix)) return 0;
    const index = Number(suffix);
    return Number.isSafeInteger(index) ? index : 0;
  }

  suggest(existingNames: readonly string[]): string {
    const baseName = this.currentDay();
    let index = this.sequence.index;
    for (const name of existingNames) index = Math.max(index, this.indexForName(name, baseName));
    index++;
    return index === FIRST_SPRITE_INDEX ? baseName : `${baseName}_${index}`;
  }

  remember(name: string) {
    const baseName = this.currentDay();
    const index = this.indexForName(name, baseName);
    if (index <= this.sequence.index) return;
    this.sequence.index = index;
    try {
      this.storage.setItem(SPRITE_NAME_SEQUENCE_KEY, JSON.stringify(this.sequence));
    } catch {
      // Naming remains usable for this workspace when storage is unavailable.
    }
  }
}
