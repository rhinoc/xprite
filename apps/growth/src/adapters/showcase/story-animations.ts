import type { ShowcaseStoryAnimationsMount } from "$/managers/ports/showcase";

const ANIMATION_SELECTOR = "img[data-showcase-animation-src]";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface StoryAnimationState {
  poster: string;
  animation: string;
  visible: boolean;
}

/** Decode animated previews only while the reader can see them. */
export const mountShowcaseStoryAnimations: ShowcaseStoryAnimationsMount = (element) => {
  const motion = window.matchMedia(REDUCED_MOTION_QUERY);
  const images = new Map<HTMLImageElement, StoryAnimationState>(
    [...element.querySelectorAll<HTMLImageElement>(ANIMATION_SELECTOR)].map(
      (image): [HTMLImageElement, StoryAnimationState] => [
        image,
        {
          poster: image.getAttribute("src")!,
          animation: image.dataset.showcaseAnimationSrc!,
          visible: false,
        },
      ],
    ),
  );
  const update = () => {
    for (const [image, state] of images) {
      const source =
        state.visible && !motion.matches && document.visibilityState === "visible"
          ? state.animation
          : state.poster;
      if (image.getAttribute("src") !== source) image.src = source;
    }
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const state = images.get(entry.target as HTMLImageElement);
      if (state) state.visible = entry.isIntersecting;
    }
    update();
  });
  for (const image of images.keys()) observer.observe(image);
  motion.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    observer.disconnect();
    motion.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", update);
    for (const [image, state] of images) {
      if (image.dataset.showcaseAnimationSrc === state.animation) image.src = state.poster;
    }
  };
};
