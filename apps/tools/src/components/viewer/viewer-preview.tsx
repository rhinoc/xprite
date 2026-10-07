import { ToolCanvasPreview } from "$/components/shared/canvas-preview";
import { ToolZoomControl } from "$/components/shared/tool-zoom-control";
import {
  ALL_FRAMES_TAG,
  type ViewerManager,
  type ViewerSnapshot,
} from "$/managers/viewer/viewer-manager";
import { ReadOnlyTimeline } from "@xprite/editor-ui/timeline";
import {
  ContentLayout,
  PanelWindowChrome,
  SurfaceTone,
  StatusBarPlacement,
  Text,
  TextVariant,
  TextTone,
  Button,
  Combobox,
  ControlFlow,
  ControlFlowVariant,
  StatusBar,
  Panel,
  PanelVariant,
  PanelWindowKind,
} from "@xprite/ui";

import styles from "$/components/viewer/viewer.module.css";

const FRAME_OFFSET = 1;
const PLAYBACK_BUTTON_SIZE = { width: 17, height: 13 };
const RANGE_WIDTH = 100;
export function ViewerPreview({
  manager,
  snapshot,
}: {
  manager: ViewerManager;
  snapshot: ViewerSnapshot;
}) {
  const navigation = manager.viewport;
  const pixels = snapshot.pixels!;
  const frameLabel = `Frame ${snapshot.frame + FRAME_OFFSET} of ${snapshot.frames}`;
  return (
    <div className={styles.layout}>
      <Panel
        windowChrome={PanelWindowChrome.Emphasized}
        contentLayout={ContentLayout.Fill}
        variant={PanelVariant.Window}
        title={snapshot.name}
        className={styles.previewWindow}
        data-ui-window-priority="primary"
      >
        <ToolCanvasPreview
          navigation={navigation}
          identity={snapshot.identity}
          pixels={pixels}
          label={frameLabel}
          navigationLabel="Sprite preview. Space to play or pause, arrow keys to change frame."
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
              manager.inspectFrame(event.key === "Home" ? 0 : snapshot.frames - FRAME_OFFSET);
            }
          }}
        />
      </Panel>
      <Panel
        windowChrome={PanelWindowChrome.Emphasized}
        tone={SurfaceTone.Accent}
        contentLayout={ContentLayout.Column}
        variant={PanelVariant.Window}
        title="Animation"
        windowKind={PanelWindowKind.Utility}
        collapsible
        className={styles.animationWindow}
      >
        <ControlFlow variant={ControlFlowVariant.Toolbar} className={styles.playbackToolbar}>
          <ControlFlow
            className={styles.playbackActions}
            role="group"
            aria-label="Playback controls"
          >
            <Button
              icon="ani_first"
              pixelSize={PLAYBACK_BUTTON_SIZE}
              pushedPart="buttonset_item_pushed"
              aria-label="First frame"
              title="First frame (Home)"
              disabled={snapshot.frames <= FRAME_OFFSET}
              onClick={() => manager.inspectFrame(0)}
            />
            <Button
              icon="ani_previous"
              pixelSize={PLAYBACK_BUTTON_SIZE}
              pushedPart="buttonset_item_pushed"
              aria-label="Previous frame"
              title="Previous frame (Left)"
              disabled={!snapshot.animated}
              onClick={() => manager.stepFrame(-FRAME_OFFSET)}
            />
            <Button
              icon={snapshot.playing ? "ani_stop" : "ani_play"}
              pixelSize={PLAYBACK_BUTTON_SIZE}
              pushedPart="buttonset_item_pushed"
              aria-label={snapshot.playing ? "Pause animation" : "Play animation"}
              title={snapshot.playing ? "Pause animation (Space)" : "Play animation (Space)"}
              selected={snapshot.playing}
              disabled={!snapshot.animated}
              onClick={() => manager.togglePlayback()}
            />
            <Button
              icon="ani_next"
              pixelSize={PLAYBACK_BUTTON_SIZE}
              pushedPart="buttonset_item_pushed"
              aria-label="Next frame"
              title="Next frame (Right)"
              disabled={!snapshot.animated}
              onClick={() => manager.stepFrame(FRAME_OFFSET)}
            />
            <Button
              icon="ani_last"
              pixelSize={PLAYBACK_BUTTON_SIZE}
              pushedPart="buttonset_item_pushed"
              aria-label="Last frame"
              title="Last frame (End)"
              disabled={snapshot.frames <= FRAME_OFFSET}
              onClick={() => manager.inspectFrame(snapshot.frames - FRAME_OFFSET)}
            />
          </ControlFlow>
          {snapshot.tags.length > 0 && (
            <Combobox
              pixelWidth={RANGE_WIDTH}
              aria-label="Animation range"
              value={snapshot.selectedTag}
              onValueChange={(value) => manager.selectTag(value)}
              options={[
                { value: ALL_FRAMES_TAG, label: "All frames" },
                ...snapshot.tags.map((tag) => ({ value: tag.id, label: tag.name })),
              ]}
            />
          )}
        </ControlFlow>
        <ReadOnlyTimeline
          timeline={manager.getPresentationTimeline()!}
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
        <StatusBar
          placement={StatusBarPlacement.Inline}
          aria-label="Preview status"
          role="group"
          leading={
            <>
              <Text
                variant={TextVariant.Reading}
                tone={TextTone.Muted}
              >{`${pixels.width} × ${pixels.height} px`}</Text>
              <div className={styles.frameInfo} title="Current frame and its duration">
                <Text
                  variant={TextVariant.Reading}
                >{`${snapshot.frame + FRAME_OFFSET} / ${snapshot.frames}`}</Text>
                <Text
                  variant={TextVariant.Reading}
                  tone={TextTone.Muted}
                >{`${snapshot.duration} ms`}</Text>
              </div>
            </>
          }
          trailing={<ToolZoomControl navigation={navigation} />}
        />
      </Panel>
    </div>
  );
}
