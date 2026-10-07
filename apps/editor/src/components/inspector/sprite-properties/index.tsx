import { useEffect, useRef, useState } from "react";

import { EditorDialog, type DialogContext } from "$/components/dialogs/overlay";
import { IconControl } from "$/components/shared/icon-control";
import { ColorPicker } from "$/components/tools/color-picker";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUi } from "$/i18n";
import { useSpritePropertiesManager } from "$/managers/inspector/sprite-properties-manager";
import type {
  InspectorColorProfile,
  SpritePropertiesEditView,
} from "$/managers/inspector/sprite-properties-manager";
import {
  formatEditorColor,
  parseEditorColor,
  TOOL_COLOR_CHANNEL_MAX,
} from "$/managers/tools/color-control";
import {
  updateUserDataFields,
  useUserDataVisibility,
  UserDataVisibilityScope,
} from "$/managers/user-data/user-data-manager";
import { Button, Input, Text, TextVariant, Checkbox, Combobox, Divider } from "@xprite/ui";

const SPRITE_PROPERTIES_DIALOG_WIDTH = 578;
const SPRITE_USER_DATA_COLOR_FIELD = { x: 88, y: 105, width: 424, height: 24 };

function prettyBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function profileKey(profile: InspectorColorProfile | undefined) {
  if (!profile || profile.type === "none") return "none";
  return profile.type === "srgb" ? "srgb" : "icc-current";
}

