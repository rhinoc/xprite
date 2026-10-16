import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { ToolCanvasPane, ToolResultWindow } from "$/components/shared/tool-result-window";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  ALL_FRAMES_TAG,
  type ViewerManager,
  type ViewerSnapshot,
} from "$/managers/viewer/viewer-manager";
import { PlaybackTransport, ReadOnlyTimeline } from "@xprite/editor-ui/timeline";
import { Combobox, ControlFlow } from "@xprite/ui";

import styles from "$/components/viewer/viewer.module.css";

const FRAME_OFFSET = 1;
const RANGE_WIDTH = 100;
export function ViewerPreview({
  manager,
  snapshot,
}: {
  manager: ViewerManager;
  snapshot: ViewerSnapshot;
}) {
  const t = useToolTranslation();

  const navigation = manager.viewport;
  const timeline = manager.getPresentationTimeline();
  const pixels = snapshot.pixels!;
  const frameLabel = `Frame ${snapshot.frame + FRAME_OFFSET} of ${snapshot.frames}`;
  const info = `${pixels.width} × ${pixels.height} px · ${snapshot.frame + FRAME_OFFSET} / ${snapshot.frames} · ${snapshot.duration} ms`;
  const transport = (
    <ControlFlow toolbar className={styles.playbackToolbar}>
      <PlaybackTransport
        className={styles.playbackActions}
        playing={snapshot.playing}
        frames={snapshot.frames}
        animated={snapshot.animated}
        labels={{
          first: t("First frame"),
          previous: t("Previous frame"),
          play: t("Play animation"),
          pause: t("Pause animation"),
          next: t("Next frame"),
          last: t("Last frame"),
          group: t("Playback controls"),
        }}
        titles={{
          first: t("First frame (Home)"),
          previous: t("Previous frame (Left)"),
          play: t("Play animation (Space)"),
          pause: t("Pause animation (Space)"),
          next: t("Next frame (Right)"),
          last: t("Last frame (End)"),
        }}
        onFirst={() => manager.inspectFrame(0)}
        onPrevious={() => manager.stepFrame(-FRAME_OFFSET)}
        onTogglePlayback={() => manager.togglePlayback()}
        onNext={() => manager.stepFrame(FRAME_OFFSET)}
        onLast={() => manager.inspectFrame(snapshot.frames - FRAME_OFFSET)}
      />
      {snapshot.tags.length > 0 && (
        <Combobox
          pixelWidth={RANGE_WIDTH}
          aria-label={t("Animation range")}
          value={snapshot.selectedTag}
          onValueChange={(value) => manager.selectTag(value)}
          options={[
            { value: ALL_FRAMES_TAG, label: t("All frames") },
            ...snapshot.tags.map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
        />
      )}
    </ControlFlow>
  );
  return (
    <ToolResultWindow
      title={snapshot.name}
      tabs={[
        {
          id: "preview",
          label: t("Preview"),
          content: (
            <>
              {!timeline && transport}
              <ToolCanvasPane status={info} controls={<ToolZoomControl navigation={navigation} />}>
                <ToolCanvasPreview
                  navigation={navigation}
                  identity={snapshot.identity}
                  pixels={pixels}
                  label={t(frameLabel)}
                  navigationLabel={t(
                    "Sprite preview. Space to play or pause, arrow keys to change frame.",
                  )}
                  onKeyDown={(event) => {
                    if (event.altKey || event.ctrlKey || event.metaKey) return;
                    if (event.key === " ") {
                      event.preventDefault();
                      if (!event.repeat) manager.togglePlayback();
                    } else if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      manager.stepFrame(-FRAME_OFFSET);
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      manager.stepFrame(FRAME_OFFSET);
                    } else if (event.key === "Home" || event.key === "End") {
                      event.preventDefault();
                      manager.inspectFrame(
                        event.key === "Home" ? 0 : snapshot.frames - FRAME_OFFSET,
                      );
                    }
                  }}
                />
              </ToolCanvasPane>
              {timeline && (
                <div className={styles.timelineDock} data-viewer-timeline="">
                  <ReadOnlyTimeline
                    toolbar={transport}
                    timeline={timeline}
                    identity={snapshot.identity}
                    frame={snapshot.frame}
                    selectedTag={snapshot.tags.findIndex((tag) => tag.id === snapshot.selectedTag)}
                    onTag={(index) => manager.selectTag(snapshot.tags[index].id)}
                    selectedLayer={snapshot.selectedLayer}
                    onLayer={(index) => manager.selectLayer(index)}
                    onVisible={(index) => manager.toggleLayer(snapshot.layers[index].id)}
                    visibilityDisabled={(index) => snapshot.layers[index].reference}
                    onCollapsed={(index) => manager.toggleGroup(index)}
                    onFrame={(frame) => manager.inspectFrame(frame)}
                    onStepFrame={(direction) => manager.stepFrame(direction)}
                    onPlayback={() => manager.togglePlayback()}
                  />
                </div>
              )}
            </>
          ),
        },
      ]}
    />
  );
}
