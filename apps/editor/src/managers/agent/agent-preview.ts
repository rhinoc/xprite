import { AgentPreviewBackground, AgentPreviewLayout } from "$/managers/ports/agent-tools";
import {
  BatchEditError,
  BatchEditErrorCode,
  blendNormalAt,
  type PixelBuffer,
  type Rgba,
} from "@xprite/editor-core";
import { hexToRgba } from "@xprite/editor-core/color";
import type { ExportRasterText } from "@xprite/editor-core/import-export";

const AGENT_PREVIEW_LIMITS = { side: 2048, scale: 16 } as const;
const CHANNELS = 4;
const OPAQUE = 255;
const CHECKER_SIZE = 8;
const CHECKER_LIGHT: Rgba = [208, 216, 220, OPAQUE];
const CHECKER_DARK: Rgba = [156, 168, 178, OPAQUE];
const CAPTION_BACKGROUND: Rgba = [25, 34, 49, OPAQUE];
const CAPTION_FOREGROUND = [239, 243, 247];
const CAPTION_FONT_SIZE = 10;
const CAPTION_PADDING = 3;
const COMPARISON_GAP = 8;
const SOLID_BACKGROUND = /^#[\da-f]{6}$/i;

export interface AgentPreviewOptions {
  scale: number;
  background: AgentPreviewBackground | string;
  labels: boolean;
  compareNative: boolean;
  layout: AgentPreviewLayout;
  /** Reserved by animation composition so changing labels cannot resize frames. */
  minimumWidth?: number;
}

export function previewBoolean(value: unknown, key: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean")
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, `${key} must be a boolean`);
  return value;
}

export function previewOptions(
  input: Record<string, unknown>,
  filmstrip?: Record<string, unknown>,
): AgentPreviewOptions {
  const scale = filmstrip?.scale ?? input.scale ?? 1;
  if (
    typeof scale !== "number" ||
    !Number.isInteger(scale) ||
    scale < 1 ||
    scale > AGENT_PREVIEW_LIMITS.scale
  )
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid preview scale");
  const background = input.background ?? AgentPreviewBackground.Transparent;
  if (
    typeof background !== "string" ||
    (!Object.values(AgentPreviewBackground).includes(background as AgentPreviewBackground) &&
      !SOLID_BACKGROUND.test(background))
  )
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      "background must be transparent, checkerboard or #RRGGBB",
    );
  const layout = filmstrip?.layout ?? AgentPreviewLayout.Strip;
  if (!Object.values(AgentPreviewLayout).includes(layout as AgentPreviewLayout))
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid filmstrip.layout");
  return {
    scale,
    background,
    layout: layout as AgentPreviewLayout,
    labels: previewBoolean(filmstrip?.labels ?? input.labels, "labels"),
    compareNative: previewBoolean(input.compareNative, "compareNative"),
  };
}

export interface AgentPreviewFrame {
  pixels: PixelBuffer;
  frameIndex: number;
  duration: number;
}

function previewCaption(
  frame: Pick<AgentPreviewFrame, "frameIndex" | "duration">,
  options: AgentPreviewOptions,
): string {
  const comparison = options.compareNative && options.scale > 1;
  return `F${frame.frameIndex}  ${frame.duration} ms${comparison ? `  1x / ${options.scale}x` : ""}`;
}

export function previewCaptionWidth(
  frames: readonly Pick<AgentPreviewFrame, "frameIndex" | "duration">[],
  options: AgentPreviewOptions,
  text?: ExportRasterText,
): number {
  return options.labels && text
    ? Math.max(
        ...frames.map(
          (frame) =>
            text.measure(previewCaption(frame, options), CAPTION_FONT_SIZE).width +
            CAPTION_PADDING * 2,
        ),
      )
    : 0;
}

