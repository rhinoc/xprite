import type { PublicLanguage } from "./language.ts";

/** Titles and paths reserved for each content scope. */
export interface PlannedPageDefinition {
  path: string;
  title: Readonly<Record<PublicLanguage, string>>;
  /** Markdown body under `content/`, without the `.<language>.md` suffix. Languages
   * without a written file keep the title-only placeholder. */
  document?: string;
  children?: readonly PlannedPageDefinition[];
}
