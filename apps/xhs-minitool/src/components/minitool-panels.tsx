import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button, ChipGroup, cx, Slider, Toggle, useText } from "$/components/minitool-controls";
import { Icon } from "$/components/minitool-icons";
import { SceneCanvas } from "$/components/minitool-preview";
import {
  frameThumbnail,
  samplePixels,
  EXPORT_FRAMES,
  ExportContent,
  type ExportFrame,
  type ExportRatio,
} from "$/managers/composition";
import type { MiniToolEditor, MiniToolSnapshot } from "$/managers/minitool-editor";
import {
  gridForLongSide,
  longSide,
  outputGrid,
  PIXEL_PRESETS,
  presetBadge,
  SIZE_MAX,
  SIZE_MIN,
  type GridSize,
} from "$/managers/pixel-presets";
import type { MiniToolScene } from "$/managers/ports";
import { rotateSplit, splitHandle, SplitLine, type Rect } from "$/managers/split-geometry";
import type { MiniToolTextKey } from "$/managers/text";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  getAllColorPickers,
  getListedAlgorithms,
  LineGuideMode,
  OutlinePrepass,
  PIXELATION_METHOD_OPTIONS,
  PixelationMode,
  type CellColorPicker,
  type PixelationMethod,
} from "@xprite/editor-core/import-export";
import type { PixelationSnapshot } from "@xprite/tools-app/pixelation";
import { displayPixelRatio, scrollElementIntoView } from "@xprite/ui/utils";

import styles from "$/components/minitool.module.css";

const THUMB = 62;
const FRAME_THUMB = { width: 62, height: 83 };
const COLORS_MIN = 2;
const COLORS_MAX = 64;
const OUTLINE_STEP = 10;
const ROTATE_STEP = 15;
const key = (value: string) => value as MiniToolTextKey;

/** A result drawn block for block, cropped to a square thumbnail. */
function PixelThumb({ pixels }: { pixels: PixelBuffer }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.width = pixels.width;
    element.height = pixels.height;
    element
      .getContext("2d")
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
  }, [pixels]);
  const aspect = pixels.width / pixels.height;
  const width = aspect >= 1 ? THUMB * aspect : THUMB;
  const height = aspect >= 1 ? THUMB : THUMB / aspect;
  // Portraits keep a little more of the top, where faces usually are.
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{ width, height, left: (THUMB - width) / 2, top: (THUMB - height) * 0.3 }}
    />
  );
}