/** Presentation only: input pixels are sRGB and are never changed. */
export function composeAgentPreview(
  frames: readonly AgentPreviewFrame[],
  options: AgentPreviewOptions,
  text?: ExportRasterText,
) {
  if (!frames.length)
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "A preview needs at least one frame");
  if (options.labels && !text)
    throw new BatchEditError(BatchEditErrorCode.Unsupported, "Preview labels are unavailable");
  const sourceWidth = frames[0].pixels.width;
  const sourceHeight = frames[0].pixels.height;
  if (frames.some(({ pixels }) => pixels.width !== sourceWidth || pixels.height !== sourceHeight))
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      "Preview frames must have matching dimensions",
    );
  const comparison = options.compareNative && options.scale > 1;
  const captions = frames.map((frame) => previewCaption(frame, options));
  const captionSizes = options.labels
    ? captions.map((caption) => text!.measure(caption, CAPTION_FONT_SIZE))
    : [];
  const headerHeight = options.labels
    ? Math.max(...captionSizes.map(({ height }) => height)) + CAPTION_PADDING * 2
    : 0;
  const imageWidth = sourceWidth * options.scale;
  const imageHeight = sourceHeight * options.scale;
  const nativeOffset = comparison ? sourceWidth + COMPARISON_GAP : 0;
  const cellWidth = Math.max(
    imageWidth + nativeOffset,
    options.minimumWidth ?? 0,
    ...captionSizes.map(({ width }) => width + CAPTION_PADDING * 2),
  );
  const cellHeight = imageHeight + headerHeight;
  const columns =
    options.layout === AgentPreviewLayout.Strip
      ? frames.length
      : Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const width = cellWidth * columns;
  const height = cellHeight * rows;
  if (width > AGENT_PREVIEW_LIMITS.side || height > AGENT_PREVIEW_LIMITS.side)
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `Preview exceeds ${AGENT_PREVIEW_LIMITS.side}px per side; reduce scale or split frames`,
    );
  const pixels: PixelBuffer = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * CHANNELS),
  };
  const solid = SOLID_BACKGROUND.test(options.background)
    ? hexToRgba(options.background)
    : undefined;
  if (options.background !== AgentPreviewBackground.Transparent) {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const color =
          solid ??
          ((Math.floor(x / CHECKER_SIZE) + Math.floor(y / CHECKER_SIZE)) % 2
            ? CHECKER_DARK
            : CHECKER_LIGHT);
        pixels.data.set(color, (y * width + x) * CHANNELS);
      }
  }
  const draw = (source: PixelBuffer, x: number, y: number, scale: number) => {
    for (let py = 0; py < source.height * scale; py++)
      for (let px = 0; px < source.width * scale; px++) {
        const from = (Math.floor(py / scale) * source.width + Math.floor(px / scale)) * CHANNELS;
        const at = ((y + py) * width + x + px) * CHANNELS;
        blendNormalAt(pixels.data, at, source.data, from, OPAQUE);
      }
  };
  const frameRects = frames.map((frame, ordinal) => {
    const cellX = (ordinal % columns) * cellWidth;
    const cellY = Math.floor(ordinal / columns) * cellHeight;
    const x = cellX + nativeOffset;
    const y = cellY + headerHeight;
    // Empty comparison space is a quiet gutter, not a giant transparency grid.
    // Keep the chosen background underneath the actual native-size image.
    if (comparison) {
      for (let py = y; py < y + imageHeight; py++)
        for (let px = cellX; px < x; px++)
          if (px >= cellX + sourceWidth || py >= y + sourceHeight)
            pixels.data.set(CAPTION_BACKGROUND, (py * width + px) * CHANNELS);
    }
    if (options.labels) {
      for (let py = cellY; py < y; py++)
        for (let px = cellX; px < cellX + cellWidth; px++)
          pixels.data.set(CAPTION_BACKGROUND, (py * width + px) * CHANNELS);
      text!.draw(
        pixels,
        captions[ordinal],
        cellX + CAPTION_PADDING,
        cellY + CAPTION_PADDING,
        CAPTION_FONT_SIZE,
        CAPTION_FOREGROUND,
      );
    }
    if (comparison) draw(frame.pixels, cellX, y, 1);
    draw(frame.pixels, x, y, options.scale);
    return {
      x,
      y,
      width: imageWidth,
      height: imageHeight,
      frameIndex: frame.frameIndex,
      duration: frame.duration,
      ...(comparison
        ? { nativeRect: { x: cellX, y, width: sourceWidth, height: sourceHeight } }
        : {}),
    };
  });
  return {
    pixels,
    width,
    height,
    columns,
    rows,
    frameRects,
    scale: options.scale,
    background: options.background,
    layout: options.layout,
  };
}
