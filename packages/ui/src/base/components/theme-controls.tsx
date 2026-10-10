import * as React from "react";

import { entrySelection } from "$/base/controls/control-policy";
import { themeFontFamily } from "$/base/theme/font-families";
import { paintPartSurface } from "$/base/theme/paint-part-surface";
import {
  glyphSets,
  isCjkGlyph,
  measureThemeText,
  themeFontHeight,
  useThemeText,
  centerThemePixel,
} from "$/base/theme/text-metrics";
import {
  getThemeAssets,
  preloadThemeAssets,
  subscribeThemeAssets,
  type UiAssetBundle,
  type UiBitmap,
} from "$/base/theme/theme-assets-store";
import {
  remapThemeColor,
  useTheme,
  type UiStyleDefinition,
  type UiAppearance,
} from "$/base/theme/theme-context";
import { ThemePart, type AtlasPartName, type UiPartName } from "$/base/theme/theme-part";
import { themeTextCache } from "$/base/theme/theme-text-cache";
import { cn } from "$/base/utils/cn";
import { borderSize, observeElementSize, rangeRect } from "$/base/utils/dom-geometry";
import { isImeKeyboardEvent } from "$/base/utils/is-ime-keyboard-event";
import { UINT8_MAX } from "$/base/utils/numeric-constants";
import { surfaceLayout, DEFAULT_SURFACE_VIEWPORT } from "$/components/canvas-surface";
import { RASTER_SCALE } from "$/components/canvas-surface/metrics";
import type { ControlPlacement } from "$/components/control-flow/placement";
import { useFieldControl } from "$/components/field/Field";
import { InputTouchActivation, useInputTouchActivation } from "$/components/input/touch-activation";
import { Text, TextVariant, type PixelFont } from "$/components/text";

import styles from "$/base/components/theme-controls.module.css";

export { getThemeAssets, preloadThemeAssets };
export type { UiAssetBundle, UiBitmap };

export function useThemeAssets(variant?: UiAppearance): UiAssetBundle | null {
  const context = useTheme();
  const requestedVariant = variant ?? context.variant;
  const subscribe = React.useCallback(
    (listener: () => void) => subscribeThemeAssets(requestedVariant, context.uiTheme, listener),
    [requestedVariant, context.uiTheme],
  );
  const getSnapshot = React.useCallback(
    () => getThemeAssets(requestedVariant, context.uiTheme),
    [requestedVariant, context.uiTheme],
  );
  const assets = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  React.useEffect(() => {
    void preloadThemeAssets(requestedVariant, context.language, context.uiTheme).catch((error) =>
      console.error(error),
    );
  }, [requestedVariant, context.language, context.uiTheme]);
  return React.useMemo(
    () => (assets ? { ...assets, language: context.language } : null),
    [assets, context.language],
  );
}
const cjkPixelGlyphCache = new Map<string, HTMLCanvasElement>();
const CJK_PIXEL_GLYPH_CACHE_LIMIT = 512;
const CJK_PIXEL_COVERAGE_THRESHOLD = 64;
const CJK_FONT_LANGUAGE = "zh";
/**
 * Canvas fillText antialiases Fusion Pixel's deliberately pixel-shaped outlines.
 * Center the measured ink inside the Aseprite atlas line height, discard only
 * faint edge coverage, and snap retained pixels to solid opacity to preserve
 * thin strokes without cropping glyphs with different ascent/descent metrics.
 */
