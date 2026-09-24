# Bedrock

## Purpose

Bedrock contains product-independent code.

Bedrock contains common helpers and browser API wrappers.

Bedrock does not contain editor workflows.

## Folder structure

```text
packages/bedrock/
├── AGENTS.md
├── browser/
│   ├── clipboard.ts        Clipboard API wrapper
│   ├── file-system.ts      File picker and file write wrappers
│   ├── images.ts           Browser image decode and PNG encode
│   ├── indexeddb.ts        IndexedDB connection wrapper
│   ├── keyboard.ts         Keyboard event adapter
│   ├── localstorage.ts     Safe localStorage access
│   ├── opfs-worker.ts      OPFS worker messages and file access
│   ├── opfs.ts             OPFS byte store
│   ├── runtime-crypto.ts   Random ID and hash helpers
│   └── storage-error.ts    Generic browser storage errors
├── common/
│   ├── clamp.ts            Numeric range helper
│   ├── crc32.ts            CRC-32 checksum
│   ├── join-bytes.ts       Byte array join
│   └── utf8.ts             UTF-8 decoder
├── package.json
├── tsconfig.browser.json
├── tsconfig.common.json
└── tsconfig.json
```

## Architecture layers

Bedrock is the lowest logic layer.

The diagram shows the allowed dependency paths.

```text
+-----------+     +----------+     +-----------------+     +----------------+
|           |     |          |     |                 |     |                |
| App logic |---->| Services |---->|   Editor core   |---->| Bedrock common |
|           |     |          |     |                 |     |                |
+-----------+     +----------+     +-----------------+     +----------------+
                        |
                        |
                        |
                        |
                        |
                        |          +-----------------+
                        |          |                 |
                        +--------->| Bedrock browser |
                                   |                 |
                                   +-----------------+
```

Bedrock does not import app code, editor-core, or ui code.

The `common/` modules do not use browser APIs or DOM types.

The `browser/` modules can use browser APIs and `common/` modules.

The editor core can import `common/` modules.

App services can import editor-core and Bedrock modules.

## Key Principle

- Keep product rules out of Bedrock.
- Keep project records and recovery rules in app services.
- Keep editor models and edit rules in editor-core.
- Put platform-neutral helpers in `common/`.
- Put generic browser API wrappers in `browser/`.
- Use generic names for Bedrock types and functions.
- Do not add Xprite, project, timeline, or editor types to Bedrock APIs.
- Keep dependency paths one-way.
