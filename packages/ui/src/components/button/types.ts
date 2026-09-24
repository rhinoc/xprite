import type * as React from "react";

import type { SurfaceViewport } from "$/components/canvas-surface";
import type { ControlPlacement } from "$/components/control-flow/placement";
import type { MenuItem } from "$/components/menu";
import type { PixelFont } from "$/components/text";
import type { UiPartName } from "$/components/theme/appearance";

export enum ButtonVariant {
  Standard = "standard",
  Icon = "icon",
  FlatIcon = "flat-icon",
  Color = "color",
  Tool = "tool",
  Split = "split",
}

export interface ButtonMenuConfig {
  label: string;
  description?: string;
  items: readonly MenuItem[];
  /** Width of the separate dropdown action, in scene pixels. */
  expandWidth?: number;
}

interface ButtonContentProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  children?: React.ReactNode;
  /** Button presentation and interaction. Pixel artwork is the default for editor controls. */
  variant?: ButtonVariant;
  /** Dropdown action for the split variant. */
  menu?: ButtonMenuConfig;
  /** Disable interaction for a color preview while preserving its swatch appearance. */
  readOnly?: boolean;
  selected?: boolean;
  /** Override the pressed appearance during an interaction such as drag sampling. */
  pressed?: boolean;
  viewport?: SurfaceViewport;
  part?: UiPartName;
  hotPart?: UiPartName;
  pushedPart?: UiPartName;
  focusedPart?: UiPartName;
  selectedPart?: UiPartName;
  focusAppearance?: "always" | "keyboard";
  icon?: UiPartName;
  selectedIcon?: UiPartName;
  tintDisabledIcon?: boolean;
  tintIcon?: boolean;
  disabledTextShadow?: boolean;
  text?: string;
  /** Optional visible label used by touch presentation. */
  label?: string;
  /** Optional content placed before a touch label. */
  leading?: React.ReactNode;
  labelScale?: number;
  font?: PixelFont;
  insetContent?: boolean;
  /** Composite containers can paint overlapping faces while retaining button semantics. */
  paintArtwork?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  fill?: string;
  /** Text/icon ink override for pixel artwork buttons. */
  color?: string;
  /** Color-swatch fill. The editor can pass a profile-converted display color. */
  swatchColor?: string;
  /** Source color value used for the swatch's default label. */
  swatchValue?: string;
  mask?: boolean;
  textOffset?: { x: number; y: number };
  mnemonicIndex?: number;
  iconOffset?: { x: number; y: number };
}

export type ButtonProps = ButtonContentProps & ControlPlacement;