function cjkPixelGlyph(
  char: string,
  font: PixelFont,
  scale: number,
  color: string,
  usePixelFont: boolean,
) {
  const size = themeFontHeight(font, scale);
  const key = `${size}:${color}:${usePixelFont ? "pixel" : "system"}:${char}`;
  const cached = cjkPixelGlyphCache.get(key);
  if (cached) {
    cjkPixelGlyphCache.delete(key);
    cjkPixelGlyphCache.set(key, cached);
    return cached;
  }
  if (typeof document === "undefined") return null;
  const mask = document.createElement("canvas");
  mask.width = size;
  mask.height = size;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return null;
  maskContext.clearRect(0, 0, size, size);
  maskContext.font = `${size}px ${usePixelFont ? "FusionPixelZhHans" : "sans-serif"}`;
  maskContext.textAlign = "left";
  maskContext.textBaseline = "alphabetic";
  maskContext.fillStyle = "#fff";
  const metrics = maskContext.measureText(char);
  const baselineY = Math.round(
    (size + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2,
  );
  maskContext.fillText(char, 0, baselineY, size);
  const pixels = maskContext.getImageData(0, 0, size, size);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3];
    pixels.data[index] = UINT8_MAX;
    pixels.data[index + 1] = UINT8_MAX;
    pixels.data[index + 2] = UINT8_MAX;
    pixels.data[index + 3] = alpha >= CJK_PIXEL_COVERAGE_THRESHOLD ? UINT8_MAX : 0;
  }
  maskContext.putImageData(pixels, 0, 0);

  const glyph = document.createElement("canvas");
  glyph.width = size;
  glyph.height = size;
  const glyphContext = glyph.getContext("2d");
  if (!glyphContext) return null;
  glyphContext.fillStyle = color;
  glyphContext.fillRect(0, 0, size, size);
  glyphContext.globalCompositeOperation = "destination-in";
  glyphContext.drawImage(mask, 0, 0);
  cjkPixelGlyphCache.set(key, glyph);
  while (cjkPixelGlyphCache.size > CJK_PIXEL_GLYPH_CACHE_LIMIT) {
    cjkPixelGlyphCache.delete(cjkPixelGlyphCache.keys().next().value!);
  }
  return glyph;
}