export function PixelPanel({
  editor,
  state,
  pixels,
}: {
  editor: MiniToolEditor;
  state: MiniToolSnapshot;
  pixels: PixelationSnapshot;
}) {
  const t = useText();
  const [draft, setDraft] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const advanced = useRef<HTMLButtonElement>(null);
  const source = pixels.source;
  const current: GridSize = source
    ? outputGrid(pixels.settings, pixels.grid)
    : { width: 0, height: 0 };
  const recovered = pixels.settings.mode === PixelationMode.RecoverGrid;
  const shownGrid =
    draft === null ? current : gridForLongSide(recovered || !source ? current : source, draft);
  const automatic = state.automatic;
  const isAutomatic = !!automatic && longSide(automatic) === longSide(shownGrid);
  const settings = pixels.settings;
  const pickerDisabled = !pixels.grid?.reliable && settings.prepass === OutlinePrepass.None;
  const convertOnly = recovered || settings.prepass !== OutlinePrepass.None;
  return (
    <>
      <div className={cx(styles.row, styles.compact)}>
        <span className={styles.label}>{t("pixel.size")}</span>
        {source && (
          <span className={styles.tag}>{t(isAutomatic ? "pixel.auto" : "pixel.custom")}</span>
        )}
        <span className={styles.spacer} />
        <span className={styles.value} data-grid-readout="">
          {source ? `${shownGrid.width} × ${shownGrid.height}` : "– × –"}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.end}>{t("pixel.coarse")}</span>
        <Slider
          label={t("pixel.size")}
          valueText={`${shownGrid.width} × ${shownGrid.height}`}
          min={SIZE_MIN}
          max={SIZE_MAX}
          value={Math.max(SIZE_MIN, Math.min(SIZE_MAX, draft ?? longSide(current)))}
          disabled={!source}
          onChange={setDraft}
          onCommit={(value) => {
            setDraft(null);
            editor.setLongSide(value);
          }}
        />
        <span className={styles.end}>{t("pixel.fine")}</span>
      </div>
      <div className={styles.thumbs} role="radiogroup" aria-label={t("pixel.presets")}>
        {PIXEL_PRESETS.map((preset) => {
          const selected = state.preset === preset;
          const thumbnail = state.thumbnails[preset];
          const badge = automatic ? presetBadge(preset, automatic) : null;
          return (
            <Button
              key={preset}
              className={styles.thumbButton}
              role="radio"
              aria-checked={selected}
              data-preset={preset}
              disabled={!source}
              onClick={() => editor.applyPreset(preset)}
            >
              {selected && (
                <span className={styles.badge}>
                  <Icon name="check" />
                </span>
              )}
              <span className={styles.thumbImage}>
                {thumbnail && <PixelThumb pixels={thumbnail} />}
                {badge && (
                  <span className={styles.meta}>
                    {"colors" in badge
                      ? t("preset.colors", { count: badge.colors })
                      : badge.columns}
                  </span>
                )}
              </span>
              <span className={styles.thumbName}>{t(key(`preset.${preset}`))}</span>
            </Button>
          );
        })}
      </div>
      <Button
        ref={advanced}
        className={styles.advanced}
        aria-expanded={open}
        disabled={!source}
        onClick={() => {
          setOpen(!open);
          if (!open)
            requestAnimationFrame(() => {
              if (advanced.current)
                scrollElementIntoView(advanced.current, { block: "start", behavior: "smooth" });
            });
        }}
      >
        <Icon name="sliders" />
        <span className={styles.label}>{t("advanced.title")}</span>
        <Icon name="down" className={styles.chevron} />
      </Button>
      {open && source && (
        <div>
          <Field label={t("advanced.algorithm")}>
            <ChipGroup
              scroll
              label={t("advanced.algorithm")}
              value={pixels.algorithm}
              options={getListedAlgorithms().map((value) => ({
                value,
                label: t(key(`algorithm.${value}`)),
              }))}
              onChange={editor.changeAlgorithm}
            />
          </Field>
          <Field label={t("advanced.prepass")}>
            <ChipGroup
              scroll
              label={t("advanced.prepass")}
              value={settings.prepass}
              options={Object.values(OutlinePrepass).map((value) => ({
                value,
                label: t(key(`prepass.${value}`)),
              }))}
              onChange={(prepass) => editor.changeSettings({ prepass })}
            />
          </Field>
          {settings.prepass === OutlinePrepass.PixeloeLines && (
            <Field label={t("advanced.line-guide")}>
              <ChipGroup
                label={t("advanced.line-guide")}
                value={settings.lineGuide}
                options={Object.values(LineGuideMode).map((value) => ({
                  value,
                  label: t(key(`line-guide.${value}`)),
                }))}
                onChange={(lineGuide) => editor.changeSettings({ lineGuide })}
              />
            </Field>
          )}
          <Field label={t("advanced.picker")}>
            <ChipGroup
              scroll
              label={t("advanced.picker")}
              value={settings.colorPicker}
              disabled={pickerDisabled}
              options={getAllColorPickers().map((value) => ({
                value,
                label: t(key(`picker.${value}`)),
              }))}
              onChange={(colorPicker: CellColorPicker) => editor.changeSettings({ colorPicker })}
            />
          </Field>
          <div className={styles.row}>
            <span className={styles.label}>{t("advanced.limit")}</span>
            <span className={styles.spacer} />
            <Toggle
              label={t("advanced.limit")}
              checked={settings.reduceColors}
              onChange={(reduceColors) => editor.changeSettings({ reduceColors })}
            />
          </div>
          {settings.reduceColors && settings.palette === null && (
            <ColorCount
              value={settings.maxColors}
              onCommit={(maxColors) => editor.changeSettings({ maxColors })}
            />
          )}
          <Field label={t("advanced.method")}>
            <ChipGroup
              scroll
              label={t("advanced.method")}
              value={settings.method}
              disabled={convertOnly}
              options={PIXELATION_METHOD_OPTIONS.map((option) => ({
                value: option.value,
                label: t(key(`method.${option.value}`)),
              }))}
              onChange={(method: PixelationMethod) => editor.changeSettings({ method })}
            />
          </Field>
          <OutlineStrength
            value={settings.outlineStrength}
            disabled={convertOnly}
            onCommit={(outlineStrength) => editor.changeSettings({ outlineStrength })}
          />
          <div className={styles.row}>
            <span className={styles.label}>{t("advanced.noise")}</span>
            <span className={styles.spacer} />
            <Toggle
              label={t("advanced.noise")}
              checked={settings.removeNoise}
              onChange={(removeNoise) => editor.changeSettings({ removeNoise })}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

function ColorCount({ value, onCommit }: { value: number; onCommit(value: number): void }) {
  const t = useText();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{t("advanced.colors")}</span>
      <Slider
        label={t("advanced.colors")}
        min={COLORS_MIN}
        max={COLORS_MAX}
        value={Math.min(COLORS_MAX, shown)}
        onChange={setDraft}
        onCommit={(next) => {
          setDraft(null);
          onCommit(next);
        }}
      />
      <span className={styles.value}>{shown}</span>
    </div>
  );
}

function OutlineStrength({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit(value: number): void;
}) {
  const t = useText();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className={cx(styles.row, disabled && styles.disabled)}>
      <span className={styles.label}>{t("advanced.outline")}</span>
      <Slider
        label={t("advanced.outline")}
        min={0}
        max={100}
        step={OUTLINE_STEP}
        value={shown}
        disabled={disabled}
        onChange={setDraft}
        onCommit={(next) => {
          setDraft(null);
          onCommit(next);
        }}
      />
      <span className={styles.value}>{shown}</span>
    </div>
  );
}

export function ComparePanel({
  editor,
  state,
  visible,
}: {
  editor: MiniToolEditor;
  state: MiniToolSnapshot;
  visible: Rect | null;
}) {
  const t = useText();
  const { split } = state;
  const rotated = (angle: number) =>
    visible ? rotateSplit(split, angle, splitHandle(split, visible), visible) : { ...split, angle };
  const rotateTo = (angle: number) => {
    const next = rotated(angle);
    editor.changeSplit({ angle: next.angle, position: next.position, swapped: next.swapped });
  };
  return (
    <>
      <div className={styles.row}>
        <span className={styles.label}>{t("compare.angle")}</span>
        <Slider
          label={t("compare.angle")}
          valueText={`${split.angle}°`}
          min={-90}
          max={90}
          centre={0}
          ticks={[-45, 0, 45]}
          value={split.angle}
          onStart={editor.beginGesture}
          onChange={(angle) => {
            const next = rotated(angle);
            editor.previewSplit({
              angle: next.angle,
              position: next.position,
              swapped: next.swapped,
            });
          }}
          onCommit={editor.endGesture}
        />
        <span className={styles.value} data-split-angle-readout="">
          {Math.round(split.angle)}°
        </span>
      </div>
      <div className={styles.row}>
        <ChipGroup
          label={t("compare.angle")}
          value={[0, 45, 90].includes(split.angle) ? String(split.angle) : null}
          options={["0", "45", "90"].map((value) => ({
            value,
            label: <span className={styles.pix}>{value}°</span>,
          }))}
          onChange={(value) => rotateTo(Number(value))}
        />
        <span className={styles.spacer} />
        <Button
          className={styles.iconButton}
          aria-label={t("compare.rotate-left")}
          onClick={() => rotateTo(split.angle + ROTATE_STEP)}
        >
          <Icon name="rotateLeft" />
        </Button>
        <Button
          className={styles.iconButton}
          aria-label={t("compare.rotate-right")}
          onClick={() => rotateTo(split.angle - ROTATE_STEP)}
        >
          <Icon name="rotateRight" />
        </Button>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t("compare.position")}</span>
        <span className={styles.end}>{t("compare.left")}</span>
        <Slider
          label={t("compare.position")}
          valueText={`${Math.round(split.position * 100)}%`}
          min={0}
          max={100}
          centre={50}
          ticks={[50]}
          value={Math.round(split.position * 100)}
          onStart={editor.beginGesture}
          onChange={(value) => editor.previewSplit({ position: value / 100 })}
          onCommit={editor.endGesture}
        />
        <span className={styles.end}>{t("compare.right")}</span>
        <Button
          className={styles.small}
          onClick={() => editor.changeSplit({ swapped: !split.swapped })}
        >
          <Icon name="swap" />
          {t("compare.swap")}
        </Button>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t("compare.line")}</span>
        <ChipGroup
          label={t("compare.line")}
          value={split.line}
          options={[SplitLine.Thin, SplitLine.Thick, SplitLine.Steps, SplitLine.None].map(
            (value) => ({
              value,
              label: t(key(`line.${value}`)),
            }),
          )}
          onChange={(line) => editor.changeSplit({ line })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t("compare.labels")}</span>
        <span className={styles.sub}>{t("compare.labels-hint")}</span>
        <span className={styles.spacer} />
        <Toggle
          label={t("compare.labels")}
          checked={split.labels}
          onChange={(labels) => editor.changeSplit({ labels })}
        />
      </div>
    </>
  );
}

