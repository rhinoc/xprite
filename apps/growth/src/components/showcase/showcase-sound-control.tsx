import { useRef, useState } from "react";

import { DEFAULT_MUSIC_VOLUME, ShowcaseMusicVolume } from "$/managers/showcase/music-volume";
import {
  Dialog,
  Icon,
  IconKind,
  MenubarButton,
  OverlayContentLayout,
  Slider,
  SliderOrientation,
  SliderVariant,
  Text,
  TextVariant,
  type SurfaceBounds,
} from "@xprite/ui";
import { clientRect, viewportSize } from "@xprite/ui/utils";

import styles from "$/components/showcase/showcase-sound-control.module.css";

const PANEL_WIDTH = 184;
const PANEL_HEIGHT = 260;
const PANEL_GAP = 4;
const VOLUME_STEP = 1;
const CONTROL_TEXT_SCALE = 2;

/** Menu-bar access to the classic sound panel's vertical, ticked volume control. */
export function ShowcaseSoundControl({
  language,
  muted = false,
  volume = DEFAULT_MUSIC_VOLUME,
  available = false,
  onVolumeChange,
}: {
  language: string;
  muted?: boolean;
  volume?: ShowcaseMusicVolume;
  available?: boolean;
  onVolumeChange?: (volume: ShowcaseMusicVolume) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [bounds, setBounds] = useState<SurfaceBounds>();
  const chinese = language.startsWith("zh");
  const title = chinese ? "声音" : "Sound";
  const label = chinese ? "背景音乐音量" : "Background music";
  const value = muted ? ShowcaseMusicVolume.Muted : volume;
  const close = () => {
    setBounds(undefined);
    trigger.current?.focus({ preventScroll: true });
  };
  const toggle = () => {
    if (bounds) {
      close();
      return;
    }
    if (!trigger.current) return;
    const rect = clientRect(trigger.current);
    const viewport = viewportSize();
    setBounds({
      x: Math.max(0, Math.min(rect.left, viewport.width - PANEL_WIDTH)),
      y: Math.max(0, Math.min(rect.bottom + PANEL_GAP, viewport.height - PANEL_HEIGHT)),
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    });
  };
  return (
    <>
      <MenubarButton
        icon
        buttonRef={trigger}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={!!bounds}
        disabled={!available || !onVolumeChange}
        onClick={toggle}
      >
        <Icon kind={muted ? IconKind.VolumeMuted : IconKind.Volume} />
      </MenubarButton>
      {bounds && (
        <Dialog
          portal
          open
          title={title}
          closeLabel={chinese ? "关闭声音面板" : "Close Sound"}
          bounds={bounds}
          onBoundsChange={setBounds}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          moveable
          resizable={false}
          minSize={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
          contentLayout={OverlayContentLayout.Flow}
        >
          <div
            className={styles.panel}
            data-showcase-sound-panel
            onKeyDown={(event) => {
              if (event.key !== "Escape") event.stopPropagation();
            }}
          >
            <Text variant={TextVariant.Inline} scale={CONTROL_TEXT_SCALE}>
              {label}
            </Text>
            <Icon kind={IconKind.Volume} />
            <Slider
              variant={SliderVariant.Native}
              orientation={SliderOrientation.Vertical}
              showTicks
              min={ShowcaseMusicVolume.Muted}
              max={ShowcaseMusicVolume.Level7}
              step={VOLUME_STEP}
              value={value}
              aria-label={label}
              aria-valuetext={muted ? (chinese ? "静音" : "Muted") : String(volume)}
              disabled={!available}
              onValueChange={(next) => onVolumeChange?.(next as ShowcaseMusicVolume)}
            />
            <Icon kind={IconKind.VolumeMuted} />
            <Text variant={TextVariant.Inline} scale={CONTROL_TEXT_SCALE}>
              {muted ? (chinese ? "静音" : "Muted") : String(volume)}
            </Text>
          </div>
        </Dialog>
      )}
    </>
  );
}
