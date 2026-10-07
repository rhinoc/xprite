import { ShowcaseStoryContent } from "$/components/showcase/showcase-story-content";
import type { ShowcaseLanguage } from "$/managers/showcase/showcase-language";

/** Server and interactive pages use the same component composition. */
export function ShowcaseStories({ language }: { language: ShowcaseLanguage }) {
  return <ShowcaseStoryContent language={language} />;
}
