import { useCallback, useRef, type MutableRefObject } from "react";

import { useColorProfile } from "$/components/tools/color-profile";
import { useColorSource } from "$/managers/colors/color-sources";
import {
  displayEditorColorInSrgb as colorProfileToSrgb,
  parseEditorColor as hexToRgba,
  TOOL_COLOR_CHANNEL_MAX as UINT8_MAX,
  type EditorColorProfile as AsepriteColorProfile,
} from "$/managers/tools/color-control";
import { Button, ButtonVariant, type ButtonProps, type ControlPlacement } from "@xprite/ui";

function displayColor(value: string, profile?: AsepriteColorProfile) {
  let rgba: readonly number[];
  try {
    rgba = hexToRgba(value);
  } catch {
    rgba = [UINT8_MAX, UINT8_MAX, UINT8_MAX, UINT8_MAX];
  }
  const [red, green, blue, alpha] = colorProfileToSrgb(
    [rgba[0] ?? UINT8_MAX, rgba[1] ?? UINT8_MAX, rgba[2] ?? UINT8_MAX, rgba[3] ?? UINT8_MAX],
    profile,
  );
  return `rgba(${red}, ${green}, ${blue}, ${alpha / UINT8_MAX})`;
}

export type EditorColorButtonProps = Omit<
  ButtonProps,
  | "variant"
  | "value"
  | "swatchValue"
  | "swatchColor"
  | "mask"
  | "bounds"
  | "relativeTo"
  | "pixelSize"
> &
  ControlPlacement & { value: string; mask?: boolean };

/** Editor adapter: keep document color-space conversion outside the reusable control. */
export function EditorColorButton(props: EditorColorButtonProps) {
  const profile = useColorProfile();
  const button = useRef<HTMLButtonElement | null>(null);
  useColorSource(button, () => {
    try {
      return { color: hexToRgba(props.value), profile };
    } catch {
      return null;
    }
  });
  const buttonRef = useCallback(
    (element: HTMLButtonElement | null) => {
      button.current = element;
      if (typeof props.buttonRef === "function") props.buttonRef(element);
      else if (props.buttonRef)
        (props.buttonRef as MutableRefObject<HTMLButtonElement | null>).current = element;
    },
    [props.buttonRef],
  );
  return (
    <Button
      {...props}
      buttonRef={buttonRef}
      variant={ButtonVariant.Color}
      value={props.value}
      swatchValue={props.value}
      swatchColor={displayColor(props.value, profile)}
    />
  );
}
