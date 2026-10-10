# Editor telemetry

The first integration sends events directly from the browser to PostHog Cloud.
Analytics is optional: local diagnostics, editing, file pickers, export and recovery
continue to work when configuration is absent or reporting fails.

## Layers

- `managers/ports/telemetry.ts`: provider-independent event vocabulary and transport contract.
- `managers/telemetry/`: event policy, workspace observers, exception filtering,
  and decorators for existing file boundaries.
- `adapters/telemetry/`: official PostHog SDK configuration, bounded startup buffering and network I/O.
- `scripts/telemetry/`: deployment-only source map upload.

No editor-core or UI package depends on PostHog. Components do not perform reporting.
The application root wires the transport, manager, diagnostic observer and session ports.
Dialog and layout managers notify the telemetry manager at their existing lifecycle boundaries.

## Events

| Event                     | Boundary                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`               | One page visit after optional transport initialization.                                                                                                              |
| `editor_startup`          | Bootstrap, workspace and UI-asset startup stages, with started/completed/failed status and duration. A still-incomplete startup emits stalled once after 30 seconds. |
| `editor_ready`            | Workspace and UI assets are ready, once per page visit.                                                                                                              |
| `visit_checkpoint`        | Cumulative page-visible time, Home/editor-visible time, last view and startup state when the page becomes hidden or receives pagehide.                               |
| `view_changed`            | The committed view changed, including initial entry, user selection, automatic workflow transitions and browser history navigation.                                  |
| `document_restored`       | A document from the saved workspace is available when startup finishes, once per restored document per page visit.                                                   |
| `document_opened`         | A usable document was opened by the user. `open_method` distinguishes example, new, import, recent and recovery. Cancelled/failed imports do not count.              |
| `document_edit_started`   | First committed content change per open document. Pointer movement, selections, viewport changes, loading and saves do not count.                                    |
| `file_download_requested` | Generated files were handed to the browser's download mechanism. This does not assert that a file reached disk.                                                      |
| `file_save_as_completed`  | A user-requested Save As completed through the native file picker/file handle.                                                                                       |
| `editor_operation`        | Document-open intent/cancellation and manual save/export requests/results, distinguished by action, phase, outcome and target.                                       |
| `feature_used`            | Settings/about/save-as/export dialog entries, Save As dialog cancellation, donate clicks and layout changes.                                                         |
| `feedback_submitted`      | A user explicitly submits the feedback dialog: `category`, `message` and optional `email`, plus the existing visit context.                                          |
| `$exception`              | A sanitized exception from the existing diagnostic pipeline. Repeated exceptions are suppressed for five seconds, with at most twenty reports per minute.            |

An export operation emits one output event, even when it downloads a PNG sequence.
Completed outputs are marked `output_completed: true`; partial outputs are marked
`output_completed: false`. For downloads, completion means all files were handed
to the browser, not that they reached disk. Auto-save is not a business event.
Native Save As cancellation produces `editor_operation` with `action: save_as`,
`phase: finished`, `outcome: cancelled`, but no successful output event.
Downloads produced by ordinary Save are included in `file_download_requested` with
`download_kind: save`. A successful browser-storage save produces `editor_operation`
with `action: save` or `save_as`, `phase: finished`, `outcome: success` and
`target: browser`; it does not produce a download event. Save As dialog
openings and cancellations, plus export dialog openings, use `feature_used`.

`editor_operation` uses the following fixed dimensions:

- `action`: `open_document`, `save`, `save_as`, `export`.
- `phase`: `requested`, `finished`.
- `outcome`: `success`, `cancelled`, `failed`, `ignored`, on results only.
- `target`: `browser`, `file_system`, for manual saves.
- `open_method`: `new`, `import`, `recent`, `example`, for document-open intent/cancellation.

Save/export request and result share a memory-only `operation_id` and the result
contains `operation_duration_ms`. Export results include file count, size, format
and completion, even when zero files were generated. Document-open intent is
recorded before showing the New dialog or file picker; explicit cancellation uses
`phase: finished`, `outcome: cancelled`. The existing `document_opened` event marks
a usable document. A browser without a file-input cancel event cannot report that
cancellation. No separate event name is created for each operation phase.

`editor_startup` is deduplicated across React effect replay. A stalled event is an
observation, not a terminal failure: the same visit can subsequently become ready.
Failures before the main JavaScript module or optional SDK starts remain outside
this event stream. Common properties include `telemetry_schema_version: 3`, secure
context and availability of structuredClone, IndexedDB and the native save picker.

Checkpoint durations are cumulative within `visit_id`; use the latest checkpoint,
not their sum. Visible time includes idle time and is not proof of user activity.
Hidden/pagehide can be followed by a return or BFCache restoration, so these events
do not declare a completed session. Checkpoints use the SDK's immediate sendBeacon
transport as best-effort delivery. A missing checkpoint cannot prove a crash or
abandonment. They add no persistent timer state or artwork data.

`view_changed` records `from_view`, `to_view`, `trigger` and `reason`. Views are
`home`, `editor`, `guide` and `recovery`; selecting another document within the
editor does not change the view. Initial entry uses `from_view: null`,
`trigger: initial` and `reason: initial_load`. Later triggers are `user`,
`automatic` and `navigation`. Reasons use the fixed `EditorViewChangeReason`
vocabulary, including document activation/open/recovery, closing the last document,
tab selection/closing, recovery entry/exit and browser history navigation.

The UI store owns tab and recovery visibility plus the transition cause. A manager
hook observes committed React views; the telemetry manager suppresses repeated
views, including StrictMode effect replay. Intermediate updates that have already
been superseded and the empty editor's automatic Home fallback are not reported as
separate editor visits. `editor_ready` measures startup readiness, not entry into
the editor view. This adds no navigation persistence fields or changes to routes.

For a document-availability funnel, combine `document_opened` and
`document_restored` in one step. `document_opened` alone excludes work resumed
from the saved workspace; use `view_changed` to measure entry into the editor view.

Common context includes release/version, a memory-only `visit_id`, committed view,
open document count, dirty state, runtime-only document identity, dimensions and
layer/frame/palette counts.
Browser/device/OS properties use PostHog's standard event field names.
The same visit ID joins a user's operations within this page load; it is not saved
to browser storage or reused across reloads.
`entry_referring_domain` and `referring_domain` contain only the hostname read from
`document.referrer`; `entry_referrer_present` distinguishes a supplied referrer
from missing information. Missing referrer still cannot establish the true source.
The shared SDK still persists `$referrer` and `$referring_domain` (`save_referrer: true`).

When an editor URL contains exactly the recognized attribution values
`utm_source=compare`, `utm_medium=referral`, and one of `utm_campaign=aseprite-online`,
`aseprite-on-ipad` or `piskel-alternatives`, the provider-independent visit context
adds `compare_source`, `compare_medium` and `compare_campaign`. These fields are
attached to `$pageview`, readiness, document and output events for this page visit.
They are not saved or carried to an unrelated return visit. The viewer's Continue
editing link reconstructs only these three validated parameters; it never copies
the input query or file metadata. Invalid combinations produce no compare context.

For effective new-visitor attribution, select browser identifiers whose first-ever
`$pageview` contains `compare_campaign`, then require `document_opened` followed by
`document_edit_started` with the same `visit_id` and `document_id`. A click,
`editor_ready` or restored document alone does not qualify. Use the existing
browser identifier for first-time versus returning visitors; `visit_id` alone
only distinguishes page loads. A first-ever visit must be determined from the
available event history, not merely the first event inside a report date range.
Cleared site storage, other browsers and other devices cannot be deduplicated.

PostHog keeps a separate browser-scoped visitor identifier in localStorage so
return visits can be counted across page loads. Person profiles remain disabled.

Current manager events do not include document names, paths, pixels, source file
metadata, workspace exports or arbitrary diagnostic details. The adapter preserves
caller-supplied fields such as `email` and `name`; it has no general field deletion
list. Event whitelisting and URL/campaign filtering remain enabled, including
removal of raw URL query/hash parameters.
Only the fixed comparison attribution above is accepted from a URL. The SDK's
automatic campaign persistence is disabled, while referrer persistence stays on so
`$referrer` and `$referring_domain` remain available. Outgoing standard UTM,
click identifiers and search keywords are removed, including initial/session fields.
Exceptions include a sanitized message/stack and error source, with allowlisted
`pwa_*` and `file_write_*` exception properties: operation
stage, bounded timings/retry count, worker states/version, browser availability,
whether the registration function appears native, and write permission/activation.
Worker URLs, file names and arbitrary diagnostic details stay local.
The official SDK
parses stack frames and attaches CLI-injected chunk/release IDs. Key actions are
added to the SDK's bounded `$exception_steps` buffer for diagnostic context, and
sanitized exceptions also produce structured error logs. Console contents,
replay, autocapture, surveys, heatmaps and flags are not collected.
The SDK's `full/no-external` entry bundles the required exception/log extensions
without loading remote scripts. SDK and included dependency license notices are
retained in `LICENSES/posthog-js.txt` and copied to the deployment output.

The transport buffers at most 64 reports during optional SDK startup.
SDK batching/retry behavior handles subsequent delivery. Do Not Track is respected.

Feedback uses the same initialized SDK for visitor identity and event properties,
then posts once to the public Capture API with the existing event/URL/campaign
filtering. It waits for an accepted HTTP response before clearing the draft. A
failed, timed-out or unavailable transport keeps the draft and shows a retry error.
The request timeout is fifteen seconds. Background SDK retry and batching do not
apply to this explicit submission; only the user retries it. Local development
and Do Not Track still disable sending. No Surveys configuration is required.
Filter the PostHog event list on `feedback_submitted` to read the submitted fields.

The shared adapter, public-page/tool event boundaries and internal-traffic query
policy are documented in the [website telemetry contract](../../../../../packages/site-shell/src/telemetry/README.md).

## Configuration and deployment

1. Use a PostHog free account without adding a payment method. Choose an existing
   project, or obtain approval before creating one or changing its settings.
2. Keep the project's **GeoIP** transformation enabled and **Discard client IP
   data** enabled. GeoIP adds location properties before PostHog discards the
   original IP. The browser SDK stores its visitor identifier in localStorage,
   not in a cookie.
3. Configure the public build variables shown in `apps/editor/.env.example`:
   `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_REGION` (`US` or `EU`).
   The SDK uses `https://us.i.posthog.com` or `https://eu.i.posthog.com` for
   ingestion. Local development never reports.
