# Anonymous share service

Independent TypeScript backend for temporary ASE snapshots. EdgeOne continues
serving the editor and viewer. This service uses Cloudflare Workers, D1, and a
private R2 Standard bucket. No accounts or editor startup dependencies are added.
The frontend is not connected yet; returned viewer URLs describe the intended
frontend entry point, not a completed browser sharing feature.

## Architecture

```text
worker.ts                                  composition and platform entrypoints
sharing/domain/                            rules, states, bounded ASE validation
sharing/ports/                             repository, object store, clock/crypto
sharing/application/                       upload, access, revocation, cleanup
sharing/adapters/http/                     routes, CORS, bounded request bodies
sharing/adapters/cloudflare/               D1 SQL and private R2 operations
sharing/adapters/runtime/                  configuration and Web Crypto
sql/schema.sql                             current initial D1 schema
```

Domain and application modules have no Cloudflare or HTTP dependency. Adapters
implement explicit ports; only `worker.ts` connects concrete persistence adapters.
The package imports no frontend, UI, or editor implementation. Root import and
dependency checks enforce these boundaries. D1 statements are parameterized;
SQL triggers protect immutable records, legal state transitions, and exactly-once
physical-capacity release. No ORM, authentication service, or schema fallback is
required.

Local reference research found LibreSprite's share command delegates to native
sharing or a browser file download; it is not a cloud-storage implementation.
No reference implementation was copied. The bounded file inspector was written
from the [official ASE format](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md).
Historical `.docs/monorepo-architecture.md` describes older paths; current
repository instructions and package boundaries take precedence.

## Rules and ownership

| Rule                                        | Value                                    |
| ------------------------------------------- | ---------------------------------------- |
| Actual ASE file bytes                       | At most 250,000 bytes                    |
| Effective capacity per upload IP            | 10,000,000 bytes                         |
| Physical file capacity held by this service | 8,000,000,000 bytes                      |
| Share lifetime                              | 7 days after publication                 |
| Unfinished reservation lifetime             | 5 minutes after reservation              |
| New reservations per IP                     | At most 30 in a rolling 60-second window |
| Retired metadata retention                  | 7 days after storage release             |

The constants in `sharing/domain/policy.ts` are authoritative. Capacity means
currently effective files plus unfinished reservations, never historical upload
traffic. Expiration frees IP capacity immediately, even before Cron deletes the
file. The global held-byte counter continues counting that file until R2 cleanup
succeeds. Both checks run inside one conditional SQLite insertion; a trigger
adds the physical reservation in the same transaction.
Admission and publication deadlines use database time as a lower bound, so a
delayed Worker request cannot publish an upload after another request has reused
its expired reservation. Public file reads also check expiry in D1.

IP ownership is captured at reservation creation and stays unchanged when a
client changes networks. Only a platform-provided `CF-Connecting-IP` is used;
there is no fallback to client-provided forwarding headers. IPv4/IPv6 addresses
are normalized and stored as HMAC identifiers using `IP_HASH_SECRET`. Keep that
secret stable while records exist: changing it creates a new quota identity for
the same address. IPs do not authorize file access, listing, or revocation.
Users sharing a public network address share its capacity budget.

A client generates a fresh 32-byte, base64url management key (43 characters) and
a UUID v4 request ID, and persists both locally before contacting the service.
The key is sent in `Authorization: Bearer <key>` on management operations.
Only its SHA-256 hash is stored. Never include the key in share URLs, query
parameters, telemetry, or logs. Losing local credentials loses the management
entry point; expiration still works. CORS is browser integration, not identity
verification; non-browser clients remain anonymous and quota-limited.

No additional preview files are stored. The file limit applies to the ASE
source alone. Server validation bounds frame/chunk structure and declared cel
memory, but does not inflate or render pixel data. Consumers must use their full
ASE parser, decoded-memory limits, and the supplied SHA-256 checksum. CPU-heavy
encoding, preview generation, and decoding remain in the browser.

