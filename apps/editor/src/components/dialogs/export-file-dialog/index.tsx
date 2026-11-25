import { useEffect, useRef, useState } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUi } from "$/i18n";
import {
  ExportTagDirection,
  MAX_EXPORT_LOOP_COUNT,
  MAX_WEBP_EXPORT_LOOP_COUNT,
  useExportFileDialogModel,
  type ExportFileDialogOptions,
  type ImageExportCapabilities,
} from "$/managers/dialogs/export-file-dialog-model";
import { ExportOutputFormat } from "$/managers/files/export-file-options";
import {
  readGifExportPreferences,
  writeGifExportPreferences,
  readImageExportPreferences,
  ImageExportFormat,
  WebpCompression,
} from "$/managers/files/export-format-preferences";
import { DEFAULT_FILE_PREFERENCES } from "$/managers/preferences/file-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";

export interface ExportFileDialogDraft {
  options: ExportFileDialogOptions;
  resize: string;
  outputFormat: ExportOutputFormat;
}

export interface ExportFileDialogProps {
  embedded?: boolean;
  formatRequest?: { format: ExportOutputFormat };
  initialDraft?: ExportFileDialogDraft;
  onDraftChange?: (draft: ExportFileDialogDraft) => void;
  onFormatChange?: (format: ExportOutputFormat) => void;
  imageCapabilities?: ImageExportCapabilities;
  onLayoutSizeChange?: (size: { width: number; height: number }) => void;
  onClose: () => void;
  onExport: (options: ExportFileDialogOptions) => void;
  busy?: boolean;
  documentKey?: string;
  filePreferences?: FilePreferences;
}

function formatFromFileName(name: string): ExportOutputFormat {
  return /\.gif$/i.test(name)
    ? ExportOutputFormat.Gif
    : /\.apng$/i.test(name)
      ? ExportOutputFormat.Apng
      : /\.jpe?g$/i.test(name)
        ? ExportOutputFormat.Jpeg
        : /\.webp$/i.test(name)
          ? ExportOutputFormat.Webp
          : ExportOutputFormat.Png;
}

