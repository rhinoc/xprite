import { useSyncExternalStore } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { tUi, useUiLanguage } from "$/i18n";
import {
  VideoImportStage,
  VideoImportSampling,
  type VideoImportManager,
} from "$/managers/files/video-import-manager";
import {
  Button,
  ControlFlow,
  PixelImage,
  PixelImageFit,
  ProgressBar,
  Slider,
  SliderMode,
  SliderRendering,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/dialogs/video-import/video-import.module.css";

const DIALOG_WIDTH = 480;
const DIALOG_HEIGHT = 640;
const LOADING_DIALOG_WIDTH = 360;
const FRAME_RATE_PRESETS = [1, 6, 8, 10, 12, 15, 24, 25, 30, 60];
const DIMENSION_PRESETS = [16, 32, 64, 128, 256, 512, 1024, 2048];
const COLOR_PRESETS = [8, 16, 32, 64, 128, 256];
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

function timecode(seconds: number): string {
  const milliseconds = Math.round(seconds * MILLISECONDS_PER_SECOND);
  const minutes = Math.floor(milliseconds / (SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND));
  const rest = milliseconds % (SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(rest / MILLISECONDS_PER_SECOND)).padStart(2, "0")}.${String(rest % MILLISECONDS_PER_SECOND).padStart(3, "0")}`;
}

export function VideoImportDialog({
  manager,
  onCancel,
}: {
  manager: VideoImportManager;
  onCancel(): void;
}) {
  useUiLanguage();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const { settings, metadata } = state;
  const ready = state.stage === VideoImportStage.Ready;
  const importing = state.stage === VideoImportStage.Importing;
  const loading = state.stage === VideoImportStage.Loading;
  const updating = state.previewing && (!state.playing || !state.previewUrl);
  const showProgress = loading || updating || importing;
  const progress = state.progress.total
    ? Math.round((state.progress.completed / state.progress.total) * PERCENT)
    : 0;
  const progressLabel = loading
    ? tUi("video.import.loading")
    : importing
      ? tUi("video.import.title")
      : tUi("ui.preparing.preview");
  const fields: FormField[] = settings
    ? [
        {
          key: "fps",
          type: "select",
          label: tUi("ui.frame.rate"),
          editable: true,
          suffix: "fps",
          disabled: !ready,
          value: String(settings.frameRate),
          options: FRAME_RATE_PRESETS.map((value) => ({
            value: String(value),
            label: String(value),
          })),
          onChange: (value) => manager.update({ frameRate: Number(value) }),
        },
        {
          key: "recover",
          type: "checkbox",
          label: tUi("video.import.recover"),
          text: "",
          value: settings.recoverGrid,
          disabled: !ready || !metadata?.recovery.reliable,
          onChange: (recoverGrid) => manager.update({ recoverGrid }),
        },
        ...(["width", "height"] as const).map((axis): FormField => ({
          key: axis,
          type: "select",
          label: tUi(axis === "width" ? "ui.width" : "ui.height"),
          editable: true,
          suffix: "px",
          disabled: !ready,
          value: String(settings[axis]),
          options: DIMENSION_PRESETS.map((value) => ({
            value: String(value),
            label: String(value),
          })),
          onChange: (value) => manager.update({ [axis]: Number(value) }),
        })),
        {
          key: "ratio",
          type: "checkbox",
          label: tUi("ui.lock.ratio"),
          text: "",
          disabled: !ready,
          value: settings.keepAspectRatio,
          onChange: (keepAspectRatio) => manager.update({ keepAspectRatio }),
        },
        {
          key: "sampling",
          type: "select",
          label: tUi("video.import.sampling"),
          disabled: !ready,
          value: settings.sampling,
          options: [
            { value: VideoImportSampling.Smooth, label: tUi("video.import.smooth") },
            { value: VideoImportSampling.Nearest, label: tUi("video.import.nearest") },
          ],
          onChange: (value) => manager.update({ sampling: value as VideoImportSampling }),
        },
        {
          key: "limit-colors",
          type: "checkbox",
          label: tUi("ui.limit.colors"),
          text: "",
          value: settings.reduceColors,
          disabled: !ready,
          onChange: (reduceColors) => manager.update({ reduceColors }),
        },
        {
          key: "colors",
          type: "select",
          label: tUi("ui.colors"),
          editable: true,
          value: String(settings.maxColors),
          disabled: !ready || !settings.reduceColors,
          options: COLOR_PRESETS.map((value) => ({ value: String(value), label: String(value) })),
          onChange: (value) => manager.update({ maxColors: Number(value) }),
        },
      ]
    : [];
  const error = state.validationError ?? state.error ?? state.previewError;
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={`${tUi("video.import.title")} — ${state.name}`}
      width={metadata ? DIALOG_WIDTH : LOADING_DIALOG_WIDTH}
      height={DIALOG_HEIGHT}
      scrollFields={!!metadata}
      fields={fields}
      beforeFields={
        <>
          {(loading || (metadata && settings)) && (
            <div className={styles.preview} data-loading={loading} aria-busy={showProgress}>
              {state.previewUrl && settings && (
                <div className={styles.image} data-updating={updating}>
                  <PixelImage
                    src={state.previewUrl}
                    alt={tUi("video.import.preview")}
                    width={settings.width}
                    height={settings.height}
                    fit={PixelImageFit.Contain}
                    checker={false}
                  />
                </div>
              )}
              {showProgress && (
                <>
                  <ProgressBar
                    className={styles.progress}
                    label={progressLabel}
                    value={
                      importing && state.progress.completed > 0
                        ? state.progress.completed / state.progress.total
                        : undefined
                    }
                  />
                  <div
                    className={state.previewUrl ? styles.status : styles.waiting}
                    role={importing ? undefined : "status"}
                  >
                    <Text variant={TextVariant.Inline} scale={2} ink="var(--ui-color-white)">
                      {importing && state.progress.completed > 0 ? `${progress}%` : progressLabel}
                    </Text>
                  </div>
                </>
              )}
            </div>
          )}
          {metadata && settings && (
            <ControlFlow className={styles.transport}>
              <Button
                icon={state.playing ? "ani_stop" : "ani_play"}
                pixelSize={{ width: 17, height: 26 }}
                aria-label={tUi(state.playing ? "ui.stop.preview" : "ui.play.preview")}
                title={tUi(state.playing ? "ui.stop.preview" : "ui.play.preview")}
                disabled={!ready || !!state.validationError}
                onClick={manager.togglePlayback}
              />
              <Slider
                rendering={SliderRendering.Filmstrip}
                mode={SliderMode.Range}
                className={styles.timeline}
                frames={state.thumbnails}
                frameAspectRatio={metadata.width / metadata.height}
                duration={metadata.durationSeconds}
                value={[settings.startSeconds, settings.endSeconds]}
                position={state.previewTime}
                step={1 / metadata.frameRate}
                disabled={!ready}
                labels={{
                  range: tUi("video.import.preview"),
                  start: tUi("video.import.start"),
                  end: tUi("video.import.end"),
                  position: tUi("video.import.preview.position"),
                }}
                formatValue={timecode}
                onValueChange={([startSeconds, endSeconds]) =>
                  manager.update({ startSeconds, endSeconds })
                }
                onPositionChange={(time) => manager.seek(time)}
              />
            </ControlFlow>
          )}
        </>
      }
      afterFields={
        error ? (
          <div role="alert">
            <Text variant={TextVariant.Inline} scale={2} wrap>
              {error}
            </Text>
          </div>
        ) : undefined
      }
      actions={[
        ...(metadata
          ? [
              {
                label: state.frameCount
                  ? tUi("video.import.confirm", { frames: state.frameCount })
                  : tUi("ui.import"),
                disabled:
                  !ready ||
                  !!state.validationError ||
                  !!state.previewError ||
                  (state.previewing && !state.playing),
                onClick: () => void manager.import(),
              },
            ]
          : []),
        { label: tUi("ui.cancel"), onClick: onCancel },
      ]}
    />
  );
}