## HTTP contract

All responses, including downloads and errors, use `Cache-Control: no-store`.
Browser callers must come from an exact `ALLOWED_ORIGINS` entry. The API should
be called directly on its Worker endpoint so the client IP is preserved.
Adding an EdgeOne or other proxy requires a separately authenticated original-IP
forwarding design; never start trusting arbitrary `X-Forwarded-For` values.

| Method and path             | Purpose                                      | Management key |
| --------------------------- | -------------------------------------------- | -------------- |
| `GET /v1/policy`            | Public file, capacity, and lifetime limits   | No             |
| `GET /v1/quota`             | Current request IP's effective capacity      | No             |
| `POST /v1/shares`           | Reserve capacity or recover the same request | Yes            |
| `PUT /v1/shares/:id/upload` | Submit the reserved immutable snapshot       | Yes            |
| `GET /v1/shares/:id/manage` | Recover upload/publication state             | Yes            |
| `GET /v1/shares/:id`        | Read active public metadata                  | No             |
| `GET /v1/shares/:id/file`   | Download an active private-bucket object     | No             |
| `DELETE /v1/shares/:id`     | Revoke and release effective IP capacity     | Yes            |

Reserve with `Content-Type: application/json` (body limit 2,048 bytes):

```json
{
  "requestId": "a290c8a5-289a-4a87-a311-a4dde4674c22",
  "fileName": "character.aseprite",
  "sizeBytes": 8417,
  "sha256": "<64 lowercase hexadecimal characters computed from the file>"
}
```

The response contains `id`, `state`, `fileName`, `sizeBytes`, `sha256`,
`reservationUntil`, `expiresAt`, and `shareUrl`. Times are Unix milliseconds.
The share URL is null until publication. Normal creation returns 201; recovering
an already published request returns 200. No IP key, management hash, bucket path,
or secret is returned.

Upload the raw snapshot to `/v1/shares/:id/upload` using
`Content-Type: application/octet-stream` and the same management key. The actual
body must exactly match the reserved length and checksum. Request bodies are
read with an actual-byte cap and a 30-second read deadline; compressed HTTP bodies
are rejected. A successful upload returns public metadata and
`https://xprite.cc/tools/viewer/?share=<id>`. The 7-day lifetime starts only then.

Reuse the original request ID and management key when retrying a lost reservation
response. Repeated identical completed uploads return the existing share without
writing R2 again. A changed payload for that request ID returns 409. Concurrent
uploads cannot claim the same reservation twice. For an in-progress 409, poll the
authenticated management endpoint; do not start a second upload with a new key.
An expired or failed reservation requires a new request ID.

Errors are JSON `{ "error": "<stable code>", "message": "..." }`:

| Status | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| 400    | Invalid metadata, size/checksum mismatch, or malformed ASE |
| 401    | Missing or incorrect management credentials                |
| 403    | Browser origin is not allowed                              |
| 404    | Unknown ID/route, or a share not yet published             |
| 409    | Concurrent operation or conflicting request payload        |
| 410    | Reservation/share expired or share revoked                 |
| 413    | File/body size or IP effective-capacity limit exceeded     |
| 429    | Reservation frequency limit; includes `Retry-After`        |
| 503    | Physical capacity exhausted or service/storage unavailable |

The body contains the specific stable code to distinguish capacity from file
size. Deletion is idempotent while the retired record remains: repeated calls
return 204 and never decrement capacity again. After metadata retention, the
same ID returns 404. No endpoint lists shares by IP.

## Failure handling and cleanup

```text
reserved → uploading → active → retired
    └─────────┴──────────────────→ retired
```

R2 writes are create-if-absent, checksum-verified operations. The database publishes
the share only after the write succeeds. If a publication response is lost after
commit, the application rereads D1 and returns the committed result. An interrupted
writer stays tracked in D1, so a crash cannot leave an unaccounted object.