/** Export dialog field order and label strings. Unsupported outputs stay visibly disabled. */
export function ExportFileDialog({
  embedded = false,
  formatRequest,
  initialDraft,
  onDraftChange,
  onFormatChange,
  imageCapabilities,
  onLayoutSizeChange,
  onClose,
  onExport,
  busy = false,
  documentKey,
  filePreferences = DEFAULT_FILE_PREFERENCES,
}: ExportFileDialogProps) {
  const manager = useExportFileDialogModel(documentKey, filePreferences, imageCapabilities);
  const document = manager.document;
  const indexed = document.indexed;
  const opaqueIndexed = document.opaqueIndexed;
  const [gifPrefs] = useState(readGifExportPreferences);
  const [options, setOptions] = useState<ExportFileDialogOptions>(() => {
    if (initialDraft) return initialDraft.options;
    const base = manager.createInitialOptions();
    const loopCount = base.loopCount ?? (gifPrefs.loop ? 0 : 1);
    const baseFormat = formatFromFileName(base.name);
    return {
      ...base,
      // Single-frame JPEG exports always save frames="current"; restore "all" as the
      // underlying multi-frame scope on multi-frame documents so switching formats works.
      frames:
        baseFormat === ExportOutputFormat.Jpeg && document.frameCount > 1
          ? "all"
          : (base.frames ?? "all"),
      gifInterlaced: gifPrefs.interlaced,
      loopCount,
      gifPreservePaletteOrder: indexed && (opaqueIndexed || gifPrefs.preservePaletteOrder),
    };
  });
  const [resize, setResize] = useState(
    () => initialDraft?.resize ?? options.scalePercent.toFixed(2),
  );
  const update = <K extends keyof ExportFileDialogOptions>(
    key: K,
    value: ExportFileDialogOptions[K],
  ) => setOptions((old) => ({ ...old, [key]: value }));
  const initialFormat = initialDraft?.outputFormat ?? formatFromFileName(options.name);
  const [outputFormat, setOutputFormat] = useState(formatRequest?.format ?? initialFormat);
  const gifImage = outputFormat === ExportOutputFormat.Gif;
  const staticImage = outputFormat === ExportOutputFormat.Jpeg;
  const webpImage = outputFormat === ExportOutputFormat.Webp;
  const applyOutputFormat = (selected: ExportOutputFormat, name: string) => {
    setOutputFormat(selected);
    if (selected === ExportOutputFormat.Jpeg) {
      const prefs = readImageExportPreferences(ImageExportFormat.Jpeg);
      setOptions((old) => ({
        ...old,
        name,
        // Keep the user's multi-frame selection intact; staticImage forces "current" in UI & plan.
        imageQualityPercent: prefs.qualityPercent,
        jpegMatte: prefs.jpegMatte,
      }));
    } else if (selected === ExportOutputFormat.Webp) {
      const prefs = readImageExportPreferences(ImageExportFormat.Webp);
      setOptions((old) => ({
        ...old,
        name,
        frames:
          document.frameCount === 1 && document.loopCount === undefined
            ? "current"
            : (old.frames ?? "all"),
        imageQualityPercent: prefs.qualityPercent,
        webpCompression: prefs.webpCompression,
      }));
    } else update("name", name);
  };
  const setOutputName = (name: string) => {
    const extension = name.toLowerCase().match(/\.(png|gif|apng|jpe?g|webp)$/)?.[1];
    if (extension)
      applyOutputFormat(
        extension === "jpeg" ? ExportOutputFormat.Jpeg : (extension as ExportOutputFormat),
        name,
      );
    else update("name", name);
  };
  const chooseOutputFormat = (format: string) => {
    const selected = format as ExportOutputFormat;
    const stem = options.name.trim().replace(/\.[^.]*$/, "") || "untitled";
    applyOutputFormat(selected, `${stem}.${selected}`);
  };
  const appliedFormatRequest = useRef<ExportFileDialogProps["formatRequest"]>(
    initialDraft && formatRequest && initialDraft.outputFormat === formatRequest.format
      ? formatRequest
      : undefined,
  );
  useEffect(() => {
    if (!formatRequest || appliedFormatRequest.current === formatRequest || busy) return;
    appliedFormatRequest.current = formatRequest;
    chooseOutputFormat(formatRequest.format);
  }, [formatRequest, busy, chooseOutputFormat]);
  useEffect(() => {
    onFormatChange?.(outputFormat);
  }, [outputFormat, onFormatChange]);
  useEffect(() => {
    onDraftChange?.({ options, resize, outputFormat });
  }, [options, resize, outputFormat, onDraftChange]);
  const nameStem = options.name.trim().replace(/\.[^.]*$/, "") || "untitled";
  const jpegPrefs = staticImage ? readImageExportPreferences(ImageExportFormat.Jpeg) : null;
  const webpPrefs = webpImage ? readImageExportPreferences(ImageExportFormat.Webp) : null;
  const plan = {
    ...options,
    name: `${nameStem}.${outputFormat}`,
    scalePercent: resize.trim() ? Number(resize) : NaN,
    ...(staticImage
      ? {
          frames: "current" as const,
          ignoreEmpty: false,
          forTwitter: false,
          playSubtags: false,
          imageQualityPercent: options.imageQualityPercent ?? jpegPrefs!.qualityPercent,
          jpegMatte: options.jpegMatte ?? jpegPrefs!.jpegMatte,
        }
      : {}),
    ...(webpImage
      ? {
          webpCompression: options.webpCompression ?? webpPrefs!.webpCompression,
          imageQualityPercent: options.imageQualityPercent ?? webpPrefs!.qualityPercent,
          forTwitter: false,
        }
      : {}),
  };
  const inspection = manager.inspect(plan);
  const valid = inspection.valid;
  const tags = document.tags;
  const submit = () => {
    if (!busy && valid) {
      if (gifImage) {
        writeGifExportPreferences({
          interlaced: !!plan.gifInterlaced,
          loop: plan.loopCount !== 1,
          preservePaletteOrder: !!plan.gifPreservePaletteOrder,
        });
      }
      onExport(plan);
    }
  };
  const showSubtags =
    !staticImage &&
    tags.length > 0 &&
    options.frames !== "selected" &&
    options.frames !== "current";
  const showPixelRatio = document.pixelWidth !== 1 || document.pixelHeight !== 1;
  const showPlayCount =
    gifImage ||
    outputFormat === ExportOutputFormat.Apng ||
    (webpImage && options.frames !== "current");
  let preferred = 1;
  while (preferred < 10 && (document.width * preferred < 240 || document.height * preferred < 240))
    preferred++;
  const fields: FormField[] = [
    {
      key: "output",
      label: "Output File:",
      type: "filename",
      value: plan.name,
      onChange: setOutputName,
      disabled: busy,
    },
    {
      key: "format",
      label: "Format",
      type: "select",
      value: outputFormat,
      onChange: chooseOutputFormat,
      disabled: busy,
      options: [
        { value: "png", label: "PNG image (.png)" },
        { value: "gif", label: "GIF animation (.gif)" },
        { value: "apng", label: "Animated PNG (.apng)" },
        {
          value: "jpg",
          label:
            manager.imageEncoding?.checked && !manager.imageEncoding.jpeg
              ? "JPEG unavailable in this browser"
              : "JPEG current frame (.jpg)",
          disabled: !manager.imageEncoding?.jpeg,
        },
        {
          value: "webp",
          label:
            manager.imageEncoding?.checked && !manager.imageEncoding.webp
              ? "WebP unavailable in this browser"
              : "WebP image/animation (.webp)",
          disabled: !manager.imageEncoding?.webp,
        },
      ],
    },
    ...(staticImage
      ? [
          {
            key: "quality",
            row: "jpeg-options",
            label: "Quality (%)",
            type: "number" as const,
            min: 0,
            max: 100,
            step: 1,
            value: plan.imageQualityPercent ?? jpegPrefs!.qualityPercent,
            onChange: (value: number) => update("imageQualityPercent", value),
            disabled: busy,
          },
          {
            key: "jpegMatte",
            row: "jpeg-options",
            label: "Background",
            type: "color" as const,
            value: plan.jpegMatte ?? jpegPrefs!.jpegMatte,
            onChange: (value: string) => update("jpegMatte", value.slice(0, 7)),
            disabled: busy,
          },
        ]
      : []),
    ...(webpImage
      ? [
          {
            key: "webpCompression",
            row: "webp-options",
            label: "Compression:",
            type: "select" as const,
            value: plan.webpCompression ?? WebpCompression.Lossless,
            disabled: busy,
            onChange: (value: string) => update("webpCompression", value as WebpCompression),
            options: [
              {
                value: WebpCompression.Lossless,
                label: manager.imageEncoding.webpLossless
                  ? "Lossless"
                  : "Lossless unavailable in this browser",
                disabled: !manager.imageEncoding.webpLossless,
              },
              {
                value: WebpCompression.Lossy,
                label: manager.imageEncoding.webpLossy
                  ? "Lossy"
                  : "Lossy unavailable in this browser",
                disabled: !manager.imageEncoding.webpLossy,
              },
            ],
          },
          {
            key: "quality",
            row: "webp-options",
            label: "Quality (%)",
            type: "number" as const,
            min: 0,
            max: 100,
            step: 1,
            value: plan.imageQualityPercent ?? webpPrefs!.qualityPercent,
            onChange: (value: number) => update("imageQualityPercent", value),
            disabled: busy || plan.webpCompression === WebpCompression.Lossless,
          },
        ]
      : []),
    {
      key: "resize",
      row: "resize-area",
      label: "Resize:",
      type: "select",
      editable: true,
      suffix: "%",
      inputMode: "numeric",
      value: resize,
      onChange: setResize,
      disabled: busy,
      options: [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((value) => ({
        value: value.toFixed(2),
        label: value.toFixed(2),
      })),
    },
    {
      key: "area",
      row: "resize-area",
      label: "Area:",
      type: "select",
      value: options.area,
      onChange: (value) => update("area", value as ExportFileDialogOptions["area"]),
      disabled: busy,
      options: [
        { value: "canvas", label: "Canvas" },
        { value: "selection", label: "Selection", disabled: !document.hasSelection },
      ],
    },
    {
      key: "layers",
      label: "Layers:",
      type: "select",
      value: options.layers,
      onChange: (value) => update("layers", value as ExportFileDialogOptions["layers"]),
      disabled: busy,
      options: [
        { value: "visible", label: "Visible layers" },
        { value: "selected", label: "Selected layers" },
      ],
    },
    {
      key: "frames",
      label: "Frames:",
      type: "select",
      value: staticImage ? "current" : (options.frames ?? "all"),
      onChange: (value) => {
        if (!staticImage) update("frames", value as ExportFileDialogOptions["frames"]);
      },
      disabled: busy,
      options: [
        { value: "all", label: "All frames", disabled: staticImage },
        { value: "selected", label: "Selected frames", disabled: staticImage },
        { value: "current", label: "Current frame" },
        ...tags.map((tag) => ({
          value: `tag:${tag.name}`,
          label: tag.name,
          disabled: staticImage,
        })),
      ],
    },
    ...(showPlayCount
      ? [
          {
            key: "loopCount",
            label: "Play Count (0 = ∞):",
            type: "number" as const,
            min: 0,
            max: webpImage ? MAX_WEBP_EXPORT_LOOP_COUNT : MAX_EXPORT_LOOP_COUNT,
            step: 1,
            value: options.loopCount ?? 0,
            disabled: busy,
            onChange: (value: number) => setOptions((old) => ({ ...old, loopCount: value })),
          },
        ]
      : []),
    {
      key: "anidir",
      label: "Animation Direction:",
      type: "select",
      value: options.direction ?? ExportTagDirection.Forward,
      onChange: (value) => update("direction", value as ExportFileDialogOptions["direction"]),
      disabled: busy || staticImage,
      options: [
        [ExportTagDirection.Forward, "Forward"],
        [ExportTagDirection.Reverse, "Reverse"],
        [ExportTagDirection.PingPong, "Ping-pong"],
        [ExportTagDirection.PingPongReverse, "Ping-pong Reverse"],
      ].map(([value, label]) => ({ value, label })),
    },
    ...(
      [
        ["playSubtags", "Play Subtags & Repetitions"],
        ["pixelRatio", "Apply pixel ratio"],
        ["forTwitter", "Export for Twitter"],
        ["ignoreEmpty", "Ignore empty frames"],
      ] as const
    )
      .filter(([key]) =>
        key === "playSubtags" ? showSubtags : key === "pixelRatio" ? showPixelRatio : true,
      )
      .map(([key, label]): FormField => ({
        key,
        label,
        type: "checkbox",
        value: !!plan[key],
        onChange: (v) => update(key, v),
        disabled:
          busy || (staticImage && key !== "pixelRatio") || (webpImage && key === "forTwitter"),
      })),
    ...(gifImage
      ? [
          {
            key: "interlaced",
            label: "Interlaced",
            disabled: busy,
            type: "checkbox" as const,
            value: !!options.gifInterlaced,
            onChange: (v: boolean) => update("gifInterlaced", v),
          },
          {
            key: "palette",
            label: "Preserve palette order",
            type: "checkbox" as const,
            value: !!options.gifPreservePaletteOrder,
            onChange: (v: boolean) => update("gifPreservePaletteOrder", v),
            disabled: busy || !indexed || opaqueIndexed,
          },
        ]
      : []),
    ...(!staticImage && !webpImage && options.forTwitter && Number(resize) < preferred * 100
      ? [
          {
            key: "adjustResize",
            label: tUi("ui.adjust.resize.to", { value1: preferred * 100 }),
            type: "button" as const,
            onClick: () => setResize((preferred * 100).toFixed(2)),
            disabled: busy,
          },
        ]
      : []),
  ];
  const form = (
    <FormDialog
      embedded={embedded}
      onLayoutSizeChange={onLayoutSizeChange}
      key="export-file"
      open
      title={embedded ? tUi("ui.export.images.animation") : "Export File"}
      width={480}
      layoutMode="flow"
      message={inspection.error}
      helpUrl="https://www.aseprite.org/docs/exporting/"
      fields={embedded ? fields.filter((field) => field.key !== "format") : fields}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      actions={[
        { label: "Export", disabled: busy || !valid, onClick: submit },
        { label: "Cancel", disabled: busy, onClick: onClose },
      ]}
    />
  );
  return form;
}
