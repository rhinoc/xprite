# Bedrock

Product-independent helpers and browser API wrappers. Follow the
[root repository rules](../../AGENTS.md).

## Modules and dependencies

- `common/`: platform-neutral byte, checksum, string and numeric helpers.
  This entry uses no browser APIs or DOM types.
- `browser/`: generic wrappers for file pickers, clipboard, images, IndexedDB,
  localStorage, OPFS, input and runtime crypto. It may depend on `common/`.
- Editor-core may import `common/`; app managers and adapters may use either
  entry as permitted by the root architecture.
- Bedrock imports no app, editor-core or UI code.

## Ownership

Use product-independent names and contracts. Editor models and edit rules belong
in editor-core; project records, recovery policy and app workflows belong in app
managers. Browser wrappers handle generic platform operations through one-way
dependencies.
