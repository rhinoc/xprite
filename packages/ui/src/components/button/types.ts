import type * as React from "react";

import type { SurfaceViewport } from "$/components/canvas-surface";
import type { ControlPlacement } from "$/components/control-flow/placement";
import type { MenuItem } from "$/components/menu";
import type { PixelFont } from "$/components/text";
import type { UiPartName } from "$/components/theme/appearance";

export enum ButtonAppearance {
  Default = "default",
  Quiet = "quiet",
}

export enum ButtonVariant {
  Standard = "standard",
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
  /** Content composition for standard or split buttons in normal flow layout. */
  slots?: ButtonSlots;
  /** Button presentation and interaction. Pixel artwork is the default for editor controls. */
  variant?: Exclude<ButtonVariant, ButtonVariant.Tile>;
  /** Quiet renders themed text and slots without a control frame. */
  appearance?: ButtonAppearance;
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

/** Link buttons retain the browser's URL, new-tab, download, and keyboard behavior. */
export interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant.Standard;
  appearance?: ButtonAppearance;
  text?: string;
  slots?: ButtonSlots;
  disabled?: boolean;
  selected?: boolean;
}

export enum ButtonTileSize {
  Regular = "regular",
  Compact = "compact",
}
interface TileContentProps {
  variant: ButtonVariant.Tile;
  text?: string;
  slots?: ButtonSlots;
  tileSize?: ButtonTileSize;
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
