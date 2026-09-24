import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { IconControl } from "$/components/shared/icon-control";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUi } from "$/i18n";
import {
  CEL_OPACITY_MAX,
  CEL_Z_INDEX_MAX,
  CEL_Z_INDEX_MIN,
  useCelPropertiesManager,
  type CelPropertiesEditView,
  type CelPropertiesTarget,
} from "$/managers/inspector/cel-properties-manager";
import { formatEditorColor, parseEditorColor } from "$/managers/tools/color-control";
import {
  updateUserDataFields,
  useUserDataVisibility,
  UserDataVisibilityScope,
} from "$/managers/user-data/user-data-manager";
import { Button, Input, Label, Slider } from "@xprite/ui";

const MIN_DIALOG_WIDTH = 280;
const MAX_DIALOG_WIDTH = 560;
const DEFAULT_DIALOG_HEIGHT = 122;
const MAX_DIALOG_HEIGHT = 250;
const MAX_COLLAPSED_DIALOG_HEIGHT = 190;
const VIEWPORT_GUTTER = 24;
const LABEL_X = 2;
const LABEL_WIDTH = 76;
const FIELD_X = 82;
const RIGHT_INSET = 12;
const BUTTON_WIDTH = 24;
const ROW_GROUP_HEIGHT = 72;
const SECOND_ROW_OFFSET = 40;
const USER_DATA_COLOR_ROW_OFFSET = ROW_GROUP_HEIGHT + 8;
const USER_DATA_TEXT_ROW_OFFSET = ROW_GROUP_HEIGHT + 44;
const SPINNER_DOWN_OFFSET = 16;
const SLIDER_BUTTON_GAP = 8;
const INPUT_BUTTON_GAP = 2;

/** Source CelPropertiesWindow: nonmodal, 250 ms live commits, Enter/Escape
 * flush and close. Targets follow the active site; empty cells stay empty. */
