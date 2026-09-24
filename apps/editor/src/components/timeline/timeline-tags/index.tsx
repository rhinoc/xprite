import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { FormDialog } from "$/components/dialogs/form-dialog";
import { useTimelineActions } from "$/components/timeline/timeline-actions";
import { tUi, tUiSource } from "$/i18n";
import { TIMELINE_TAG_BAND_HEIGHT } from "$/managers/timeline/tag-bands";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";
import {
  timelineTags,
  timelineTagIndexAtFrame,
  UINT8_MAX,
  UINT16_MAX,
} from "$/managers/timeline/timeline-presentation";
import type { SpriteTimeline } from "$/managers/timeline/timeline-presentation";
import { hexToRgba, rgbaToHex } from "$/managers/timeline/timeline-presentation";
import { AsepriteTagDirection } from "$/managers/timeline/timeline-presentation";
import type { AsepriteTag } from "$/managers/timeline/timeline-presentation";
import {
  useUserDataVisibility,
  UserDataVisibilityScope,
} from "$/managers/user-data/user-data-manager";
import { Button, ButtonVariant, ContextMenu as EditorContextMenu } from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";
import { clientPoint, clientScale, stylusPointerInputProps } from "@xprite/ui/utils";

export interface TagDialogRequest {
  id: number;
  /** Undefined opens the innermost tag at the active frame; null creates one. */
  index?: number | null;
}

const TAG_PROPERTIES_FORM_WIDTH = 420;
const TAG_PROPERTIES_ERROR_MESSAGE_HEIGHT = 34;

function tagDialogValue(
  timeline: SpriteTimeline,
  index: number | null | undefined,
): { index: number; tag: AsepriteTag } | null {
  const tags = timelineTags(timeline);
  if (index === null) {
    const range = timeline.range;
    const frames =
      range && (range.kind === "frames" || range.kind === "cels")
        ? range.frames
        : [timeline.activeFrame];
    const from = Math.min(...frames),
      to = Math.max(...frames);
    return {
      index: tags.length,
      tag: {
        name: "Tag",
        from,
        to,
        color: [0, 0, 0, UINT8_MAX],
        direction: AsepriteTagDirection.Forward,
        repeat: 0,
      },
    };
  }
  const target =
    index === undefined ? timelineTagIndexAtFrame(timeline, timeline.activeFrame) : index;
  if (target === undefined || target < 0 || target >= tags.length) return null;
  return { index: target, tag: { ...tags[target], color: [...tags[target].color] } };
}

