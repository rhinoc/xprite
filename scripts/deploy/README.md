# Editor deployment

The editor and public guides are static Vite outputs. A generated Makers
middleware permits published files and explicit editor entry points, and returns
the custom page with HTTP 404 for everything else. It uses no database, secrets,
or application server. PostHog sends events directly from the browser to its
US/EU ingestion endpoint.

For itch.io HTML hosting, use the separate [itch.io distribution workflow](ITCH.md).

Its output uses relative URLs and hash routes and does not use EdgeOne commands.

## Repository configuration

- `edgeone.json`: editor build/output settings and cache rules. It also works
  with EdgeOne's Git integration when the project root is the repository root.
- `.github/workflows/deploy-editor.yml`: tag and manual deployments through the
  pinned EdgeOne CLI (`edgeone@1.6.41` in the lockfile).
- `scripts/deploy/editor-deployment.mjs`: configuration validation, static
  artifact preparation, upload and verification of the deployed revision.

The release workflow controls deployment. Use an EdgeOne **direct upload**
project. CLI uploads cannot update a project created using Git integration.
Do not also enable EdgeOne's branch-triggered Git deployment for this project.
The CLI creates a direct upload project with the configured name if it does not
already exist. This happens only when the publish step is actually run.

## Custom domains

The production project binds `xprite.cc` and `www.xprite.cc`. Bind both domains
to the production environment in the Makers domain console. Both the apex and
`www` DNS records point to the project's `xprite.cc.pages.dnsoe8.com` address.
Deploy a free HTTPS certificate for each: the apex uses DNS delegation, while
`www` uses automatic verification. Retain the DNS ownership and certificate
delegation records; automatic verification also requires the domain to remain
pointed at Makers. Root-domain CNAME records in Spaceship are flattened to A records.

The committed `edgeone.json` uses Makers' `$wwwhost` → `$host` redirect with
status `301` to canonicalize `www` custom domains while retaining the path and
query string. This host redirect retains the request scheme. Forced HTTPS on the
apex completes HTTP requests with a second `301`; HTTPS `www` requests redirect
directly to the HTTPS apex. Preset `edgeone.dev` URLs are unaffected by this
custom-domain rule. The deployment preparation script includes the redirect in
every static upload.

Verify both HTTP and HTTPS requests to `www.xprite.cc`, including a nested path
and query parameters, and check that the final URL is the corresponding
`https://xprite.cc` URL. Also verify that the apex `release.json` still serves the
deployed production revision.

## Search indexing and sharing

The showcase has separate `/showcase/en/` and `/showcase/zh-CN/` static entry
pages. Both are required by assembly and deployment validation. Growth generates
localized titles, descriptions, Open Graph metadata, self canonical links, and
reciprocal `hreflang` plus `x-default` annotations before assembly. The sitemap
lists both language URLs. `edgeone.json` normalizes trailing slashes and directs
the neutral showcase entry to English; language selection uses no query string.

The production website uses `https://xprite.cc/` as its canonical application URL.
The editor keeps Home at `/` and documents at `/editor`; `/home`, `/home/` and
`/index.html` redirect to `/`. The explicit `/editor` rewrites preserve valid app
entry points. Deployment preparation bundles `middleware.js` with the exact
resource inventory and current `404.html`; this prevents Makers' automatic SPA
fallback from returning the editor with HTTP 200 for nonexistent paths. Middleware
is generated after `release.json` and serving configuration are written. The pinned
CLI runs inside the artifact directory so it discovers this middleware.

Public guides live at `/help/en/` and `/help/zh-CN/`. The Vite plugin in
`apps/growth/build/public-pages.ts` renders the same Markdown that the editor's Help
menu reads, validates section links and image catalog entries, and copies only
referenced screenshots. Images carry their catalog dimensions; the guides need
no editor JavaScript. Production guides have individual titles, descriptions,
canonical URLs and reciprocal `hreflang` links. Both guide URLs are included in
the generated sitemap. The editor layout is unchanged, and guide bodies remain
sourced from the formal Markdown files.

The English compare column at `/compare/` and its three initial article routes
are rendered from the growth article manifest before assembly. Assembly and
deployment preparation require these files. The column includes canonical URLs,
article sharing metadata, structured data, and sitemap entries; reserve drafts
and research dossiers have no public route. Compare aliases normalize to trailing
slashes with query-preserving redirects, and unknown slugs return HTTP 404.
Its editor links use only the three fixed compare campaigns described in the
[editorial workflow](../../apps/growth/content/compare/README.md).

The file viewer at `/tools/viewer/` is the separate `apps/tools` application, with its
own entry point, managers, browser adapters and CSS Modules. It uses the shared
editor-core Aseprite codec and timeline renderer without mounting the editor.
Previewing does not write editor workspaces, preferences, recents or recovery
data. Continue editing stages the original file in an isolated, short-lived
IndexedDB record and opens `/editor` with a one-use transfer fragment. The editor
consumes and deletes that record, removes the fragment and imports the project
through its ordinary workspace API after startup. Other editor URLs never read
the transfer store. Its static HTML has its own metadata and sitemap entry.

