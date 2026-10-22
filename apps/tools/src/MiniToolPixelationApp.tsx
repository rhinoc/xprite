import { createMiniToolPort } from "$/adapters/minitool/minitool-output";
import { createMiniToolPixelationPort } from "$/adapters/minitool/minitool-pixelation";
import {
  MiniToolRendererContext,
  MiniToolTextContext,
} from "$/components/minitool/minitool-controls";
import { MiniToolScreen } from "$/components/minitool/minitool-screen";
import type { MiniToolText } from "$/managers/locale/minitool-text";
import { MiniToolEditor } from "$/managers/minitool/minitool-editor";
import { PixelationManager } from "$/managers/pixelation/pixelation-manager";

/** The pixelate tool as a Xiaohongshu mini tool: the same pixelation manager, a phone layout. */
export function createMiniToolPixelationApplication(text: MiniToolText) {
  const manager = new PixelationManager(createMiniToolPixelationPort());
  const port = createMiniToolPort();
  const editor = new MiniToolEditor(manager, port);
  void port.renderer.ready();
  return {
    view: (
      <MiniToolTextContext.Provider value={text}>
        <MiniToolRendererContext.Provider value={port.renderer}>
          <MiniToolScreen editor={editor} />
        </MiniToolRendererContext.Provider>
      </MiniToolTextContext.Provider>
    ),
    dispose: () => {
      editor.dispose();
      manager.dispose();
    },
  };
}