const RATIO_ICONS: Readonly<Record<ExportRatio, { width: number; height: number }>> = {
  "3:4": { width: 10, height: 13 },
  "1:1": { width: 12, height: 12 },
  "9:16": { width: 9, height: 15 },
};

export function RatioIcon({ ratio }: { ratio: ExportRatio }) {
  return <span className={styles.ratioIcon} style={RATIO_ICONS[ratio]} />;
}

/** A frame drawn at one device pixel per frame art pixel, with whole-pixel blocks. */
function FrameThumb({
  scene,
  frame,
  ratio,
}: {
  scene: MiniToolScene;
  frame: ExportFrame;
  ratio: ExportRatio;
}) {
  const pixelRatio = displayPixelRatio();
  const width = Math.round(FRAME_THUMB.width * pixelRatio);
  const height = Math.round(FRAME_THUMB.height * pixelRatio);
  const thumb = useMemo(() => {
    const { composition, factor } = frameThumbnail({ frame, ratio }, scene.pixels, {
      width,
      height,
    });
    return {
      ...scene,
      composition,
      pixels: samplePixels(scene.pixels, factor),
      split: { ...scene.split, labels: false },
      content: ExportContent.Split,
    };
  }, [scene, frame, ratio, width, height]);
  return <SceneCanvas scene={thumb} width={width / pixelRatio} height={height / pixelRatio} />;
}

