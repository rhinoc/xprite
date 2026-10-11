import type * as React from "react";
import type { HTMLAttributes, ReactNode } from "react";

import type { FontRole } from "$/base/theme/theme-types";
import type { Border } from "$/components/border";
import type { SurfaceContentProps } from "$/components/surface/content";
import type { WindowDisclosureProps } from "$/components/window-workspace/disclosure";

export enum PanelBorderStyle {
  Single = "single",
  Etched = "etched",
}

export enum PanelTitleAlignment {
  Center = "center",
  Start = "start",
}

export interface PanelGroupProps
  extends Omit<HTMLAttributes<HTMLElement>, "title">, SurfaceContentProps {
  title?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  border?: Border<PanelBorderStyle>;
}

export enum PanelDismissBehavior {
  Remove = "remove",
  Collapse = "collapse",
}

export enum PanelNoteColor {
  Yellow = "yellow",
  Cyan = "cyan",
  Green = "green",
  Pink = "pink",
  Lilac = "lilac",
  Gray = "gray",
  White = "white",
}

export interface PanelNoteOptions {
  noteColor?: PanelNoteColor;
  dismissBehavior?: PanelDismissBehavior;
  onDismiss?(): void;
  dismissLabel?: string;
  collapseLabel?: string;
  expandLabel?: string;
  resizeLabel?: string;
}

export enum PanelVariant {
  Content = "content",
  Document = "document",
  Utility = "utility",
  Dialog = "dialog",
  Note = "note",
  NoteWindow = "note-window",
}

interface PanelContentProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title">, SurfaceContentProps {
  children?: React.ReactNode;
}

interface PanelCaptionProps {
  title?: React.ReactNode;
  extra?: React.ReactNode;
}

interface ContentPanelProps extends PanelContentProps, PanelCaptionProps {
  variant?: PanelVariant.Content;
  border?: Border<PanelBorderStyle>;
}

interface PanelWindowContentProps
  extends PanelContentProps, PanelCaptionProps, WindowDisclosureProps {
  /** Emphasize the window frame and titlebar with the theme's stronger styling. */
  emphasized?: boolean;
  footer?: React.ReactNode;
  /** Scroll overflowing window content with the active theme's scrollbars. */
  scrollable?: boolean;
}

interface WindowPanelProps<
  Variant extends PanelVariant.Document | PanelVariant.Utility,
> extends PanelWindowContentProps {
  variant: Variant;
}

interface DialogPanelProps extends PanelWindowContentProps {
  variant: PanelVariant.Dialog;
  titleAlign?: PanelTitleAlignment;
  titleFont?: FontRole;
}

export type PanelWindowProps =
  | WindowPanelProps<PanelVariant.Document>
  | WindowPanelProps<PanelVariant.Utility>
  | DialogPanelProps;

interface NotePanelProps extends PanelContentProps {
  variant: PanelVariant.Note;
  noteColor?: PanelNoteColor;
}

interface NoteWindowPanelProps
  extends PanelContentProps, PanelCaptionProps, WindowDisclosureProps, PanelNoteOptions {
  variant: PanelVariant.NoteWindow;
  footer?: React.ReactNode;
}

export type PanelProps =
  | ContentPanelProps
  | PanelWindowProps
  | NotePanelProps
  | NoteWindowPanelProps;
