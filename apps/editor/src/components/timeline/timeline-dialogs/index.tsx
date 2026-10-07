import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { EditorDialog, type DialogContext } from "$/components/dialogs/overlay";
import { CelProperties } from "$/components/inspector/cel-properties";
import { SpriteProperties } from "$/components/inspector/sprite-properties";
import { IconControl } from "$/components/shared/icon-control";
import { useRegisterTimelineActions } from "$/components/timeline/timeline-actions";
import { TagPropertiesDialog, type TagDialogRequest } from "$/components/timeline/timeline-tags";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { TilemapDialog } from "$/components/tools/tilemap-controls";
import { tUi } from "$/i18n";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";
import { BLEND_MODES, UINT16_MAX } from "$/managers/timeline/timeline-presentation";
import type { SpriteTimeline } from "$/managers/timeline/timeline-presentation";
import { timelineTags, timelineTagIndexAtFrame } from "$/managers/timeline/timeline-presentation";
import { UINT8_MAX } from "$/managers/timeline/timeline-presentation";
import { formatEditorColor, parseEditorColor } from "$/managers/tools/color-control";
import {
  updateUserDataFields,
  useUserDataVisibility,
  UserDataVisibilityScope,
} from "$/managers/user-data/user-data-manager";
import type { AsepriteUserData } from "$/managers/user-data/user-data-manager";
import {
  Button,
  Divider,
  Input,
  Text,
  TextVariant,
  Combobox,
  Slider,
  SliderVariant,
} from "@xprite/ui";

const LAYER_PROPERTIES_DEFAULT_WIDTH = 390;
const LAYER_PROPERTIES_MIN_WIDTH = 300;
const LAYER_PROPERTIES_VIEWPORT_GUTTER = 16;
const LAYER_PROPERTIES_IMAGE_HEIGHT = 156;
const LAYER_PROPERTIES_COMPACT_HEIGHT = 78;
const LAYER_PROPERTIES_USER_DATA_HEIGHT = 78;
const LAYER_PROPERTIES_USER_DATA_COLOR_IMAGE_OFFSET = 118;
const LAYER_PROPERTIES_USER_DATA_TEXT_IMAGE_OFFSET = 154;
const LAYER_PROPERTIES_USER_DATA_COLOR_COMPACT_OFFSET = 38;
const LAYER_PROPERTIES_USER_DATA_TEXT_COMPACT_OFFSET = 74;
const LAYER_PROPERTIES_BUTTON_SIZE = 24;
const LAYER_PROPERTIES_CONTROL_GAP = 8;
const LAYER_PROPERTIES_CONTROL_FIELD_OFFSET = 78;
const LAYER_PROPERTIES_COMPACT_NAME_FIELD_OFFSET = 62;
const FRAME_PROPERTIES_DEFAULT_WIDTH = 322;
const FRAME_PROPERTIES_MIN_WIDTH = 280;
const FRAME_PROPERTIES_VIEWPORT_GUTTER = 16;
const FRAME_PROPERTIES_VALUE_WIDTH = 96;
const FRAME_PROPERTIES_BUTTON_WIDTH = 120;
const FRAME_PROPERTIES_BUTTON_GAP = 8;

export interface TimelineDialogsProps {
  layerName?: string;
  firstFrame?: number;
}

type DialogKind =
  | "layer-properties"
  | "frame-properties"
  | "cel-properties"
  | "sprite-properties"
  | null;

function resolveGotoFrame(
  text: string,
  timeline: SpriteTimeline | undefined,
  current: number,
  firstFrame = 1,
): number {
  if (!timeline) return current;
  const numeric = Number(text);
  if (text === String(numeric) && Number.isSafeInteger(numeric))
    return Math.max(0, Math.min(timeline.frames.length - 1, numeric - firstFrame));
  const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const tag = words.length
    ? timelineTags(timeline).find((candidate) =>
        words.every((word) => candidate.name.toLocaleLowerCase().includes(word)),
      )
    : undefined;
  return tag?.from ?? current;
}

