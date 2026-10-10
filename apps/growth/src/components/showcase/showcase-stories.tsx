import { useEffect, useRef } from "react";

import { ShowcaseStoryContent } from "$/components/showcase/showcase-story-content";
import type { ShowcaseStoryAnimationsMount } from "$/managers/ports/showcase";
import type { ShowcaseLanguage } from "$/managers/showcase/showcase-language";

/** Server and interactive pages use the same component composition. */
export function ShowcaseStories({
  language,
  mountAnimations,
}: {
  language: ShowcaseLanguage;
  mountAnimations: ShowcaseStoryAnimationsMount;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) return mountAnimations(host.current);
  }, [language, mountAnimations]);
  return <ShowcaseStoryContent language={language} hostRef={host} />;
}