4. Deploy the static editor output to EdgeOne Makers. From repository root, use
   build command `pnpm run build:editor` and output directory `apps/editor/dist`.
   Analytics requires no edge functions or hosting runtime variables. Inject
   the public build variables in the actual build environment: EdgeOne for Git
   integration, or GitHub Actions for CLI uploads. The ignored local env file
   is not available to CI automatically.
   The tag/manual GitHub Actions release workflow and required repository
   variables are documented in [the deployment guide](../../../../../scripts/deploy/README.md).
5. For readable error stacks, configure deployment-only
   `POSTHOG_CLI_API_KEY` (a personal key limited to required source map/error-tracking
   permissions) and `POSTHOG_CLI_PROJECT_ID`. These are not browser environment
   variables. The root build generates hidden maps, then runs the CLI inject/upload
   pipeline and deletes uploaded maps. Without both variables, upload is skipped.
   `POSTHOG_RELEASE` or `EDGEONE_COMMIT_SHA` links a build to its release; otherwise
   the repository package version is used.
6. Verify actual browser events from mainland China networks after deployment:
   script assets must load from the site, direct ingestion requests should
   succeed, and events/errors must appear in PostHog. A successful HTTP response
   alone does not prove ingestion.
7. Verify each of the three comparison CTA campaigns reaches `$pageview`,
   `editor_startup`, `editor_ready`, `document_opened`, `document_edit_started` and an output event
   with matching compare fields. Use a fresh browser profile for first-visit
   verification, then verify an untagged return visit has no compare fields.
   Check the viewer's Continue editing path as well. Invalid source, medium or
   campaign values and unrelated query/hash values must not appear in events.
