const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function replayTimeLabel(milliseconds: number) {
  const seconds = Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
}
