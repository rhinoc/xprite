import { useEditorFields } from "$/managers/editor/editor-state-manager";

/** Target selection is UI workflow state; working colors remain canonical in core settings. */
export function useWorkingColorControls() {
  const editor = useEditorFields(["workingColorTarget", "setWorkingColorTarget"]);
  return {
    target: editor.workingColorTarget,
    setTarget: editor.setWorkingColorTarget,
  };
}
