export enum ShowcaseMusicVolume {
  Muted = 0,
  Level1 = 1,
  Level2 = 2,
  Level3 = 3,
  Level4 = 4,
  Level5 = 5,
  Level6 = 6,
  Level7 = 7,
}

export const DEFAULT_MUSIC_VOLUME = ShowcaseMusicVolume.Level2;
// Preserve the original quarter-volume default, with seven ascending audible levels.
const MUSIC_GAINS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 1] as const;
export function musicVolumeGain(volume: ShowcaseMusicVolume): number {
  return MUSIC_GAINS[volume];
}
export function normalizeMusicVolume(value: unknown): ShowcaseMusicVolume {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= ShowcaseMusicVolume.Level1 &&
    value <= ShowcaseMusicVolume.Level7
    ? (value as ShowcaseMusicVolume)
    : DEFAULT_MUSIC_VOLUME;
}
