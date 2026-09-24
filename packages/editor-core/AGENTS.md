# editor-core

## Purpose

This package contains platform-independent editor logic.
It does not contain React components or browser UI code.
The editor app can use this package. This package can use `packages/bedrock`.

## Folder structure

Put feature areas at the top level. Put technical groups inside a feature area.

```text
src/
├── base/                 # Common types and low-level helpers
├── document/             # Document data, project data, and validation
├── canvas/               # Canvas view, geometry, raster, guides, and grid
│   ├── assistance/
│   └── raster/
├── drawing/              # Brush, line, shape, text, and tool logic
│   ├── data/
│   ├── line/
│   ├── shapes/
│   └── text/
├── selection/            # Selection data, operations, and transforms
├── clipboard/            # Image, timeline, and tile clipboard data
├── timeline/             # Frames, layers, cels, tags, and animation
│   └── operations/
├── sprite/               # Sprite size, properties, palette, and slices
├── tilemap/              # Tilemap and tileset logic
│   └── operations/
├── color/                # Color conversion, profiles, and Aseprite samples
├── image-editing/        # Resize, crop, rotate, and image effects
├── import-export/        # File import and export
│   ├── aseprite/
│   └── image/
│       └── import/
├── editor/               # Editor state and cross-domain work
│   └── commands/
├── history/              # Undo and redo
└── session/              # Open, save, recents, autosave, and recovery
```

`src/index.ts` is the package entry point.
Each feature `index.ts` is the public entry point for that feature.
Do not keep compatibility exports or aliases for moved code.

## Architecture layers

The arrows show the direction of dependency.

```text
apps/editor/src/App.tsx (composition root)
  ├── components ──> packages/ui
  ├── components ──> managers
  ├── managers ──> editor-core ──> bedrock/common
  ├── managers ──> app store
  └── adapters ──> bedrock/browser ──> bedrock/common

managers declare ports; adapters implement them; App.tsx wires concrete adapters.
```

## Key Principle

- Put feature folders at the top level. Put technical subfolders inside a feature.
- Put model files in the feature that owns the data.
- Do not create a package-level `model/` or `modules/` folder.
- Keep dependencies one-way.
- Keep editor app workflows in app managers; do not make editor-core depend on app managers or adapters.
- Keep browser API and React UI code outside editor-core.
- App managers may use generic `bedrock/browser` wrappers; app-specific browser implementations stay in `apps/editor/adapters/` behind manager ports.
- Keep `base/` free of imports from feature folders.
- Let `editor/` coordinate more than one feature.
- Let `session/` coordinate the editor lifecycle.
- Keep file codecs inside `import-export/`.
- Do not make a feature depend on `editor/` or `session/`.
- Keep shared behavior in the feature that owns it.
- Do not move code to `base/` only because more than one feature uses it.

## Best Practice

- Keep each file in the feature that owns its behavior.
- Use a feature `index.ts` for imports from another feature.
- Keep direct file imports inside the same feature.
- Use an enum for a fixed set of named values.
- Use a named constant for each fixed value. Do not use magic numbers or strings.
- Use `import type` when an import is only a type.
- Keep tests next to their source files.
