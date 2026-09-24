import { useEditorFields, type EditorTool } from "$/managers/editor/editor-state-manager";

export interface ToolRailModel {
  tool: EditorTool;
  previousTool: EditorTool | null;
  switchToPreviousTool(): void;
  setTool(value: EditorTool): void;
  previewVisible: boolean;
  setPreviewVisible(value: boolean | ((current: boolean) => boolean)): void;
  timelineVisible: boolean;
  setTimelineVisible(value: boolean | ((current: boolean) => boolean)): void;
}

/** State and commands needed by the desktop tool rail. */
export function useToolRailModel(): ToolRailModel {
  const editor = useEditorFields([
    "tool",
    "previousTool",
    "setTool",
    "previewVisible",
    "setPreviewVisible",
    "timelineVisible",
    "setTimelineVisible",
  ]);
  return {
    tool: editor.tool,
    previousTool: editor.previousTool,
    switchToPreviousTool: () => {
      if (editor.previousTool) editor.setTool(editor.previousTool);
    },
    setTool: editor.setTool,
    previewVisible: editor.previewVisible,
    setPreviewVisible: editor.setPreviewVisible,
    timelineVisible: editor.timelineVisible,
    setTimelineVisible: editor.setTimelineVisible,
  };
}
