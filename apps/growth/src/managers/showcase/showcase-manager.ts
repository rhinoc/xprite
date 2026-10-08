import type { ShowcaseMusic, ShowcasePort, ShowcaseScene } from "$/managers/ports/showcase";
import {
  DEVICE_NAME_SCRAMBLE_MILLISECONDS,
  DEVICE_NAME_TICK_MILLISECONDS,
  deviceNameFrame,
} from "$/managers/showcase/device-name-motion";
import {
  advanceFilmTime,
  FILM_DURATION,
  FILM_SETTLE_DURATION,
  FILM_START,
  FILM_INTERACTION_START,
  FILM_OUTRO_START,
  MILLISECONDS_PER_SECOND,
} from "$/managers/showcase/ipad-story";
import {
  DEFAULT_MUSIC_VOLUME,
  normalizeMusicVolume,
  musicVolumeGain,
  ShowcaseMusicVolume,
} from "$/managers/showcase/music-volume";
import { adjacentDevice, ShowcaseDevice } from "$/managers/showcase/showcase-device";
import { SHOWCASE_COPY, ShowcaseLanguage } from "$/managers/showcase/showcase-language";

export enum ShowcaseStatus {
  Loading = "loading",
  Ready = "ready",
  Error = "error",
}

interface ShowcaseState {
  playing: boolean;
  started: boolean;
  editingHighlighted: boolean;
  status: ShowcaseStatus;
  language: ShowcaseLanguage;
  device: ShowcaseDevice;
  deviceText: string;
  musicMuted: boolean;
  musicVolume: ShowcaseMusicVolume;
  musicAvailable: boolean;
}

// A slow rendered frame should not stretch every entrance into an extra hold.
const MAX_FRAME_SECONDS = 0.25;
const RESULT_HOLD_SECONDS = 2;

export class ShowcaseManager {
  private state: ShowcaseState = {
    playing: false,
    started: false,
    editingHighlighted: false,
    status: ShowcaseStatus.Loading,
    language: ShowcaseLanguage.English,
    device: ShowcaseDevice.Computer,
    deviceText: SHOWCASE_COPY[ShowcaseLanguage.English].titleEnd[ShowcaseDevice.Computer].device,
    musicMuted: false,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    musicAvailable: true,
  };
  private listeners = new Set<() => void>();
  private scene?: ShowcaseScene;
  private music?: ShowcaseMusic;
  private frame?: number;
  private previousTime = 0;
  private filmTime = FILM_START;
  private endingTime = 0;
  private mounted = 0;
  private removeVisibility?: () => void;
  private removeLanguage?: () => void;
  private removeDeviceSelection?: () => void;
  private removeDeviceNavigation?: () => void;
  private removeInvalidation?: () => void;
  private visible = true;
  private dragging = false;
  private loading?: AbortController;
  private deviceNameElapsed = DEVICE_NAME_SCRAMBLE_MILLISECONDS;
  private deviceNameTick = -1;

  constructor(private readonly port: ShowcasePort) {
    this.state.language = port.readLanguage();
    this.state.musicMuted = port.readMusicMuted();
    this.state.musicVolume = normalizeMusicVolume(port.readMusicVolume());
    this.state.deviceText = SHOWCASE_COPY[this.state.language].titleEnd[this.state.device].device;
    port.applyLanguage(this.state.language);
  }

