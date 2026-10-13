import { pickText, publicLanguage } from "$content/site/language";
import { useRef, useState } from "react";

import { DEFAULT_MUSIC_VOLUME, ShowcaseMusicVolume } from "$/managers/showcase/music-volume";
import {
  Dialog,
  Button,
  ButtonAppearance,
  Icon,
  IconKind,
  IconSize,
  OverlayContentLayout,
  Slider,
  SliderOrientation,
  SliderRendering,
  Text,
  TextVariant,
  type SurfaceBounds,
} from "@xprite/ui";
import { clientRect, viewportContentSize } from "@xprite/ui/utils";

import styles from "$/components/showcase/showcase-sound-control.module.css";

const PANEL_WIDTH = 184;
const PANEL_HEIGHT = 260;
const PANEL_GAP = 4;
const VOLUME_STEP = 1;
const CONTROL_TEXT_SCALE = 2;

/** Device demo access to the classic sound panel's vertical, ticked volume control. */
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
  const current = publicLanguage(language);
  const title = pickText(current, "Sound", "声音", "サウンド", "사운드", "Звук", "Som", "Sonido");
  const label = pickText(
    current,
    "Background music",
    "背景音乐音量",
    "BGM の音量",
    "배경 음악 음량",
    "Фоновая музыка",
    "Música de fundo",
    "Música de fondo",
  );
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
    const viewport = viewportContentSize();
    setBounds({
      x: Math.max(0, Math.min(rect.left, viewport.width - PANEL_WIDTH)),
      y: Math.max(0, Math.min(rect.bottom + PANEL_GAP, viewport.height - PANEL_HEIGHT)),
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    });
  };
  return (
    <>
      <Button
        appearance={ButtonAppearance.Quiet}
        className={styles.trigger}
        slots={{
          leading: (
            <Icon kind={muted ? IconKind.VolumeMuted : IconKind.Volume} size={IconSize.Small} />
          ),
        }}
        buttonRef={trigger}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={!!bounds}
        disabled={!available || !onVolumeChange}
        onClick={toggle}
      />
      {bounds && (
        <Dialog
          portal
          open
          title={title}
          closeLabel={pickText(
            current,
            "Close Sound",
            "关闭声音面板",
            "サウンドを閉じる",
            "사운드 닫기",
            "Закрыть «Звук»",
            "Fechar Som",
            "Cerrar Sonido",
          )}
          bounds={bounds}
          onBoundsChange={setBounds}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          movable
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
              rendering={SliderRendering.BrowserRange}
              orientation={SliderOrientation.Vertical}
              showTicks
              min={ShowcaseMusicVolume.Muted}
              max={ShowcaseMusicVolume.Level7}
              step={VOLUME_STEP}
              value={value}
              aria-label={label}
              aria-valuetext={
                muted
                  ? pickText(
                      current,
                      "Muted",
                      "静音",
                      "ミュート",
                      "음소거",
                      "Без звука",
                      "Sem som",
                      "Silenciado",
                    )
                  : String(volume)
              }
              disabled={!available}
              onValueChange={(next) => onVolumeChange?.(next as ShowcaseMusicVolume)}
            />
            <Icon kind={IconKind.VolumeMuted} />
            <Text variant={TextVariant.Inline} scale={CONTROL_TEXT_SCALE}>
              {muted
                ? pickText(
                    current,
                    "Muted",
                    "静音",
                    "ミュート",
                    "음소거",
                    "Без звука",
                    "Sem som",
                    "Silenciado",
                  )
                : String(volume)}
            </Text>
          </div>
        </Dialog>
      )}
    </>
  );
}
