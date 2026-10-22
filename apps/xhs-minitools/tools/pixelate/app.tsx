import { TextContext } from "$/shared/ui/controls";
import { createMiniToolPort } from "$/tools/pixelate/adapters/output";
import { createMiniToolPixelationPort } from "$/tools/pixelate/adapters/pixelation";
import { RendererContext } from "$/tools/pixelate/components/context";
import { MiniToolScreen } from "$/tools/pixelate/components/screen";
import { MiniToolEditor } from "$/tools/pixelate/managers/editor";
import type { MiniToolText } from "$/tools/pixelate/managers/text";
import { PixelationManager } from "@xprite/tools-app/pixelation";

/** The pixelate tool as a Xiaohongshu mini tool: the same pixelation manager, a phone layout. */
export function createMiniToolPixelationApplication(text: MiniToolText) {
  const manager = new PixelationManager(createMiniToolPixelationPort());
  const port = createMiniToolPort();
  const editor = new MiniToolEditor(manager, port);
  void port.renderer.ready();
  return {
    view: (
      <TextContext.Provider value={text}>
        <RendererContext.Provider value={port.renderer}>
          <MiniToolScreen editor={editor} />
        </RendererContext.Provider>
      </TextContext.Provider>
    ),
    dispose: () => {
      editor.dispose();
      manager.dispose();
    },
  };
}
