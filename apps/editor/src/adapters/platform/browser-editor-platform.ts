import { browserColorSampling } from "$/adapters/colors/browser-color-sampling";
import { decodeAsepriteBlob } from "$/adapters/files/aseprite-files";
import { createBrowserAnimalCrossingExportPort } from "$/adapters/files/browser-animal-crossing-export";
import { decodeImage } from "$/adapters/files/images";
import { createBrowserWebpExportPort } from "$/adapters/files/webp-export";
import { browserPointerSamples } from "$/adapters/input/browser-pointer-samples";
import { connectBrowserStylusTouchDefaults } from "$/adapters/input/browser-stylus-touch";
import { BrowserWheelInput } from "$/adapters/input/browser-wheel";
import { debugInput } from "$/adapters/input/debug-input-log";
import type { DebugInputEvent } from "$/adapters/input/debug-input-log";
import {
  editorCursor,
  paintingCrosshairPixels,
  selectionHandleCursor,
} from "$/adapters/input/editor-cursors";
import { browserKeyboardLikelyAvailable } from "$/adapters/input/keyboard-capability";
import { createPaintingCursorRenderer } from "$/adapters/input/painting-cursors";
import { releaseEditorFocus } from "$/adapters/input/release-editor-focus";
import { createBrowserEditorLocation } from "$/adapters/platform/browser-editor-location";
import { createBrowserStartupScreen } from "$/adapters/platform/browser-startup-screen";
import { rasterizeEditorTextFont } from "$/adapters/rendering/editor-font";
import { ReferenceViewportCache } from "$/adapters/rendering/reference-viewport-cache";
import { createBrowserProjectSharing } from "$/adapters/sharing/browser-project-sharing";
import { createBrowserShortcutFilePort } from "$/adapters/shortcuts/browser-shortcut-files";
import { IndexedDbUserPresets } from "$/adapters/storage/indexeddb/user-presets";
import {
  EditorPrimaryModifier,
  type EditorCursorName,
  type EditorPlatformPorts,
} from "$/managers/ports/platform";
import { browserLocalStorage } from "@xprite/bedrock/browser/localstorage";
import { cursorStyle, type CursorName } from "@xprite/ui/cursor";

function browserCursorName(name: EditorCursorName | string): CursorName {
  return name as CursorName;
}

/** Concrete browser capabilities wired once by the editor application root. */
export function createBrowserEditorPlatformPorts(): EditorPlatformPorts {
  const primaryModifier = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
    ? EditorPrimaryModifier.Command
    : EditorPrimaryModifier.Control;
  return {
    startupScreen: createBrowserStartupScreen(),
    navigation: {
      location: createBrowserEditorLocation(),
      openExternal: (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
    },
    colorSampling: browserColorSampling,
    preferences: browserLocalStorage,
    userPresets: new IndexedDbUserPresets(),
    shortcutFiles: createBrowserShortcutFilePort(primaryModifier),
    files: {
      animalCrossingExport: createBrowserAnimalCrossingExportPort(),
      sharing:
        !__XPRITE_ITCH__ && typeof Worker === "function"
          ? createBrowserProjectSharing()
          : undefined,
      decodeAsepriteBlob,
      decodeImageBlob: decodeImage,
      webp: createBrowserWebpExportPort(),
    },
    input: {
      keyboardLikelyAvailable: browserKeyboardLikelyAvailable(),
      primaryModifier,
      releaseEditorFocus,
      cursorStyle: (name, fallback) => cursorStyle(browserCursorName(name), fallback),
    },
    canvasRendering: {
      createReferenceCache: () => new ReferenceViewportCache(),
    },
    wheelInput: new BrowserWheelInput(),
    canvasInput: {
      connectStylusTouchDefaults: connectBrowserStylusTouchDefaults,
      pointerSamples: browserPointerSamples,
      cursors: {
        createPaintingCursorRenderer,
        cursorStyle: (name, fallback) => cursorStyle(browserCursorName(name), fallback),
        editorCursor,
        selectionHandleCursor,
        paintingCrosshairPixels,
      },
      debugInput: (kind, event, details, options) =>
        debugInput(kind, event, details as Partial<DebugInputEvent> | undefined, options),
    },
    font: {
      rasterize: rasterizeEditorTextFont,
    },
  };
}
