import {
  contrastRatio,
  hexToOklch,
  hueDistance,
  maxChroma,
  oklch,
  oklchToHex,
  type Oklch,
} from "$/base/theme/oklch";
import { UiColorScheme } from "$/base/theme/theme-types";

/**
 * Families keep Aseprite Classic's distribution. Every Classic color belongs to one of four
 * roles and keeps its lightness, its hue offset inside the role and its share of the sRGB
 * gamut. A family sets the hue of each role, and the intensity sets how much color the
 * surfaces carry.
 *
 * Classic light: blue-grey frame, beige face, plum canvas, red selection.
 * Classic dark: grey surfaces with a blue selection and a gold accent.
 */
enum PaletteRole {
  Frame = "frame",
  Face = "face",
  Canvas = "canvas",
  Accent = "accent",
}
type RoleHues = Readonly<Record<PaletteRole, number>>;

/** The hue each role has in Aseprite Classic. */
const CLASSIC_HUES: Readonly<Record<UiColorScheme, RoleHues>> = {
  [UiColorScheme.Light]: {
    [PaletteRole.Frame]: hexToOklch("#7d929e").h,
    [PaletteRole.Face]: hexToOklch("#d3cbbe").h,
    [PaletteRole.Canvas]: hexToOklch("#655561").h,
    [PaletteRole.Accent]: hexToOklch("#ff5555").h,
  },
  [UiColorScheme.Dark]: {
    [PaletteRole.Frame]: hexToOklch("#41444a").h,
    [PaletteRole.Face]: hexToOklch("#2c2c30").h,
    [PaletteRole.Canvas]: hexToOklch("#202125").h,
    [PaletteRole.Accent]: hexToOklch("#e1b85f").h,
  },
};
/** Colors below this chroma are greys. */
const ACHROMATIC_CHROMA = 0.005;
/**
 * Classic dark surfaces are nearly grey, so their hue says little about their role.
 * Their lightness does: canvas below, faces, then the frame band, then text.
 */
const DARK_NEUTRAL_CHROMA = 0.04;
const DARK_CANVAS_MAX_LIGHTNESS = 0.27;
const DARK_FACE_MAX_LIGHTNESS = 0.305;
const DARK_TEXT_MIN_LIGHTNESS = 0.56;

export enum ColorIntensity {
  Soft = "soft",
  Vivid = "vivid",
}

interface IntensityRule {
  /** Multiplies the gamut share of light surfaces and dark selections. */
  tint: number;
  /** Tinted shares stop here; full colors such as the selection keep their share. */
  limit: number;
  /** Gamut share of dark surfaces and dark text; null keeps the Classic share. */
  darkSurface: number | null;
  darkText: number | null;
}

const INTENSITIES: Readonly<Record<ColorIntensity, IntensityRule>> = {
  [ColorIntensity.Soft]: { tint: 1.6, limit: 0.5, darkSurface: 0.24, darkText: 0.06 },
  [ColorIntensity.Vivid]: { tint: 3, limit: 0.85, darkSurface: 0.55, darkText: 0.1 },
};
const CLASSIC_INTENSITY: IntensityRule = { tint: 1, limit: 1, darkSurface: null, darkText: null };

export enum ColorFamilyId {
  Ocean = "ocean",
  Moss = "moss",
  Ember = "ember",
  Grape = "grape",
  Mustard = "mustard",
  Cocoa = "cocoa",
}

interface FamilyHues {
  frame: number;
  face: number;
  canvas: number;
  accent: number;
  /** Dark schemes use a lighter accent, as Classic dark uses gold instead of red. */
  darkAccent: number;
}

const FAMILY_HUES: Readonly<Record<ColorFamilyId, FamilyHues>> = {
  // Blue frame, sand face, indigo canvas, red selection.
  [ColorFamilyId.Ocean]: { frame: 240, face: 75, canvas: 280, accent: 25, darkAccent: 85 },
  // Green frame, olive face, brown canvas, orange selection.
  [ColorFamilyId.Moss]: { frame: 150, face: 95, canvas: 55, accent: 35, darkAccent: 125 },
  // Brick frame, cream face, wine canvas, teal selection.
  [ColorFamilyId.Ember]: { frame: 30, face: 75, canvas: 350, accent: 230, darkAccent: 70 },
  // Violet frame, rose face, indigo canvas, green selection.
  [ColorFamilyId.Grape]: { frame: 300, face: 340, canvas: 255, accent: 145, darkAccent: 330 },
  // Mustard frame, cream face, teal canvas, red selection.
  [ColorFamilyId.Mustard]: { frame: 100, face: 85, canvas: 200, accent: 20, darkAccent: 95 },
  // Brown frame, tan face, rust canvas, teal selection.
  [ColorFamilyId.Cocoa]: { frame: 55, face: 75, canvas: 25, accent: 165, darkAccent: 75 },
};
export interface ColorFamily {
  /** Theme id: the family, with a suffix for the vivid intensity. */
  id: string;
  family: ColorFamilyId;
  intensity: ColorIntensity;
  hues: Readonly<Record<UiColorScheme, RoleHues>>;
  rule: IntensityRule;
}