The independent growth server (`pnpm run dev:growth`, port 5175) serves public
guides and `/showcase` directly from source. Unknown public paths return the
custom HTTP 404 page in growth development and Vite preview.

`pnpm run build:site` builds editor, growth, tools, and gallery independently and merges
their outputs into `.tmp/site`. It applies website search metadata to the merged
editor HTML without changing `apps/editor/dist`. Growth owns guide source,
showcase assets, static public pages, and SEO code; the editor reads only the
small `@xprite/growth-content/help` data module. The deployment command validates
all required entry files in `.tmp/site` before staging an upload. Gallery assets
use `/gallery/` in both development and production. Its component and icon routes
come from `apps/gallery/build/generated-routes.json`, regenerated alongside the
component catalog by `gallery:generate`; staging adds exact rewrites and middleware
entries for those routes, including direct visits and reloads. Gallery remains
`noindex, follow` and is excluded from the public sitemap.

Shared website icon links are defined in `infra/site-html.ts`. Vite entry templates
use `<!-- xprite-site-icons -->`; generated guide and article HTML use `siteIcons()`.
The same configuration covers the error page. Editor icon links retain relative
URLs for embedded builds, while public pages use domain-root URLs independent of
the app's asset base. Keep page-specific titles, descriptions, theme colors and
editor installation metadata with their owning pages.

`pnpm run dev` starts the independent app servers and connects them through the
shared development proxy. Website navigation stays on the current origin;
`/tools/` and `/gallery/` keep their own runtime and asset paths. The backend ports
are implementation details of the development servers, not navigation destinations.

The initial HTML contains visible product text during startup. The assembled
production website includes canonical and Open Graph metadata, a large social
preview, and basic WebApplication structured data without ratings. `robots.txt`
advertises the sitemap containing the editor, public guides, viewer, and iPad
showcase; add entries only for independent, indexable content.

The HTML startup screen is outside the React root. The browser platform retains
that same screen and animated canvas until workspace startup finishes, including
React StrictMode effect replay. Keep its styles aligned with the React fallback
in `app.css`; startup failures must dismiss the screen so error recovery stays visible.

The startup recovery region uses `data-nosnippet` so Google cannot use module
loading errors as the site's search description. Service-worker registration
failures are recorded locally with the `service-worker` diagnostic source;
offline caching is optional and must not produce an unhandled rejection in
restricted browsers or search rendering tools.

Startup text uses a small, preloaded WOFF2 subset of the existing pixel font.
After changing the HTML startup copy, regenerate the checked-in font with
`pnpm run assets:startup-font`. The asset generator requires Python `fonttools`
and `brotli`, as does the existing font fixture workflow; these are not browser
or deployment runtime dependencies. The startup animation acts as the product
heading, followed by a separate subtitle and description. Both remain ordinary
accessible text and can wrap on narrow screens.

The generator also updates the font's content version in the HTML preload,
font-face and service-worker precache URLs. The worker precaches the tiny font
and discards older app-shell caches, so offline startup keeps the same typography
and cannot reuse an older subset after copy changes.

Preview builds omit canonical and structured data, set `noindex, follow`, and
receive the same directive as an `X-Robots-Tag` response header during package
preparation. Preview packages omit the production sitemap. Local development
and itch.io embeds also use `noindex, follow`; the itch.io listing is independent
of its embedded application. No search-engine accounts or DNS settings are
changed by these build steps.

After deploying, verify the production canonical, sitemap XML, social image,
`/home` redirect, `/editor` response and an unknown URL's 404 status. Confirm
`www.xprite.cc` has a valid certificate and redirects to the apex domain, then
submit the sitemap through Google Search Console and inspect the rendered page.

## One-time account configuration

Add the following under GitHub Settings → Secrets and variables → Actions,
or in the matching `production` / `preview` GitHub Environment. Creating the
account token and setting these values is separate from committing this workflow.

| Kind     | Name                         | Value                                                                                                           |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Secret   | `EDGEONE_API_TOKEN`          | EdgeOne Makers API Token from your account; required for both environments.                                     |
| Variable | `EDGEONE_AREA`               | Required: `overseas` excludes mainland nodes; `global` includes mainland nodes. Match your chosen project area. |
| Variable | `EDGEONE_PROJECT_NAME`       | Optional; defaults to `xprite`.                                                                                 |
| Variable | `VITE_POSTHOG_PROJECT_TOKEN` | Public `phc_…` token for the Xprite PostHog project; required for production.                                   |
| Variable | `VITE_POSTHOG_REGION`        | `US` for the existing Xprite project; defaults to `US`.                                                         |
| Secret   | `POSTHOG_CLI_API_KEY`        | Optional private key for source map uploads. Never use a `VITE_` prefix.                                        |
| Variable | `POSTHOG_CLI_PROJECT_ID`     | `642366` when enabling uploads to the existing Xprite project. Required only with the source map key.           |

