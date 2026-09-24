import { tUi, tUiSource } from "$/i18n";
import type { RecoveryEntry } from "$/managers/workspace/workspace-recovery";

export interface RecoveryItem {
  id: string;
  name: string;
  description: string;
  session?: { id: string; title: string };
}

enum RecoveryColorDepth {
  Indexed = 8,
  Grayscale = 16,
  Rgb = 32,
}

const COLOR_MODE_NAMES: Record<RecoveryColorDepth, string> = {
  [RecoveryColorDepth.Indexed]: "Indexed",
  [RecoveryColorDepth.Grayscale]: "Grayscale",
  [RecoveryColorDepth.Rgb]: "RGB",
};

/** Describes stored document content; checkpoint times belong to session headings, not filenames. */
export function presentRecoveryEntry(entry: RecoveryEntry): RecoveryItem {
  const frames =
    entry.frameCount === undefined
      ? ""
      : tUi(entry.frameCount === 1 ? "ui.recovery.frames.one" : "ui.recovery.frames.many", {
          count: entry.frameCount,
        });
  const mode = entry.colorDepth === undefined ? "Unknown" : COLOR_MODE_NAMES[entry.colorDepth];
  const date = entry.sessionStartedAt === undefined ? undefined : new Date(entry.sessionStartedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    id: entry.id,
    name: entry.name,
    description: tUi("ui.recovery.sprite.description", {
      mode: tUiSource(mode),
      width: entry.width,
      height: entry.height,
      frames,
      name: entry.name,
    }),
    ...(date
      ? {
          session: {
            id: String(entry.sessionStartedAt),
            title: tUi("ui.recovery.session.title", {
              date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
              time: `${pad(date.getHours())}:${pad(date.getMinutes())}.${pad(date.getSeconds())}`,
            }),
          },
        }
      : {}),
  };
}
