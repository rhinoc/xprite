import type { ShowcaseMusic } from "$/managers/ports/showcase";

const MUSIC_URL = "/showcase/audio/tokyo-lofi.mp3";
const MUSIC_VOLUME_KEY = "xprite.showcase.music.volume";
const MUSIC_MUTED_KEY = "xprite.showcase.music.muted";
const MUTED_VALUE = "true";
const BLOCKED_PLAY_ERROR = "NotAllowedError";
const CANCELLED_PLAY_ERROR = "AbortError";

export function readMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_MUTED_KEY) === MUTED_VALUE;
  } catch {
    return false;
  }
}

export function readMusicVolume(): number | undefined {
  try {
    const value = localStorage.getItem(MUSIC_VOLUME_KEY);
    return value === null ? undefined : Number(value);
  } catch {
    return undefined;
  }
}
export function saveMusicVolume(volume: number): void {
  try {
    localStorage.setItem(MUSIC_VOLUME_KEY, String(volume));
  } catch {
    // Sound settings remain usable when browser storage is unavailable.
  }
}

/** Playback is activated explicitly by the device demo workflow. */
export function mountBackgroundMusic(
  muted: boolean,
  volume: number,
  onUnavailable: () => void,
): ShowcaseMusic {
  const audio = new Audio(MUSIC_URL);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = volume;
  audio.muted = muted;
  let activated = false;
  let disposed = false;
  let unavailable = false;

  const failed = () => {
    if (disposed || unavailable) return;
    unavailable = true;
    audio.pause();
    onUnavailable();
  };
  const play = () => {
    if (!activated || disposed || unavailable || audio.muted || document.hidden || !audio.paused)
      return;
    void audio.play().then(
      () => {
        if (disposed || audio.muted || document.hidden) audio.pause();
      },
      (error: unknown) => {
        if (
          error instanceof DOMException &&
          (error.name === BLOCKED_PLAY_ERROR || error.name === CANCELLED_PLAY_ERROR)
        )
          return;
        failed();
      },
    );
  };
  const visibility = () => {
    if (document.hidden) audio.pause();
    else play();
  };
  audio.addEventListener("error", failed);
  document.addEventListener("visibilitychange", visibility);

  return {
    start() {
      activated = true;
      play();
    },
    setMuted(nextMuted) {
      audio.muted = nextMuted;
      try {
        localStorage.setItem(MUSIC_MUTED_KEY, String(nextMuted));
      } catch {
        // The toggle still works when browser storage is unavailable.
      }
      if (nextMuted) audio.pause();
      else play();
    },
    setVolume(nextVolume) {
      audio.volume = nextVolume;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      audio.removeEventListener("error", failed);
      document.removeEventListener("visibilitychange", visibility);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}
