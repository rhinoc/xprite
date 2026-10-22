/** Where an export goes in the container, and what happened. */
export enum MiniToolTarget {
  Album = "album",
  Note = "note",
}

export enum MiniToolOutcome {
  /** Saved to the album, or the note editor opened. */
  Done = "done",
  /** A browser on this computer downloaded the file instead (development preview). */
  Downloaded = "downloaded",
}
