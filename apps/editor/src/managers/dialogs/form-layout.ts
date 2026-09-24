export interface FormLayout {
  height?: number;
  originOffsetY?: number;
  initialFocusAction?: string;
  fields: Readonly<
    Record<
      string,
      { x: number; y: number; width: number; height?: number; labelWidth?: number; inset?: number }
    >
  >;
  tabs?: { x: number; y: number; widths: readonly number[]; height: number };
  separators?: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    vertical?: boolean;
  }[];
  actions?: Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;
}
