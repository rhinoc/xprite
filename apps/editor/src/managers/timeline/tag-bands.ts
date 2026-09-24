import { useEffect, useMemo, useState } from "react";

export const TIMELINE_TAG_BAND_HEIGHT = 38;
interface TagBandItem {
  from: number;
  to: number;
  name: string;
}

/** Reserve the frame range and the name's visible width, as Timeline::regenerateTagBands does. */
function arrangeTagBands(
  tags: readonly TagBandItem[],
  frameWidth: number,
  nameWidth: (name: string) => number,
): number[] {
  const ends: number[] = [];
  return tags.map((tag) => {
    let band = ends.findIndex((end) => tag.from > end);
    if (band < 0) band = ends.length;
    ends[band] = Math.max(tag.to, tag.from + Math.floor(nameWidth(tag.name) / frameWidth));
    return band;
  });
}

/** Tag focus belongs to the current timeline view and never changes artwork or preferences. */
export function useTimelineTagBands(
  tags: readonly TagBandItem[],
  identity: number | null,
  frameWidth: number,
  nameWidth: (name: string) => number,
) {
  const bands = useMemo(
    () => arrangeTagBands(tags, frameWidth, nameWidth),
    [tags, frameWidth, nameWidth],
  );
  const count = bands.reduce((maximum, band) => Math.max(maximum, band + 1), 1);
  const [focus, setFocus] = useState<{ identity: number | null; band: number } | null>(null);
  useEffect(() => {
    setFocus((current) =>
      current && (current.identity !== identity || current.band >= count) ? null : current,
    );
  }, [identity, count]);
  const focusedBand = focus?.identity === identity && focus.band < count ? focus.band : -1;
  const visibleCount = focusedBand < 0 ? count : 1;
  return {
    bands,
    count,
    focusedBand,
    height: visibleCount * TIMELINE_TAG_BAND_HEIGHT,
    row: (index: number) =>
      focusedBand < 0 ? (bands[index] ?? 0) : bands[index] === focusedBand ? 0 : -1,
    toggleFocus: (band: number) => setFocus({ identity, band: focusedBand < 0 ? band : -1 }),
  };
}
