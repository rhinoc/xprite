import type { ShowcaseIntroMount } from "$/managers/ports/showcase";

/** Section addresses stay on the desktop. The page does not pin a story window to the browser edge. */
export const mountShowcaseIntro: ShowcaseIntroMount = () => ({
  dispose() {},
});
