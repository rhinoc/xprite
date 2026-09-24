export enum UiElementScale {
  Standard = 1,
  Medium = 1.25,
  Large = 1.5,
  ExtraLarge = 1.75,
  Double = 2,
}

export const UI_ELEMENT_SCALE_OPTIONS = Object.values(UiElementScale)
  .filter((value): value is UiElementScale => typeof value === "number")
  .map((value) => ({ value: String(value), label: `${value * 100}%` }));

export function normalizeUiElementScale(value: unknown): UiElementScale {
  return UI_ELEMENT_SCALE_OPTIONS.some((option) => Number(option.value) === value)
    ? (value as UiElementScale)
    : UiElementScale.Standard;
}