function familyHues({ frame, face, canvas, accent, darkAccent }: FamilyHues) {
  const roles = (accentHue: number): RoleHues => ({
    [PaletteRole.Frame]: frame,
    [PaletteRole.Face]: face,
    [PaletteRole.Canvas]: canvas,
    [PaletteRole.Accent]: accentHue,
  });
  return { [UiColorScheme.Light]: roles(accent), [UiColorScheme.Dark]: roles(darkAccent) };
}

/** Every family in both intensities, soft first. */
export const COLOR_FAMILIES: readonly ColorFamily[] = Object.values(ColorFamilyId).flatMap(
  (family) =>
    Object.values(ColorIntensity).map((intensity) => ({
      id: intensity === ColorIntensity.Soft ? family : `${family}-${intensity}`,
      family,
      intensity,
      hues: familyHues(FAMILY_HUES[family]),
      rule: INTENSITIES[intensity],
    })),
);

/** The family that reproduces Aseprite Classic, for tests and comparisons. */
export function classicFamily(): ColorFamily {
  return {
    id: "classic",
    family: ColorFamilyId.Ocean,
    intensity: ColorIntensity.Soft,
    hues: CLASSIC_HUES,
    rule: CLASSIC_INTENSITY,
  };
}

const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360;

function gamutShare(color: Oklch) {
  return Math.min(1, color.c / Math.max(maxChroma(color.l, color.h), 1e-6));
}

function nearestRole(hue: number, anchors: RoleHues): PaletteRole {
  return Object.values(PaletteRole).reduce((best, role) =>
    hueDistance(hue, anchors[role]) < hueDistance(hue, anchors[best]) ? role : best,
  );
}

function darkSurfaceRole(lightness: number): PaletteRole {
  if (lightness < DARK_CANVAS_MAX_LIGHTNESS) return PaletteRole.Canvas;
  if (lightness < DARK_FACE_MAX_LIGHTNESS || lightness >= DARK_TEXT_MIN_LIGHTNESS)
    return PaletteRole.Face;
  return PaletteRole.Frame;
}

/** Recolor one Classic color for a family, keeping its lightness and role offset. */
export function rotateColor(color: Oklch, family: ColorFamily, colorScheme: UiColorScheme): Oklch {
  const anchors = CLASSIC_HUES[colorScheme];
  const targets = family.hues[colorScheme];
  const { rule } = family;
  if (colorScheme === UiColorScheme.Dark && color.c < DARK_NEUTRAL_CHROMA) {
    const role = darkSurfaceRole(color.l);
    const hue =
      color.c < ACHROMATIC_CHROMA
        ? targets[role]
        : normalizeHue(targets[role] + color.h - anchors[role]);
    const fixedShare = color.l >= DARK_TEXT_MIN_LIGHTNESS ? rule.darkText : rule.darkSurface;
    const share = fixedShare ?? gamutShare(color);
    return oklch(color.l, maxChroma(color.l, hue) * share, hue);
  }
  if (color.c < ACHROMATIC_CHROMA) return color;
  const role = nearestRole(color.h, anchors);
  const share = gamutShare(color);
  const fitted = share < rule.limit ? Math.min(rule.limit, share * rule.tint) : share;
  const hue = normalizeHue(targets[role] + color.h - anchors[role]);
  return oklch(color.l, maxChroma(color.l, hue) * fitted, hue);
}

const MINIMUM_TEXT_CONTRAST = 4.5;
/** A recolored pair may lose at most this much contrast against the Classic pair. */
export const CONTRAST_TOLERANCE = 0.05;
/** Text and face keys whose Classic contrast is kept. */
export const CONTRAST_PAIRS: readonly (readonly [string, string])[] = [
  ["text", "face"],
  ["text", "textbox_face"],
  ["selected_text", "selected"],
  ["window_titlebar_text", "window_titlebar_face"],
  ["tab_active_text", "tab_active_face"],
  ["tooltip_text", "tooltip_face"],
  ["menuitem_highlight_text", "menuitem_highlight_face"],
  ["listitem_selected_text", "listitem_selected_face"],
  ["menuitem_hot_text", "menuitem_hot_face"],
  ["workspace_text", "workspace"],
];
const FIT_STEP = 0.005;
/** Fitting keeps a color within this lightness of its Classic value. */
const MAXIMUM_FIT_SHIFT = 0.07;

/** The contrast a recolored pair must reach: the Classic value, capped at the text minimum. */
export function contrastTarget(text: string, face: string) {
  return Math.min(MINIMUM_TEXT_CONTRAST, contrastRatio(hexToOklch(text), hexToOklch(face)));
}

