/** Read `?palette=` from a location search string. Unknown or empty values are ignored upstream. */
export function paletteSlugFromSearch(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(raw).get("palette");
  if (value == null) return null;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/^builtin:/, "");
  return slug || null;
}
