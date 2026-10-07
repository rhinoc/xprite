import {
  mountBackgroundMusic,
  readMusicMuted,
  readMusicVolume,
  saveMusicVolume,
} from "$/adapters/showcase/background-music";
import {
  applyShowcaseLanguage,
  observeShowcaseLanguage,
  readShowcaseLanguage,
} from "$/adapters/showcase/browser-language";
import { afterBrowserPaint } from "$/adapters/showcase/browser-scheduling";
import { observeShowcaseNavigation } from "$/adapters/showcase/showcase-navigation";
import type { ShowcasePort, ShowcaseScreenContent } from "$/managers/ports/showcase";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function createShowcasePort(content: ShowcaseScreenContent): ShowcasePort {
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  return {
    readMusicMuted,
    readMusicVolume,
    saveMusicVolume,
    mountMusic: mountBackgroundMusic,
    mount: async (host, language, signal) => {
      await afterBrowserPaint(signal);
      const { mountScene } = await import("$/adapters/showcase/three-showcase-scene");
      signal.throwIfAborted();
      return mountScene(host, content, language, signal);
    },
    readLanguage: readShowcaseLanguage,
    applyLanguage: applyShowcaseLanguage,
    observeLanguage: observeShowcaseLanguage,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
    prefersReducedMotion: () => reducedMotion.matches,
    observeVisibility: (element, callback) => {
      let inView = true;
      const changed = () => callback(inView && document.visibilityState === "visible");
      const observer = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        changed();
      });
      observer.observe(element);
      document.addEventListener("visibilitychange", changed);
      changed();
      return () => {
        observer.disconnect();
        document.removeEventListener("visibilitychange", changed);
      };
    },
    observeDeviceNavigation: observeShowcaseNavigation,
  };
}
