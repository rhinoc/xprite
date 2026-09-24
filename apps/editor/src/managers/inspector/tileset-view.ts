import { useDialogEditorSource } from "$/managers/dialogs/internal-editor-source";

export function useTilesetInspectorView() {
  const { snapshot } = useDialogEditorSource();
  const timeline = snapshot?.document?.timeline;
  const layer = timeline?.layers[timeline.activeLayer];
  return {
    hasTileset:
      layer?.kind === "tilemap" &&
      !!timeline?.tilesets?.some((tileset) => tileset.id === layer.tilesetId),
  };
}
