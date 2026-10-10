# Growth app

This app owns public help pages, SEO metadata, and product showcases. Keep its
runtime, development server, build output, and public assets independent from
`apps/editor`.

- Follow the root repository rules and use its `dev:growth`, `build:growth`,
  and `preview:growth` scripts. Do not run builds or tests during development.
- Keep scene rendering, animation timing, and page composition here. Do not import
  editor app internals or editor-core for the presentation.
- Reuse `@xprite/ui` controls and geometry helpers. Use CSS Modules and tokens.
- Components, managers, and adapters are local organization for this scene;
  the editor's document/workspace architecture is not required here.
- Preserve editable Blender source, model generators, and asset provenance.
- Showcase assets live in `public/showcase/ipad/`; public help source lives in
  `content/help/`. The private `@xprite/growth-content` package exports guide and tool catalog
  data. The editor must not depend on this app's page runtime.
- `public/` is the shared, asset-only `@xprite/site-assets` workspace for brand
  files and example artwork. Consumers import original assets or publish selected
  files through `infra/public-package-assets.ts`; do not copy them into apps or
  create a package per artwork. Keep its package manifest out of public output.
- Reuse fonts from `packages/ui/assets/fonts/` through the public-page resource
  mapping instead of storing another font copy in `public/`.
- Keep website routing and search metadata in `build/`. Deploy by combining built
  apps through the root `build:site` pipeline, without modifying editor output.
- Keep shared page, language and navigation data in `content/site/`; individual
  content scopes own their definitions. Menu and footer use the same hierarchy.
- The localized Showcase is the website Home; `/` still opens the editor.
- Register title-only planned pages as non-indexable. Exclude them from discovery
  until they have published content, while retaining usable navigation routes.
- Keep article presentation in `src/components/articles/` and page renderers in
  `build/pages/`. Content modules must not import page runtime or build plugins.
