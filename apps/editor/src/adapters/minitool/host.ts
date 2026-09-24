import { browserPointerSamples } from "$/adapters/input/browser-pointer-samples";
import { connectBrowserStylusTouchDefaults } from "$/adapters/input/browser-stylus-touch";
import { BrowserWheelInput } from "$/adapters/input/browser-wheel";
import {
  editorCursor,
  paintingCrosshairPixels,
  selectionHandleCursor,
} from "$/adapters/input/editor-cursors";
import { createPaintingCursorRenderer } from "$/adapters/input/painting-cursors";
import { releaseEditorFocus } from "$/adapters/input/release-editor-focus";
import { decodeAsepriteBlob, deflateMiniToolCel } from "$/adapters/minitool/aseprite-files";
import { decodeImage } from "$/adapters/minitool/images";
import { MiniToolProjectRepository } from "$/adapters/minitool/project-repository";
import { miniToolPreferences, readJson, writeJson } from "$/adapters/minitool/sdk";
import { MiniToolSession } from "$/adapters/minitool/session";
import { rasterizeEditorTextFont } from "$/adapters/rendering/editor-font";
import { ReferenceViewportCache } from "$/adapters/rendering/reference-viewport-cache";
import { encodeRecoverySnapshot, decodeRecoverySnapshot } from "$/adapters/workers/recovery-codec";
import type { EditorHostFactory } from "$/managers/ports/editor-host";
import { EditorPrimaryModifier } from "$/managers/ports/platform";
import { cursorStyle, type CursorName } from "@xprite/ui/cursor";

export const createMiniToolEditorHostPorts: EditorHostFactory = () => ({
  platform: {
    navigation: { openExternal: () => {} },
    preferences: miniToolPreferences,
    userPresets: {
      load: () => readJson("user-presets", null),
      save: (value) => writeJson("user-presets", value),
      close: () => {},
    },
    files: { decodeAsepriteBlob, decodeImageBlob: decodeImage },
    input: {
      keyboardLikelyAvailable: false,
      primaryModifier: EditorPrimaryModifier.Control,
      releaseEditorFocus,
      cursorStyle: (name, fallback) => cursorStyle(name as CursorName, fallback),
    },
    canvasRendering: { createReferenceCache: () => new ReferenceViewportCache() },
    wheelInput: new BrowserWheelInput(),
    canvasInput: {
      connectStylusTouchDefaults: connectBrowserStylusTouchDefaults,
      pointerSamples: browserPointerSamples,
      cursors: {
        createPaintingCursorRenderer,
        cursorStyle: (name, fallback) => cursorStyle(name as CursorName, fallback),
        editorCursor,
        selectionHandleCursor,
        paintingCrosshairPixels,
      },
      debugInput: () => {},
    },
    font: { rasterize: rasterizeEditorTextFont },
  },
  createSessions: () => new MiniToolSession(),
  createRepository: () => new MiniToolProjectRepository(),
  createCodec: () => ({
    encode: (snapshot) => encodeRecoverySnapshot(snapshot, deflateMiniToolCel),
    decode: decodeRecoverySnapshot,
    close: () => {},
  }),
});
