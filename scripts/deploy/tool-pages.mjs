import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { applyToolSearchMetadata } from "../../apps/growth/build/seo/index.ts";
import { localizedSiteHref, PUBLIC_LANGUAGES } from "../../apps/growth/content/site/language.ts";
import { TOOLS } from "../../apps/growth/content/tools/index.ts";
import { localizedToolPage } from "../../apps/tools/build/localized-pages.ts";

const TOOLS_PREFIX = "/tools/";
const INDEX_FILENAME = "index.html";

/**
 * Every public tool page in every language. The tools app builds one English page per tool
 * that prerenders all languages; each localized address gets that page in its own language,
 * then website search metadata for its address.
 */
export async function toolPages(toolsOutput, version, indexable) {
  const pages = await Promise.all(
    TOOLS.map(async (tool) => {
      const html = await readFile(
        resolve(toolsOutput, tool.path.slice(TOOLS_PREFIX.length), INDEX_FILENAME),
        "utf8",
      );
      return PUBLIC_LANGUAGES.map((language) => ({
        path: localizedSiteHref(tool.path, language),
        language,
        html: applyToolSearchMetadata(
          localizedToolPage(html, language),
          tool,
          language,
          version,
          indexable,
        ),
      }));
    }),
  );
  return pages.flat();
}
