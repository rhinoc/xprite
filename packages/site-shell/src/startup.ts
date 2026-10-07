import patterns from "@xprite/ui/pattern-data" with { type: "json" };

export const DESKTOP_PREFERENCES_KEY = "xprite.site.desktop-preferences";

/** Select the same stored pattern and color pair before static HTML's first paint. */
export function desktopStartupScript(
  fallbackKey?: string,
  catalog: typeof patterns = patterns,
): string {
  const templates = Object.fromEntries(
    catalog
      .filter((pattern) => "svgTemplate" in pattern)
      .map((pattern) => [
        pattern.id,
        {
          svg: pattern.svgTemplate,
          foreground: pattern.defaultForeground,
          background: pattern.defaultBackground,
        },
      ]),
  );
  const patternIds = catalog.map((pattern) => pattern.id);
  return `(()=>{let p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(DESKTOP_PREFERENCES_KEY)})||'{}')||{}}catch{}let mode=p.appearance;${fallbackKey ? `if(!mode)try{mode=localStorage.getItem(${JSON.stringify(fallbackKey)})}catch{}` : ""}if(!['light','dark','system'].includes(mode))mode='light';const root=document.documentElement;root.dataset.siteDesktop='true';root.dataset.toolAppearance=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;const ids=${JSON.stringify(patternIds)};if(ids.includes(p.pattern)){root.dataset.uiPatternOverride=p.pattern;const templates=${JSON.stringify(templates)},t=templates[p.pattern];if(t){const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;const svg=t.svg.replaceAll('{{foreground}}',color(p.patternForeground,t.foreground)).replaceAll('{{background}}',color(p.patternBackground,t.background));root.style.setProperty('--ui-pattern-override-image','url("data:image/svg+xml,'+encodeURIComponent(svg)+'")')}}})()`;
}
