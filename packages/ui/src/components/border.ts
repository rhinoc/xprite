export interface BorderOptions<Style extends string> {
  style: Style;
}

export type Border<Style extends string> = boolean | BorderOptions<Style>;

export function borderStyle<Style extends string>(
  border: Border<Style>,
  defaultStyle: Style,
): Style | undefined {
  if (border === false) return undefined;
  return border === true ? defaultStyle : border.style;
}
