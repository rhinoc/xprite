import { useState } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUi } from "$/i18n";
import {
  ExportTagDirection,
  ExportOutputFormat,
  MAX_EXPORT_LOOP_COUNT,
  MAX_WEBP_EXPORT_LOOP_COUNT,
  useExportFileDialogModel,
  type ExportFileDialogOptions,
} from "$/managers/dialogs/export-file-dialog-model";
import {
  readGifExportPreferences,
  writeGifExportPreferences,
  readImageExportPreferences,
  ImageExportFormat,
  WebpCompression,
} from "$/managers/files/export-format-preferences";
import {
  exportFileAsepriteLayout,
  gifOptionsAsepriteLayout,
} from "$/managers/files/policies/export-file-geometry";
import { DEFAULT_FILE_PREFERENCES } from "$/managers/preferences/file-preferences";
import type { FilePreferences } from "$/managers/preferences/file-preferences";

export interface ExportFileDialogProps {
  onClose: () => void;
  onExport: (options: ExportFileDialogOptions) => void;
  busy?: boolean;
  documentKey?: string;
  filePreferences?: FilePreferences;
}
/** Aseprite export_file.xml field order and en.ini strings. Unsupported output
 * behaviors remain visibly disabled rather than being silently ignored. */
export function ExportFileDialog({
  onClose,
  onExport,
  busy = false,
  documentKey,
  filePreferences = DEFAULT_FILE_PREFERENCES,
}: ExportFileDialogProps) {
  const manager = useExportFileDialogModel(documentKey, filePreferences);
  const document = manager.document;
  const indexed = document.indexed;
  const opaqueIndexed = document.opaqueIndexed;
  const [gifPrefs, setGifPrefs] = useState(readGifExportPreferences);
  const [options, setOptions] = useState<ExportFileDialogOptions>(() => {
    const base = manager.createInitialOptions();
    const loopCount = base.loopCount ?? (gifPrefs.loop ? 0 : 1);
    return {
      ...base,
      gifInterlaced: gifPrefs.interlaced,
      loopCount,
      gifPreservePaletteOrder: indexed && (opaqueIndexed || gifPrefs.preservePaletteOrder),
    };
  });
  const [gifOptions, setGifOptions] = useState(false);
  const [imageOptions, setImageOptions] = useState(false);
  const [resize, setResize] = useState(options.scalePercent.toFixed(2));
  const update = <K extends keyof ExportFileDialogOptions>(
    key: K,
    value: ExportFileDialogOptions[K],
  ) => setOptions((old) => ({ ...old, [key]: value }));
  const changeLoop = (enabled: boolean) =>
    setOptions((old) => ({
      ...old,
      loopCount: enabled ? (old.loopCount === 1 ? 0 : (old.loopCount ?? 0)) : 1,
    }));
  const initialFormat = /\.gif$/i.test(options.name)
    ? ExportOutputFormat.Gif
    : /\.apng$/i.test(options.name)
      ? ExportOutputFormat.Apng
      : /\.jpe?g$/i.test(options.name)
        ? ExportOutputFormat.Jpeg
        : /\.webp$/i.test(options.name)
          ? ExportOutputFormat.Webp
          : ExportOutputFormat.Png;
  const [outputFormat, setOutputFormat] = useState(initialFormat);
  const staticImage = outputFormat === ExportOutputFormat.Jpeg;
  const webpImage = outputFormat === ExportOutputFormat.Webp;
  const applyOutputFormat = (selected: ExportOutputFormat, name: string) => {
    setOutputFormat(selected);
    if (selected === ExportOutputFormat.Jpeg || selected === ExportOutputFormat.Webp) {
      const prefs = readImageExportPreferences(
        selected === ExportOutputFormat.Jpeg ? ImageExportFormat.Jpeg : ImageExportFormat.Webp,
      );
      setOptions((old) => ({
        ...old,
        name,
        frames:
          selected === ExportOutputFormat.Jpeg ||
          (document.frameCount === 1 && document.loopCount === undefined)
            ? "current"
            : (old.frames ?? "all"),
        imageQualityPercent: prefs.qualityPercent,
        jpegMatte: prefs.jpegMatte,
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
  const nameStem = options.name.trim().replace(/\.[^.]*$/, "") || "untitled";
  const plan = {
    ...options,
    name: `${nameStem}.${outputFormat}`,
    scalePercent: resize.trim() ? Number(resize) : NaN,
    ...(staticImage
      ? { frames: "current" as const, ignoreEmpty: false, forTwitter: false, playSubtags: false }
      : {}),
    ...(webpImage
      ? {
          webpCompression:
            options.webpCompression ??
            readImageExportPreferences(ImageExportFormat.Webp).webpCompression,
          forTwitter: false,
        }
      : {}),
  };
  const inspection = manager.inspect(plan);
  const valid = inspection.valid;
  const tags = document.tags;
  const submit = () => {
    if (!busy && valid) {
      if (/\.gif$/i.test(plan.name) && !gifPrefs.dontShow) setGifOptions(true);
      else if (staticImage || webpImage) setImageOptions(true);
      else onExport(plan);
    }
  };
  if (imageOptions) {
    const format =
      outputFormat === ExportOutputFormat.Jpeg ? ImageExportFormat.Jpeg : ImageExportFormat.Webp;
    const prefs = readImageExportPreferences(format);
    return (
      <FormDialog
        key="image-options"
        open
        title={format === ImageExportFormat.Jpeg ? "JPEG Options" : "WebP Options"}
        width={480}
        message={
          format === ImageExportFormat.Jpeg
            ? "Exports the current frame. Transparent pixels are composited over the selected background."
            : plan.webpCompression === WebpCompression.Lossless
              ? "Lossless WebP preserves exact RGBA pixels, including colors under transparency. Frame selection and play count apply to animations."
              : "Lossy WebP uses browser compression with the selected quality. Frame selection and play count apply to animations."
        }
        fields={[
          {
            key: "quality",
            label: "Quality (%)",
            type: "number",
            min: 0,
            max: 100,
            step: 1,
            value: options.imageQualityPercent ?? prefs.qualityPercent,
            onChange: (value) => update("imageQualityPercent", value),
            disabled: busy || (webpImage && plan.webpCompression === WebpCompression.Lossless),
          },
          ...(format === ImageExportFormat.Jpeg
            ? [
                {
                  key: "jpegMatte",
                  label: "Background",
                  type: "color" as const,
                  value: options.jpegMatte ?? prefs.jpegMatte,
                  onChange: (value: string) => update("jpegMatte", value.slice(0, 7)),
                  disabled: busy,
                },
              ]
            : []),
        ]}
        onOpenChange={(open) => {
          if (!open && !busy) setImageOptions(false);
        }}
        actions={[
          {
            label: "Export",
            disabled: busy || !valid,
            onClick: () => {
              onExport({
                ...plan,
                imageQualityPercent: options.imageQualityPercent ?? prefs.qualityPercent,
                jpegMatte: options.jpegMatte ?? prefs.jpegMatte,
              });
            },
          },
          { label: "Cancel", disabled: busy, onClick: () => setImageOptions(false) },
        ]}
      />
    );
  }
  if (gifOptions)
    return (
      <FormDialog
        key="gif-options"
        open
        title="GIF Options"
        width={548}
        layout={gifOptionsAsepriteLayout}
        fields={[
          {
            key: "interlaced",
            label: "Interlaced",
            type: "checkbox",
            value: !!options.gifInterlaced,
            onChange: (v) => update("gifInterlaced", v),
          },
          {
            key: "loop",
            label: "Animation Loop",
            type: "checkbox",
            value: options.loopCount !== 1,
            onChange: changeLoop,
          },
          {
            key: "palette",
            label: "Preserve palette order",
            type: "checkbox",
            value: !!options.gifPreservePaletteOrder,
            onChange: (v) => update("gifPreservePaletteOrder", v),
            disabled: !indexed || opaqueIndexed,
          },
          {
            key: "dontShow",
            label: "Don't show this alert again",
            type: "checkbox",
            value: gifPrefs.dontShow,
            onChange: (value) => setGifPrefs((old) => ({ ...old, dontShow: value })),
          },
        ]}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
        actions={[
          {
            label: "OK",
            disabled: busy,
            onClick: () => {
              writeGifExportPreferences({
                dontShow: gifPrefs.dontShow,
                interlaced: !!plan.gifInterlaced,
                loop: plan.loopCount !== 1,
                preservePaletteOrder: !!plan.gifPreservePaletteOrder,
              });
              onExport(plan);
            },
          },
          { label: "Cancel", disabled: busy, onClick: onClose },
        ]}
      />
    );
  const showSubtags =
    !staticImage &&
    tags.length > 0 &&
    options.frames !== "selected" &&
    options.frames !== "current";
  const showPixelRatio = document.pixelWidth !== 1 || document.pixelHeight !== 1;
  const showPlayCount =
    outputFormat === ExportOutputFormat.Gif ||
    outputFormat === ExportOutputFormat.Apng ||
    (webpImage && options.frames !== "current");
  const layout = exportFileAsepriteLayout(showSubtags, showPixelRatio, showPlayCount, webpImage);
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
    ...(webpImage
      ? [
          {
            key: "webpCompression",
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
        ]
      : []),
    {
      key: "resize",
      row: "resize-area",
      label: "Resize:",
      type: "select",
      editable: true,
      suffix: "%",
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
      onChange: (value) => update("frames", value as ExportFileDialogOptions["frames"]),
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
  return (
    <FormDialog
      key="export-file"
      open
      title="Export File"
      width={480}
      layout={layout}
      helpUrl="https://www.aseprite.org/docs/exporting/"
      fields={fields}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      actions={[
        { label: "Export", disabled: busy || !valid, onClick: submit },
        { label: "Cancel", disabled: busy, onClick: onClose },
      ]}
    />
  );
}