/** Pixel coordinates refer to the physical scene surface; sprite parts are logical pixels. */
export function paintThemePart(
  context: CanvasRenderingContext2D,
  assets: UiAssetBundle,
  part: AtlasPartName,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    fill?: string;
    drawCenter?: boolean;
    scale?: number;
    scaleTop?: number;
    scaleBottom?: number;
    color?: string;
  } = {},
) {
  const source = assets.theme.parts[part];
  if (
    source.surface &&
    paintPartSurface(context, source.surface, assets.theme.colors, x, y, width, height, {
      face: options.fill
        ? remapThemeColor(options.fill, assets.theme, assets.variant, assets.lightThemeColorRoles)
        : undefined,
      ink: options.color,
      drawCenter: options.drawCenter,
    })
  )
    return;
  const scale = options.scale ?? source.paintScale ?? 2;
  const bitmap = options.color ? tint(assets.sheet, options.color) : assets.sheet;
  context.imageSmoothingEnabled = false;
  if (options.fill) {
    context.fillStyle = remapThemeColor(
      options.fill,
      assets.theme,
      assets.variant,
      assets.lightThemeColorRoles,
    );
    context.fillRect(x, y, width, height);
  }
  if (!source.slices) {
    context.drawImage(bitmap, source.x, source.y, source.width, source.height, x, y, width, height);
    return;
  }
  const [left, centerWidth, right, top, centerHeight, bottom] = source.slices;
  const scaleTop = options.scaleTop ?? scale;
  const scaleBottom = options.scaleBottom ?? scale;
  const sw = [left, centerWidth, right],
    sh = [top, centerHeight, bottom];
  const dw = [left * scale, Math.max(0, width - (left + right) * scale), right * scale];
  const dh = [
    top * scaleTop,
    Math.max(0, height - top * scaleTop - bottom * scaleBottom),
    bottom * scaleBottom,
  ];
  let sourceY = source.y,
    targetY = y;
  for (let row = 0; row < 3; row++) {
    let sourceX = source.x,
      targetX = x;
    for (let column = 0; column < 3; column++) {
      if (
        (row !== 1 || column !== 1 || options.drawCenter !== false) &&
        sw[column] &&
        sh[row] &&
        dw[column] &&
        dh[row]
      )
        context.drawImage(
          bitmap,
          sourceX,
          sourceY,
          sw[column],
          sh[row],
          targetX,
          targetY,
          dw[column],
          dh[row],
        );
      sourceX += sw[column];
      targetX += dw[column];
    }
    sourceY += sh[row];
    targetY += dh[row];
  }
}
const tintedSources = new WeakMap<UiBitmap, Map<string, HTMLCanvasElement>>();
function tint(image: UiBitmap, color: string) {
  let cache = tintedSources.get(image);
  if (!cache) {
    cache = new Map();
    tintedSources.set(image, cache);
  }
  let canvas = cache.get(color);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = "naturalWidth" in image ? image.naturalWidth : image.width;
    canvas.height = "naturalHeight" in image ? image.naturalHeight : image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Imported tag colors are user data; bound the shared atlas tint cache.
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(color, canvas);
  }
  return canvas;
}
export function paintThemeIcon(
  context: CanvasRenderingContext2D,
  assets: UiAssetBundle,
  part: AtlasPartName,
  x: number,
  y: number,
  options: { scale?: number; color?: string } = {},
) {
  const source = assets.theme.parts[part];
  const scale = options.scale ?? 2;
  const color =
    options.color ??
    (source.foregroundRole ? assets.theme.colors[source.foregroundRole] : undefined);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    color ? tint(assets.sheet, color) : assets.sheet,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.floor(x),
    Math.floor(y),
    source.width * scale,
    source.height * scale,
  );
}
export function paintThemeText(
  context: CanvasRenderingContext2D,
  assets: UiAssetBundle,
  text: string,
  x: number,
  y: number,
  options: { font?: PixelFont; color?: string; scale?: number } = {},
) {
  const font = options.font ?? "default",
    scale = options.scale ?? 2;
  const metrics = assets.theme.typography?.[font];
  if (metrics) {
    if (!assets.cjkFontReady && [...text].some((char) => isCjkGlyph(char.codePointAt(0)!))) {
      void preloadThemeAssets(assets.variant, CJK_FONT_LANGUAGE, assets.uiTheme).catch((error) =>
        console.error(error),
      );
    }
    context.save();
    context.font = `${(metrics.fontSize * scale) / RASTER_SCALE}px ${themeFontFamily(metrics)}`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = options.color ?? assets.theme.colors.text;
    context.fillText(
      text,
      Math.floor(x),
      Math.floor(y + (metrics.lineHeight * scale) / RASTER_SCALE / 2),
    );
    context.restore();
    return;
  }
  const image = tint(
    font === "mini" ? assets.miniFont : assets.defaultFont,
    options.color ?? assets.theme.colors.text,
  );
  context.imageSmoothingEnabled = false;
  // Cache only the pixel-aligned, plain compositing path used by the bitmap UI.
  // Shadows, blend modes and fractional transforms retain per-glyph semantics.
  const hasCjkFallback = [...text].some((char) => {
    const codepoint = char.codePointAt(0)!;
    return !glyphSets[font][String(codepoint)] && isCjkGlyph(codepoint);
  });
  if (
    !hasCjkFallback &&
    text.length > 1 &&
    text.length <= 128 &&
    Number.isInteger(scale) &&
    scale > 0 &&
    context.globalAlpha === 1 &&
    context.globalCompositeOperation === "source-over" &&
    context.shadowBlur === 0 &&
    context.shadowOffsetX === 0 &&
    context.shadowOffsetY === 0 &&
    (!context.filter || context.filter === "none")
  ) {
    const transform = context.getTransform();
    if (
      transform.a === 1 &&
      transform.d === 1 &&
      transform.b === 0 &&
      transform.c === 0 &&
      Number.isInteger(transform.e) &&
      Number.isInteger(transform.f)
    ) {
      const run = themeTextCache.get(image, glyphSets[font], text);
      if (run) {
        context.drawImage(run, Math.floor(x), Math.floor(y), run.width * scale, run.height * scale);
        return;
      }
    }
  }
  let cursor = Math.floor(x);
  for (const char of text) {
    const codepoint = char.codePointAt(0)!;
    const glyph = glyphSets[font][String(codepoint)];
    if (!glyph && isCjkGlyph(codepoint)) {
      const fallbackAdvance = themeFontHeight(font, scale);
      const bitmap = cjkPixelGlyph(
        char,
        font,
        scale,
        options.color ?? assets.theme.colors.text,
        assets.cjkFontReady,
      );
      if (bitmap) context.drawImage(bitmap, cursor, Math.floor(y));
      cursor += fallbackAdvance;
      continue;
    }
    const fallbackGlyph = glyph ?? glyphSets[font]["63"];
    if (!fallbackGlyph) continue;
    const [sx, sy, width, height] = fallbackGlyph;
    context.drawImage(
      image,
      sx,
      sy,
      width,
      height,
      cursor,
      Math.floor(y),
      width * scale,
      height * scale,
    );
    cursor += width * scale;
  }
}