/**
 * Move a face in lightness, at most MAXIMUM_FIT_SHIFT, until its texts reach their targets.
 * Texts can sit on both sides of a face, such as white tab text and dark workspace text on
 * the workspace, so the face takes the nearest lightness that serves the highest total target.
 */
function fitFace(face: Oklch, texts: readonly { color: Oklch; target: number }[]): Oklch {
  const share = gamutShare(face);
  const at = (l: number) => oklch(l, maxChroma(l, face.h) * share, face.h);
  const served = (color: Oklch) =>
    texts
      .filter(({ color: text, target }) => contrastRatio(color, text) >= target)
      .reduce((sum, { target }) => sum + target, 0);
  const total = texts.reduce((sum, { target }) => sum + target, 0);
  let best = face;
  let bestServed = served(face);
  for (let step = 1; step * FIT_STEP <= MAXIMUM_FIT_SHIFT && bestServed < total; step++)
    for (const direction of [-1, 1]) {
      const l = face.l + direction * step * FIT_STEP;
      if (l <= 0 || l >= 1) continue;
      const color = at(l);
      const count = served(color);
      if (count > bestServed) {
        best = color;
        bestServed = count;
      }
    }
  return best;
}

/** Document tool colors keep their Classic values; they mark pixels, not interface. */
const FIXED_KEYS = new Set(["select_box_ruler", "select_box_grid", "filelist_disabled_row_text"]);

/**
 * Every Aseprite color key recolored for the family, with Classic text contrast kept.
 * Keys that share one Classic color, such as the workspace and the active tab, are one
 * group and always keep one color, so fitting moves the whole group.
 */
export function colorFamilyColors(
  source: Readonly<Record<string, string>>,
  family: ColorFamily,
  colorScheme: UiColorScheme,
): Record<string, string> {
  const group = (key: string) => source[key].toLowerCase();
  const colors = new Map<string, Oklch>();
  for (const [key, value] of Object.entries(source))
    if (!FIXED_KEYS.has(key) && !colors.has(group(key)))
      colors.set(group(key), rotateColor(hexToOklch(value), family, colorScheme));
  const pairs = CONTRAST_PAIRS.filter(
    ([text, face]) => source[text] && source[face] && group(text) !== group(face),
  );
  const fit = (
    moved: (pair: readonly [string, string]) => string,
    other: (pair: readonly [string, string]) => string,
  ) => {
    const byGroup = new Map<string, (readonly [string, string])[]>();
    for (const pair of pairs)
      byGroup.set(group(moved(pair)), [...(byGroup.get(group(moved(pair))) ?? []), pair]);
    for (const [key, members] of byGroup)
      colors.set(
        key,
        fitFace(
          colors.get(key)!,
          members.map((pair) => ({
            color: colors.get(group(other(pair)))!,
            target: contrastTarget(source[pair[0]], source[pair[1]]),
          })),
        ),
      );
  };
  // Move each face group against all of its texts, then each text group against its faces.
  fit(
    ([, face]) => face,
    ([text]) => text,
  );
  fit(
    ([text]) => text,
    ([, face]) => face,
  );
  fit(
    ([, face]) => face,
    ([text]) => text,
  );
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      FIXED_KEYS.has(key) ? value : oklchToHex(colors.get(group(key))!),
    ]),
  );
}

/** Classic [light, dark] values the editor stylesheets fall back to. */
const EDITOR_TOKEN_SOURCES: Readonly<Record<`--${string}`, readonly [string, string]>> = {
  "--ui-editor-workspace": ["#7d929e", "#333333"],
  "--ui-editor-face": ["#2c2c30", "#2c2c30"],
  "--ui-editor-panel": ["#41444a", "#41444a"],
  "--ui-editor-panel-dark": ["#333333", "#333333"],
  "--ui-editor-canvas": ["#202125", "#202125"],
  "--ui-editor-gutter": ["#655561", "#202125"],
  "--ui-editor-edge": ["#202125", "#202125"],
  "--ui-editor-edge-highlight": ["#c6c6c6", "#c6c6c6"],
  "--ui-editor-text": ["#000000", "#c0c0c0"],
  "--ui-editor-detail": ["#636d79", "#636d79"],
  "--ui-editor-link": ["#6e9adb", "#6e9adb"],
  "--ui-editor-focus": ["#2c4c91", "#aebfe6"],
  "--ui-editor-selected": ["#e1b85f", "#e1b85f"],
  "--ui-editor-selected-text": ["#41444a", "#41444a"],
  "--ui-editor-hot": ["#575b61", "#575b61"],
};

/** Editor chrome colors that its stylesheets read before their Classic fallbacks. */
export function colorFamilyEditorTokens(family: ColorFamily, colorScheme: UiColorScheme) {
  const index = colorScheme === UiColorScheme.Light ? 0 : 1;
  return Object.fromEntries(
    Object.entries(EDITOR_TOKEN_SOURCES).map(([token, values]) => [
      token,
      oklchToHex(rotateColor(hexToOklch(values[index]), family, colorScheme)),
    ]),
  );
}
