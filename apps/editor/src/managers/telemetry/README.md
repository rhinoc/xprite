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

| Event                     | Boundary                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`               | One page visit after optional transport initialization.                                                                                                   |
| `editor_ready`            | Workspace and UI assets are ready, once per page visit.                                                                                                   |
| `document_opened`         | A usable document was opened by the user. `open_method` distinguishes example, new, import, recent and recovery. Cancelled/failed imports do not count.   |
| `document_edit_started`   | First committed content change per open document. Pointer movement, selections, viewport changes, loading and saves do not count.                         |
| `file_download_requested` | Generated files were handed to the browser's download mechanism. This does not assert that a file reached disk.                                           |
| `file_save_as_completed`  | A user-requested Save As completed through the native file picker/file handle.                                                                            |
| `feature_used`            | Actual settings/about dialog openings, donate clicks and layout changes.                                                                                  |
| `$exception`              | A sanitized exception from the existing diagnostic pipeline. Repeated exceptions are suppressed for five seconds, with at most twenty reports per minute. |

An export operation emits one output event, even when it downloads a PNG sequence.
Partial outputs are marked `output_completed: false`. Auto-save is not a business event.
Native Save As cancellation produces no output event.

Common context includes release/version, a memory-only `visit_id`, open document
count, runtime-only document identity, dimensions, layer/frame/palette counts.
Browser/device/OS properties use PostHog's standard event field names.
The same visit ID joins a user's operations within this page load; it is not saved
to browser storage or reused across reloads.

Remote events never include document names, paths, pixels, source file metadata,
workspace exports, arbitrary diagnostic details or URL query/hash parameters.
Exceptions include a sanitized message/stack and error source. The official SDK
parses stack frames and attaches CLI-injected chunk/release IDs. Key actions are
added to the SDK's bounded `$exception_steps` buffer for diagnostic context, and
sanitized exceptions also produce structured error logs. Console contents,
replay, autocapture, surveys, heatmaps and flags are not collected.
The SDK's `full/no-external` entry bundles the required exception/log extensions
without loading remote scripts. SDK and included dependency license notices are
retained in `LICENSES/posthog-js.txt` and copied to the deployment output.

The transport buffers at most 64 reports during optional SDK startup.
SDK batching/retry behavior handles subsequent delivery. Do Not Track is respected.

## Configuration and deployment

1. Use a PostHog free account without adding a payment method. Choose an existing
   project, or obtain approval before creating one or changing its settings.
2. In PostHog project settings, enable **Cookieless server hash mode**. This is
   mandatory: PostHog otherwise discards cookieless events. This integration does
   not change account/project settings by itself.
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

Direct browser connectivity to PostHog requires mainland network validation.
Reporting failures do not interrupt editing or local diagnostics. No proxy,
hosting-side geography endpoint, or durable delivery queue is included.

Cookieless measurement has daily identity rotation and collision/repeat-visitor
limitations. Prefer daily feature penetration and visit-level funnels. Retention
across days requires a separate identity/consent design.

## Sources

- [PostHog cookieless tracking](https://posthog.com/tutorials/cookieless-tracking)
- [PostHog error tracking](https://posthog.com/docs/error-tracking/installation/web)
- [PostHog Capture API](https://posthog.com/docs/api/capture)
- [PostHog exception wire schema](https://posthog.com/docs/error-tracking/issues-and-exceptions)
- [PostHog JavaScript configuration](https://posthog.com/docs/libraries/js/config)

Local references contain desktop workspace lifecycle behavior but no equivalent
web telemetry implementation. `.docs/feature-4-workspace-progress.md` is historical
evidence only; the current `DocumentWorkspace` and `persistenceRevision` contract
define the observation boundaries. No reference implementation was copied.
