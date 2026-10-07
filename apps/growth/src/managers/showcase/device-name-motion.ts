export const DEVICE_NAME_SCRAMBLE_MILLISECONDS = 700;
export const DEVICE_NAME_TICK_MILLISECONDS = 45;
const SCRAMBLE_GLYPHS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%&*?/";
const MAX_ASCII_CODEPOINT = 0x7f;
const FULLWIDTH_ASCII_OFFSET = 0xfee0;

function scrambleGlyph(letter: string): string {
  const glyph = SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
  return letter.codePointAt(0)! > MAX_ASCII_CODEPOINT
    ? String.fromCodePoint(glyph.codePointAt(0)! + FULLWIDTH_ASCII_OFFSET)
    : glyph;
}

export function deviceNameFrame(text: string, elapsed: number, reducedMotion: boolean): string {
  if (reducedMotion || elapsed >= DEVICE_NAME_SCRAMBLE_MILLISECONDS) return text;
  const letters = Array.from(text);
  const settled = Math.floor((elapsed / DEVICE_NAME_SCRAMBLE_MILLISECONDS) * letters.length);
  return letters
    .map((letter, index) => (index < settled || letter === " " ? letter : scrambleGlyph(letter)))
    .join("");
}
