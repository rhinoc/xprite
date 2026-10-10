import type { AtlasPartName, UiColorRole } from "$/base/theme/theme-name-types";

export type UiAppearance = "light" | "dark";

export interface UiMenuGlyph {
  width: number;
  height: number;
  advance: number;
  paths: readonly { path: string; opacity: number }[];
}

export interface UiTooltipPointerArtwork {
  textOffset?: { x: number; y: number };
  inkPath: string;
  facePath: string;
  width: number;
  height: number;
  horizontal: "left" | "right";
  horizontalInset: number;
  vertical: "top" | "bottom";
  verticalInset: number;
  bodyInsets: { left: number; top: number; right: number; bottom: number };
}

interface UiFontMetrics {
  fontFamily: string;
  /** Script fallback and advance must match the face used by DOM and Canvas. */
  cjkFontFamily?: string;
  cjkAdvance?: number;
  /** CSS pixels at the standard artwork scale (2). */
  fontSize: number;
  lineHeight: number;
  advances: Readonly<Record<string, number>>;
  glyphBleed?: number;
}

export interface UiPartDefinition {
  /** Atlas scale preferred by canvas painters; layout geometry is unchanged. */
  paintScale?: number;
  id?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  w1?: number;
  w2?: number;
  w3?: number;
  h1?: number;
  h2?: number;
  h3?: number;
  width: number;
  height: number;
  focusx?: number;
  focusy?: number;
  slices: number[] | null;
  /** Optional foreground role for glyphs that contain only ink and transparency. */
  foregroundRole?: UiColorRole;
  vector?: {
    width: number;
    height: number;
    path: string;
    hoverPath?: string;
    pressedPath?: string;
    pressedFace?: { path: string; colorRole: UiColorRole };
  };
  /** Vector surfaces keep thin classic frames independent of atlas raster scale. */
  surface?: {
    faceRole?: UiColorRole;
    borderRole: UiColorRole;
    borderWidth: number;
    focusedBorderWidth?: number;
    borderSides?: readonly [boolean, boolean, boolean, boolean];
    radius?: number | readonly [number, number, number, number];
    shadow?: number;
    mark?: "check" | "radio";
    pixelCircle?: boolean;
    frame?: { image: string; slice: string; width: string };
    titlebar?: { height: number; stripeCount: number; stripeStep: number; inset: number };
  };
}

export interface UiStyleDefinition {
  provenance: {
    source: string;
    sha256: string;
    sheetSha256: string;
  };
  sheet: { width: number; height: number };
  dimensions: Record<string, number>;
  colors: Record<string, string>;
  typography?: Partial<Record<"default" | "mini", UiFontMetrics>>;
  parts: Record<AtlasPartName, UiPartDefinition>;
  /** Component skin bindings let themes reuse atlas parts without changing behavior. */
  controlParts?: {
    timeline?: {
      /** Uniform spacing or top/right/bottom/left edges, matching the cell border. */
      thumbnailInset: number | readonly [number, number, number, number];
      /** Recolors the existing shared grid edges without adding an inset frame. */
      selectionBorderPart?: AtlasPartName;
    };
    canvasSurface?: {
      checker: {
        readonly cellSize: number;
        readonly light: readonly [number, number, number];
        readonly dark: readonly [number, number, number];
      };
    };
    button?: {
      part?: AtlasPartName;
      textOffsetY?: Partial<Record<"default" | "mini", number>>;
      /** Align icons with the visible face when the frame includes atlas shadow pixels. */
      frameIconOffset?: { x: number; y: number };
      font: "default" | "mini";
      outline?: {
        radius: number;
        minimumWidth: number;
        minimumHeight: number;
        pixelCorners?: boolean;
      };
    };
    tooltip?: {
      balloon: boolean;
      font?: "default" | "mini";
      padding?: number;
      pointerSize?: number;
      pointerArtworks?: Readonly<Record<string, UiTooltipPointerArtwork>>;
    };
    checkable?: {
      focus: "icon" | "frame";
      hoverFace?: UiColorRole;
      focusFace?: UiColorRole;
    };
    splitButton?: { arrowOpen: AtlasPartName };
    panel?: { header: "cutout" };
    listBox?: {
      borderWidth: number;
      innerInset: number;
      contentInset: number;
      rowHeight: number;
      textInset: number;
      font: "default" | "mini";
    };
    menu?: {
      checkedVector: { width: number; height: number; path: string };
      arrowPart: AtlasPartName;
      shortcutGlyphs?: Readonly<Record<string, UiMenuGlyph>>;
      labelGlyphs?: Readonly<Record<string, UiMenuGlyph>>;
      selectFirstOnOpen?: boolean;
      pressToOpen?: boolean;
    };
    scrollbar?: {
      arrowExtent: number;
      thumbSize: number;
      areaVariant?: "regular" | "mini" | "transparent";
    };
    alert?: {
      minimumWidth: number;
      messageLeft: number;
      messageRight: number;
      messageTop: number;
      messageHeight: number;
      buttonGap: number;
      buttonTopGap: number;
      buttonRight: number;
      bottomPadding: number;
      icon: { width: number; height: number; x: number; y: number; path: string };
    };
    combobox?: {
      popupMenu?: boolean;
      faceNormal: AtlasPartName;
      faceHot?: AtlasPartName;
      faceFocused: AtlasPartName;
      arrowNormal: AtlasPartName;
      arrowHot: AtlasPartName;
      arrowPressed: AtlasPartName;
      arrowOpen?: AtlasPartName;
    };
  };
}