/** TagWindow equivalent shared by the menubar and the timeline tag strip. */
export function TagPropertiesDialog({
  timeline,
  request,
  onClose,
  container,
  firstFrame = 1,
}: {
  timeline: SpriteTimeline;
  request: TagDialogRequest | null;
  onClose: () => void;
  container: HTMLElement | null;
  firstFrame?: number;
}) {
  const timelineManager = useTimelineManager();
  const { commands } = timelineManager;
  const [draft, setDraft] = useState<{ index: number; tag: AsepriteTag } | null>(null);
  const [userDataOpen, setUserDataOpen] = useUserDataVisibility(UserDataVisibilityScope.Tag);
  useEffect(() => {
    if (request)
      setDraft(
        tagDialogValue(
          timelineManager.getSnapshot()?.document?.timeline ?? timeline,
          request.index,
        ),
      );
    else setDraft(null);
  }, [request?.id, timelineManager.identity, timelineManager.getSnapshot]);
  const update = (values: Partial<AsepriteTag>) =>
    setDraft((current) => (current ? { ...current, tag: { ...current.tag, ...values } } : null));
  const lastFrame = timeline.frames.length - 1;
  const tagColor = draft?.tag.userData?.color ?? draft?.tag.color ?? [0, 0, 0, UINT8_MAX];
  const invalid =
    !!draft &&
    (!Number.isInteger(draft.tag.from) ||
      !Number.isInteger(draft.tag.to) ||
      !Number.isInteger(draft.tag.repeat));
  const close = () => {
    setDraft(null);
    onClose();
  };
  const accept = () => {
    if (!draft) return;
    const from = Math.max(0, Math.min(lastFrame, Math.round(draft.tag.from)));
    const to = Math.max(from, Math.min(lastFrame, Math.round(draft.tag.to)));
    const repeat = Math.max(0, Math.min(UINT16_MAX, Math.round(draft.tag.repeat)));
    commands.setAnimationTag(
      draft.index,
      { ...draft.tag, name: draft.tag.name.slice(0, 256), from, to, repeat },
      draft.index < timelineTags(timeline).length ? "Tag Properties" : "New Tag",
    );
    close();
  };
  if (!request || !draft || !container) return null;
  return createPortal(
    <>
      <FormDialog
        open
        selectInitialInput
        title="Tag Properties"
        onOpenChange={(open) => {
          if (!open) close();
        }}
        message={invalid ? "Enter a valid frame range and repeat count." : undefined}
        width={TAG_PROPERTIES_FORM_WIDTH}
        layout={{
          fields: {
            name: {
              x: 8,
              y: 8 + (invalid ? TAG_PROPERTIES_ERROR_MESSAGE_HEIGHT : 0),
              width: 336,
              labelWidth: 68,
              height: 30,
              inset: 0,
            },
            "user-data-toggle": {
              x: 352,
              y: 8 + (invalid ? TAG_PROPERTIES_ERROR_MESSAGE_HEIGHT : 0),
              width: 32,
              height: 30,
              inset: 0,
            },
          },
        }}
        fields={[
          {
            key: "name",
            type: "text",
            label: "Name:",
            value: draft.tag.name,
            onChange: (name) => update({ name }),
            row: "name-row",
          },
          {
            key: "user-data-toggle",
            type: "button",
            label: tUi("ui.user.data"),
            icon: "icon_user_data",
            expanded: userDataOpen,
            row: "name-row",
            onClick: () => setUserDataOpen(!userDataOpen),
          },
          {
            key: "from",
            type: "number",
            label: "From:",
            value: draft.tag.from + firstFrame,
            min: firstFrame,
            max: lastFrame + firstFrame,
            step: 1,
            onChange: (value) => update({ from: Math.round(value) - firstFrame }),
          },
          {
            key: "to",
            type: "number",
            label: "To:",
            value: draft.tag.to + firstFrame,
            min: firstFrame,
            max: lastFrame + firstFrame,
            step: 1,
            onChange: (value) => update({ to: Math.round(value) - firstFrame }),
          },
          {
            key: "direction",
            type: "select",
            label: "Animation Direction:",
            value: draft.tag.direction ?? AsepriteTagDirection.Forward,
            onChange: (value) => update({ direction: value as AsepriteTag["direction"] }),
            options: [
              { value: AsepriteTagDirection.Forward, label: "Forward" },
              { value: AsepriteTagDirection.Reverse, label: "Reverse" },
              { value: AsepriteTagDirection.PingPong, label: "Ping-pong" },
              { value: AsepriteTagDirection.PingPongReverse, label: "Ping-pong Reverse" },
            ],
          },
          {
            key: "limit",
            type: "checkbox",
            label: "Repeat:",
            value: draft.tag.repeat > 0,
            onChange: (value) => update({ repeat: value ? draft.tag.repeat || 1 : 0 }),
          },
          {
            key: "repeat",
            disabled: draft.tag.repeat === 0,
            type: "number",
            label: "Repeat:",
            value: draft.tag.repeat,
            min: 0,
            max: UINT16_MAX,
            step: 1,
            onChange: (repeat) => update({ repeat: Math.round(repeat) }),
          },
          ...(userDataOpen
            ? [
                {
                  key: "tag-color",
                  type: "color" as const,
                  label: "Color:",
                  value: rgbaToHex(tagColor),
                  row: "user-data-color",
                  onChange: (value: string) => {
                    try {
                      const color = [...hexToRgba(value)] as AsepriteTag["color"];
                      const userData = { ...draft.tag.userData, color };
                      update({ color, userData });
                    } catch {
                      /* ColorPicker emits only valid hexadecimal colors. */
                    }
                  },
                },
                {
                  key: "user-data",
                  type: "text" as const,
                  label: "User Data:",
                  value: draft.tag.userData?.text ?? "",
                  row: "user-data-text",
                  onChange: (text: string) => {
                    const userData = { ...draft.tag.userData };
                    if (text) userData.text = text;
                    else delete userData.text;
                    update({ userData: Object.keys(userData).length ? userData : undefined });
                  },
                },
              ]
            : []),
        ]}
        actions={[
          { label: "OK", disabled: invalid, onClick: accept },
          { label: "Cancel", onClick: close },
        ]}
      />
    </>,
    container,
  );
}

