import { Marked, type Tokens } from "marked";

import { FeatureIcon, type FeatureGroup } from "../../content/features/index.ts";

const GROUP_HEADING_DEPTH = 2;
const DESCRIPTION_SEPARATOR = /^[\s:：]+/;

/** Markdown links name the feature and lead to its working application. */
export function featureGroups(markdown: string): FeatureGroup[] {
  const groups: FeatureGroup[] = [];
  const parser = new Marked({ gfm: true, async: false });
  for (const token of parser.lexer(markdown)) {
    if (token.type === "heading" && token.depth === GROUP_HEADING_DEPTH) {
      groups.push({
        id: token.text
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\p{L}\p{N}_-]/gu, ""),
        title: token.text,
        items: [],
      });
    }
    if (token.type !== "list") continue;
    const group = groups.at(-1);
    if (!group) throw Error("Feature entries require a category heading.");
    const items = token.items.map((item) => {
      const paragraph = item.tokens[0] as Tokens.Text;
      const inline = paragraph.tokens ?? [];
      const link = inline[0];
      if (link?.type !== "link") throw Error("Feature entries require an application link.");
      if (!Object.values(FeatureIcon).includes(link.title as FeatureIcon))
        throw Error("Feature entries require a supported icon.");
      return {
        title: link.text,
        href: link.href,
        icon: link.title as FeatureIcon,
        description: inline
          .slice(1)
          .map((part) => ("text" in part ? part.text : part.raw))
          .join("")
          .replace(DESCRIPTION_SEPARATOR, ""),
      };
    });
    groups[groups.length - 1] = { ...group, items: [...group.items, ...items] };
  }
  return groups;
}
