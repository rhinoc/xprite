import { textRuns } from "$/components/text/text-runs";

/** Wrap localized words without splitting ordinary Latin words or dropping explicit lines. */
export function wrapTooltipText(
  text: string,
  maximumWidth: number,
  measureText: (text: string) => number,
): string[] {
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    const append = (segment: string) => {
      if (line && measureText(line + segment) > maximumWidth) {
        lines.push(line.trimEnd());
        line = "";
      }
      line += line ? segment : segment.trimStart();
    };
    const segments = textRuns(paragraph).flatMap((run) =>
      run.cjk ? [...run.text] : (run.text.match(/\s+|\S+/g) ?? []),
    );
    for (const segment of segments) {
      if (measureText(segment) > maximumWidth) {
        for (const character of segment) append(character);
      } else {
        append(segment);
      }
    }
    lines.push(line.trimEnd());
    return lines;
  });
}
