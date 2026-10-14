import type { CSSProperties, HTMLAttributes } from "react";

import { ThemeIcon, type UiPartName } from "$/base/theme/theme-part";
import applicationSmallUrl from "$assets/icons/desktop/macos8/application-small.webp?url";
import applicationUrl from "$assets/icons/desktop/macos8/application.webp?url";
import applicationsFolderSmallUrl from "$assets/icons/desktop/macos8/applications-folder-small.webp?url";
import applicationsFolderUrl from "$assets/icons/desktop/macos8/applications-folder.webp?url";
import documentSmallUrl from "$assets/icons/desktop/macos8/document-small.webp?url";
import documentUrl from "$assets/icons/desktop/macos8/document.webp?url";
import searchSmallUrl from "$assets/icons/desktop/macos8/find-file-small.webp?url";
import searchUrl from "$assets/icons/desktop/macos8/find-file.webp?url";
import folderSmallUrl from "$assets/icons/desktop/macos8/folder-small.webp?url";
import folderUrl from "$assets/icons/desktop/macos8/folder.webp?url";
import mapSmallUrl from "$assets/icons/desktop/macos8/map-small.webp?url";
import mapUrl from "$assets/icons/desktop/macos8/map.webp?url";
import notePadSmallUrl from "$assets/icons/desktop/macos8/note-pad-small.webp?url";
import notePadUrl from "$assets/icons/desktop/macos8/note-pad.webp?url";
import imageSmallUrl from "$assets/icons/desktop/macos8/scrapbook-small.webp?url";
import imageUrl from "$assets/icons/desktop/macos8/scrapbook.webp?url";
import stickiesSmallUrl from "$assets/icons/desktop/macos8/stickies-small.webp?url";
import stickiesUrl from "$assets/icons/desktop/macos8/stickies.webp?url";
import trashFullSmallUrl from "$assets/icons/desktop/macos8/trash-full-small.webp?url";
import trashFullUrl from "$assets/icons/desktop/macos8/trash-full.webp?url";
import trashSmallUrl from "$assets/icons/desktop/macos8/trash-small.webp?url";
import trashUrl from "$assets/icons/desktop/macos8/trash.webp?url";
import helpUrl from "$assets/icons/system/help.svg?url";
import languageUrl from "$assets/icons/system/language.svg?url";
import volumeMutedUrl from "$assets/icons/system/volume-muted.svg?url";
import volumeUrl from "$assets/icons/system/volume.svg?url";

import styles from "$/components/icon/icon.module.css";

export enum IconKind {
  Folder = "folder",
  Document = "document",
  Application = "application",
  Search = "search",
  Image = "image",
  Map = "map",
  Stickies = "stickies",
  NotePad = "note-pad",
  ApplicationsFolder = "applications-folder",
  Trash = "trash",
  TrashFull = "trash-full",
  Help = "help",
  Language = "language",
  Volume = "volume",
  VolumeMuted = "volume-muted",
}
const ARTWORK_URLS = {
  [IconKind.Folder]: { regular: folderUrl, small: folderSmallUrl },
  [IconKind.Document]: { regular: documentUrl, small: documentSmallUrl },
  [IconKind.Application]: { regular: applicationUrl, small: applicationSmallUrl },
  [IconKind.Search]: { regular: searchUrl, small: searchSmallUrl },
  [IconKind.Image]: { regular: imageUrl, small: imageSmallUrl },
  [IconKind.Map]: { regular: mapUrl, small: mapSmallUrl },
  [IconKind.Stickies]: { regular: stickiesUrl, small: stickiesSmallUrl },
  [IconKind.NotePad]: { regular: notePadUrl, small: notePadSmallUrl },
  [IconKind.ApplicationsFolder]: {
    regular: applicationsFolderUrl,
    small: applicationsFolderSmallUrl,
  },
  [IconKind.Trash]: { regular: trashUrl, small: trashSmallUrl },
  [IconKind.TrashFull]: { regular: trashFullUrl, small: trashFullSmallUrl },
};

const GLYPH_URLS: Partial<Record<IconKind, string>> = {
  [IconKind.Help]: helpUrl,
  [IconKind.Language]: languageUrl,
  [IconKind.Volume]: volumeUrl,
  [IconKind.VolumeMuted]: volumeMutedUrl,
};
export enum IconSize {
  Small = 16,
  Medium = 40,
  Large = 64,
}
const DEFAULT_ICON_SIZE = IconSize.Small;
const SMALL_ICON_SIZE = IconSize.Small;

interface IconAttributes extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "dangerouslySetInnerHTML" | "color"
> {}
type GlyphIconKind = IconKind.Help | IconKind.Language | IconKind.Volume | IconKind.VolumeMuted;
interface AtlasPresentationOptions {
  scale?: number;
  x?: number;
  y?: number;
  hovered?: boolean;
  pressed?: boolean;
  focused?: boolean;
}
type NonAtlasPresentationOptions = { [Key in keyof AtlasPresentationOptions]?: never };
interface CatalogIconProps extends IconAttributes, NonAtlasPresentationOptions {
  kind?: IconKind;
  size?: number;
  color?: never;
}
interface GlyphIconProps extends IconAttributes, NonAtlasPresentationOptions {
  kind: GlyphIconKind;
  size?: number;
  color?: string;
}
interface AtlasIconProps extends IconAttributes, AtlasPresentationOptions {
  kind: UiPartName;
  size?: never;
  color?: string;
}
export type IconProps = CatalogIconProps | GlyphIconProps | AtlasIconProps;

/** Draw the named desktop artwork, system glyph or active-theme icon. */
export function Icon({
  kind = IconKind.Application,
  size = DEFAULT_ICON_SIZE,
  color,
  scale,
  x,
  y,
  hovered,
  pressed,
  focused,
  className,
  style,
  ...props
}: IconProps) {
  const glyph = GLYPH_URLS[kind as IconKind];
  if (glyph)
    return (
      <span
        aria-hidden="true"
        {...props}
        className={[styles.root, className].filter(Boolean).join(" ")}
        data-slot="system-icon"
        data-kind={kind}
        style={
          {
            color,
            ...style,
            "--ui-system-icon-size": `${size}px`,
            "--ui-system-icon-image": `url("${glyph}")`,
          } as CSSProperties
        }
      />
    );
  const artwork = ARTWORK_URLS[kind as keyof typeof ARTWORK_URLS];
  if (!artwork)
    return (
      <ThemeIcon
        {...props}
        part={kind as UiPartName}
        color={color}
        scale={scale}
        x={x}
        y={y}
        hovered={hovered}
        pressed={pressed}
        focused={focused}
        className={className}
        style={style}
      />
    );
  return (
    <img
      {...props}
      className={className}
      style={style}
      src={size <= SMALL_ICON_SIZE ? artwork.small : artwork.regular}
      width={size}
      height={size}
      alt=""
    />
  );
}
