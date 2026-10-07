import { gsap } from "gsap";

import type { ShowcaseIntroMount } from "$/managers/ports/showcase";
import { scrollElementIntoView } from "@xprite/ui/utils";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const ENTER_DISTANCE = 8;
const ENTER_SECONDS = 0.4;
const LINE_STAGGER_SECONDS = 0.08;

/** The introduction belongs to the device window and follows its current demo. */
export const mountShowcaseIntro: ShowcaseIntroMount = (host, rows) => {
  const context = gsap.context(() => {
    if (!window.matchMedia(REDUCED_MOTION_QUERY).matches)
      gsap.fromTo(
        rows,
        { opacity: 0, y: ENTER_DISTANCE },
        {
          opacity: 1,
          y: 0,
          duration: ENTER_SECONDS,
          stagger: LINE_STAGGER_SECONDS,
          clearProps: "opacity,transform",
        },
      );
  }, host);
  let disposed = false;
  let anchorFrame: number | undefined;
  void document.fonts.ready.then(() => {
    if (disposed) return;
    anchorFrame = requestAnimationFrame(() => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target?.matches("[data-showcase-story], [data-showcase-hero]"))
        scrollElementIntoView(target, { block: "start", behavior: "instant" });
    });
  });
  return {
    dispose() {
      disposed = true;
      if (anchorFrame !== undefined) cancelAnimationFrame(anchorFrame);
      context.revert();
    },
  };
};
