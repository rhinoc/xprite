export function isCjk(codepoint: number) {
  return (
    (codepoint >= 0x2e80 && codepoint <= 0x30ff) ||
    (codepoint >= 0x3100 && codepoint <= 0x31ff) ||
    (codepoint >= 0x3400 && codepoint <= 0x9fff) ||
    (codepoint >= 0xac00 && codepoint <= 0xd7ff) ||
    (codepoint >= 0xf900 && codepoint <= 0xfaff) ||
    (codepoint >= 0xff00 && codepoint <= 0xffef) ||
    (codepoint >= 0x20000 && codepoint <= 0x323af)
  );
}

export function textRuns(value: string) {
  const runs: { text: string; cjk: boolean }[] = [];
  for (const char of value) {
    const cjk = isCjk(char.codePointAt(0)!);
    const last = runs[runs.length - 1];
    if (last?.cjk === cjk) last.text += char;
    else runs.push({ text: char, cjk });
  }
  return runs;
}
