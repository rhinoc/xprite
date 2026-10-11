import type * as React from "react";

import type { FontRole } from "$/base/theme/theme-types";
import type { SurfaceViewport } from "$/components/canvas-surface";
import type { ControlPlacement } from "$/components/control-flow/placement";
import type { FocusRingBehavior } from "$/components/focus-ring";
import type { IconSize } from "$/components/icon";
import type { MenuItem } from "$/components/menu";
import type { UiPartName } from "$/components/theme/provider";

export enum ButtonAppearance {
  Quiet = "quiet",
}

export enum ButtonVariant {
  Push = "push",
  Icon = "icon",
  FlatIcon = "flat-icon",
  Color = "color",
  Tool = "tool",
  Split = "split",
  Tile = "tile",
}

export interface ButtonMenuConfig {
  label: string;
  description?: string;
  items: readonly MenuItem[];
  /** Width of the separate dropdown action, in scene pixels. */
  expandWidth?: number;
}

export interface ButtonSlots {
  leading?: React.ReactNode;
  content?: React.ReactNode;
  trailing?: React.ReactNode;
}

interface ButtonContentProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  children?: React.ReactNode;
  href?: never;
  /** Content composition for push or split buttons in normal flow layout. */
  slots?: ButtonSlots;
  /** Button structure and interaction. The push button is used when omitted. */
  variant?: Exclude<ButtonVariant, ButtonVariant.Tile>;
  /** Dropdown action for the split variant. */
  menu?: ButtonMenuConfig;
  /** Disable interaction for a preview while preserving its original artwork. */
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
  focusRing?: FocusRingBehavior;
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
  font?: FontRole;
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

type ColorButtonOptions = Pick<ButtonContentProps, "swatchColor" | "swatchValue" | "mask">;
type NonColorButtonOptions = { [Key in keyof ColorButtonOptions]?: never };
type QuietButtonOptions = { appearance?: ButtonAppearance.Quiet };
type ButtonVariantOptions =
  | (QuietButtonOptions &
      NonColorButtonOptions & {
        variant?: Exclude<
          ButtonVariant,
          ButtonVariant.Color | ButtonVariant.Split | ButtonVariant.Tile
        >;
        menu?: never;
      })
  | (ColorButtonOptions & { variant: ButtonVariant.Color; menu?: never; appearance?: never })
  | (QuietButtonOptions &
      NonColorButtonOptions & { variant: ButtonVariant.Split; menu?: ButtonMenuConfig });

export type ButtonProps = Omit<ButtonContentProps, "variant" | "menu" | keyof ColorButtonOptions> &
  ControlPlacement &
  ButtonVariantOptions;

/** Link buttons retain the browser's URL, new-tab, download, and keyboard behavior. */
export interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant.Push;
  appearance?: ButtonAppearance.Quiet;
  text?: string;
  slots?: ButtonSlots;
  disabled?: boolean;
  selected?: boolean;
}

interface TileContentProps {
  variant: ButtonVariant.Tile;
  text?: string;
  slots?: ButtonSlots;
  tileSize?: IconSize.Medium | IconSize.Large;
  compactOnSmallScreens?: boolean;
}
export interface ButtonTileProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, TileContentProps {
  href?: never;
}
export interface ButtonTileLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>, TileContentProps {
  href: string;
  disabled?: boolean;
}

export interface ButtonComponent {
  (props: ButtonProps & React.RefAttributes<HTMLButtonElement>): React.ReactElement | null;
  (props: ButtonLinkProps & React.RefAttributes<HTMLAnchorElement>): React.ReactElement | null;
  (props: ButtonTileProps & React.RefAttributes<HTMLButtonElement>): React.ReactElement | null;
  (props: ButtonTileLinkProps & React.RefAttributes<HTMLAnchorElement>): React.ReactElement | null;
  (
    props:
      | (ButtonProps & React.RefAttributes<HTMLButtonElement>)
      | (ButtonLinkProps & React.RefAttributes<HTMLAnchorElement>)
      | (ButtonTileProps & React.RefAttributes<HTMLButtonElement>)
      | (ButtonTileLinkProps & React.RefAttributes<HTMLAnchorElement>),
  ): React.ReactElement | null;
  displayName?: string;
}
