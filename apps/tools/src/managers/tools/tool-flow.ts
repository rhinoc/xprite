const STEP_SEPARATOR = " · ";

/**
 * Step cue for the shared status bar: "Generated · Adjust · Export" once the default result
 * exists, a start hint while empty and a progress word while it is being made.
 */
export function flowCue(
  t: (source: string) => string,
  state: { ready: boolean; processing: boolean },
): string {
  if (!state.ready) return t("Open a file to start");
  if (state.processing) return t("Generating…");
  return [t("Generated"), t("Adjust"), t("Export")].join(STEP_SEPARATOR);
}
