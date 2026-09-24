import { useEffect, useState } from "react";

import { useDialogEditorSource } from "$/managers/dialogs/internal-editor-source";
import { defaultExportFileOptions } from "$/managers/files/export-file-options";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { DEFAULT_FILE_PREFERENCES } from "$/managers/preferences/file-preferences";
import type { ExportExtensionDefaults } from "$/managers/preferences/file-preferences";
import { ImageEncodingFormat, isImageEncodingSupported } from "@xprite/bedrock/browser/images";
import { exportFrameOrder, exportGeometry, timelineTags } from "@xprite/editor-core";
import type { ExportFileOptions } from "@xprite/editor-core";
import { AsepriteTagDirection } from "@xprite/editor-core/import-export";
import { MAX_WEBP_LOOP_COUNT, WebpCompression } from "@xprite/editor-core/import-export";
import { MAX_ANIMATION_LOOP_COUNT } from "@xprite/editor-core/timeline";
export const MAX_EXPORT_LOOP_COUNT = MAX_ANIMATION_LOOP_COUNT;
export const MAX_WEBP_EXPORT_LOOP_COUNT = MAX_WEBP_LOOP_COUNT;

export type ExportFileDialogOptions = ExportFileOptions;
export enum ExportOutputFormat {
  Png = "png",
  Gif = "gif",
  Apng = "apng",
  Jpeg = "jpg",
  Webp = "webp",
}
export const ExportTagDirection = Object.freeze({
  Forward: AsepriteTagDirection.Forward,
  Reverse: AsepriteTagDirection.Reverse,
  PingPong: AsepriteTagDirection.PingPong,
  PingPongReverse: AsepriteTagDirection.PingPongReverse,
});

interface ExportFileDocumentView {
  name: string;
  width: number;
  height: number;
  hasSelection: boolean;
  activeFrame: number;
  indexed: boolean;
  opaqueIndexed: boolean;
  tags: readonly { name: string }[];
  pixelWidth: number;
  pixelHeight: number;
  frameCount: number;
  loopCount?: number;
}

export function useExportFileDialogModel(
  documentKey?: string,
  defaults: ExportExtensionDefaults = DEFAULT_FILE_PREFERENCES,
) {
  const webp = useEditorPlatformPorts()?.files.webp;
  const [imageEncoding, setImageEncoding] = useState({
    jpeg: false,
    webp: false,
    webpLossless: false,
    webpLossy: false,
    checked: false,
  });
  useEffect(() => {
    let active = true;
    void Promise.all([
      isImageEncodingSupported(ImageEncodingFormat.Jpeg),
      isImageEncodingSupported(ImageEncodingFormat.Webp),
    ]).then(([jpeg, nativeWebp]) => {
      const webpLossless = webp?.supportsLossless() ?? false;
      const webpLossy = !!webp && nativeWebp;
      if (active)
        setImageEncoding({
          jpeg,
          webp: webpLossless || webpLossy,
          webpLossless,
          webpLossy,
          checked: true,
        });
    });
    return () => {
      active = false;
    };
  }, [webp]);
  const source = useDialogEditorSource(documentKey);
  const document = source.document;
  const timeline = document?.timeline;
  const indexed = timeline?.colorDepth === 8 || timeline?.asepriteSource?.depth === 8;
  const view: ExportFileDocumentView = document
    ? {
        name: document.name,
        width: document.width,
        height: document.height,
        hasSelection: !!document.selection,
        activeFrame: timeline?.activeFrame ?? 0,
        indexed,
        opaqueIndexed: indexed && !!timeline?.layers.some((layer) => (layer.flags & 8) !== 0),
        tags: timeline ? timelineTags(timeline).map((tag) => ({ name: tag.name })) : [],
        pixelWidth: timeline?.asepriteSource?.header?.pixelWidth ?? 1,
        pixelHeight: timeline?.asepriteSource?.header?.pixelHeight ?? 1,
        frameCount: timeline?.frames.length ?? 1,
        loopCount: timeline?.loopCount,
      }
    : {
        name: "Untitled",
        width: 0,
        height: 0,
        hasSelection: false,
        activeFrame: 0,
        indexed: false,
        opaqueIndexed: false,
        tags: [],
        pixelWidth: 1,
        pixelHeight: 1,
        frameCount: 1,
      };
  return {
    document: view,
    available: !!document,
    imageEncoding,
    createInitialOptions(): ExportFileDialogOptions {
      if (!document)
        return {
          name: "untitled.png",
          scalePercent: 100,
          area: "canvas",
          layers: "visible",
          frame: 0,
          frames: "all",
        };
      const remembered = source.exportPreferences.animation;
      const options: ExportFileDialogOptions = remembered
        ? {
            ...structuredClone(remembered),
            frame: timeline?.activeFrame ?? 0,
            area: remembered.area === "selection" && document.selection ? "selection" : "canvas",
          }
        : { ...defaultExportFileOptions(document, defaults), frames: "all" };
      if (!remembered && timeline?.loopCount !== undefined) options.loopCount = timeline.loopCount;
      if (
        /\.jpe?g$/i.test(options.name) ||
        (/\.webp$/i.test(options.name) &&
          !remembered &&
          view.frameCount === 1 &&
          timeline?.loopCount === undefined)
      )
        options.frames = "current";
      return options;
    },
    inspect(options: ExportFileDialogOptions) {
      if (
        !document ||
        (/\.jpe?g$/i.test(options.name) && !imageEncoding.jpeg) ||
        (/\.webp$/i.test(options.name) &&
          (!imageEncoding.webp ||
            ((options.webpCompression ?? WebpCompression.Lossless) === WebpCompression.Lossless
              ? !imageEncoding.webpLossless
              : !imageEncoding.webpLossy)))
      )
        return { valid: false, frameCount: 0 };
      try {
        exportGeometry(document, options);
        return { valid: true, frameCount: exportFrameOrder(document, options).length };
      } catch {
        return { valid: false, frameCount: 0 };
      }
    },
  };
}