function selectedFrameLabel(indices: readonly number[], firstFrame = 1): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (sorted.length <= 1) return String((sorted[0] ?? 0) + firstFrame);
  if (sorted.every((frame, index) => index === 0 || frame === sorted[index - 1] + 1))
    return `[${sorted[0] + firstFrame}...${sorted[sorted.length - 1] + firstFrame}]`;
  return "Multiple Frames";
}

function LayerPropertiesWindow({
  open,
  onOpenChange,
  name,
  opacity,
  blendMode,
  userData,
  background,
  imageProps,
  tilemap,
  onTilesetClick,
  onBlendModeChange,
  onDraftChange,
  onCommit,
  onUserDataChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  opacity: number;
  blendMode: number;
  userData?: AsepriteUserData;
  background: boolean;
  imageProps: boolean;
  tilemap: boolean;
  onTilesetClick: () => void;
  onBlendModeChange: (mode: number) => void;
  onDraftChange: (name: string, opacity: number) => void;
  onCommit: () => void;
  onUserDataChange: (userData: AsepriteUserData | undefined) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useSceneBounds();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [userDataOpen, setUserDataOpen] = useUserDataVisibility(UserDataVisibilityScope.Layer);
  const [userText, setUserText] = useState(userData?.text ?? "");
  const [userColor, setUserColor] = useState(formatEditorColor(userData?.color ?? [0, 0, 0, 0]));
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  useEffect(() => {
    if (!open) {
      setPosition(null);
      setColorPickerOpen(false);
    }
  }, [open]);
  useEffect(() => {
    setUserText(userData?.text ?? "");
    setUserColor(formatEditorColor(userData?.color ?? [0, 0, 0, 0]));
  }, [userData?.text, userData?.color]);
  useEffect(() => {
    if (!open) return;
    const input = host.current?.querySelector<HTMLInputElement>('input[data-label-source="Name"]');
    input?.focus({ preventScroll: true });
    input?.select();
  }, [open]);
  if (!open) return null;
  const width = Math.min(
    LAYER_PROPERTIES_DEFAULT_WIDTH,
    Math.max(LAYER_PROPERTIES_MIN_WIDTH, scene.width - LAYER_PROPERTIES_VIEWPORT_GUTTER),
  );
  const height =
    (imageProps ? LAYER_PROPERTIES_IMAGE_HEIGHT : LAYER_PROPERTIES_COMPACT_HEIGHT) +
    (userDataOpen ? LAYER_PROPERTIES_USER_DATA_HEIGHT : 0);
  const updateUserData = (text: string, color: string) => {
    onUserDataChange(
      updateUserDataFields(
        userData,
        text,
        parseEditorColor(color) as [number, number, number, number],
      ),
    );
  };
  return (
    <div
      ref={host}
      className="xse-timeline-dialog-host"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onCommit();
          onOpenChange(false);
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCommit();
      }}
    >
      <EditorDialog
        open
        centerOnOpen
        title="Layer Properties"
        bounds={{
          x: position?.x ?? (Math.floor(scene.width / 4) - Math.floor(width / 4)) * 2,
          y: position?.y ?? (Math.floor(scene.height / 4) - Math.floor(height / 4)) * 2,
          width,
          height,
        }}
        onBoundsChange={(bounds) => setPosition({ x: bounds.x, y: bounds.y })}
        onOpenChange={onOpenChange}
        resizable={false}
        autoFocus={false}
        constrainToViewport
      >
        {({ clientBounds: client }: DialogContext) =>
          (() => {
            const userDataX = client.x + client.width - LAYER_PROPERTIES_BUTTON_SIZE;
            const nameFieldOffset = imageProps
              ? LAYER_PROPERTIES_CONTROL_FIELD_OFFSET
              : LAYER_PROPERTIES_COMPACT_NAME_FIELD_OFFSET;
            const nameFieldWidth = Math.max(
              1,
              client.width -
                nameFieldOffset -
                LAYER_PROPERTIES_BUTTON_SIZE -
                LAYER_PROPERTIES_CONTROL_GAP,
            );
            const modeFieldWidth = Math.max(
              1,
              client.width -
                LAYER_PROPERTIES_CONTROL_FIELD_OFFSET -
                LAYER_PROPERTIES_BUTTON_SIZE -
                LAYER_PROPERTIES_CONTROL_GAP,
            );
            const opacityFieldWidth = Math.max(
              1,
              client.width - LAYER_PROPERTIES_CONTROL_FIELD_OFFSET,
            );
            const userDataBounds = {
              x: userDataX,
              y: client.y,
              width: LAYER_PROPERTIES_BUTTON_SIZE,
              height: 30,
            };
            return (
              <>
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: client.x + 2, y: client.y, width: imageProps ? 68 : 52, height: 30 }}
                  relativeTo={client}
                  text="Name:"
                />
                <Input
                  bounds={{
                    x: client.x + nameFieldOffset,
                    y: client.y,
                    width: nameFieldWidth,
                    height: 30,
                  }}
                  relativeTo={client}
                  value={name}
                  aria-label="Name"
                  onValueChange={(value) => onDraftChange(value, opacity)}
                  onCommit={onCommit}
                />
                <IconControl
                  bounds={userDataBounds}
                  relativeTo={client}
                  icon="icon_user_data"
                  label="Layer user data"
                  expanded={userDataOpen}
                  onClick={() => setUserDataOpen(!userDataOpen)}
                />
                {imageProps && (
                  <>
                    <Text
                      variant={TextVariant.Control}
                      bounds={{ x: client.x + 2, y: client.y + 38, width: 68, height: 32 }}
                      relativeTo={client}
                      text="Mode:"
                    />
                    <Combobox
                      bounds={{
                        x: client.x + LAYER_PROPERTIES_CONTROL_FIELD_OFFSET,
                        y: client.y + 38,
                        width: modeFieldWidth,
                        height: 32,
                      }}
                      relativeTo={client}
                      value={String(blendMode)}
                      options={[
                        0, -1, 4, 1, 7, -2, 5, 2, 6, 16, -3, 3, 9, 8, -4, 10, 11, 17, 18, -5, 12,
                        13, 14, 15,
                      ].map((value) => ({
                        value: String(value),
                        label: value < 0 ? "" : BLEND_MODES[value],
                        separator: value < 0,
                      }))}
                      onValueChange={(value) => onBlendModeChange(Number(value))}
                      aria-label="Mode"
                      disabled={background}
                    />
                    {tilemap && (
                      <IconControl
                        bounds={{
                          x: userDataX,
                          y: client.y + 38,
                          width: LAYER_PROPERTIES_BUTTON_SIZE,
                          height: 32,
                        }}
                        relativeTo={client}
                        icon="tiles"
                        label="Tileset Properties"
                        onClick={onTilesetClick}
                      />
                    )}
                    <Text
                      variant={TextVariant.Control}
                      bounds={{ x: client.x + 2, y: client.y + 78, width: 68, height: 32 }}
                      relativeTo={client}
                      text="Opacity:"
                    />
                    <Slider
                      variant={SliderVariant.Normal}
                      bounds={{
                        x: client.x + LAYER_PROPERTIES_CONTROL_FIELD_OFFSET,
                        y: client.y + 78,
                        width: opacityFieldWidth,
                        height: 32,
                      }}
                      relativeTo={client}
                      min={0}
                      max={UINT8_MAX}
                      value={opacity}
                      label={`${Math.round((opacity * 100) / UINT8_MAX)}%`}
                      aria-label="Opacity"
                      disabled={background}
                      onValueChange={(value) => onDraftChange(name, value)}
                    />
                  </>
                )}
                {userDataOpen && (
                  <>
                    <Text
                      variant={TextVariant.Control}
                      bounds={{
                        x: client.x + 2,
                        y:
                          client.y +
                          (imageProps
                            ? LAYER_PROPERTIES_USER_DATA_COLOR_IMAGE_OFFSET
                            : LAYER_PROPERTIES_USER_DATA_COLOR_COMPACT_OFFSET),
                        width: 68,
                        height: 30,
                      }}
                      relativeTo={client}
                      text="Color:"
                    />
                    <EditorColorButton
                      bounds={{
                        x: client.x + LAYER_PROPERTIES_CONTROL_FIELD_OFFSET,
                        y:
                          client.y +
                          (imageProps
                            ? LAYER_PROPERTIES_USER_DATA_COLOR_IMAGE_OFFSET
                            : LAYER_PROPERTIES_USER_DATA_COLOR_COMPACT_OFFSET),
                        width: Math.max(
                          1,
                          client.width - LAYER_PROPERTIES_CONTROL_FIELD_OFFSET - 8,
                        ),
                        height: 30,
                      }}
                      relativeTo={client}
                      value={userColor}
                      aria-label={tUi("ui.layer.user.data.color")}
                      onClick={() => {
                        setColorPickerAnchor({
                          x: client.x + LAYER_PROPERTIES_CONTROL_FIELD_OFFSET,
                          y:
                            client.y +
                            (imageProps
                              ? LAYER_PROPERTIES_USER_DATA_COLOR_IMAGE_OFFSET
                              : LAYER_PROPERTIES_USER_DATA_COLOR_COMPACT_OFFSET),
                          width: Math.max(
                            1,
                            client.width - LAYER_PROPERTIES_CONTROL_FIELD_OFFSET - 8,
                          ),
                          height: 30,
                        });
                        setColorPickerOpen(true);
                      }}
                    />
                    <Text
                      variant={TextVariant.Control}
                      bounds={{
                        x: client.x + 2,
                        y:
                          client.y +
                          (imageProps
                            ? LAYER_PROPERTIES_USER_DATA_TEXT_IMAGE_OFFSET
                            : LAYER_PROPERTIES_USER_DATA_TEXT_COMPACT_OFFSET),
                        width: 68,
                        height: 30,
                      }}
                      relativeTo={client}
                      text="User Data:"
                    />
                    <Input
                      bounds={{
                        x: client.x + LAYER_PROPERTIES_CONTROL_FIELD_OFFSET,
                        y:
                          client.y +
                          (imageProps
                            ? LAYER_PROPERTIES_USER_DATA_TEXT_IMAGE_OFFSET
                            : LAYER_PROPERTIES_USER_DATA_TEXT_COMPACT_OFFSET),
                        width: Math.max(
                          1,
                          client.width - LAYER_PROPERTIES_CONTROL_FIELD_OFFSET - 8,
                        ),
                        height: 30,
                      }}
                      relativeTo={client}
                      value={userText}
                      aria-label={tUi("ui.layer.user.data.text")}
                      onValueChange={(value) => {
                        setUserText(value);
                        updateUserData(value, userColor);
                      }}
                    />
                  </>
                )}
              </>
            );
          })()
        }
      </EditorDialog>
      <ColorPicker
        open={colorPickerOpen}
        onOpenChange={setColorPickerOpen}
        value={userColor}
        anchor={colorPickerAnchor}
        onValueChange={(value) => {
          setUserColor(value);
          updateUserData(userText, value);
        }}
      />
    </div>
  );
}

