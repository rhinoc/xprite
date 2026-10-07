import { useLayoutEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { RecordingBar } from "$/components/replay/recording-bar";
import { ReplayCanvas } from "$/components/replay/replay-canvas";
import { replayTimeLabel } from "$/components/replay/replay-time";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import { useReplay, useReplayMotion } from "$/managers/replay/replay-context";
import {
  Button,
  ButtonVariant,
  Checkbox,
  Combobox,
  ControlFlow,
  Slider,
  SliderVariant,
  Text,
  TextVariant,
} from "@xprite/ui";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import { layoutSize, observeResize } from "@xprite/ui/utils";

import styles from "$/components/replay/replay.module.css";

const PREVIEW_WIDTH = 1040;
const PREVIEW_MARGIN = 24;
const PREVIEW_CHROME_HEIGHT = 160;
const MIN_STAGE_HEIGHT = 180;
const MAX_STAGE_HEIGHT = 520;
const EMPTY_STAGE_HEIGHT = 180;
const MIN_PREVIEW_SIZE = { width: 560, height: 320 };
const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
const MIN_PROGRESS_RANGE_MS = 10;
const PROGRESS_PIXEL_HEIGHT = 12;

function ReplayKeys() {
  const { motion } = useReplayMotion();
  if (!motion.keys) return null;
  return (
    <div className={styles.keys} role="status" aria-live="off">
      <Text variant={TextVariant.Inline} ink="var(--ui-overlay-text)" scale={2}>
        {motion.keys.split("+").join(" + ")}
      </Text>
    </div>
  );
}

function ReplayProgress() {
  const { manager, snapshot } = useReplay();
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, layoutSize(node).width));
    measure();
    return observeResize([node], measure);
  }, []);
  return (
    <div ref={host} className={styles.progress}>
      <Slider
        variant={SliderVariant.Normal}
        pixelSize={{ width: width / RASTER_SCALE, height: PROGRESS_PIXEL_HEIGHT }}
        aria-label={tUi("replay.position")}
        label={`${replayTimeLabel(snapshot.position)} / ${replayTimeLabel(snapshot.duration)}`}
        value={snapshot.position}
        min={0}
        max={Math.max(MIN_PROGRESS_RANGE_MS, Math.ceil(snapshot.duration))}
        disabled={!snapshot.frameCount || snapshot.busy}
        onValueChange={(value) => {
          manager.pause();
          manager.seek(value);
        }}
      />
    </div>
  );
}

function ReplayPreview() {
  useUiLanguage();
  const { manager, snapshot } = useReplay();
  const scene = useSceneBounds();
  const ready = snapshot.frameCount > 0 && !snapshot.busy;
  const width = Math.min(PREVIEW_WIDTH, scene.width - PREVIEW_MARGIN * 2);
  const stageHeight = snapshot.frameCount
    ? Math.max(
        MIN_STAGE_HEIGHT,
        Math.min(MAX_STAGE_HEIGHT, width / manager.getPreviewAspectRatio()),
      )
    : EMPTY_STAGE_HEIGHT;
  return (
    <EditorDialog
      open
      modal
      centerOnOpen
      constrainToViewport
      title={
        snapshot.name
          ? `${tUi("replay.previewTitle")} — ${snapshot.name}`
          : tUi("replay.previewTitle")
      }
      defaultBounds={{
        x: 0,
        y: 0,
        width,
        height: Math.min(stageHeight + PREVIEW_CHROME_HEIGHT, scene.height - PREVIEW_MARGIN * 2),
      }}
      minSize={MIN_PREVIEW_SIZE}
      onRootRef={(node) => node?.setAttribute("data-replay-controls", "true")}
      onOpenChange={manager.setOpen}
    >
      <div data-replay-controls className={styles.body}>
        <ControlFlow className={styles.toolbar}>
          <ControlFlow className={styles.actions}>
            <Button
              variant={ButtonVariant.Standard}
              text={tUi("replay.import")}
              disabled={snapshot.busy}
              onClick={() => void manager.import()}
            />
            <Button
              variant={ButtonVariant.Split}
              text={tUi("replay.exportMenu")}
              disabled={!ready}
              onClick={manager.export}
              menu={{
                label: tUi("replay.exportMenu"),
                items: [
                  { label: tUi("replay.export"), onSelect: manager.export },
                  { label: tUi("replay.gif"), onSelect: () => void manager.exportGif() },
                ],
              }}
            />
            {snapshot.imported && (
              <Button
                variant={ButtonVariant.Standard}
                text={tUi("replay.project")}
                disabled={snapshot.busy}
                onClick={manager.showProjectReplay}
              />
            )}
          </ControlFlow>
          <ControlFlow className={styles.options}>
            <Checkbox
              label={tUi("replay.showMouse")}
              checked={snapshot.showMouse}
              disabled={!ready || !snapshot.hasMouse}
              onCheckedChange={manager.setShowMouse}
            />
            <Checkbox
              label={tUi("replay.showKeys")}
              checked={snapshot.showKeys}
              disabled={!ready || !snapshot.hasKeys}
              onCheckedChange={manager.setShowKeys}
            />
            <Checkbox
              label={tUi("replay.skipIdle")}
              title={tUi("replay.skipIdleDescription")}
              checked={snapshot.skipIdle}
              disabled={!ready}
              onCheckedChange={manager.setSkipIdle}
            />
          </ControlFlow>
        </ControlFlow>
        {snapshot.error && (
          <ControlFlow role="alert" className={styles.error}>
            <Text variant={TextVariant.Inline} ink="var(--ui-overlay-text)" scale={2} wrap>
              {tUiSource(snapshot.error)}
            </Text>
            {snapshot.unsaved && (
              <Button
                variant={ButtonVariant.Standard}
                text={tUi("replay.retrySave")}
                disabled={snapshot.saving}
                onClick={() => void manager.retrySave()}
              />
            )}
          </ControlFlow>
        )}
        <div className={styles.stage} data-replay-preview>
          {snapshot.frameCount ? (
            <ReplayCanvas />
          ) : (
            <Text variant={TextVariant.Inline} ink="var(--ui-overlay-text)" scale={2}>
              {tUi(snapshot.busy ? "replay.preparing" : "replay.empty")}
            </Text>
          )}
          <ReplayKeys />
        </div>
        <ControlFlow className={styles.transport}>
          <Button
            variant={ButtonVariant.Icon}
            icon="ani_first"
            aria-label={tUi("replay.rewind")}
            title={tUi("replay.rewind")}
            disabled={!ready}
            onClick={() => {
              manager.pause();
              manager.seek(0);
            }}
          />
          <Button
            variant={ButtonVariant.Icon}
            icon={snapshot.playing ? "ani_stop" : "ani_play"}
            aria-label={tUi(snapshot.playing ? "replay.pause" : "replay.play")}
            title={tUi(snapshot.playing ? "replay.pause" : "replay.play")}
            disabled={!ready}
            onClick={snapshot.playing ? manager.pause : manager.play}
          />
          <ReplayProgress />
          <Text variant={TextVariant.Control} text={tUi("replay.speed")} />
          <Combobox
            pixelWidth={42}
            aria-label={tUi("replay.speed")}
            value={String(snapshot.speed)}
            disabled={!ready}
            onValueChange={(value) => manager.setSpeed(Number(value))}
            options={PLAYBACK_SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }))}
          />
        </ControlFlow>
      </div>
    </EditorDialog>
  );
}

export function ReplayHost() {
  const { snapshot } = useReplay();
  return (
    <>
      <RecordingBar />
      {snapshot.open && <ReplayPreview />}
    </>
  );
}
