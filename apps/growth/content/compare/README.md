# Compare editorial workflow

Compare is an English selection column, rendered as static HTML by the growth app.
The initial batch answers three existing-file or editor-selection decisions. It
does not promise traffic, rankings, or complete Aseprite compatibility.

## Source layout

- `articles/`: the initial comparison articles included in the public page manifest.
- `research/`: product facts, primary sources, verification dates, unknowns, and
  expansion outlines. These files are editorial input, never public routes.
- `drafts/`: completed reserve articles, excluded from routing and the sitemap.
- `site.module.css`: the static column's CSS Module, compiled by the page renderer.
- `../articles/index.ts` and `../../build/article-pages.ts`: metadata, manifest, renderer,
  routes, and canonical redirects.

Adding a Markdown file alone does not publish it. Add a reviewed article to the
manifest, update EdgeOne serving rules, and extend the editor/viewer attribution
allowlists before including it in a release.
Assembly and deployment preparation require every manifest page to exist.
Development work does not authorize pushing or publishing a release.

## Initial batch

| Article               | Decision                                       | Primary entry                   |
| --------------------- | ---------------------------------------------- | ------------------------------- |
| `aseprite-online`     | Open an existing Aseprite project in a browser | Viewer, then editor             |
| `aseprite-on-ipad`    | Continue a desktop project on iPad             | Editor and touch/save guide     |
| `piskel-alternatives` | Move beyond a Piskel workflow                  | Editor, with format limitations |

The initial verification date is 2026-10-04. Research is documentary: no mobile
hardware trial or multi-product file round-trip test has been performed. Public
articles distinguish official format statements from preservation guarantees.
Use product pages, official manuals, release notes, and official store listings.
Keep imported/exported formats separate. Missing evidence means unconfirmed.
Do not infer search volume from installs, reviews, or brand traffic.

## Expansion gates

Treat these numbers as investment controls, not forecasts. Log writing, research,
template, review, and revision time separately; the suggested ceiling for each
initial article is four hours, excluding shared column work.

- Two weeks after publication: inspect crawlability, canonical URLs, and indexing.
  Resolve technical issues before adding more articles.
- Four weeks after indexing: review actual Search Console queries, impressions,
  and clicks. Improve pages whose queries show the intended decision.
- Eight weeks after indexing: require at least 50 organic-search clicks and five
  effective new editor users across the initial batch before expanding a
  demonstrated topic. Search Console clicks are a reach proxy, not unique new
  visitors; this makes the earlier 50-new-visitor proposal measurable with the
  current static pages without claiming visitor-level article analytics. Record
  the sample and indexing dates alongside the result.

An effective new user opens or creates a document and commits a content edit.
Count distinct new visitors, not document or event totals. Exclude internal
demonstrations and QA. Save/export and later return are quality signals. A browser
visitor identifier is not a cross-device person identifier.

The article CTA uses only `utm_source=compare`, `utm_medium=referral`, and one of
the three manifest slugs as `utm_campaign`. The editor maps these to bounded
`compare_*` context on its existing telemetry events; the viewer carries the
allowed attribution when continuing to edit. Neither arbitrary query parameters
nor project contents belong in analytics. Production ingestion still needs
verification; local development does not report. Static articles have no analytics
runtime, so Search Console measures search acquisition while the editor events
measure CTA arrivals and use. Combine those sources without claiming that they
identify the same person or prove a reader's original search query.

## Next batches

Choose at most two articles from a direction that passes the expansion gate:

- Browser demand: file handoff among Aseprite, LibreSprite, Pixelorama, and Xprite;
  or free browser alternatives for existing Aseprite files.
- iPad demand: Pixquare vs Resprite; or iPad tools for continuing desktop projects.
- Piskel demand: Piskel vs Pixilart; or animation editing in Piskel, Pixelorama,
  and Xprite.

The phone drafts cover Pixel Studio vs dotpict and phone pixel-art editor
selection. Keep them in reserve until actual query or conversion evidence supports
this topic. Broad best-tools lists, many Xprite-vs-brand pages, and bulk translations
also need demand evidence before production.

## Maintenance

When an article earns relevant impressions or effective users, recheck its official
sources before expanding it. Update platform scope, free/paid restrictions, format
directions, storage, and preservation caveats together with its verification date.
Update only the reviewed article’s `dateModified` in the page manifest; do not
bump every article’s source-check date when revising one. Record changes and
elapsed revision time in the corresponding research file.
Prices require a region, currency, and date; omit exact prices when those cannot
be established. Do not label a page tested when only its documentation was read.

Review article links, section anchors, metadata, recommendation conditions, and
the CTA destination before release. Publication follows the repository's visual
review and hook rules. No baseline or threshold change is part of this column.
The column does not change editor operations and requires no new user-guide
chapter; link to existing save, touch, layout, and offline sections instead.

The shared article renderer also serves `/learn/` file guides from `content/learn/articles/`. New guides target a specific downloadable output and link to the existing viewer. They use no new attribution fields.