export function SpriteProperties({ onClose }: { onClose: () => void }) {
  const manager = useSpritePropertiesManager();
  const managerRef = useRef(manager);
  managerRef.current = manager;
  const document = manager.view;
  const depth = document?.depth ?? 32;
  const paletteLength = document?.paletteLength ?? 0;
  const currentRatio = document?.pixelRatio ?? ([1, 1] as const);
  const currentIndex = document?.transparentIndex ?? 0;
  const currentUserData = document?.userData;
  const currentUuidSetting = document?.useLayerUuids ?? false;
  const [ratio, setRatio] = useState(`${currentRatio[0]}:${currentRatio[1]}`);
  const [transparentIndex, setTransparentIndex] = useState(String(currentIndex));
  const [useUuids, setUseUuids] = useState(currentUuidSetting);
  const [userDataOpen, setUserDataOpen] = useUserDataVisibility(UserDataVisibilityScope.Sprite);
  const [userText, setUserText] = useState(currentUserData?.text ?? "");
  const [userColor, setUserColor] = useState(
    formatEditorColor(currentUserData?.color ?? [0, 0, 0, 0]),
  );
  const [colorPicker, setColorPicker] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<typeof SPRITE_USER_DATA_COLOR_FIELD>();
  const profile = document?.colorProfile;
  const activeProfileKey = profileKey(profile);
  const [profileSelection, setProfileSelection] = useState(activeProfileKey);

  useEffect(() => {
    setRatio(`${currentRatio[0]}:${currentRatio[1]}`);
    setTransparentIndex(String(currentIndex));
    setUseUuids(currentUuidSetting);
    setUserText(currentUserData?.text ?? "");
    setUserColor(formatEditorColor(currentUserData?.color ?? [0, 0, 0, 0]));
    setProfileSelection(activeProfileKey);
  }, [
    document?.documentKey,
    currentRatio[0],
    currentRatio[1],
    currentIndex,
    currentUuidSetting,
    currentUserData?.text,
    currentUserData?.color,
    activeProfileKey,
  ]);

  const type =
    depth === 8
      ? tUi("ui.indexed.colors", { value1: paletteLength })
      : depth === 16
        ? "Grayscale"
        : "RGB";
  const size = document
    ? `${document.width}x${document.height} (${prettyBytes(document.byteCount)})`
    : "";
  const profileOptions = [
    { value: "none", label: "None" },
    { value: "srgb", label: "sRGB" },
    ...(profile?.type === "icc" ? [{ value: "icc-current", label: "ICC Profile" }] : []),
  ];
  const ratioOptions = [
    { value: "1:1", label: "Square Pixels (1:1)" },
    { value: "2:1", label: "Double-wide Pixels (2:1)" },
    { value: "1:2", label: "Double-high Pixels (1:2)" },
  ];
  if (!ratioOptions.some((option) => option.value === ratio))
    ratioOptions.push({ value: ratio, label: ratio });
  const profileToApply: InspectorColorProfile | null =
    profileSelection === "none"
      ? null
      : profileSelection === "srgb"
        ? { type: "srgb" as const }
        : profile?.type === "icc"
          ? profile
          : null;
  const profileChangeEnabled = profileSelection !== activeProfileKey;
  const applyProfile = (convert: boolean) => {
    if (!profileChangeEnabled) return;
    managerRef.current.setProperties({
      colorProfile: profileToApply,
      ...(convert ? { convertColorProfile: true } : {}),
    });
  };

  if (!document) return null;
  const accept = () => {
    const [pixelWidth, pixelHeight] = ratio.split(":").map(Number);
    if (
      !Number.isInteger(pixelWidth) ||
      !Number.isInteger(pixelHeight) ||
      pixelWidth < 1 ||
      pixelHeight < 1 ||
      pixelWidth > TOOL_COLOR_CHANNEL_MAX ||
      pixelHeight > TOOL_COLOR_CHANNEL_MAX
    )
      return;
    const index = Number(transparentIndex);
    if (depth === 8 && (!Number.isInteger(index) || index < 0 || index >= (paletteLength || 256)))
      return;
    const userData = userDataOpen
      ? updateUserDataFields(
          currentUserData,
          userText,
          parseEditorColor(userColor) as [number, number, number, number],
        )
      : currentUserData;
    const properties: SpritePropertiesEditView = {
      pixelRatio: [pixelWidth, pixelHeight],
      useLayerUuids: useUuids,
      userData,
      ...(depth === 8 ? { transparentIndex: index } : {}),
    };
    managerRef.current.setProperties(properties);
    onClose();
  };

  return (
    <div
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          event.target.getAttribute("aria-label") !== "File name"
        ) {
          event.preventDefault();
          accept();
          event.stopPropagation();
        }
        if (event.key === "Tab") {
          const nodes = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ),
          ];
          const index = nodes.indexOf(window.document.activeElement as HTMLElement);
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
        key={userDataOpen ? "user-data-open" : "user-data-closed"}
        open
        centerOnOpen
        title="Sprite Properties"
        defaultBounds={{
          x: 700,
          y: 310,
          width: SPRITE_PROPERTIES_DIALOG_WIDTH,
          height: userDataOpen ? 425 : 347,
        }}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        resizable={false}
        autoFocus={false}
        modal
        constrainToViewport
      >
        {({ clientBounds: c }: DialogContext) => (
          <>
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y - 2, width: 86, height: 24 }}
              relativeTo={c}
              text="File name:"
            />
            <Input
              bounds={{ x: c.x + 88, y: c.y - 2, width: 424, height: 24 }}
              relativeTo={c}
              value={document.name}
              aria-label="File name"
              readOnly
            />
            <IconControl
              bounds={{ x: c.x + 522, y: c.y - 2, width: 24, height: 24 }}
              relativeTo={c}
              icon="icon_user_data"
              label="Sprite user data"
              expanded={userDataOpen}
              onClick={() => setUserDataOpen(!userDataOpen)}
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y + 30, width: 86, height: 20 }}
              relativeTo={c}
              text="Type:"
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x + 86, y: c.y + 30, width: 400, height: 20 }}
              relativeTo={c}
              text={type}
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y + 54, width: 86, height: 20 }}
              relativeTo={c}
              text="Size:"
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x + 86, y: c.y + 54, width: 400, height: 20 }}
              relativeTo={c}
              text={size}
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y + 78, width: 86, height: 20 }}
              relativeTo={c}
              text="Frames:"
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x + 86, y: c.y + 78, width: 400, height: 20 }}
              relativeTo={c}
              text={String(document?.frameCount ?? 1)}
            />

            {userDataOpen && (
              <>
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x, y: c.y + 105, width: 86, height: 24 }}
                  relativeTo={c}
                  text="Color:"
                />
                <EditorColorButton
                  bounds={{
                    x: c.x + SPRITE_USER_DATA_COLOR_FIELD.x,
                    y: c.y + SPRITE_USER_DATA_COLOR_FIELD.y,
                    width: SPRITE_USER_DATA_COLOR_FIELD.width,
                    height: SPRITE_USER_DATA_COLOR_FIELD.height,
                  }}
                  relativeTo={c}
                  value={userColor}
                  aria-label="Sprite user data color"
                  onClick={() => {
                    setColorPickerAnchor({
                      ...SPRITE_USER_DATA_COLOR_FIELD,
                      x: c.x + SPRITE_USER_DATA_COLOR_FIELD.x,
                      y: c.y + SPRITE_USER_DATA_COLOR_FIELD.y,
                    });
                    setColorPicker(true);
                  }}
                />
                <Text
                  variant={TextVariant.Control}
                  bounds={{ x: c.x, y: c.y + 137, width: 86, height: 24 }}
                  relativeTo={c}
                  text="User Data:"
                />
                <Input
                  bounds={{ x: c.x + 88, y: c.y + 137, width: 424, height: 30 }}
                  relativeTo={c}
                  value={userText}
                  aria-label="Sprite user data text"
                  onValueChange={setUserText}
                />
              </>
            )}

            <Divider
              bounds={{ x: c.x, y: c.y + 104 + (userDataOpen ? 78 : 0), width: 546, height: 10 }}
              relativeTo={c}
              text="Advanced"
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y + 130 + (userDataOpen ? 78 : 0), width: 154, height: 24 }}
              relativeTo={c}
              text="Transparent Color:"
            />
            {depth === 8 ? (
              <Combobox
                bounds={{
                  x: c.x + 154,
                  y: c.y + 130 + (userDataOpen ? 78 : 0),
                  width: 386,
                  height: 24,
                }}
                relativeTo={c}
                value={transparentIndex}
                options={Array.from({ length: paletteLength }, (_, index) => ({
                  value: String(index),
                  label: tUi("ui.index.2", { value1: index }),
                }))}
                onValueChange={setTransparentIndex}
                aria-label="Transparent Color"
              />
            ) : (
              <Text
                variant={TextVariant.Control}
                bounds={{
                  x: c.x + 154,
                  y: c.y + 130 + (userDataOpen ? 78 : 0),
                  width: 386,
                  height: 24,
                }}
                relativeTo={c}
                text="(only for indexed images)"
              />
            )}
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y + 157 + (userDataOpen ? 78 : 0), width: 154, height: 24 }}
              relativeTo={c}
              text="Pixel Aspect Ratio:"
            />
            <Combobox
              bounds={{
                x: c.x + 154,
                y: c.y + 157 + (userDataOpen ? 78 : 0),
                width: 386,
                height: 24,
              }}
              relativeTo={c}
              value={ratio}
              options={ratioOptions}
              onValueChange={setRatio}
              aria-label="Pixel Aspect Ratio"
            />
            <Text
              variant={TextVariant.Control}
              bounds={{ x: c.x, y: c.y + 192 + (userDataOpen ? 78 : 0), width: 154, height: 24 }}
              relativeTo={c}
              text="Color Profile:"
            />
            <Combobox
              bounds={{
                x: c.x + 154,
                y: c.y + 192 + (userDataOpen ? 78 : 0),
                width: 232,
                height: 24,
              }}
              relativeTo={c}
              value={profileSelection}
              options={profileOptions}
              onValueChange={setProfileSelection}
              aria-label="Color Profile"
            />
            <Button
              bounds={{
                x: c.x + 398,
                y: c.y + 192 + (userDataOpen ? 78 : 0),
                width: 72,
                height: 24,
              }}
              relativeTo={c}
              text="Assign"
              aria-label="Assign color profile"
              disabled={!profileChangeEnabled}
              onClick={() => applyProfile(false)}
            />
            <Button
              bounds={{
                x: c.x + 479,
                y: c.y + 192 + (userDataOpen ? 78 : 0),
                width: 72,
                height: 24,
              }}
              relativeTo={c}
              text="Convert"
              aria-label="Convert color profile"
              disabled={!profileChangeEnabled}
              onClick={() => applyProfile(true)}
            />
            <Checkbox
              bounds={{ x: c.x, y: c.y + 229 + (userDataOpen ? 78 : 0), width: 310, height: 22 }}
              relativeTo={c}
              label="Create UUID for layers"
              checked={useUuids}
              onCheckedChange={setUseUuids}
              aria-label="Create UUID for layers"
            />
            <Divider
              bounds={{
                x: c.x,
                y: c.y + TOOL_COLOR_CHANNEL_MAX + (userDataOpen ? 78 : 0),
                width: 546,
                height: 8,
              }}
              relativeTo={c}
            />
            <Button
              bounds={{
                x: c.x + 328,
                y: c.y + 268 + (userDataOpen ? 78 : 0),
                width: 106,
                height: 28,
              }}
              relativeTo={c}
              text="OK"
              font="default"
              mnemonicIndex={0}
              aria-label="OK"
              onClick={accept}
            />
            <Button
              bounds={{
                x: c.x + 444,
                y: c.y + 268 + (userDataOpen ? 78 : 0),
                width: 106,
                height: 28,
              }}
              relativeTo={c}
              text="Cancel"
              font="default"
              mnemonicIndex={0}
              aria-label="Cancel"
              onClick={onClose}
            />
          </>
        )}
      </EditorDialog>
      <ColorPicker
        open={colorPicker}
        onOpenChange={setColorPicker}
        value={userColor}
        onValueChange={setUserColor}
        anchor={colorPickerAnchor}
      />
    </div>
  );
}