8. After deployment, filter on `telemetry_schema_version: 3` and verify incomplete
   startup stages, a hidden-page checkpoint, New/file-picker cancellation, manual
   browser/file-system saves and export failure. Join save/export requested and
   results within `editor_operation` by both `visit_id` and `operation_id`, filtering
   `action` and `phase`. Background recovery writes
   must not produce manual-save events. These events cannot reconstruct old visits.

Direct browser connectivity to PostHog requires mainland network validation.
Reporting failures do not interrupt editing or local diagnostics. No proxy,
hosting-side geography endpoint, or durable delivery queue is included.

The visitor identifier persists only within the current browser's site storage.
Clearing that storage resets it; different browsers and devices are counted
separately. GeoIP applies to newly ingested events, not historical events.

## Sources

- [PostHog JavaScript persistence](https://posthog.com/docs/libraries/js/persistence)
- [PostHog GeoIP transformation](https://posthog.com/docs/cdp/transformations/template-geoip)
- [PostHog IP data storage](https://posthog.com/docs/privacy/data-storage#discarding-ip-addresses-at-project-level)
- [PostHog error tracking](https://posthog.com/docs/error-tracking/installation/web)
- [PostHog Capture API](https://posthog.com/docs/api/capture)
- [PostHog exception wire schema](https://posthog.com/docs/error-tracking/issues-and-exceptions)
- [PostHog JavaScript configuration](https://posthog.com/docs/libraries/js/config)

Local references contain desktop workspace lifecycle behavior but no equivalent
web telemetry implementation. `.docs/feature-4-workspace-progress.md` is historical
evidence only; the current `DocumentWorkspace` and `persistenceRevision` contract
define the observation boundaries. No reference implementation was copied.
