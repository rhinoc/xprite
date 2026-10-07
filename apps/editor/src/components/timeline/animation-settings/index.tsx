import { useEffect, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorPopover } from "$/components/dialogs/overlay";
import {
  timelineDockPositions,
  type TimelineDockPosition,
} from "$/managers/preferences/timeline-dock-position";
import {
  defaultTimelinePanelPreferences,
  type TimelinePanelPreferences,
  type TimelinePanelPreferencesPatch,
} from "$/managers/preferences/timeline-panel-preferences";
import {
  defaultOnionSkinSettings,
  asepritePlaybackSpeeds,
  normalizeOnionSkin,
  type OnionSkinSettings,
  type PlaybackSettings,
} from "$/managers/timeline/timeline-presentation";
import { UINT8_MAX } from "$/managers/timeline/timeline-presentation";
import {
  Button,
  Input,
  Text,
  TextVariant,
  Checkbox,
  CheckboxVariant,
  Slider,
  Divider,
  type SurfaceBounds,
  Menu,
  type MenuItem,
} from "@xprite/ui";
import { UiPart } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";
import { clientRect } from "@xprite/ui/utils";

export interface OnionSkinSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: OnionSkinSettings;
  onChange: (value: OnionSkinSettings) => void;
  /** Aseprite gear bounds. Without an explicit anchor the primitive measures the shared timeline gear. */
  anchor?: SurfaceBounds;
  onSetAsDefaults?: () => void;
  firstFrame?: number;
  onFirstFrameChange?: (frame: number) => void;
  timelinePosition?: TimelineDockPosition;
  onTimelinePositionChange?: (position: TimelineDockPosition) => void;
  timelinePanelPreferences?: TimelinePanelPreferences;
  onTimelinePanelPreferencesChange?: (patch: TimelinePanelPreferencesPatch) => void;
}
export const asepriteTimelineSettingsSize = { width: 456, height: 436 };
/** Reset preserves the active toggle and timeline's dragged previous/next handles. */
export function resetOnionSkinOptions(value: OnionSkinSettings): OnionSkinSettings {
  return {
    ...defaultOnionSkinSettings,
    active: value.active,
    previousFrames: value.previousFrames,
    nextFrames: value.nextFrames,
  };
}
function SectionLabel({
  text,
  bounds,
  relativeTo,
}: {
  text: string;
  bounds: SurfaceBounds;
  relativeTo: { x: number; y: number };
}) {
  return <Divider text={text} bounds={bounds} relativeTo={relativeTo} />;
}
/** Aseprite ConfigureTimelinePopup / timeline_conf.xml bound to editor view and
 * per-document timeline panel preferences. */
