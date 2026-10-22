import { createMiniToolPort } from "$/adapters/minitool-output";
import { createMiniToolPixelationPort } from "$/adapters/minitool-pixelation";
import { MiniToolRendererContext, MiniToolTextContext } from "$/components/minitool-controls";
import { MiniToolScreen } from "$/components/minitool-screen";
import { MiniToolEditor } from "$/managers/minitool-editor";
import type { MiniToolText } from "$/managers/text";
import { PixelationManager } from "@xprite/tools-app/pixelation";

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
