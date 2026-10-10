export enum ArticleFrontmatterField {
  Published = "published",
  Updated = "updated",
}

export interface ArticleFrontmatter {
  published?: string;
  updated?: string;
}

export interface ArticleDates {
  dateModified: string;
  datePublished?: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FRONTMATTER_FIELDS = new Set<string>(Object.values(ArticleFrontmatterField));

function articleDate(value: string, field: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) throw new TypeError(`Article frontmatter ${field} must be YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new TypeError(`Article frontmatter ${field} is not a real date.`);
  return value;
}

/** Reads an optional YAML-style block from the start of an article. */
export function parseArticleFrontmatter(source: string): {
  frontmatter: ArticleFrontmatter;
  body: string;
} {
  if (!source.startsWith("---")) return { frontmatter: {}, body: source };
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) throw new TypeError("Article frontmatter must close with ---.");
  const frontmatter: ArticleFrontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new TypeError(`Invalid article frontmatter line: ${line}`);
    const field = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!FRONTMATTER_FIELDS.has(field))
      throw new TypeError(`Unknown article frontmatter field: ${field}`);
    if (field in frontmatter) throw new TypeError(`Duplicate article frontmatter field: ${field}`);
    frontmatter[field as keyof ArticleFrontmatter] = articleDate(value, field);
  }
  return { frontmatter, body: source.slice(match[0].length) };
}

/** `updated` replaces the registry date. `published` is optional. */
export function resolveArticleDates(
  fallbackModified: string,
  frontmatter: ArticleFrontmatter,
): ArticleDates {
  return {
    dateModified: frontmatter.updated ?? fallbackModified,
    ...(frontmatter.published ? { datePublished: frontmatter.published } : {}),
  };
}
