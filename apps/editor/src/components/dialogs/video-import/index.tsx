import { useState, useSyncExternalStore } from "react";

import { FormDialog, type FormField } from "$/components/dialogs/form-dialog";
import { ImportAdvanced } from "$/components/dialogs/pixelation-dialog/import-advanced";
import { ImportMode } from "$/components/dialogs/pixelation-dialog/import-mode";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import {
  VideoImportStage,
  EMPTY_VIDEO_PIXELATION_SETTINGS,
  PixelationAlgorithm,
  type VideoImportManager,
} from "$/managers/files/video-import-manager";
import { PixelationSlot, pixelationLabelKey, usePixelationBase } from "@xprite/editor-ui";
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
const HIDDEN_SLOTS: ReadonlySet<PixelationSlot> = new Set([
  PixelationSlot.Palette,
  PixelationSlot.PaletteMenu,
  PixelationSlot.ColorMode,
]);
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
  const [advanced, setAdvanced] = useState(false);
  const ready = state.stage === VideoImportStage.Ready && !state.analyzing;
  const importing = state.stage === VideoImportStage.Importing;
  const loading = state.stage === VideoImportStage.Loading;
  const updating = state.previewing && (!state.playing || !state.previewUrl);
  const showProgress = loading || updating;
  const progress = Math.floor(Math.max(0, Math.min(1, state.progress.fraction)) * PERCENT);
  const progressText = `${progress}%`;
  const progressLabel = loading
    ? tUi("video.import.loading")
    : importing
      ? tUi("video.import.title")
      : tUi("ui.preparing.preview");
  const progressValue = state.progress.fraction > 0 ? state.progress.fraction : undefined;
  const base = usePixelationBase({
    settings: settings?.pixelation ?? EMPTY_VIDEO_PIXELATION_SETTINGS,
    algorithm: settings?.algorithm ?? PixelationAlgorithm.Auto,
    grid: state.grid ?? undefined,
    sourceSize: metadata ?? { width: 1, height: 1 },
    busy: !ready,
    hidden: HIDDEN_SLOTS,
    translate: (text, values) => tUiSource(pixelationLabelKey(text), values),
    onChange: manager.updatePixelation,
    onAlgorithm: (algorithm, size) => void manager.setAlgorithm(algorithm, size),
  });
  const sharedField = (slot: PixelationSlot): FormField[] =>
    base[slot].visible
      ? [
          {
            key: slot,
            type: "custom",
            label: base[slot].label ?? "",
            render: (placement) => base[slot].render(placement),
          },
        ]
      : [];
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
          key: "action",
          type: "custom",
          fullWidth: true,
          label: "",
          render: (placement) => (
            <ImportMode
              {...placement}
              value={settings.action}
              disabled={!ready}
              onChange={(action) => {
                manager.update({ action });
                if (action !== "pixelate") setAdvanced(false);
              }}
            />
          ),
        },
        ...(settings.action === "pixelate"
          ? [
              {
                key: "advanced",
                type: "custom" as const,
                fullWidth: true,
                label: "",
                render: () => (
                  <ImportAdvanced open={advanced} onChange={setAdvanced} style={{ height: 22 }} />
                ),
              },
              ...(advanced
                ? [
                    ...sharedField(PixelationSlot.Algorithm),
                    ...sharedField(PixelationSlot.GridSource),
                    ...sharedField(PixelationSlot.ColorPicker),
                    ...sharedField(PixelationSlot.Prepass),
                    ...sharedField(PixelationSlot.LineGuide),
                    ...sharedField(PixelationSlot.Width),
                    ...sharedField(PixelationSlot.Height),
                    {
                      key: "limit-colors",
                      type: "checkbox" as const,
                      label: tUi("ui.limit.colors"),
                      text: "",
                      value: settings.pixelation.reduceColors,
                      disabled: !ready,
                      onChange: (reduceColors: boolean) =>
                        manager.updatePixelation({ reduceColors }),
                    },
                    ...sharedField(PixelationSlot.Colors),
                    ...sharedField(PixelationSlot.Dither),
                    {
                      key: "noise",
                      type: "checkbox" as const,
                      label: tUi("ui.remove.noise"),
                      text: "",
                      value: settings.pixelation.removeNoise,
                      disabled: !ready,
                      onChange: (removeNoise: boolean) => manager.updatePixelation({ removeNoise }),
                    },
                  ]
                : []),
            ]
          : []),
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
            <div
              className={styles.preview}
              data-loading={loading}
              aria-busy={showProgress || importing}
            >
              {state.previewUrl && settings && (
                <div className={styles.image} data-updating={updating}>
                  <PixelImage
                    src={state.previewUrl}
                    alt={tUi("video.import.preview")}
                    width={state.outputSize.width}
                    height={state.outputSize.height}
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
                    value={progressValue}
                  />
                  <div className={state.previewUrl ? styles.status : styles.waiting} role="status">
                    <Text variant={TextVariant.Inline} scale={3} ink="var(--ui-color-white)" wrap>
                      {progressText}
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
      beforeActions={
        importing ? (
          <div className={styles.importProgress}>
            <Text variant={TextVariant.Inline} scale={3} wrap>
              {progressText}
            </Text>
            <ProgressBar label={progressLabel} value={progressValue} />
          </div>
        ) : undefined
      }
      actions={[
        ...(metadata && !importing
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
