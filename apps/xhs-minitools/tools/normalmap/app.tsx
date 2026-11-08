import { TextContext } from "$/shared/ui/controls";
import { outputScene } from "$/tools/normalmap/adapters/output";
import { NormalTextContext } from "$/tools/normalmap/components/context";
import { MiniToolScreen } from "$/tools/normalmap/components/screen";
import { NormalToolEditor } from "$/tools/normalmap/managers/editor";
import type { MiniToolText } from "$/tools/normalmap/managers/text";

/** The normal-map tool as a Xiaohongshu mini tool: the lighter engine, a phone layout. */
export function createMiniToolNormalMapApplication(text: MiniToolText) {
  const editor = new NormalToolEditor();
  editor.setOutputHandler(outputScene);
  return {
    view: (
      <TextContext.Provider value={text}>
        <NormalTextContext.Provider value={text}>
          <MiniToolScreen editor={editor} />
        </NormalTextContext.Provider>
      </TextContext.Provider>
    ),
    dispose: () => editor.dispose(),
  };
}
