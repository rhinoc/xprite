export enum CursorScale {
  Normal = 1,
  Double = 2,
  Triple = 3,
  Quadruple = 4,
}

export const CURSOR_SCALES = [
  CursorScale.Normal,
  CursorScale.Double,
  CursorScale.Triple,
  CursorScale.Quadruple,
];

export enum PaintingCursorType {
  Simple = "simple",
  Sprite = "sprite",
  SpriteUnscaled = "sprite-unscaled",
}

export enum BrushPreviewMode {
  None = "none",
  Edges = "edges",
  Full = "full",
  FullAll = "full-all",
  FullEdges = "full-edges",
}

export enum CursorColorType {
  Negative = "negative",
  Specific = "specific",
}

export interface CursorPreferences {
  useNativeCursor: boolean;
  cursorScale: CursorScale;
  paintingCursorType: PaintingCursorType;
  brushPreview: BrushPreviewMode;
  tilePreview: BrushPreviewMode;
  colorType: CursorColorType;
  color: string;
  snapToGrid: boolean;
}

export const DEFAULT_CURSOR_PREFERENCES: Readonly<CursorPreferences> = {
  useNativeCursor: false,
  cursorScale: CursorScale.Normal,
  paintingCursorType: PaintingCursorType.Sprite,
  brushPreview: BrushPreviewMode.Full,
  tilePreview: BrushPreviewMode.Full,
  colorType: CursorColorType.Negative,
  color: "#000000ff",
  snapToGrid: false,
};
const MIN_CURSOR_SCALE = CursorScale.Normal;
const MAX_CURSOR_SCALE = CursorScale.Quadruple;

export function normalizeCursorPreferences(value: unknown): CursorPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const enumValue = <T extends string>(input: unknown, values: readonly T[], fallback: T): T =>
    values.includes(input as T) ? (input as T) : fallback;
  return {
    useNativeCursor:
      typeof saved.useNativeCursor === "boolean"
        ? saved.useNativeCursor
        : DEFAULT_CURSOR_PREFERENCES.useNativeCursor,
    cursorScale:
      typeof saved.cursorScale === "number" && Number.isFinite(saved.cursorScale)
        ? (Math.max(
            MIN_CURSOR_SCALE,
            Math.min(MAX_CURSOR_SCALE, Math.trunc(saved.cursorScale)),
          ) as CursorScale)
        : DEFAULT_CURSOR_PREFERENCES.cursorScale,
    paintingCursorType: enumValue(
      saved.paintingCursorType,
      Object.values(PaintingCursorType),
      DEFAULT_CURSOR_PREFERENCES.paintingCursorType,
    ),
    brushPreview: enumValue(
      saved.brushPreview,
      Object.values(BrushPreviewMode),
      DEFAULT_CURSOR_PREFERENCES.brushPreview,
    ),
    tilePreview: enumValue(
      saved.tilePreview,
      Object.values(BrushPreviewMode),
      DEFAULT_CURSOR_PREFERENCES.tilePreview,
    ),
    colorType: enumValue(
      saved.colorType,
      Object.values(CursorColorType),
      DEFAULT_CURSOR_PREFERENCES.colorType,
    ),
    color:
      typeof saved.color === "string" && /^#[\da-f]{6}([\da-f]{2})?$/i.test(saved.color)
        ? `${saved.color.toLowerCase()}${saved.color.length === 7 ? "ff" : ""}`
        : DEFAULT_CURSOR_PREFERENCES.color,
    snapToGrid:
      typeof saved.snapToGrid === "boolean"
        ? saved.snapToGrid
        : DEFAULT_CURSOR_PREFERENCES.snapToGrid,
  };
}

/** None overrides the document's preview switch; effects retain edges in Full. */
export function resolveBrushPreview(mode: BrushPreviewMode, enabled: boolean, effect: boolean) {
  if (!enabled || mode === BrushPreviewMode.None) return { fill: false, edges: false };
  return {
    fill: mode !== BrushPreviewMode.Edges && (!effect || mode !== BrushPreviewMode.Full),
    edges:
      mode === BrushPreviewMode.Edges ||
      mode === BrushPreviewMode.FullEdges ||
      (mode === BrushPreviewMode.Full && effect),
  };
}
