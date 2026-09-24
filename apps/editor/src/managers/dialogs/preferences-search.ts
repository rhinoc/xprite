export const PREFERENCES_SEARCH_DELAY_MS = 250;

const MAX_SEARCH_WORD_DISTANCE = 2;
const MIN_FUZZY_SEARCH_WORD_LENGTH = 4;

function wordDistance(query: string, candidate: string): number {
  if (Math.abs(query.length - candidate.length) > MAX_SEARCH_WORD_DISTANCE)
    return MAX_SEARCH_WORD_DISTANCE + 1;
  let previous = Array.from({ length: candidate.length + 1 }, (_, index) => index);
  for (let row = 1; row <= query.length; row++) {
    const current = [row];
    for (let column = 1; column <= candidate.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(query[row - 1] !== candidate[column - 1]),
      );
    }
    previous = current;
  }
  return previous[candidate.length];
}

/** Match setting labels as well as section names, in the displayed language or English. */
export function matchesPreferencesSearch(query: string, labels: readonly string[]): boolean {
  const words = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/u);
  if (!words[0]) return true;
  return labels.some((label) => {
    const text = label.normalize("NFKC").toLocaleLowerCase();
    const candidates = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    return words.every(
      (word) =>
        text.includes(word) ||
        (word.length >= MIN_FUZZY_SEARCH_WORD_LENGTH &&
          /^[a-z]+$/u.test(word) &&
          candidates.some(
            (candidate) =>
              /^[a-z]+$/u.test(candidate) &&
              wordDistance(word, candidate) <=
                Math.min(
                  MAX_SEARCH_WORD_DISTANCE,
                  Math.floor(word.length / MIN_FUZZY_SEARCH_WORD_LENGTH),
                ),
          )),
    );
  });
}