export function OnionSkinSettingsPanel({
  open,
  onOpenChange,
  value,
  onChange,
  anchor,
  onSetAsDefaults,
  firstFrame = 1,
  onFirstFrameChange,
  timelinePosition = "bottom",
  onTimelinePositionChange,
  timelinePanelPreferences = defaultTimelinePanelPreferences,
  onTimelinePanelPreferencesChange,
}: OnionSkinSettingsPanelProps) {
  const scene = useSceneBounds(),
    [measured, setMeasured] = useState<SurfaceBounds | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);
  useEffect(() => {
    if (!open || anchor) return;
    const gear = document.querySelector<HTMLElement>(
        '[data-ui-label-source="Timeline configuration"]',
      ),
      host = gear?.closest("[data-ui-scene]");
    if (!gear || !host) return;
    const g = clientRect(gear),
      r = clientRect(host);
    if (r.width && r.height)
      setMeasured({
        x: Math.round(((g.x - r.x) * scene.width) / r.width / 2) * 2,
        y: Math.round(((g.y - r.y) * scene.height) / r.height / 2) * 2,
        width: Math.round((g.width * scene.width) / r.width / 2) * 2,
        height: Math.round((g.height * scene.height) / r.height / 2) * 2,
      });
  }, [open, anchor, timelinePosition, scene.width, scene.height]);
  const thumbnailExtra = timelinePanelPreferences.thumbnailsEnabled ? 96 : 0;
  const at = anchor ?? measured ?? { x: 232, y: scene.height - 224, width: 24, height: 24 },
    size = {
      ...asepriteTimelineSettingsSize,
      height: asepriteTimelineSettingsSize.height + thumbnailExtra,
    };
  const y =
    at.y + at.height + size.height <= scene.height
      ? at.y + at.height
      : Math.max(0, at.y - size.height);
  const patch = (p: Partial<OnionSkinSettings>) => onChange(normalizeOnionSkin({ ...value, ...p })),
    selectedPosition = timelineDockPositions.indexOf(timelinePosition);
  return (
    <EditorPopover
      open={open}
      onOpenChange={onOpenChange}
      label="Timeline Settings"
      bounds={{ x: at.x + at.width / 2 - size.width / 2, y, ...size }}
    >
      {({ clientBounds: c }) => {
        const b = (x: number, y: number, width: number, height: number) => ({
          x: c.x + 2 + x,
          y: c.y + 2 + y,
          width,
          height,
        });
        const common = { relativeTo: c },
          clientOrigin = surfaceLayout({ ...c, width: 0, height: 0 });
        return (
          <>
            <SectionLabel text="Position:" bounds={b(0, 0, 82, 22)} {...common} />
            <SectionLabel text="Frame Header:" bounds={b(90, 0, 210, 22)} {...common} />
            {[
              { index: 0, x: 0, y: 0, width: 62, height: 32 },
              { index: 1, x: 0, y: 26, width: 32, height: 32 },
              { index: 2, x: 30, y: 26, width: 32, height: 32 },
              { index: 3, x: 0, y: 52, width: 62, height: 32 },
            ].map(({ index, ...item }) => {
              const itemBounds = b(item.x, 30 + item.y, item.width, item.height);
              const layout = surfaceLayout(itemBounds);
              return (
                <UiPart
                  key={index}
                  part={
                    index === selectedPosition || index === hoveredPosition
                      ? "buttonset_item_hot"
                      : "buttonset_item_normal"
                  }
                  scale={2}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: layout.left - clientOrigin.left,
                    top: layout.top - clientOrigin.top,
                    width: layout.width,
                    height: layout.height,
                    pointerEvents: "none",
                  }}
                />
              );
            })}
            {[
              { x: 0, y: 30, width: 62, height: 26, label: "Dock timeline at top" },
              { x: 0, y: 56, width: 30, height: 26, label: "Dock timeline at left" },
              { x: 30, y: 56, width: 32, height: 26, label: "Dock timeline at right" },
              { x: 0, y: 82, width: 62, height: 32, label: "Dock timeline at bottom" },
            ].map((item, i) => (
              <Button
                key={item.label}
                {...common}
                bounds={b(item.x, item.y, item.width, item.height)}
                aria-label={item.label}
                aria-pressed={i === selectedPosition}
                part="buttonset_item_normal"
                selected={i === selectedPosition}
                paintArtwork={false}
                disabled={!onTimelinePositionChange}
                onPointerEnter={() => setHoveredPosition(i)}
                onPointerLeave={() => setHoveredPosition((value) => (value === i ? null : value))}
                onClick={() => onTimelinePositionChange?.(timelineDockPositions[i])}
              />
            ))}
            <Text
              variant={TextVariant.Control}
              {...common}
              bounds={b(92, 30, 102, 30)}
              text="First Frame:"
            />
            <Input
              {...common}
              bounds={b(204, 30, 96, 30)}
              value={String(firstFrame)}
              aria-label="First Frame"
              disabled={!onFirstFrameChange}
              onValueChange={(text) => {
                const parsed = Number(text);
                if (text.trim() && Number.isSafeInteger(parsed)) onFirstFrameChange?.(parsed);
              }}
              onCommit={(text) => {
                const parsed = Number(text);
                if (Number.isSafeInteger(parsed)) onFirstFrameChange?.(parsed);
              }}
            />
            <Checkbox
              {...common}
              bounds={b(90, 68, 130, 24)}
              label="Thumbnails"
              checked={timelinePanelPreferences.thumbnailsEnabled}
              disabled={!onTimelinePanelPreferencesChange}
              onCheckedChange={(thumbnailsEnabled) =>
                onTimelinePanelPreferencesChange?.({ thumbnailsEnabled })
              }
            />
            {timelinePanelPreferences.thumbnailsEnabled && (
              <>
                <Text
                  variant={TextVariant.Control}
                  {...common}
                  bounds={b(92, 96, 102, 30)}
                  text="Thumbnail Size:"
                />
                <Slider
                  {...common}
                  bounds={b(204, 96, 236, 30)}
                  min={1}
                  max={10}
                  value={timelinePanelPreferences.thumbnailZoom}
                  aria-label="Thumbnail size"
                  disabled={!onTimelinePanelPreferencesChange}
                  onValueChange={(thumbnailZoom) =>
                    onTimelinePanelPreferencesChange?.({ thumbnailZoom })
                  }
                />
                <Checkbox
                  {...common}
                  bounds={b(90, 130, 148, 24)}
                  label="Overlay Size:"
                  checked={timelinePanelPreferences.thumbnailOverlayEnabled}
                  disabled={!onTimelinePanelPreferencesChange}
                  onCheckedChange={(thumbnailOverlayEnabled) =>
                    onTimelinePanelPreferencesChange?.({ thumbnailOverlayEnabled })
                  }
                />
                <Slider
                  {...common}
                  bounds={b(244, 130, 196, 24)}
                  min={2}
                  max={10}
                  value={timelinePanelPreferences.thumbnailOverlaySize}
                  aria-label="Thumbnail overlay size"
                  disabled={!onTimelinePanelPreferencesChange}
                  onValueChange={(thumbnailOverlaySize) =>
                    onTimelinePanelPreferencesChange?.({ thumbnailOverlaySize })
                  }
                />
                <Checkbox
                  {...common}
                  bounds={b(90, 160, 220, 24)}
                  label="Scale up to fit"
                  checked={timelinePanelPreferences.thumbnailScaleUpToFit}
                  disabled={!onTimelinePanelPreferencesChange}
                  onCheckedChange={(thumbnailScaleUpToFit) =>
                    onTimelinePanelPreferencesChange?.({ thumbnailScaleUpToFit })
                  }
                />
              </>
            )}
            <SectionLabel
              text="Onion Skin:"
              bounds={b(0, 122 + thumbnailExtra, 440, 22)}
              {...common}
            />
            <Checkbox
              variant={CheckboxVariant.Radio}
              {...common}
              bounds={b(0, 152 + thumbnailExtra, 156, 34)}
              label="Merge Frames"
              checked={value.type === "merge"}
              onCheckedChange={() => patch({ type: "merge" })}
            />
            <Checkbox
              variant={CheckboxVariant.Radio}
              {...common}
              bounds={b(164, 152 + thumbnailExtra, 148, 34)}
              label="Red/Blue Tint"
              checked={value.type === "red-blue"}
              onCheckedChange={() => patch({ type: "red-blue" })}
            />
            <Button
              {...common}
              bounds={b(320, 152 + thumbnailExtra, 120, 34)}
              text="Reset"
              font="default"
              part="button_normal"
              hotPart="button_hot"
              focusedPart="button_focused"
              pushedPart="button_selected"
              onClick={() => onChange(resetOnionSkinOptions(value))}
            />
            <Text
              variant={TextVariant.Control}
              {...common}
              bounds={b(2, 194 + thumbnailExtra, 110, 32)}
              text="Opacity:"
            />
            <Slider
              {...common}
              bounds={b(122, 194 + thumbnailExtra, 318, 32)}
              alphaPercentage
              min={0}
              max={UINT8_MAX}
              value={value.opacityBase}
              label={`${Math.round((value.opacityBase * 100) / UINT8_MAX)}%`}
              aria-label="Onion skin opacity"
              onValueChange={(opacityBase) => patch({ opacityBase })}
            />
            <Text
              variant={TextVariant.Control}
              {...common}
              bounds={b(2, 234 + thumbnailExtra, 110, 32)}
              text="Opacity Step:"
            />
            <Slider
              {...common}
              bounds={b(122, 234 + thumbnailExtra, 318, 32)}
              alphaPercentage
              min={0}
              max={UINT8_MAX}
              value={value.opacityStep}
              label={`${Math.round((value.opacityStep * 100) / UINT8_MAX)}%`}
              aria-label="Onion skin opacity step"
              onValueChange={(opacityStep) => patch({ opacityStep })}
            />
            <Checkbox
              {...common}
              bounds={b(0, 274 + thumbnailExtra, 440, 24)}
              label="Loop through tag frames"
              checked={value.loopTag}
              onCheckedChange={(loopTag) => patch({ loopTag })}
            />
            <Checkbox
              {...common}
              bounds={b(0, 306 + thumbnailExtra, 440, 24)}
              label="Current layer only"
              checked={value.currentLayer}
              onCheckedChange={(currentLayer) => patch({ currentLayer })}
            />
            <Checkbox
              variant={CheckboxVariant.Radio}
              {...common}
              bounds={b(0, 338 + thumbnailExtra, 144, 24)}
              label="Behind sprite"
              checked={value.position === "behind"}
              onCheckedChange={() => patch({ position: "behind" })}
            />
            <Checkbox
              variant={CheckboxVariant.Radio}
              {...common}
              bounds={b(152, 338 + thumbnailExtra, 176, 24)}
              label="In front of sprite"
              checked={value.position === "in-front"}
              onCheckedChange={() => patch({ position: "in-front" })}
            />
            <Divider {...common} bounds={b(0, 370 + thumbnailExtra, 440, 8)} />
            <Button
              {...common}
              bounds={b(300, 386 + thumbnailExtra, 140, 34)}
              text="Set as Defaults"
              disabledTextShadow
              font="default"
              part="button_normal"
              hotPart="button_hot"
              focusedPart="button_focused"
              pushedPart="button_selected"
              disabled={!onSetAsDefaults}
              onClick={onSetAsDefaults}
            />
          </>
        );
      }}
    </EditorPopover>
  );
}
export function animationPlaybackMenuItems(
  value: PlaybackSettings,
  onChange: (value: PlaybackSettings) => void,
): MenuItem[] {
  return [
    ...asepritePlaybackSpeeds.map((speed) => ({
      label: `${speed}x`,
      checked: value.speed === speed,
      onSelect: () => onChange({ ...value, speed }),
    })),
    ...(["playOnce", "playAll", "playSubtags", "rewindOnStop"] as const).map((key, index) => ({
      label: ["Play Once", "Play All Frames", "Play Subtags", "Rewind on Stop"][index],
      separator: index === 0,
      checked: value[key],
      onSelect: () => onChange({ ...value, [key]: !value[key] }),
    })),
  ];
}
export function PlaybackSettingsPanel({
  open,
  onOpenChange,
  value,
  onChange,
  anchor,
  relativeTo,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  value: PlaybackSettings;
  onChange: (value: PlaybackSettings) => void;
  anchor: SurfaceBounds;
  relativeTo?: { x: number; y: number };
}) {
  return (
    <Menu
      expanded={open}
      onExpandedChange={onOpenChange}
      label="Animation Playback"
      items={animationPlaybackMenuItems(value, onChange)}
      renderTrigger={(props) => (
        <Button
          {...props}
          bounds={anchor}
          relativeTo={relativeTo}
          text={`${value.speed}x`}
          aria-label="Animation Playback"
        />
      )}
    />
  );
}
