import type { SessionSource } from "@xprite/editor-core/session";

export const DEFAULT_SEQUENCE_FRAME_DURATION_MS = 100;
export const MIN_SEQUENCE_FRAME_DURATION_MS = 1;
export const MAX_SEQUENCE_FRAME_DURATION_MS = 65535;

export enum FileImportKind {
  Document = "document",
  PngSequence = "png-sequence",
}

export type FileImportItem =
  | { kind: FileImportKind.Document; source: SessionSource<string> }
  | {
      kind: FileImportKind.PngSequence;
      name: string;
      sources: readonly SessionSource<string>[];
      durationMs: number;
    };

export interface NumberedPngGroup {
  name: string;
  sources: readonly SessionSource<string>[];
}

/** Only selected files can participate; browsers cannot enumerate their siblings. */
export function numberedPngGroups(sources: readonly SessionSource<string>[]): NumberedPngGroup[] {
  const candidates = new Map<
    string,
    { prefix: string; files: { source: SessionSource<string>; number: bigint }[] }
  >();
  for (const source of sources) {
    const match = /^(.*?)(\d+)\.png$/i.exec(source.name);
    if (!match) continue;
    // Prefix casing is significant: two differently named assets must stay separate.
    const prefix = match[1];
    const group = candidates.get(prefix) ?? { prefix, files: [] };
    group.files.push({ source, number: BigInt(match[2]) });
    candidates.set(prefix, group);
  }
  return (
    [...candidates.values()]
      .filter((group) => group.files.length > 1)
      // Duplicate frame numbers are ambiguous, so open those files independently.
      .filter(
        (group) => new Set(group.files.map((file) => file.number)).size === group.files.length,
      )
      .map((group) => ({
        name: `${group.prefix.replace(/[-_. ]+$/, "") || "Animation"}.aseprite`,
        sources: group.files
          .sort((left, right) =>
            left.number < right.number ? -1 : left.number > right.number ? 1 : 0,
          )
          .map((file) => file.source),
      }))
  );
}

export function fileImportPlan(
  sources: readonly SessionSource<string>[],
  groups: readonly NumberedPngGroup[] = [],
  durationMs = DEFAULT_SEQUENCE_FRAME_DURATION_MS,
): FileImportItem[] {
  const groupBySource = new Map(
    groups.flatMap((group) => group.sources.map((source) => [source.source, group] as const)),
  );
  const emitted = new Set<NumberedPngGroup>();
  return sources.flatMap((source): FileImportItem[] => {
    const group = groupBySource.get(source.source);
    if (!group) return [{ kind: FileImportKind.Document, source }];
    if (emitted.has(group)) return [];
    emitted.add(group);
    return [
      { kind: FileImportKind.PngSequence, name: group.name, sources: group.sources, durationMs },
    ];
  });
}

export function importItemSources(item: FileImportItem): readonly SessionSource<string>[] {
  return item.kind === FileImportKind.Document ? [item.source] : item.sources;
}