The account location (China / international account) and acceleration area are
different settings. The API token selects the account; `EDGEONE_AREA` selects
the acceleration area. Mainland-node acceleration requires a filed custom domain.
Using `overseas` does not guarantee mainland reachability; verify it with the
actual site/domain and target networks.

Private keys are read only by validation/build/upload steps, never written into
the static package. The PostHog project token is public and is intentionally
compiled into the production JavaScript. Ignored local `.env.local` files are
not available in Actions and must not be uploaded or committed.

No source map key is required to release. Without it, maps are neither generated
nor uploaded; error events still work, with minified stacks. When configured,
the existing root build injects/uploads maps and deletes them before packaging.
An upload failure blocks deployment of that build.

## Publishing

First commit the workflow to the default branch. Tags must point to commits
containing this deployment tooling.

Push a version tag to deploy automatically to production:

```sh
git tag v0.1.0
git push origin v0.1.0
```

For a manual deployment, open Actions → Deploy editor → Run workflow:

1. Select the workflow branch.
2. Optionally enter the tag or commit to build. Empty uses the selected branch.
3. Select `production` or `preview` (manual default: preview).

**The first deployment must use production.** EdgeOne CLI requires an existing
successful production deployment before allowing a preview deployment. Preview
builds clear the PostHog token and source map credentials; test interactions do
not enter the production project.

The workflow uses Node 24 and pnpm 11.1.3, records the actual checked-out SHA as
`POSTHOG_RELEASE`, runs `pnpm run build:site`, and prepares the static files in
the ignored `.tmp/deploy/editor/` directory. It saves that package as a GitHub
artifact before uploading it. Same-environment deployments do not run concurrently.

Uploading passes the explicit artifact directory to `edgeone makers deploy`,
so the CLI does not rebuild. The serving configuration and `release.json` travel
with the artifact; the source/install commands do not. Package preparation rejects
hidden files, symlinks and leftover source maps.

After upload, the script verifies the commit/environment in `/release.json`,
loads the editor HTML and checks its JavaScript module entry and linked stylesheets,
both guide pages and their indexing metadata, both localized showcase pages,
every tool page, all generated gallery routes, and an unknown path's custom HTTP 404 response. Tool and gallery checks also verify their module entries and linked stylesheets. Showcase checks
require the correct HTML language and mount point, same-origin JavaScript module
entry and linked stylesheets with successful HTTP responses and matching content
types. Production pages must have their own canonical URL, both language links,
the English default language link, and indexable robots metadata. Preview pages
must have `noindex, follow` and no canonical URL. Asset requests preserve signed
preview URL parameters. These checks do not execute showcase animations or load
every model, image, font, or dynamically imported chunk. The Actions summary
contains the deployment URL; result JSON is retained as a separate artifact,
including whether these checks passed. A failed post-upload check fails the job but does not roll
back an already published deployment. Fix the issue and redeploy the desired tag.

To publish an older version, manually select that tag/commit. This rebuilds the
selected revision with current deployment variables; it is not a byte-for-byte
restore of a past artifact.

## Local commands

Use the root scripts. `deploy:editor` performs a real cloud write; the other
two deployment commands only validate configuration or prepare local files.

```sh
pnpm run deploy:validate
pnpm run build:site
pnpm run deploy:prepare
pnpm run deploy:editor
```

Use `build:site` for website releases. The general `build` script builds only
the editor and component gallery; it does not produce the combined website.

Set the same variables as the workflow, plus `EDGEONE_ENV`, the actual commit
SHA in `POSTHOG_RELEASE`, and optionally `DEPLOY_REF`. Set `POSTHOG_RELEASE`
before building as well as before packaging. These commands do not load `.env`
files automatically. Do not run the publish command until deployment is intended.

Publish website releases through the tag/manual direct-upload workflow so public
pages, indexing metadata and route middleware are prepared together.

## First-release acceptance

The pipeline's HTTP checks verify publishing, not editor interactions or analytics.
After the first deployment, use an actual mainland browser/network to open the
editor, open a document, edit, export, and verify the resulting events in PostHog.
Verify a sanitized diagnostic error and, if configured, its source map resolution.
The existing Xprite PostHog project has GeoIP enabled and discards client IPs
after enrichment. Check country data on newly ingested events; earlier events
are not enriched retroactively.

## Official documentation

- [EdgeOne configuration](https://pages.edgeone.ai/document/edgeone-json)
- [EdgeOne CLI](https://pages.edgeone.ai/document/edgeone-cli)
- [Direct upload](https://pages.edgeone.ai/document/direct-upload)
- [API Token](https://pages.edgeone.ai/document/api-token)
- [Domain requirements](https://cloud.tencent.com/document/product/1552/127404)
- [GitHub workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [PostHog source maps](https://posthog.com/docs/error-tracking/upload-source-maps/github-actions)

The GIF converter at `/tools/gif-to-sprite-sheet/` is another `apps/tools` entry.
Its PNG/JSON export and canvas controls share the viewer foundation, with no
editor runtime. Site assembly requires both tool entry files; public routing,
canonical redirects, sitemap discovery, preview noindex and release verification
include the converter. Run `pnpm run dev:tools` to review either entry on port 5176.
