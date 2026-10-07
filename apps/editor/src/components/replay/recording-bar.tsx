import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { ReplayStopButton } from "$/components/replay/replay-stop-button";
import { replayTimeLabel } from "$/components/replay/replay-time";
import { tUi, useUiLanguage } from "$/i18n";
import { useReplay } from "$/managers/replay/replay-context";
import { ControlFlow, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/replay/replay.module.css";

const BAR_WIDTH = 180;
const BAR_HEIGHT = 80;
const BAR_MARGIN = 24;

export function RecordingBar() {
  useUiLanguage();
  const { manager, snapshot } = useReplay();
  const scene = useSceneBounds();
  return (
    <EditorDialog
      open={snapshot.recording && snapshot.barOpen}
      title={tUi("replay.recording")}
      defaultBounds={{
        x: scene.x + Math.max(BAR_MARGIN, scene.width - BAR_WIDTH - BAR_MARGIN),
        y: scene.y + Math.max(BAR_MARGIN, scene.height - BAR_HEIGHT - BAR_MARGIN),
        width: BAR_WIDTH,
        height: BAR_HEIGHT,
      }}
      modal={false}
      autoFocus={false}
      moveable
      resizable={false}
      constrainToViewport
      onRootRef={(node) => node?.setAttribute("data-replay-controls", "true")}
      onOpenChange={manager.setBarOpen}
    >
      <ControlFlow data-replay-controls className={styles.recordingBar}>
        <Text variant={TextVariant.Inline} ink="var(--ui-overlay-text)" scale={2}>
          {replayTimeLabel(snapshot.recordingElapsed)}
        </Text>
        <ReplayStopButton label={tUi("replay.stop")} onClick={manager.stop} />
      </ControlFlow>
    </EditorDialog>
  );
}
