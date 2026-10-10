import type { PublicLanguage } from "./language.ts";

/** Titles and paths reserved for each content scope. */
export interface PlannedPageDefinition {
  path: string;
  title: Readonly<Record<PublicLanguage, string>>;
  children?: readonly PlannedPageDefinition[];
}