/** Theme::calcWidgetMetrics: content plus atlas borders in painter units. */
export function themeControlSize(
  theme: Pick<UiStyleDefinition, "parts" | "typography">,
  part: AtlasPartName,
  text = "",
  font: PixelFont = "default",
  icon?: AtlasPartName,
) {
  const frame = theme.parts[part];
  const slices = frame?.slices;
  const borderWidth = slices ? slices[0] + slices[2] : 0;
  const borderHeight = slices ? slices[3] + slices[5] : 0;
  const glyph = icon ? theme.parts[icon] : undefined;
  return {
    width:
      Math.max(
        frame?.width ?? 0,
        borderWidth +
          Math.max(measureThemeText(text, font, 1, theme.typography), glyph?.width ?? 0),
      ) * RASTER_SCALE,
    height:
      Math.max(
        frame?.height ?? 0,
        borderHeight + Math.max(themeFontHeight(font, 1, theme.typography), glyph?.height ?? 0),
      ) * RASTER_SCALE,
  };
}

interface InputContentProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "size" | "part"
> {
  /** Width in theme pixels; keep the skin's natural height. */
  pixelWidth?: number;
  /** Preferred character capacity, independent of the current draft value. */
  size?: number;
  value: string;
  /** Leading content whose measured width is reserved before the editable text. */
  leading?: React.ReactNode;
  /** Live draft updates without committing the entry. */
  onValueChange?: (value: string) => void;
  suffix?: string;
  mini?: boolean;
  /** ComboBox entries use sunken2 rather than the standalone Input frame. */
  part?: UiPartName;
  focusedPart?: UiPartName;
  /** Left content inset inside the bitmap entry frame, before any leading content. */
  textInset?: number;
  /** Optional vertical stretching of Input frame slices, in scene pixels. */
  frameScaleTop?: number;
  /** Aseprite-style modal focus indicators stay visible after pointer activation. */
  focusAppearance?: "always" | "keyboard";
  onCommit?: (value: string) => void;
  /** DoubleTap reserves casual touch/pen taps for controls rather than the keyboard. */
  touchActivation?: InputTouchActivation;
  onTouchTap?: () => void;
}

export type InputProps = InputContentProps & ControlPlacement;

const INPUT_TEXT_INSET = 8;
const INPUT_LEADING_GAP = 4;
interface EntryTextPositions {
  selectionStart: number;
  selectionEnd: number;
  caret: number;
  draftEnd: number;
}

/** Align painted caret and selection geometry with the browser-rendered entry text. */
function measureRenderedEntryOffset(container: HTMLSpanElement, offset: number, fallback: number) {
  const textNode = container.querySelector<HTMLElement>('[data-font="default"]')?.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return fallback;
  const length = textNode.textContent?.length ?? 0;
  const position = Math.max(0, Math.min(length, offset));
  const range = document.createRange();
  range.setStart(textNode, position);
  range.collapse(true);
  let rect = rangeRect(container, range);
  if (!Number.isFinite(rect.left) || rect.height === 0) {
    if (position === length && length > 0) {
      range.setStart(textNode, length - 1);
      range.setEnd(textNode, length);
      rect = rangeRect(container, range);
      return Number.isFinite(rect.right) ? rect.right : fallback;
    }
    if (length > 0) {
      range.setStart(textNode, position);
      range.setEnd(textNode, Math.min(length, position + 1));
      rect = rangeRect(container, range);
      return Number.isFinite(rect.left) ? rect.left : fallback;
    }
    return fallback;
  }
  return rect.left;
}

