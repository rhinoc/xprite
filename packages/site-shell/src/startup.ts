import patterns from "@xprite/ui/pattern-data" with { type: "json" };

export const DESKTOP_PREFERENCES_KEY = "xprite.site.desktop-preferences";
/** The colored pattern image the page runtime last applied, so first paint needs no templates. */
export const DESKTOP_PATTERN_IMAGE_KEY = "xprite.site.desktop-pattern-image";
const PATTERN_IMAGE_PREFIX = 'url("data:image/svg+xml,';

/** Select the same stored pattern and color pair before static HTML's first paint. */
export function desktopStartupScript(
  fallbackKey?: string,
  catalog: typeof patterns = patterns,
): string {
  const patternIds = catalog.map((pattern) => pattern.id);
  return `(()=>{let p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(DESKTOP_PREFERENCES_KEY)})||'{}')||{}}catch{}let mode=p.appearance;${fallbackKey ? `if(!mode)try{mode=localStorage.getItem(${JSON.stringify(fallbackKey)})}catch{}` : ""}if(!['light','dark','system'].includes(mode))mode='light';const root=document.documentElement;root.dataset.siteDesktop='true';root.dataset.toolAppearance=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;const ids=${JSON.stringify(patternIds)};if(ids.includes(p.pattern)){root.dataset.uiPatternOverride=p.pattern;let s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(DESKTOP_PATTERN_IMAGE_KEY)})||'{}')||{}}catch{}if(s.pattern===p.pattern&&typeof s.image==='string'&&s.image.startsWith(${JSON.stringify(PATTERN_IMAGE_PREFIX)}))root.style.setProperty('--ui-pattern-override-image',s.image)}})()`;
}