function FramePropertiesWindow({
  open,
  onOpenChange,
  frame,
  duration,
  allFrames,
  onDurationChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frame: string;
  duration: number;
  allFrames: boolean;
  onDurationChange: (value: number) => void;
}) {
  const scene = useSceneBounds();
  const timelineManager = useTimelineManager();
  const { commands } = timelineManager;
  const host = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const latestDuration = useRef(duration);
  latestDuration.current = duration;
  useEffect(() => {
    if (!open) setPosition(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const input = host.current?.querySelector<HTMLInputElement>(
      'input[data-label-source="Duration (milliseconds)"]',
    );
    input?.focus({ preventScroll: true });
    input?.select();
  }, [open]);
  if (!open) return null;
  const width = Math.min(
    FRAME_PROPERTIES_DEFAULT_WIDTH,
    Math.max(FRAME_PROPERTIES_MIN_WIDTH, scene.width - FRAME_PROPERTIES_VIEWPORT_GUTTER),
  );
  const buttonGroupWidth = FRAME_PROPERTIES_BUTTON_WIDTH * 2 + FRAME_PROPERTIES_BUTTON_GAP;
  const accept = () => {
    commands.setFrameDuration(latestDuration.current, allFrames);
    onOpenChange(false);
  };
  return (
    <div
      ref={host}
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          accept();
          event.stopPropagation();
          return;
        }
        if (event.key === "Tab") {
          const nodes = [
            ...(host.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ) ?? []),
          ];
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          if (
            nodes.length &&
            (index < 0 ||
              (event.shiftKey && index === 0) ||
              (!event.shiftKey && index === nodes.length - 1))
          ) {
            event.preventDefault();
            nodes[event.shiftKey ? nodes.length - 1 : 0].focus({ preventScroll: true });
          }
        }
        event.stopPropagation();
      }}
    >
      <EditorDialog
        open
        title="Frame Properties"
        bounds={{
          x: position?.x ?? (Math.floor(scene.width / 4) - Math.floor(width / 4)) * 2,
          y: position?.y ?? (Math.floor(scene.height / 4) - Math.floor(160 / 4)) * 2,
          width,
          height: 160,
        }}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        onOpenChange={onOpenChange}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
      >
        {({ clientBounds: client }: DialogContext) => {
          const frameValueOffset = Math.min(202, client.width - FRAME_PROPERTIES_VALUE_WIDTH);
          const actionX = client.x + client.width - buttonGroupWidth;
          return (
            <>
              <Text
                variant={TextVariant.Control}
                bounds={{ x: client.x + 2, y: client.y, width: frameValueOffset - 10, height: 18 }}
                relativeTo={client}
                text="Frame number:"
              />
              <Text
                variant={TextVariant.Control}
                bounds={{
                  x: client.x + frameValueOffset,
                  y: client.y,
                  width: FRAME_PROPERTIES_VALUE_WIDTH,
                  height: 18,
                }}
                relativeTo={client}
                text={frame}
              />
              <Text
                variant={TextVariant.Control}
                bounds={{
                  x: client.x + 2,
                  y: client.y + 26,
                  width: frameValueOffset - 10,
                  height: 30,
                }}
                relativeTo={client}
                text="Duration (milliseconds):"
              />
              <Input
                bounds={{
                  x: client.x + frameValueOffset,
                  y: client.y + 26,
                  width: FRAME_PROPERTIES_VALUE_WIDTH,
                  height: 30,
                }}
                relativeTo={client}
                value={String(duration)}
                aria-label="Duration (milliseconds)"
                inputMode="numeric"
                onValueChange={(value) => {
                  const parsed = Number(value);
                  if (Number.isFinite(parsed))
                    onDurationChange(Math.max(1, Math.min(UINT16_MAX, Math.round(parsed))));
                }}
                onCommit={(value) => {
                  const parsed = Number(value);
                  if (Number.isFinite(parsed))
                    onDurationChange(Math.max(1, Math.min(UINT16_MAX, Math.round(parsed))));
                }}
              />
              <Divider
                bounds={{ x: client.x, y: client.y + 62, width: client.width, height: 8 }}
                relativeTo={client}
              />
              <Button
                bounds={{
                  x: actionX,
                  y: client.y + 80,
                  width: FRAME_PROPERTIES_BUTTON_WIDTH,
                  height: 34,
                }}
                relativeTo={client}
                text="OK"
                font="default"
                mnemonicIndex={0}
                aria-label="OK"
                onClick={accept}
              />
              <Button
                bounds={{
                  x: actionX + FRAME_PROPERTIES_BUTTON_WIDTH + FRAME_PROPERTIES_BUTTON_GAP,
                  y: client.y + 80,
                  width: FRAME_PROPERTIES_BUTTON_WIDTH,
                  height: 34,
                }}
                relativeTo={client}
                text="Cancel"
                font="default"
                mnemonicIndex={0}
                aria-label="Cancel"
                onClick={() => onOpenChange(false)}
              />
            </>
          );
        }}
      </EditorDialog>
    </div>
  );
}