export function TimelineTags({
  timeline,
  left,
  top,
  height,
  width,
  scroll,
  frameWidth = 24,
  firstFrame = 1,
  onPreview,
  bands,
  focusedBand,
  onFocusBand,
  bandCount,
}: {
  timeline: SpriteTimeline;
  left: number;
  top: number;
  height: number;
  width: number;
  scroll: number;
  frameWidth?: number;
  firstFrame?: number;
  onPreview?: (value: { index: number; from: number; to: number } | null) => void;
  bands: readonly number[];
  focusedBand: number;
  onFocusBand: (band: number) => void;
  bandCount: number;
}) {
  const timelineManager = useTimelineManager();
  const { commands } = timelineManager;
  const root = useRef<HTMLDivElement>(null);
  const tags = timelineTags(timeline);
  const actions = useTimelineActions();
  const [preview, setLocalPreview] = useState<{ index: number; from: number; to: number } | null>(
    null,
  );
  const [contextTagIndex, setContextTagIndex] = useState<number | null>(null);
  const [hotBand, setHotBand] = useState<number | null>(null);
  const setPreview = (value: { index: number; from: number; to: number } | null) => {
    setLocalPreview(value);
    onPreview?.(value);
  };
  const drag = useRef<{
    id: number;
    index: number;
    x: number;
    tag: AsepriteTag;
    mode: "from" | "to" | "move";
    moved: boolean;
    from: number;
    to: number;
  } | null>(null);
  useEffect(() => {
    setLocalPreview(null);
    setContextTagIndex(null);
    drag.current = null;
    onPreview?.(null);
  }, [timelineManager.identity]);
  const open = (index: number) => actions?.openTagPropertiesDialog?.(index);
  const contextTag = contextTagIndex === null ? undefined : tags[contextTagIndex];
  const tagGroup = (
    <div
      ref={root}
      role="group"
      aria-label={tUi("ui.animation.tags")}
      onPointerMoveCapture={(event) => {
        const hit = (event.target as Element).closest<HTMLElement>("[data-tag-band]");
        setHotBand(hit ? Number(hit.dataset.tagBand) : null);
      }}
      onPointerLeave={() => setHotBand(null)}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("[data-tag-index],button")) return;
        const band = (event.target as Element).closest<HTMLElement>("[data-tag-band]");
        if (band) {
          event.stopPropagation();
          onFocusBand(Number(band.dataset.tagBand));
        }
      }}
      style={{
        position: "absolute",
        left: left * sx,
        top: top * sy,
        width: width * sx,
        height: height * sy,
        overflow: "hidden",
        zIndex: 4,
        pointerEvents: tags.length ? "auto" : "none",
      }}
    >
      {Array.from({ length: height / TIMELINE_TAG_BAND_HEIGHT }, (_, row) => {
        const band = focusedBand < 0 ? row : focusedBand;
        return (
          <Fragment key={band}>
            <div
              data-tag-band={band}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: row * TIMELINE_TAG_BAND_HEIGHT * sy,
                height: TIMELINE_TAG_BAND_HEIGHT * sy,
                touchAction: "none",
              }}
            />
            {bandCount > 1 && hotBand === band && (
              <Button
                variant={ButtonVariant.FlatIcon}
                icon="window_center_icon"
                aria-label={`${tUi("ui.animation.tags")}: ${band + 1}`}
                aria-pressed={focusedBand === band}
                data-tag-band={band}
                bounds={{
                  x: left + width - 20,
                  y: top + row * TIMELINE_TAG_BAND_HEIGHT + 11,
                  width: 16,
                  height: 16,
                }}
                relativeTo={{ x: left, y: top }}
                style={{ zIndex: 1 }}
                onClick={(event) => {
                  event.stopPropagation();
                  onFocusBand(band);
                }}
              />
            )}
          </Fragment>
        );
      })}
      {tags.map((tag, index) => {
        const band = bands[index] ?? 0;
        if (focusedBand >= 0 && band !== focusedBand) return null;
        const bandTop = (focusedBand < 0 ? band : 0) * TIMELINE_TAG_BAND_HEIGHT;
        const moving = preview?.index === index ? preview : tag;
        const x = moving.from * frameWidth - scroll;
        const commitRange = (from: number, to: number) =>
          commands.setAnimationTag(index, { ...tag, from, to }, "Tag Properties");
        return (
          <Fragment key={index}>
            <button
              type="button"
              aria-label={tUi("ui.tag.frames.to", {
                value1: tag.name,
                value2: moving.from + firstFrame,
                value3: moving.to + firstFrame,
              })}
              {...stylusPointerInputProps()}
              data-tag-index={index}
              data-tag-band={band}
              style={{
                position: "absolute",
                left: (x + 6) * sx,
                top: (bandTop + 12) * sy,
                width: Math.max(24, measureUiText(tag.name) + 8) * sx,
                height: 18 * sy,
                padding: 0,
                border: 0,
                background:
                  preview?.index === index
                    ? `rgba(${UINT8_MAX},${UINT8_MAX},${UINT8_MAX},.3)`
                    : "transparent",
                touchAction: "none",
                cursor: "move",
                pointerEvents: "auto",
              }}
              onClick={(event) => {
                if (event.detail === 0) open(index);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  id: event.pointerId,
                  index,
                  x: clientPoint(event).x,
                  tag,
                  mode: "move",
                  moved: false,
                  from: tag.from,
                  to: tag.to,
                };
              }}
              onPointerMove={(event) => {
                const current = drag.current;
                if (!current || current.id !== event.pointerId) return;
                let delta = Math.round(
                  (clientPoint(event).x - current.x) /
                    (frameWidth * sx * clientScale(event.currentTarget).x),
                );
                if (!delta && !current.moved) return;
                current.moved = true;
                delta = Math.max(
                  -current.tag.from,
                  Math.min(timeline.frames.length - 1 - current.tag.to, delta),
                );
                current.from = current.tag.from + delta;
                current.to = current.tag.to + delta;
                setPreview({ index, from: current.from, to: current.to });
              }}
              onPointerUp={(event) => {
                const current = drag.current;
                drag.current = null;
                setPreview(null);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                if (!current) return;
                if (current.moved) commitRange(current.from, current.to);
                else open(index);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setPreview(null);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
                setPreview(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  drag.current = null;
                  setPreview(null);
                  event.stopPropagation();
                }
              }}
            />
            {(["from", "to"] as const).map((edge) => (
              <div
                key={edge}
                {...stylusPointerInputProps()}
                data-tag-index={index}
                data-tag-band={band}
                role="slider"
                tabIndex={0}
                aria-label={tUi("ui.frame.2", {
                  value1: tag.name,
                  value2: tUiSource(edge === "from" ? "start" : "end"),
                })}
                aria-valuemin={firstFrame}
                aria-valuemax={timeline.frames.length - 1 + firstFrame}
                aria-valuenow={moving[edge] + firstFrame}
                style={{
                  position: "absolute",
                  left:
                    ((edge === "from" ? moving.from * frameWidth : (moving.to + 1) * frameWidth) -
                      scroll -
                      3) *
                    sx,
                  top: (bandTop + 28) * sy,
                  width: 6 * sx,
                  height: 10 * sy,
                  cursor: "ew-resize",
                  touchAction: "none",
                  pointerEvents: "auto",
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    id: event.pointerId,
                    index,
                    x: clientPoint(event).x,
                    tag,
                    mode: edge,
                    moved: false,
                    from: tag.from,
                    to: tag.to,
                  };
                }}
                onPointerMove={(event) => {
                  const current = drag.current;
                  if (!current || current.id !== event.pointerId) return;
                  const delta = Math.round(
                    (clientPoint(event).x - current.x) /
                      (frameWidth * sx * clientScale(event.currentTarget).x),
                  );
                  current.moved ||= delta !== 0;
                  if (edge === "from")
                    current.from = Math.max(0, Math.min(current.to, current.tag.from + delta));
                  else
                    current.to = Math.max(
                      current.from,
                      Math.min(timeline.frames.length - 1, current.tag.to + delta),
                    );
                  setPreview({ index, from: current.from, to: current.to });
                }}
                onPointerUp={(event) => {
                  const current = drag.current;
                  drag.current = null;
                  setPreview(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  if (current?.moved) commitRange(current.from, current.to);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setPreview(null);
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                  setPreview(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    drag.current = null;
                    setPreview(null);
                    event.stopPropagation();
                  }
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    const next = {
                      ...tag,
                      [edge]: Math.max(
                        edge === "from" ? 0 : tag.from,
                        Math.min(
                          edge === "from" ? tag.to : timeline.frames.length - 1,
                          tag[edge] + (event.key === "ArrowLeft" ? -1 : 1),
                        ),
                      ),
                    };
                    commitRange(next.from, next.to);
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
  if (!tags.length) return tagGroup;
  return (
    <EditorContextMenu
      gestureScope={timelineManager.identity}
      longPressTarget="[data-tag-index]"
      canOpenTouchMenu={(_, target) => !target.closest('[role="slider"]') && !drag.current?.moved}
      touchDoubleClickTarget="[data-tag-index],[data-tag-band]"
      label={contextTag ? tUi("ui.tag.menu", { value1: contextTag.name }) : "Animation tag menu"}
      items={
        contextTag && contextTagIndex !== null
          ? [
              { label: "Tag Properties...", onSelect: () => open(contextTagIndex) },
              {
                label: "Delete Tag",
                onSelect: () => commands.setAnimationTag(contextTagIndex, null, "Delete Tag"),
              },
            ]
          : []
      }
      onContextMenu={(event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-tag-index]")
            : null;
        const index = Number(target?.dataset.tagIndex);
        if (!target || !Number.isInteger(index) || !tags[index]) event.preventDefault();
        else setContextTagIndex(index);
      }}
    >
      {tagGroup}
    </EditorContextMenu>
  );
}