/** Aseprite Input geometry with bitmap text and a semantic editable input. */
export function Input({
  bounds: suppliedBounds,
  pixelSize,
  pixelWidth,
  relativeTo = { x: 0, y: 0 },
  size = 8,
  value,
  suffix = "",
  leading,
  mini = false,
  part,
  focusedPart,
  textInset: suppliedTextInset,
  frameScaleTop,
  onCommit,
  onValueChange,
  style,
  className,
  onKeyDown,
  onBlur,
  onFocus,
  onSelect,
  onCompositionStart,
  onCompositionEnd,
  touchActivation = InputTouchActivation.Native,
  onTouchTap,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onClick,
  ...props
}: InputProps) {
  const fieldAttributes = useFieldControl(props);
  const { definition: theme, translateSource } = useTheme();
  const { measureThemeText, themeFontHeight } = useThemeText();
  const activation = useInputTouchActivation(touchActivation, !!props.readOnly, onTouchTap);
  const [draft, setDraft] = React.useState(value);
  const leadingLayer = React.useRef<HTMLSpanElement>(null);
  const [leadingWidth, setLeadingWidth] = React.useState(0);
  const hasLeading = leading !== undefined && leading !== null && leading !== false;
  React.useLayoutEffect(() => {
    const layer = leadingLayer.current;
    if (!layer) {
      setLeadingWidth(0);
      return;
    }
    const update = ({ width }: { width: number }) => setLeadingWidth(width);
    update(borderSize(layer));
    return observeElementSize(layer, update);
  }, [hasLeading]);
  const contentInset = suppliedTextInset ?? theme.dimensions.input_text_inset ?? INPUT_TEXT_INSET;
  const textInset = contentInset + (hasLeading ? leadingWidth + INPUT_LEADING_GAP : 0);
  const measuredText = "0".repeat(Math.max(1, size)) + suffix;
  const measuredSize = themeControlSize(
    theme,
    part ?? (mini ? "sunken_mini_normal" : "sunken_normal"),
    measuredText,
    mini ? "mini" : "default",
  );
  const contentMinimumWidth = textInset + measureThemeText(measuredText) + INPUT_TEXT_INSET;
  const bounds = suppliedBounds ?? {
    x: 0,
    y: 0,
    ...measuredSize,
    height: theme.dimensions.input_height ?? measuredSize.height,
    ...(pixelWidth !== undefined ? { width: pixelWidth * RASTER_SCALE } : {}),
    ...(hasLeading && pixelWidth === undefined
      ? { width: Math.max(measuredSize.width, contentMinimumWidth) }
      : {}),
    ...(pixelSize
      ? {
          width: pixelSize.width * RASTER_SCALE,
          height: pixelSize.height * RASTER_SCALE,
        }
      : {}),
  };
  const [focused, setFocused] = React.useState(false);
  const showingPlaceholder = !draft && !!props.placeholder && !focused;
  const displayText =
    draft || (showingPlaceholder && props.placeholder ? translateSource(props.placeholder) : "");
  const skipBlurCommit = React.useRef(false);
  const composing = React.useRef(false);
  const [selection, setSelection] = React.useState({ start: 0, end: 0, caret: 0 });
  const [caretVisible, setCaretVisible] = React.useState(true);
  const textLayer = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    setCaretVisible(true);
    if (!focused || props.disabled) return;
    // ui::Input starts a 500ms blinking timer on focus/input. A bitmap-font
    // caret remains visible at the active end of a selected range as well.
    const timer = setInterval(() => setCaretVisible((visible) => !visible), 500);
    return () => clearInterval(timer);
  }, [focused, props.disabled, draft, selection.start, selection.end, selection.caret]);
  const updateSelection = (node: HTMLInputElement) =>
    setSelection((previous) => {
      const next = {
        start: node.selectionStart ?? 0,
        end: node.selectionEnd ?? 0,
        caret:
          (node.selectionDirection === "backward" ? node.selectionStart : node.selectionEnd) ?? 0,
      };
      return next.start === previous.start &&
        next.end === previous.end &&
        next.caret === previous.caret
        ? previous
        : next;
    });
  React.useEffect(() => {
    if (!composing.current) setDraft(value);
  }, [value]);
  const facePart = ((focused ? (focusedPart ?? part) : part) ??
    (mini
      ? focused
        ? "sunken_mini_focused"
        : "sunken_mini_normal"
      : focused
        ? "sunken_focused"
        : "sunken_normal")) as AtlasPartName;
  const textY =
    centerThemePixel(bounds.y, bounds.height, 14) -
    bounds.y +
    (theme.dimensions.input_text_offset_y ?? 0);
  const range = entrySelection(draft, selection.start, selection.end);
  const [textPositions, setTextPositions] = React.useState<EntryTextPositions | null>(null);
  React.useLayoutEffect(() => {
    const layer = textLayer.current;
    if (!layer) return;
    const fallbackOffset = (offset: number) =>
      textInset - 4 + measureThemeText(displayText.slice(0, offset));
    const next = {
      selectionStart: measureRenderedEntryOffset(layer, range.from, fallbackOffset(range.from)),
      selectionEnd: measureRenderedEntryOffset(layer, range.to, fallbackOffset(range.to)),
      caret: measureRenderedEntryOffset(layer, selection.caret, fallbackOffset(selection.caret)),
      draftEnd: measureRenderedEntryOffset(layer, draft.length, fallbackOffset(draft.length)),
    };
    setTextPositions((previous) =>
      previous &&
      previous.selectionStart === next.selectionStart &&
      previous.selectionEnd === next.selectionEnd &&
      previous.caret === next.caret &&
      previous.draftEnd === next.draftEnd
        ? previous
        : next,
    );
  }, [displayText, draft.length, range.from, range.to, selection.caret, textInset]);
  const fallbackOffset = (offset: number) =>
    textInset - 4 + measureThemeText(displayText.slice(0, offset));
  const selectedX = textPositions?.selectionStart ?? fallbackOffset(range.from);
  const selectedWidth = textPositions
    ? textPositions.selectionEnd - textPositions.selectionStart
    : measureThemeText(range.selected);
  const caretX = textPositions?.caret ?? fallbackOffset(selection.caret);
  const suffixX = textPositions?.draftEnd ?? fallbackOffset(draft.length);
  const layout = surfaceLayout(bounds);
  const commit = (nextValue: string) => onCommit?.(nextValue);
  return (
    <span
      className={cn("xse-entry", styles.uiEntry, className)}
      style={{
        position: suppliedBounds ? "absolute" : "relative",
        left:
          layout.left -
          Math.floor(
            (relativeTo.x * DEFAULT_SURFACE_VIEWPORT.width) / DEFAULT_SURFACE_VIEWPORT.sceneWidth,
          ),
        top:
          layout.top -
          Math.floor(
            (relativeTo.y * DEFAULT_SURFACE_VIEWPORT.height) / DEFAULT_SURFACE_VIEWPORT.sceneHeight,
          ),
        flex: "0 0 auto",
        width: layout.width,
        height: layout.height,
        ...style,
      }}
    >
      <ThemePart
        part={facePart}
        scale={2}
        scaleTop={frameScaleTop}
        drawCenter
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <span
          ref={textLayer}
          style={{ position: "absolute", inset: 4, overflow: "hidden", pointerEvents: "none" }}
        >
          <Text
            variant={TextVariant.PositionedPixel}
            text={displayText}
            x={textInset - 4}
            y={textY - 4}
            color={
              props.disabled
                ? theme.colors.disabled
                : showingPlaceholder
                  ? (theme.colors.textbox_placeholder_text ?? theme.colors.disabled)
                  : (theme.colors.textbox_text ?? theme.colors.text)
            }
          />
          {range.selected && !props.disabled && (
            <>
              <span
                style={{
                  position: "absolute",
                  left: selectedX,
                  top: textY - 4,
                  width: selectedWidth,
                  height: themeFontHeight(),
                  background: focused ? theme.colors.selected : theme.colors.disabled,
                }}
              />
              <Text
                variant={TextVariant.PositionedPixel}
                text={range.selected}
                x={selectedX}
                y={textY - 4}
                color={theme.colors.selected_text}
              />
            </>
          )}
          {focused && !props.disabled && caretVisible && (
            <span
              style={{
                position: "absolute",
                left: caretX,
                top: textY - 6,
                width: 4,
                height: themeFontHeight() + 4,
                background: theme.colors.text,
              }}
            />
          )}
          <Text
            variant={TextVariant.PositionedPixel}
            text={suffix}
            x={suffixX}
            y={textY - 4}
            color={props.disabled ? theme.colors.disabled : theme.colors.entry_suffix}
          />
        </span>
      </ThemePart>
      {hasLeading && (
        <span
          ref={leadingLayer}
          className={styles.uiEntryLeading}
          data-slot="input-leading"
          style={{
            left: contentInset,
            color: props.disabled
              ? theme.colors.disabled
              : showingPlaceholder
                ? (theme.colors.textbox_placeholder_text ?? theme.colors.disabled)
                : (theme.colors.textbox_text ?? theme.colors.text),
          }}
        >
          {leading}
        </span>
      )}
      <input
        {...props}
        {...fieldAttributes}
        readOnly={activation.readOnly}
        style={{ paddingLeft: textInset }}
        aria-label={props["aria-label"] ? translateSource(props["aria-label"]!) : undefined}
        title={props.title ? translateSource(props.title) : undefined}
        placeholder={props.placeholder ? translateSource(props.placeholder) : undefined}
        data-label-source={props["aria-label"] ?? undefined}
        value={draft}
        onPointerDown={(event) => {
          activation.onPointerDown(event);
          onPointerDown?.(event);
        }}
        onPointerMove={(event) => {
          activation.onPointerMove(event);
          onPointerMove?.(event);
        }}
        onPointerUp={(event) => {
          activation.onPointerUp(event);
          onPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          activation.onPointerCancel(event);
          onPointerCancel?.(event);
        }}
        onLostPointerCapture={(event) => {
          activation.onPointerCancel(event);
          onLostPointerCapture?.(event);
        }}
        onClick={(event) => {
          activation.onClick(event);
          onClick?.(event);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!composing.current) onValueChange?.(e.target.value);
          updateSelection(e.currentTarget);
        }}
        onCompositionStart={(e) => {
          composing.current = true;
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          setDraft(e.currentTarget.value);
          updateSelection(e.currentTarget);
          onValueChange?.(e.currentTarget.value);
          onCompositionEnd?.(e);
        }}
        onSelect={(e) => {
          updateSelection(e.currentTarget);
          onSelect?.(e);
        }}
        onFocus={(e) => {
          setFocused(true);
          updateSelection(e.currentTarget);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          activation.onBlur();
          setFocused(false);
          if (skipBlurCommit.current) skipBlurCommit.current = false;
          else commit(e.currentTarget.value);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (composing.current || isImeKeyboardEvent(e.nativeEvent)) {
            // Candidate navigation belongs to the IME, including in a combobox
            // or a dialog with Enter/Escape shortcuts.
            e.stopPropagation();
            return;
          }
          if (activation.onKeyDown(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
            skipBlurCommit.current = true;
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommit.current = true;
            setDraft(value);
            e.currentTarget.blur();
          }
          onKeyDown?.(e);
        }}
      />
    </span>
  );
}