Cron runs every five minutes and processes up to 20 retirements, 20 object cleanups,
and 20 metadata purges per invocation. Failed cleanups receive exponential retry
delays (one minute up to 64 minutes), preventing a permanently failing object from
starving all other cleanup. Expiry access checks do not depend on Cron. Monitor
backlog and adjust the batch/schedule within platform subrequest and CPU budgets
before increasing traffic; the global admission guard pauses new uploads while
physical cleanup is behind.

Normally, cleanup deletes the R2 object. When retirement races an `uploading`
writer, cleanup replaces the object with a persistent zero-byte write fence.
This makes a delayed conditional R2 write fail even if it completes after cleanup.
The file content is erased and its capacity is released; the empty marker remains.
Do not apply a lifecycle rule deleting these fences from `shares/`, or a late write
could recreate retired content. Successful completed shares do not leave fences.

The global 8 GB guard measures this service's reserved/file body bytes, including
objects awaiting deletion. It does not account for other buckets, R2 request
charges, or provider metadata. Use dedicated resources and monitor account usage;
it is not a billing spend cap. Public R2 access must stay disabled, otherwise direct
downloads could bypass expiration and revocation.

## Development

From the repository root:

```sh
pnpm install
cp services/share/.dev.vars.example services/share/.dev.vars
# Set IP_HASH_SECRET in .dev.vars to a securely generated value.
pnpm run share:db:init
pnpm run dev:share
```

The default Worker uses local D1/R2 emulation with development-only origins.
Reuse the dev server's existing port; no editor server restart is needed.
The all-zero D1 ID is a local-development placeholder, not a production resource.
Cloudflare supplies the trusted IP header in production. When a local emulator
does not populate it, explicitly set `CF-Connecting-IP: 127.0.0.1` in local API
requests. Missing IP information fails quota/reservation calls instead of grouping
everyone under a fake IP. Never place an untrusted proxy in front of the production
Worker without implementing authenticated original-IP forwarding.

`pnpm run check:share` checks production and test TypeScript without building.
The root format, lint, import, architecture, and unused-code workflows cover the
service. `pnpm run test:share` runs regression coverage with the production SQL
executed against Node SQLite, including concurrency, expiry, lost responses,
revocation races, cleanup retries, body limits, and HTTP responses. It is available
for later validation; repository instructions prohibit running builds/tests during
development. Cloudflare runtime behavior and the 10 ms free-request CPU budget
still require validation before production launch.

## Production setup

Provision resources in the intended Cloudflare account, using separate development
and production databases/buckets. Enable R2 Standard storage and retain private
access. Create D1 database `xprite-share` and R2 bucket `xprite-share`, then replace
the production `database_id` placeholder in `wrangler.jsonc` with the real ID.
Keep the default local ID unchanged.

Set the production `IP_HASH_SECRET` with Wrangler's secret command, never a checked-in
variable. Initialize the empty production D1 once with
`pnpm run share:db:init:production`. `sql/schema.sql` intentionally fails if tables
already exist; there are no prelaunch migration or compatibility paths. Do not
reset an existing database to retry a deployment. D1 metadata and R2 content must
be backed up and restored as one service if operational recovery is needed.

`pnpm run deploy:share` validates the real production D1 ID, separate resources,
HTTPS origins/viewer URL, and cleanup schedule before invoking Wrangler. It does
not provision resources or secrets. Add a restricted CI token and the account ID
only when configuring a release workflow. Frontend deployment remains independent.

Before connecting the editor, configure its sharing adapter with the Worker URL
and verify browser access from the supported user regions. Keep all cloud requests
out of editor startup and local persistence. User-visible sharing instructions
and privacy documentation must be updated with that frontend integration; this
backend-only change leaves current browser operations unchanged.

## Platform references

- [Workers runtime and pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 statements and atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [R2 conditional writes and checksum validation](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cron scheduling](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
