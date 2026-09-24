import { useEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { animationPlaybackMenuItems } from "$/components/timeline/animation-settings";
import {
  useWheelInput,
  wheelZoomSteps,
  EditorWheelSurface,
} from "$/managers/input/use-wheel-input";
import {
  renderTimelinePreview,
  useAnimationPreviewManager,
} from "$/managers/timeline/animation-preview-manager";
import type { TimelineSnapshot } from "$/managers/timeline/timeline-manager";
import {
  defaultPlaybackSettings,
  type PlaybackSettings,
} from "$/managers/timeline/timeline-presentation";
import { stepZoom, libreSpriteZoomAtAnchor } from "$/managers/timeline/timeline-presentation";
import { parseEditorColor } from "$/managers/tools/color-control";
import { ContextMenu as EditorContextMenu } from "@xprite/ui";
import { Button } from "@xprite/ui";
import { CanvasSurface, type SurfaceBounds } from "@xprite/ui";
import { paintUiPart, useUiAssets } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";
import {
  clientPoint,
  clientRect,
  clientDeltaToLocal,
  stylusPointerInputProps,
} from "@xprite/ui/utils";
export interface AnimationPreviewProps {
  snapshot: TimelineSnapshot;
  identity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playRequest?: number;
  rewindOnStop?: boolean;
  onRewindOnStopChange?: (enabled: boolean) => void;
}
interface PreviewView {
  zoom: number;
  pan: { x: number; y: number };
  follow: boolean;
}
const preferences = new Map<number, Map<number | string, PreviewView>>();
export function asepritePreviewWindowBounds(width: number, height: number): SurfaceBounds {
  const w = Math.floor(width / 8) * 2,
    h = Math.floor(height / 8) * 2;
  return { x: width - 48 - w, y: height - 42 - h, width: w, height: h };
}
const initialView = (): PreviewView => ({ zoom: 1, pan: { x: 0, y: 0 }, follow: true });
/** PreviewEditorWindow/DocView::Preview. Independent frame/zoom/scroll, Aseprite
 * titlebar Center/Play/Close, right-click Play exposes animation options. */
export function AnimationPreview({
  snapshot,
  identity,
  open,
  onOpenChange,
  playRequest = 0,
  rewindOnStop = false,
  onRewindOnStopChange,
}: AnimationPreviewProps) {
  const scene = useSceneBounds();
  const { resolve: resolveWheel } = useWheelInput();
  const assets = useUiAssets();
  const [options, setOptions] = useState<PlaybackSettings>({ ...defaultPlaybackSettings }),
    [view, setView] = useState<PreviewView>(initialView),
    [, render] = useState(0);
  const t = snapshot.document?.timeline,
    id = snapshot.document?.id ?? snapshot.document?.name ?? "";
  const player = useAnimationPreviewManager();
  const latest = useRef({ snapshot, options });
  latest.current = { snapshot, options };
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    pan: { x: number; y: number };
    sx: number;
    sy: number;
  } | null>(null);
  const updateView = (next: PreviewView) => {
    setView(next);
    let map = preferences.get(identity);
    if (!map) {
      map = new Map();
      preferences.set(identity, map);
    }
    map.set(id, next);
  };
  useEffect(() => {
    player.stop(options);
    player.sync(t?.activeFrame ?? 0);
    const stored = preferences.get(identity)?.get(id) ?? initialView();
    setView(
      stored.follow
        ? {
            ...stored,
            pan: {
              x: (snapshot.view.pan.x * stored.zoom) / snapshot.view.zoom,
              y: (snapshot.view.pan.y * stored.zoom) / snapshot.view.zoom,
            },
          }
        : stored,
    );
    drag.current = null;
    render((v) => v + 1);
  }, [identity, id]);
  useEffect(() => {
    setOptions((current) => ({ ...current, rewindOnStop }));
  }, [rewindOnStop]);
  useEffect(() => {
    if (!snapshot) return;
    setView((old) =>
      old.follow
        ? {
            ...old,
            pan: {
              x: (snapshot.view.pan.x * old.zoom) / snapshot.view.zoom,
              y: (snapshot.view.pan.y * old.zoom) / snapshot.view.zoom,
            },
          }
        : old,
    );
  }, [identity, id, snapshot?.view.pan.x, snapshot?.view.pan.y, snapshot?.view.zoom]);
  useEffect(() => {
    if (!open) player.stop(options);
  }, [open]);
  useEffect(() => {
    if (playRequest && t) {
      if (player.playing) player.stop(options);
      else player.play(t, options);
      render((v) => v + 1);
    }
  }, [playRequest, t, options, player]);
  useEffect(() => {
    if (!open) return;
    let handle = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const current = latest.current;
      const t = current.snapshot.document?.timeline;
      if (t && player.playing) {
        const before = player.playing;
        if (player.advance(t, now - previous, current.options) || before !== player.playing)
          render((v) => v + 1);
      }
      previous = now;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [open]);
  if (!open || !t || !snapshot.document) return null;
  player.sync(t.activeFrame);
  const frame = Math.min(player.frame, t.frames.length - 1),
    doc = snapshot.document;
  const pan = view.pan;
  const changePlaybackOptions = (next: PlaybackSettings) => {
    setOptions(next);
    if (next.rewindOnStop !== options.rewindOnStop) onRewindOnStopChange?.(next.rewindOnStop);
    if (player.playing) player.play(t, next, frame);
  };
  const togglePlay = () => {
    if (player.playing) player.stop(options);
    else player.play(t, options);
    render((v) => v + 1);
  };
  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Preview"
      defaultBounds={asepritePreviewWindowBounds(scene.width, scene.height)}
      resizable
      constrainToViewport
      autoFocus={false}
      titlebarActions={({ bounds: b }) => (
        <>
          <Button
            bounds={{ x: b.x + b.width - 64, y: b.y + 6, width: 18, height: 22 }}
            relativeTo={b}
            part="window_button_normal"
            hotPart="window_button_hot"
            pushedPart="window_button_selected"
            selectedPart="window_button_selected"
            icon="window_center_icon"
            tintIcon
            selected={view.follow}
            insetContent={false}
            aria-label="Center preview on active editor"
            aria-pressed={view.follow}
            onClick={() =>
              updateView({
                ...view,
                follow: !view.follow,
                pan: view.follow
                  ? pan
                  : {
                      x: (snapshot.view.pan.x * view.zoom) / snapshot.view.zoom,
                      y: (snapshot.view.pan.y * view.zoom) / snapshot.view.zoom,
                    },
              })
            }
          />
          <EditorContextMenu
            label="Animation Playback"
            items={animationPlaybackMenuItems(options, changePlaybackOptions)}
          >
            <Button
              bounds={{ x: b.x + b.width - 44, y: b.y + 6, width: 18, height: 22 }}
              relativeTo={b}
              part="window_button_normal"
              hotPart="window_button_hot"
              pushedPart="window_button_selected"
              icon={player.playing ? "window_stop_icon" : "window_play_icon"}
              tintIcon
              insetContent={false}
              aria-label={player.playing ? "Stop preview" : "Play preview"}
              onClick={togglePlay}
            />
          </EditorContextMenu>
        </>
      )}
    >
      {({ clientBounds: c }) => (
        <CanvasSurface
          bounds={c}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: surfaceLayout(c).width,
            height: surfaceLayout(c).height,
            touchAction: "none",
          }}
          dependencies={[
            assets,
            t,
            frame,
            snapshot.pixelRevision,
            view.zoom,
            pan.x,
            pan.y,
            doc.width,
            doc.height,
          ]}
          aria-label="Animation preview canvas"
          {...stylusPointerInputProps()}
          onPointerDown={(event) => {
            if (event.button > 2) return;
            event.preventDefault();
            event.stopPropagation();
            const r = clientRect(event.currentTarget);
            drag.current = {
              pointer: event.pointerId,
              x: clientPoint(event).x,
              y: clientPoint(event).y,
              pan,
              sx: r.width / c.width,
              sy: r.height / c.height,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d || d.pointer !== event.pointerId) return;
            event.preventDefault();
            updateView({
              ...view,
              follow: false,
              pan: {
                x: d.pan.x + (clientPoint(event).x - d.x) / d.sx / 2,
                y: d.pan.y + (clientPoint(event).y - d.y) / d.sy / 2,
              },
            });
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointer === event.pointerId) {
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onContextMenu={(event) => event.preventDefault()}
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const decision = resolveWheel(event.nativeEvent, EditorWheelSurface.Zoom);
            const delta = clientDeltaToLocal(event.currentTarget, { x: decision.x, y: decision.y });
            const steps = wheelZoomSteps(decision, { x: delta.x / 2, y: delta.y / 2 });
            if (!steps) return;
            const r = clientRect(event.currentTarget),
              anchor = {
                x: (((clientPoint(event).x - r.left) * c.width) / r.width - 6) / 2,
                y: (((clientPoint(event).y - r.top) * c.height) / r.height - 6) / 2,
              };
            const next = libreSpriteZoomAtAnchor(
              stepZoom(view.zoom, steps),
              { width: (c.width - 12) / 2, height: (c.height - 12) / 2 },
              doc,
              { zoom: view.zoom, pan },
              anchor,
            );
            updateView({ ...view, ...next });
          }}
          paint={(ctx) => {
            if (!assets) return;
            const width = Math.max(1, Math.round(c.width - 12)),
              height = Math.max(1, Math.round(c.height - 12));
            const image = renderTimelinePreview(
              t,
              frame,
              doc,
              { width, height },
              view.zoom,
              pan,
              parseEditorColor(assets.style.colors.editor_face),
            );
            ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), width, height), 6, 6);
            paintUiPart(ctx, assets, "editor_selected", c.x, c.y, c.width, c.height, {
              drawCenter: false,
            });
          }}
        />
      )}
    </EditorDialog>
  );
}