export function FramePanel({
  editor,
  state,
  scene,
}: {
  editor: MiniToolEditor;
  state: MiniToolSnapshot;
  scene: MiniToolScene | null;
}) {
  const t = useText();
  return (
    <>
      <div className={cx(styles.row, styles.compact)}>
        <span className={styles.label}>{t("layout.frame")}</span>
        <span className={styles.sub}>{t("layout.frame-hint")}</span>
      </div>
      <div
        className={cx(styles.thumbs, styles.scroller)}
        role="radiogroup"
        aria-label={t("layout.frame")}
      >
        {EXPORT_FRAMES.map((frame) => {
          const selected = state.layout.frame === frame;
          return (
            <Button
              key={frame}
              className={cx(styles.thumbButton, styles.tall)}
              role="radio"
              aria-checked={selected}
              data-frame={frame}
              disabled={!scene}
              onClick={() => editor.changeLayout({ frame })}
            >
              {selected && (
                <span className={styles.badge}>
                  <Icon name="check" />
                </span>
              )}
              <span className={styles.thumbImage}>
                {scene && <FrameThumb scene={scene} frame={frame} ratio={state.layout.ratio} />}
              </span>
              <span className={styles.thumbName}>{t(key(`frame.${frame}`))}</span>
            </Button>
          );
        })}
      </div>
    </>
  );
}
