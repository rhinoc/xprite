# Share service

This package is an independently deployed anonymous sharing backend. It must not
import apps, UI, editor-core, browser Bedrock, or another service's internals.

- `src/worker.ts` is the composition root. Only it connects concrete adapters.
- Group code under `sharing`, then by domain, application, ports, and adapters.
- Domain and application code have no Cloudflare, HTTP, or global clock/crypto
  dependencies. Inject repository, object storage, and runtime ports.
- D1 owns atomic admission and state transitions; R2 owns immutable file bytes.
- Never authorize access by IP. IP identifiers only partition upload capacity.
- Keep expired-IP capacity separate from physical R2 capacity awaiting cleanup.
- SQL is the current initial schema, not a migration chain. Initialization must
  fail against an existing schema instead of silently accepting a different one.
- Use root package scripts. Do not run builds or tests during development.
