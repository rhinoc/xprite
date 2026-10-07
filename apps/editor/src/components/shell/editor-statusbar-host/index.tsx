import { useEditorActions } from "$/components/shell/editor-actions";
import { StatusBar } from "$/components/shell/status-bar";
import { getEditorHomeAbout } from "$/components/workspace/home-view/about";
import { useEditor } from "$/managers/editor/editor-state-manager";

export function EditorStatusbar({
  filename,
  dimensions,
  directory,
  showHomeAbout = false,
}: {
  filename: string;
  dimensions: string;
  directory: string;
  showHomeAbout?: boolean;
}) {
  const actions = useEditorActions();
  return (
    <StatusBar
      editor={useEditor()}
      filename={filename}
      dimensions={dimensions}
      directory={directory}
      backupActive={actions?.backupActive}
      recoveryProblem={actions?.recoveryProblem}
      retryRecovery={actions?.retryRecovery}
      saveRecoveryCopy={actions?.saveAs}
      about={showHomeAbout ? getEditorHomeAbout() : undefined}
    />
  );
}