/** Shared source-shaped Layer/Frame property windows. */
export function TimelineDialogs({ layerName = "Layer", firstFrame = 1 }: TimelineDialogsProps) {
  const register = useRegisterTimelineActions();
  const timelineManager = useTimelineManager();
  const { commands } = timelineManager;
  const getSnapshot = timelineManager.getSnapshot;
  const celFlush = useRef<() => void>(() => {});
  const sceneRoot = useRef<HTMLDivElement>(null);
  const state = timelineManager.snapshot;
  const shownTarget = useRef<{ docId?: number; layerId?: string } | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [tilesetPropertiesOpen, setTilesetPropertiesOpen] = useState(false);
  const [frameTarget, setFrameTarget] = useState<"current" | "all">("current");
  const [frameLabel, setFrameLabel] = useState("1");
  const [layerDraft, setLayerDraft] = useState(layerName);
  const [opacityDraft, setOpacityDraft] = useState(UINT8_MAX);
  const [blendDraft, setBlendDraft] = useState(0);
  const [durationDraft, setDurationDraft] = useState(100);
  const [tagRequest, setTagRequest] = useState<TagDialogRequest | null>(null);
  const tagRequestId = useRef(0);
  const [gotoFrameOpen, setGotoFrameOpen] = useState(false);
  const [gotoFrameDraft, setGotoFrameDraft] = useState("1");
  const pendingLayer = useRef<{
    docId?: number;
    layerId: string;
    name: string;
    opacity: number;
    blendMode: number;
  } | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPendingLayerProperties = useCallback(() => {
    celFlush.current();
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    const pending = pendingLayer.current;
    pendingLayer.current = null;
    if (!pending) return;
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const timeline = snapshot.document?.timeline;
    if (snapshot.document?.id !== pending.docId || !timeline) return;
    const index = timeline.layers.findIndex((layer) => layer.id === pending.layerId);
    if (index >= 0)
      commands.setLayerProperties(
        { name: pending.name, opacity: pending.opacity, blendMode: pending.blendMode },
        index,
      );
  }, [commands, getSnapshot]);
  const scheduleLayerProperties = useCallback(
    (name: string, opacity: number, mode?: number) => {
      const snapshot = getSnapshot();
      const timeline = snapshot?.document?.timeline;
      const active = timeline?.activeLayer ?? 0;
      const layer = timeline?.layers[active];
      if (!snapshot?.document || !layer) return;
      setLayerDraft(name);
      setOpacityDraft(opacity);
      const blendMode = mode ?? pendingLayer.current?.blendMode ?? layer.blendMode ?? 0;
      setBlendDraft(blendMode);
      pendingLayer.current = {
        docId: snapshot.document.id,
        layerId: layer.id,
        name,
        opacity,
        blendMode,
      };
      if (pendingTimer.current !== null) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(flushPendingLayerProperties, 250);
    },
    [commands, getSnapshot, flushPendingLayerProperties],
  );
  useEffect(() => () => flushPendingLayerProperties(), [flushPendingLayerProperties]);
  useEffect(() => {
    if (dialog !== "layer-properties") {
      shownTarget.current = null;
      return;
    }
    const doc = state?.document,
      t = doc?.timeline,
      layer = t?.layers[t.activeLayer];
    if (!doc || !layer) {
      flushPendingLayerProperties();
      setDialog(null);
      return;
    }
    const changed =
      shownTarget.current?.docId !== doc.id || shownTarget.current?.layerId !== layer.id;
    if (changed) {
      flushPendingLayerProperties();
      shownTarget.current = { docId: doc.id, layerId: layer.id };
    }
    if (changed || !pendingLayer.current) {
      setLayerDraft(layer.name);
      setOpacityDraft(layer.opacity);
      setBlendDraft(layer.blendMode ?? 0);
    }
  }, [dialog, state?.document?.id, state?.document?.timeline, flushPendingLayerProperties]);

  const openLayerPropertiesDialog = useCallback(() => {
    flushPendingLayerProperties();
    const timeline = getSnapshot()?.document?.timeline;
    const active = timeline?.activeLayer ?? 0;
    setLayerDraft(timeline?.layers[active]?.name ?? layerName);
    setOpacityDraft(Math.round(timeline?.layers[active]?.opacity ?? UINT8_MAX));
    setBlendDraft(timeline?.layers[active]?.blendMode ?? 0);
    setDialog("layer-properties");
  }, [commands, getSnapshot, layerName, flushPendingLayerProperties]);
  const openFramePropertiesDialog = useCallback(
    (target: "current" | "all" = "current") => {
      flushPendingLayerProperties();
      const timeline = getSnapshot()?.document?.timeline;
      if (!timeline) return;
      const selected =
        target === "all"
          ? timeline.frames.map((_, index) => index)
          : timeline.range && (timeline.range.kind === "frames" || timeline.range.kind === "cels")
            ? timeline.range.frames
            : [timeline.activeFrame];
      const indices = [...new Set(selected)].sort((a, b) => a - b);
      setDurationDraft(
        Math.round(timeline.frames[indices[0] ?? timeline.activeFrame]?.duration ?? 100),
      );
      setFrameTarget(target);
      setFrameLabel(selectedFrameLabel(indices, firstFrame));
      setDialog("frame-properties");
    },
    [commands, getSnapshot, flushPendingLayerProperties, firstFrame],
  );
  const openTagPropertiesDialog = useCallback(
    (index?: number) => {
      flushPendingLayerProperties();
      if (!getSnapshot()?.document?.timeline) return;
      setTagRequest({ id: ++tagRequestId.current, ...(index === undefined ? {} : { index }) });
    },
    [commands, getSnapshot, flushPendingLayerProperties],
  );
  const newTagDialog = useCallback(() => {
    flushPendingLayerProperties();
    if (!getSnapshot()?.document?.timeline) return;
    setTagRequest({ id: ++tagRequestId.current, index: null });
  }, [commands, getSnapshot, flushPendingLayerProperties]);
  const deleteCurrentTag = useCallback(() => {
    const timeline = getSnapshot()?.document?.timeline;
    const index = timeline ? timelineTagIndexAtFrame(timeline, timeline.activeFrame) : undefined;
    if (index !== undefined) commands.setAnimationTag(index, null, "Delete Tag");
  }, [commands, getSnapshot]);
  const openGotoFrameDialog = useCallback(() => {
    flushPendingLayerProperties();
    const timeline = getSnapshot()?.document?.timeline;
    if (!timeline) return;
    setGotoFrameDraft(String(timeline.activeFrame + firstFrame));
    setGotoFrameOpen(true);
  }, [commands, getSnapshot, flushPendingLayerProperties, firstFrame]);
  const openCelPropertiesDialog = useCallback(() => {
    flushPendingLayerProperties();
    const t = getSnapshot()?.document?.timeline;
    if (t?.frames[t.activeFrame]?.cels[t.activeLayer]) setDialog("cel-properties");
  }, [commands, getSnapshot, flushPendingLayerProperties]);
  const openSpritePropertiesDialog = useCallback(() => {
    flushPendingLayerProperties();
    if (getSnapshot()?.document) setDialog("sprite-properties");
  }, [commands, getSnapshot, flushPendingLayerProperties]);
  useEffect(() => {
    if (!register) return;
    return register({
      openLayerPropertiesDialog,
      openFramePropertiesDialog,
      openCelPropertiesDialog,
      openSpritePropertiesDialog,
      flushPendingLayerProperties,
      openTagPropertiesDialog,
      newTagDialog,
      deleteCurrentTag,
      openGotoFrameDialog,
    });
  }, [
    register,
    openLayerPropertiesDialog,
    openFramePropertiesDialog,
    openCelPropertiesDialog,
    openSpritePropertiesDialog,
    flushPendingLayerProperties,
    openTagPropertiesDialog,
    newTagDialog,
    deleteCurrentTag,
    openGotoFrameDialog,
  ]);
  const timeline = getSnapshot()?.document?.timeline;
  const activeFrame = (timeline?.activeFrame ?? 0) + 1;
  const portalTarget =
    sceneRoot.current?.closest<HTMLElement>("[data-ui-scene]") ??
    (typeof document === "undefined" ? null : document.body);
  const acceptGotoFrame = () => {
    if (timeline)
      commands.selectFrame(
        resolveGotoFrame(gotoFrameDraft, timeline, timeline.activeFrame, firstFrame),
      );
    setGotoFrameOpen(false);
  };
  return (
    <>
      <div ref={sceneRoot} style={{ display: "contents" }} />
      {portalTarget &&
        createPortal(
          <>
            {dialog === "cel-properties" && (
              <CelProperties onClose={() => setDialog(null)} flushRef={celFlush} />
            )}
            {dialog === "sprite-properties" && <SpriteProperties onClose={() => setDialog(null)} />}
            <LayerPropertiesWindow
              open={dialog === "layer-properties"}
              onOpenChange={(open) => {
                if (!open) {
                  flushPendingLayerProperties();
                  setDialog(null);
                }
              }}
              name={layerDraft}
              opacity={opacityDraft}
              blendMode={blendDraft}
              userData={
                timeline?.layers[timeline.activeLayer]?.userData === null
                  ? undefined
                  : (timeline?.layers[timeline.activeLayer]?.userData ??
                    timeline?.layers[timeline.activeLayer]?.source?.userData)
              }
              imageProps={
                timeline?.layers[timeline.activeLayer]?.kind !== "group" ||
                !!state?.settings.composeGroups
              }
              background={
                !!(
                  timeline?.layers[timeline.activeLayer]?.flags &&
                  timeline.layers[timeline.activeLayer].flags & 8
                )
              }
              tilemap={timeline?.layers[timeline.activeLayer]?.kind === "tilemap"}
              onTilesetClick={() => setTilesetPropertiesOpen(true)}
              onBlendModeChange={(blendMode) =>
                scheduleLayerProperties(layerDraft, opacityDraft, blendMode)
              }
              onDraftChange={scheduleLayerProperties}
              onCommit={flushPendingLayerProperties}
              onUserDataChange={(userData) => {
                flushPendingLayerProperties();
                const id = timeline?.layers[timeline.activeLayer]?.id;
                const current = getSnapshot()?.document?.timeline;
                const index = current?.layers.findIndex((layer) => layer.id === id) ?? -1;
                const layer = current?.layers[index];
                if (!layer || index < 0) return;
                commands.setLayerProperties({ userData: userData ?? null }, index);
              }}
            />
            {tilesetPropertiesOpen && timelineManager.active && (
              <TilemapDialog
                convert={false}
                properties
                onClose={() => setTilesetPropertiesOpen(false)}
              />
            )}
            <FramePropertiesWindow
              open={dialog === "frame-properties"}
              onOpenChange={(open) => !open && setDialog(null)}
              frame={dialog === "frame-properties" ? frameLabel : String(activeFrame)}
              duration={durationDraft}
              allFrames={frameTarget === "all"}
              onDurationChange={setDurationDraft}
            />
          </>,
          portalTarget,
        )}
      {timeline && (
        <TagPropertiesDialog
          key={tagRequest?.id ?? "closed"}
          timeline={timeline}
          request={tagRequest}
          onClose={() => setTagRequest(null)}
          container={portalTarget}
          firstFrame={firstFrame}
        />
      )}
      {gotoFrameOpen &&
        timeline &&
        portalTarget &&
        createPortal(
          <FormDialog
            open
            title="Go to Frame"
            onOpenChange={setGotoFrameOpen}
            fields={[
              {
                key: "frame",
                type: "select",
                editable: true,
                label: "Frame:",
                value: gotoFrameDraft,
                onChange: setGotoFrameDraft,
                options: timelineTags(timeline).map((tag) => ({
                  value: tag.name,
                  label: tag.name,
                })),
              },
            ]}
            actions={[
              { label: "OK", onClick: acceptGotoFrame },
              { label: "Cancel", onClick: () => setGotoFrameOpen(false) },
            ]}
          />,
          portalTarget,
        )}
    </>
  );
}