  getSnapshot = () => this.state;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };

  private update(next: Partial<ShowcaseState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((notify) => notify());
  }

  async mount(element: HTMLElement): Promise<void> {
    this.unmount();
    const generation = ++this.mounted;
    this.removeLanguage = this.port.observeLanguage(this.setLanguage);
    this.loading = new AbortController();
    this.endingTime = 0;
    this.filmTime = FILM_START;
    this.deviceNameElapsed = DEVICE_NAME_SCRAMBLE_MILLISECONDS;
    this.deviceNameTick = -1;
    this.update({
      status: ShowcaseStatus.Loading,
      playing: false,
      started: false,
      editingHighlighted: false,
      musicAvailable: true,
      deviceText: SHOWCASE_COPY[this.state.language].titleEnd[this.state.device].device,
    });
    this.music = this.port.mountMusic(
      this.state.musicMuted,
      musicVolumeGain(this.state.musicVolume),
      () => {
        if (generation === this.mounted) this.update({ musicAvailable: false, musicMuted: true });
      },
    );
    try {
      const scene = await this.port.mount(element, this.state.language, this.loading.signal);
      if (generation !== this.mounted) {
        scene.dispose();
        return;
      }
      this.scene = scene;
      this.removeInvalidation = scene.observeInvalidation(this.wake);
      this.removeDeviceSelection = scene.observeDeviceSelection(this.selectDevice);
      this.removeDeviceNavigation = this.port.observeDeviceNavigation(
        element,
        this.moveDevice,
        () => this.state.started && this.visible,
      );
      await scene.setLanguage(this.state.language);
      if (generation !== this.mounted) return;
      this.update({
        status: ShowcaseStatus.Ready,
        playing: this.state.started,
      });
      scene.render(this.filmTime);
      this.removeVisibility = this.port.observeVisibility(element, (visible) => {
        this.visible = visible;
        this.previousTime = this.port.now();
        if (!visible && this.frame !== undefined) {
          this.port.cancelFrame(this.frame);
          this.frame = undefined;
        } else if (visible) this.wake();
      });
      this.previousTime = this.port.now();
    } catch (error) {
      if (generation === this.mounted) {
        console.error("Unable to mount showcase", error);
        this.update({ status: ShowcaseStatus.Error, playing: false });
      }
    }
  }

  private wake = () => {
    if (
      !this.visible ||
      !this.scene ||
      this.state.status !== ShowcaseStatus.Ready ||
      this.frame !== undefined
    )
      return;
    this.previousTime = this.port.now();
    this.frame = this.port.requestFrame(this.tick);
  };

  private tick = () => {
    this.frame = undefined;
    const now = this.port.now();
    const elapsed = Math.max(
      0,
      Math.min(MAX_FRAME_SECONDS, (now - this.previousTime) / MILLISECONDS_PER_SECOND),
    );
    if (
      this.visible &&
      this.state.started &&
      this.deviceNameElapsed < DEVICE_NAME_SCRAMBLE_MILLISECONDS
    ) {
      this.deviceNameElapsed = Math.min(
        DEVICE_NAME_SCRAMBLE_MILLISECONDS,
        this.deviceNameElapsed + Math.max(0, now - this.previousTime),
      );
      const tick = Math.floor(this.deviceNameElapsed / DEVICE_NAME_TICK_MILLISECONDS);
      if (
        tick !== this.deviceNameTick ||
        this.deviceNameElapsed === DEVICE_NAME_SCRAMBLE_MILLISECONDS
      ) {
        this.deviceNameTick = tick;
        const deviceText = deviceNameFrame(
          SHOWCASE_COPY[this.state.language].titleEnd[this.state.device].device,
          this.deviceNameElapsed,
          this.port.prefersReducedMotion(),
        );
        if (deviceText !== this.state.deviceText) this.update({ deviceText });
      }
    }
    const demoReady = this.scene?.isDemoReady() ?? false;
    if (this.state.playing && this.visible && demoReady) {
      let time = advanceFilmTime(this.filmTime, elapsed);
      if (time >= FILM_DURATION) {
        this.endingTime += time - FILM_DURATION;
        time = FILM_DURATION;
      }
      this.filmTime = time;
      if (time >= FILM_OUTRO_START && !this.state.editingHighlighted)
        this.update({ editingHighlighted: true });
      if (this.endingTime >= FILM_SETTLE_DURATION + RESULT_HOLD_SECONDS) {
        this.scene?.showOverview();
        this.update({ started: false, playing: false, editingHighlighted: false });
      }
    }
    if (this.visible) this.scene?.render(this.filmTime + this.endingTime);
    this.previousTime = now;
    const animateName =
      this.state.started && this.deviceNameElapsed < DEVICE_NAME_SCRAMBLE_MILLISECONDS;
    const animateFilm = this.state.playing && this.scene?.isDemoReady();
    if (this.visible && (animateName || animateFilm || this.scene?.needsFrame()))
      this.frame = this.port.requestFrame(this.tick);
  };

  selectDevice = (device: ShowcaseDevice) => {
    if (this.state.status !== ShowcaseStatus.Ready) return;
    this.scene?.setDevice(device);
    if (device === this.state.device && this.state.started) return;
    this.endingTime = 0;
    this.previousTime = this.port.now();
    const reducedMotion = this.port.prefersReducedMotion();
    this.deviceNameElapsed = reducedMotion ? DEVICE_NAME_SCRAMBLE_MILLISECONDS : 0;
    this.deviceNameTick = -1;
    this.filmTime = reducedMotion ? FILM_DURATION : FILM_INTERACTION_START;
    this.update({
      device,
      deviceText: deviceNameFrame(
        SHOWCASE_COPY[this.state.language].titleEnd[device].device,
        this.deviceNameElapsed,
        reducedMotion,
      ),
      started: true,
      editingHighlighted: reducedMotion,
      playing: true,
    });
    this.wake();
  };

  moveDevice = (direction: number) => {
    if (this.dragging || !this.state.started) return;
    this.selectDevice(adjacentDevice(this.state.device, direction));
  };

  beginDrag = () => {
    if (!this.state.started) return;
    this.dragging = true;
    this.scene?.beginDrag();
  };

  finishDrag = (direction: number) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.moveDevice(direction);
  };

  previewDrag = (progress: number) => {
    this.scene?.previewDrag(progress);
  };

  setLanguage = (language: ShowcaseLanguage) => {
    if (language === this.state.language) return;
    this.port.applyLanguage(language);
    const scene = this.scene;
    if (scene) {
      void scene.setLanguage(language).then(
        () => {
          if (scene === this.scene) this.wake();
        },
        (error: unknown) => {
          if (scene !== this.scene || language !== this.state.language) return;
          console.error("Unable to load showcase language", error);
          this.update({ status: ShowcaseStatus.Error, playing: false });
        },
      );
    }
    this.deviceNameElapsed = DEVICE_NAME_SCRAMBLE_MILLISECONDS;
    this.update({
      language,
      deviceText: SHOWCASE_COPY[language].titleEnd[this.state.device].device,
    });
  };

  previewDevice = (device?: ShowcaseDevice) => {
    if (!this.state.started) this.scene?.previewDevice(device);
  };

  setMusicVolume = (volume: ShowcaseMusicVolume) => {
    if (!this.state.musicAvailable) return;
    const musicMuted = volume === ShowcaseMusicVolume.Muted;
    const musicVolume = musicMuted ? this.state.musicVolume : normalizeMusicVolume(volume);
    this.update({ musicVolume, musicMuted });
    this.port.saveMusicVolume(musicVolume);
    this.music?.setVolume(musicVolumeGain(musicVolume));
    this.music?.setMuted(musicMuted);
  };

  unmount() {
    this.music?.dispose();
    this.music = undefined;
    this.dragging = false;
    ++this.mounted;
    this.loading?.abort();
    this.loading = undefined;
    if (this.frame !== undefined) this.port.cancelFrame(this.frame);
    this.frame = undefined;
    this.removeVisibility?.();
    this.removeVisibility = undefined;
    this.removeLanguage?.();
    this.removeLanguage = undefined;
    this.removeInvalidation?.();
    this.removeInvalidation = undefined;
    this.removeDeviceSelection?.();
    this.removeDeviceSelection = undefined;
    this.scene?.dispose();
    this.removeDeviceNavigation?.();
    this.removeDeviceNavigation = undefined;
    this.scene = undefined;
  }
}