export function CelProperties({
  onClose,
  flushRef,
}: {
  onClose: () => void;
  flushRef: { current: () => void };
}) {
  const scene = useSceneBounds();
  const manager = useCelPropertiesManager();
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const view = manager.view;
  const [opacity, setOpacity] = useState(view.opacity),
    [z, setZ] = useState(String(view.zIndex));
  const [userDataOpen, setUserDataOpen] = useUserDataVisibility(UserDataVisibilityScope.Cel);
  const [userText, setUserText] = useState(view.userData?.text ?? "");
  const [userColor, setUserColor] = useState(
    formatEditorColor(view.userData?.color ?? [0, 0, 0, 0]),
  );
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    host = useRef<HTMLDivElement>(null);
  const pending = useRef<{
    target: CelPropertiesTarget;
    properties: CelPropertiesEditView;
  } | null>(null);
  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    managerRef.current.setCelProperties(p.target, p.properties);
  }, []);
  useLayoutEffect(() => {
    flushRef.current = flush;
    return () => {
      flush();
      flushRef.current = () => {};
    };
  }, [flush, flushRef]);
  useLayoutEffect(() => {
    flush();
    const next = managerRef.current.view;
    setOpacity(next.opacity);
    setZ(String(next.zIndex));
    setUserText(next.userData?.text ?? "");
    setUserColor(formatEditorColor(next.userData?.color ?? [0, 0, 0, 0]));
  }, [view.targetKey, flush]);
  useEffect(() => {
    if (!pending.current) {
      setOpacity(view.opacity);
      setZ(String(view.zIndex));
    }
  }, [view.opacity, view.zIndex]);
  useEffect(() => {
    const opacity = host.current?.querySelector<HTMLElement>('[data-label-source="Cel opacity"]');
    const target =
      opacity?.getAttribute("aria-disabled") === "true"
        ? host.current?.querySelector<HTMLInputElement>("input:not(:disabled)")
        : opacity;
    target?.focus({ preventScroll: true });
    if (target instanceof HTMLInputElement) target.select();
  }, []);
  const schedule = (properties: CelPropertiesEditView) => {
    if (!view.target || !view.hasSelectedCels) return;
    pending.current = {
      target: view.target,
      properties: { ...pending.current?.properties, ...properties },
    };
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 250);
  };
  const changeZ = (value: string) => {
    setZ(value);
    if (value.trim() && Number.isFinite(Number(value))) schedule({ zIndex: Number(value) });
  };
  const updateUserData = (text: string, color: string) => {
    const data = updateUserDataFields(
      managerRef.current.view.userData,
      text,
      parseEditorColor(color) as [number, number, number, number],
    );
    schedule({ userData: data ?? null });
  };
  const close = () => {
    flush();
    onClose();
  };
  const dialogWidth = Math.min(
    MAX_DIALOG_WIDTH,
    Math.max(MIN_DIALOG_WIDTH, scene.width - VIEWPORT_GUTTER),
  );
  const dialogHeight = Math.min(
    userDataOpen ? MAX_DIALOG_HEIGHT : MAX_COLLAPSED_DIALOG_HEIGHT,
    Math.max(userDataOpen ? 218 : DEFAULT_DIALOG_HEIGHT, scene.height - VIEWPORT_GUTTER),
  );
  return (
    <div
      ref={host}
      className="xse-timeline-dialog-host"
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) flush();
      }}
    >
      <EditorDialog
        open
        title="Cel Properties"
        bounds={{
          x: position?.x ?? (Math.floor(scene.width / 4) - Math.floor(dialogWidth / 4)) * 2,
          y: position?.y ?? (Math.floor(scene.height / 4) - Math.floor(dialogHeight / 4)) * 2,
          width: dialogWidth,
          height: dialogHeight,
        }}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        resizable={false}
        autoFocus={false}
        constrainToViewport
      >
        {({ clientBounds: c }) => {
          const rowTop = userDataOpen
            ? 8
            : Math.max(0, Math.floor((c.height - ROW_GROUP_HEIGHT) / 2));
          const secondRowTop = rowTop + SECOND_ROW_OFFSET;
          const buttonX = c.x + c.width - RIGHT_INSET - BUTTON_WIDTH;
          return (
            <>
              <Label
                bounds={{ x: c.x + LABEL_X, y: c.y + rowTop, width: LABEL_WIDTH, height: 32 }}
                relativeTo={c}
                text="Opacity:"
              />
              <Slider
                bounds={{
                  x: c.x + FIELD_X,
                  y: c.y + rowTop,
                  width: Math.max(0, buttonX - c.x - SLIDER_BUTTON_GAP - FIELD_X),
                  height: 32,
                }}
                relativeTo={c}
                min={0}
                max={CEL_OPACITY_MAX}
                value={opacity}
                label={`${Math.round((opacity * 100) / CEL_OPACITY_MAX)}%`}
                aria-label="Cel opacity"
                disabled={!view.opacityEnabled}
                onValueChange={(value) => {
                  setOpacity(value);
                  schedule({ opacity: value });
                }}
              />
              <IconControl
                bounds={{ x: buttonX, y: c.y + rowTop, width: BUTTON_WIDTH, height: 30 }}
                relativeTo={c}
                icon="icon_user_data"
                label="Cel user data"
                expanded={userDataOpen}
                disabled={!view.hasSingleCel}
                onClick={() => setUserDataOpen(!userDataOpen)}
              />
              <Label
                bounds={{
                  x: c.x + LABEL_X,
                  y: c.y + secondRowTop,
                  width: LABEL_WIDTH,
                  height: 30,
                }}
                relativeTo={c}
                text="Z-Index:"
              />
              <Input
                bounds={{
                  x: c.x + FIELD_X,
                  y: c.y + secondRowTop,
                  width: Math.max(0, buttonX - c.x - INPUT_BUTTON_GAP - FIELD_X),
                  height: 30,
                }}
                relativeTo={c}
                value={z}
                aria-label="Cel Z-Index"
                inputMode="numeric"
                disabled={!view.hasSelectedCels}
                onValueChange={changeZ}
                onCommit={() => flush()}
              />
              <Button
                bounds={{ x: buttonX, y: c.y + secondRowTop, width: BUTTON_WIDTH, height: 14 }}
                relativeTo={c}
                icon="spin_up"
                aria-label="Increase cel Z-Index"
                disabled={!view.hasSelectedCels}
                onClick={() => changeZ(String(Math.min(CEL_Z_INDEX_MAX, (Number(z) || 0) + 1)))}
              />
              <Button
                bounds={{
                  x: buttonX,
                  y: c.y + secondRowTop + SPINNER_DOWN_OFFSET,
                  width: BUTTON_WIDTH,
                  height: 14,
                }}
                relativeTo={c}
                icon="spin_down"
                aria-label="Decrease cel Z-Index"
                disabled={!view.hasSelectedCels}
                onClick={() => changeZ(String(Math.max(CEL_Z_INDEX_MIN, (Number(z) || 0) - 1)))}
              />
              {userDataOpen && (
                <>
                  <Label
                    bounds={{
                      x: c.x + LABEL_X,
                      y: c.y + rowTop + USER_DATA_COLOR_ROW_OFFSET,
                      width: LABEL_WIDTH,
                      height: 30,
                    }}
                    relativeTo={c}
                    text="Color:"
                  />
                  <EditorColorButton
                    bounds={{
                      x: c.x + FIELD_X,
                      y: c.y + rowTop + USER_DATA_COLOR_ROW_OFFSET,
                      width: Math.max(0, buttonX - c.x - INPUT_BUTTON_GAP - FIELD_X),
                      height: 30,
                    }}
                    relativeTo={c}
                    value={userColor}
                    aria-label={tUi("ui.cel.user.data.color")}
                    disabled={!view.hasSingleCel}
                    onClick={() => {
                      setColorPickerAnchor({
                        x: c.x + FIELD_X,
                        y: c.y + rowTop + USER_DATA_COLOR_ROW_OFFSET,
                        width: Math.max(0, buttonX - c.x - INPUT_BUTTON_GAP - FIELD_X),
                        height: 30,
                      });
                      setColorPickerOpen(true);
                    }}
                  />
                  <Label
                    bounds={{
                      x: c.x + LABEL_X,
                      y: c.y + rowTop + USER_DATA_TEXT_ROW_OFFSET,
                      width: LABEL_WIDTH,
                      height: 30,
                    }}
                    relativeTo={c}
                    text="User Data:"
                  />
                  <Input
                    bounds={{
                      x: c.x + FIELD_X,
                      y: c.y + rowTop + USER_DATA_TEXT_ROW_OFFSET,
                      width: Math.max(0, buttonX - c.x - INPUT_BUTTON_GAP - FIELD_X),
                      height: 30,
                    }}
                    relativeTo={c}
                    value={userText}
                    aria-label={tUi("ui.cel.user.data.text")}
                    disabled={!view.hasSingleCel}
                    onValueChange={(value) => {
                      setUserText(value);
                      updateUserData(value, userColor);
                    }}
                  />
                </>
              )}
            </>
          );
        }}
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
