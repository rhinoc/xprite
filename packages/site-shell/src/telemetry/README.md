# Shared website telemetry

The editor, showcase, gallery, public articles/help and tools bootstrap use
`@xprite/site-shell/telemetry/browser`. Managers consume the data-only
`@xprite/site-shell/telemetry` port; static rendering never initializes the SDK.
The editor's workflow/error/feedback contract remains in its manager ports.

Production builds require `VITE_POSTHOG_PROJECT_TOKEN` and
`VITE_POSTHOG_REGION`. GitHub production deployment supplies these to every app
and injects the checked-out commit as `POSTHOG_RELEASE`. Preview deployments
receive no token. Development, missing configuration and Do Not Track disable
capture. Reporting never changes a product workflow's outcome.

One transport and `visit_id` belong to one document load, outside React. The
initial load and each different `location.pathname` capture `$pageview`.
`pushState`, `replaceState` and `popstate` are observed; queries, fragments,
React Strict Mode and hydration do not add pageviews. A return to a previous
path does add one. BFCache restoration retains the original document visit.
Queued events retain their page context from the time of capture.
Component docs routes (`/components/`, its component and icon routes) keep
`page_type: gallery`, including their client-side path changes. Their
site-entry links use the same CTA listener; component preview callbacks are not
tool file or output events. The about page (`/about/`) keeps
`page_type: showcase`.

Comparison (`/compare/`) and file-guide (`/learn/`) landing pages both use
`page_type: article`. Chinese pages under `/zh-CN/` report the page type of
their English counterpart; `/privacy/` reports `other`.

All events include `page_type`, `page_path`, nullable `tool_name`, nullable
`referring_domain`, `entry_referrer_present`, nullable `entry_referring_domain`,
`release`, `visit_id`, and boolean `internal_traffic`.
`referring_domain` and `entry_referring_domain` are the referrer hostname from
`document.referrer`. SDK initialization keeps `save_referrer: true`, so PostHog
`$referrer` and `$referring_domain` still persist across visits. Campaign
parameter persistence stays off.
The existing capability/version fields and editor attribution remain. URL
queries/fragments and arbitrary campaign values are stripped before delivery.

Use the SDK's anonymous `distinct_id` or `$session_id` for a cross-page funnel.
All apps use the same project token, unnamed SDK instance and localStorage
persistence on the same origin. `visit_id` is deliberately unsuitable as the
cross-page join key. Different origins, devices or cleared/unavailable browser
storage cannot share the anonymous visitor. Person profiles, identify/alias,
automatic click capture and session recording remain disabled.

| Event                    | Boundary                                                                         | Additional properties                                                      |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `$pageview`              | Initial document load or different path                                          | Common context                                                             |
| `site_cta_click`         | Activated internal product destination; includes middle-click and keyboard links | `cta_target`, `target_page_path`                                           |
| `tool_file_opened`       | Manager finished parsing and has usable preview pixels                           | `file_id`, allowlisted `input_format`, `open_source` (`file` or `example`) |
| `tool_output_handed_off` | Generated output passed to `downloadBlob`; adapter returned successfully         | `file_id`, `output_format`                                                 |
| `tool_operation_failed`  | Open or export failed                                                            | `operation`, allowlisted `error_category`                                  |

Join tool open/output by `visit_id`, `tool_name` and `file_id`. File identifiers
are counters within the document visit, never filenames or content hashes.
After a failed new open, an export of the previous project keeps its original
file identifier. Superseded/disposed opens do not report success. Picker
cancellation invokes no open; `AbortError` reports neither success nor failure.
No raw error messages, filenames, arbitrary extensions or file contents are sent.

A browser download handoff cannot confirm disk writes, user acceptance or
completion. CTA and output events use immediate beacon delivery when the SDK is
ready. Startup reports have a bounded in-memory queue that preserves the first pageview; blocked/offline telemetry
is best effort and cannot prevent navigation or tool use.

## Internal traffic and queries

On the relevant site origin, mark a development/acceptance browser locally:

```js
localStorage.setItem("xprite:internal-traffic", "1");
```

The adapter reads the marker per event. To stop marking future events, remove
that one key; no browser history, work or visitor identifier needs clearing.
The marker does not override development restrictions or DNT.

Xprite PostHog project `642366` keeps its existing internal cohort exclusion and
adds the event filter `internal_traffic is_not ["true"]`. New insights default
to `filterTestAccounts: true`. The existing primary dashboard `2163267` also
has this event property filter at dashboard scope, including its older tiles
that explicitly disabled test-account filtering.

All new native queries must explicitly use `filterTestAccounts: true` and this
property filter; raw SQL must include the equivalent condition. Query defaults
cannot override a query that deliberately disables/excludes the filter. Older
unmarked events cannot retrospectively be classified by this local marker.
For internal acceptance only, explicitly query `internal_traffic = true` and the
exact release, then keep those events out of product conversion results.

Use an ordered anonymous/session funnel for:

- Showcase `$pageview` (`page_type = showcase`) → `site_cta_click`
  (`cta_target = editor`) → editor `$pageview` → `document_edit_started`.
- Viewer `$pageview` (`tool_name = viewer`) → `tool_file_opened`
  (`open_source = file`) → `tool_output_handed_off`.

A same-file viewer conversion also requires matching `visit_id`/`file_id`; a
visitor funnel alone can join an export from another file. Do not require one
`visit_id` across the showcase and editor: navigation creates a new document.

## Acceptance

Use the actual production release after deployment to verify ingestion, with
an internal browser marker and a narrow release/time filter. Check the full
showcase/editor and viewer/open/download chains, stable anonymous identity,
new document visit IDs, one initial pageview, and no success on cancellation.
A local isolated capture inspection is not proof of PostHog ingestion.
Keep the complete existing pre-push editor and tools-startup pixel audits.
This feature changes no user guide or intended UI appearance.

Sources: [PostHog SPA pageviews](https://posthog.com/tutorials/single-page-app-pageviews),
[JavaScript configuration](https://posthog.com/docs/libraries/js/config),
[anonymous events](https://posthog.com/docs/data/anonymous-vs-identified-events),
[internal/test traffic filters](https://posthog.com/docs/data/test-accounts).
