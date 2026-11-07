import type { UiLanguage } from "$/i18n";

export interface HomeNewsEntry {
  slug: string;
  date: string;
  title: string;
  hook: string;
  locale: UiLanguage;
  image?: string;
}

interface NewsFrontmatter {
  title?: string;
  date?: string;
  hook?: string;
}

function parseFrontmatter(source: string, path: string): NewsFrontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${path}: missing frontmatter block.`);
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z]+):\s*(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!field) throw new Error(`${path}: bad frontmatter line ${JSON.stringify(line)}.`);
    fields[field[1]] = field[2] ?? field[3] ?? field[4]?.trim() ?? "";
  }
  return fields;
}

const modules = import.meta.glob<string>("./*/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});
const images = import.meta.glob<string>("./*/preview.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const collections = new Map<string, Partial<Record<UiLanguage, NewsFrontmatter>>>();
for (const [path, source] of Object.entries(modules)) {
  const match = path.match(/\.\/([a-z0-9-]+)\/(en|zh-CN|ja|ko|ru|pt-BR|es)\.md$/);
  if (!match) throw new Error(`${path}: expected ./<slug>/<locale>.md`);
  const [, slug, locale] = match as [string, string, UiLanguage];
  collections.set(slug, { ...collections.get(slug), [locale]: parseFrontmatter(source, path) });
}

const UI_LANGUAGES: readonly UiLanguage[] = ["en", "zh-CN", "ja", "ko", "ru", "pt-BR", "es"];

function pickLanguage(
  versions: Partial<Record<UiLanguage, NewsFrontmatter>>,
  language: UiLanguage,
): UiLanguage | undefined {
  if (versions[language]) return language;
  if (versions.en) return "en";
  return UI_LANGUAGES.find((candidate) => versions[candidate]);
}

export function homeNews(language: UiLanguage): HomeNewsEntry[] {
  const entries: HomeNewsEntry[] = [];
  for (const [slug, versions] of collections) {
    const locale = pickLanguage(versions, language);
    if (!locale) continue;
    const front = versions[locale]!;
    if (!front.title || !front.date) {
      throw new Error(`news/${slug}/${locale}.md: frontmatter needs title and date.`);
    }
    entries.push({
      slug,
      date: String(front.date),
      title: String(front.title),
      hook: front.hook ? String(front.hook) : "",
      locale,
      image: images[`./${slug}/preview.webp`],
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
