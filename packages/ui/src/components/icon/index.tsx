import type { CSSProperties, HTMLAttributes } from "react";

import applicationSmallUrl from "$assets/icons/desktop/macos8/application-small.webp?url";
import applicationUrl from "$assets/icons/desktop/macos8/application.webp?url";
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

export interface IconProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "dangerouslySetInnerHTML"
> {
  kind?: IconKind;
  size?: number;
}

/** Decorative raster artwork or a glyph colored by the active theme. */
export function Icon({
  kind = IconKind.Application,
  size = DEFAULT_ICON_SIZE,
  className,
  style,
  ...props
}: IconProps) {
  const glyph = GLYPH_URLS[kind];
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
            ...style,
            "--ui-system-icon-size": `${size}px`,
            "--ui-system-icon-image": `url("${glyph}")`,
          } as CSSProperties
        }
      />
    );
  const artwork = ARTWORK_URLS[kind as keyof typeof ARTWORK_URLS];
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
