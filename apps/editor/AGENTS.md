# Editor app architecture

## Areas

```text
src/
├── App.tsx                 # Composition root
├── components/<scope>/     # Business views and page composition
├── managers/<scope>/       # Use cases, state ownership, selectors, commands
├── managers/ports/         # Manager-owned contracts implemented by adapters
├── adapters/<scope>/       # App-specific environment and I/O implementations
├── i18n/
│   └── locales/           # UI language corpora
├── assets/
└── styles
```

Organize by business scope first, then by technical role within that scope.

## Dependencies

- Components may import `@xprite/ui`, `@xprite/editor-ui` and public APIs from `managers/`.
- Components must not import `@xprite/editor-core`, `@xprite/bedrock`, `adapters/`, or a store library directly.
- Managers coordinate application use cases and own app UI stores. Keep editor document/history/settings canonical in `RasterEditor` and session/workspace objects; do not mirror those models into Zustand.
- Managers depend on editor-core, Bedrock's generic `common/` and `browser/` modules, store implementations, and manager-owned port contracts.
- Put adapter contracts in `managers/ports/`. Adapters may import contracts from this folder, but not manager implementations or policies.
- Pass manager-owned decisions through port callbacks when an adapter needs them. Keep browser event translation and storage serialization in adapters; keep product policy and data normalization in managers.
- Use adapters and ports for app-specific browser behavior; adapters may use generic `bedrock/browser` wrappers. Do not import components from adapters.
- `App.tsx` is the composition root: instantiate adapters, inject ports into managers, provide manager APIs, then render components.
- `editor-core` stays platform independent. It may depend on `bedrock/common`, not app code, React, UI, or browser adapters.
- Put generic browser API wrappers in `bedrock/browser`; keep app-specific keys, project recovery, and file workflows in editor managers/adapters.
- Do not keep compatibility re-exports or aliases for migrated `services/` or `editor-react/` paths.

## State

- Create stores per editor/workspace instance; do not use app-global mutable singletons.
- Use store selectors for shared cross-component UI state. Keep component-only form drafts local to React.
- Expose manager hooks, selectors, and commands to components instead of passing editor-core objects through UI.

## Input

- Editor surfaces use `managers/input/use-wheel-input` for wheel events. Keep browser event translation, pinch detection, and shared device history in the injected `wheelInput` port; do not infer devices from `deltaMode` or create a detector per component.
- Keep surface-specific wheel actions and delta policy in `managers/input/policies/wheel`. Components supply geometry and apply the returned action. Use the shared native wheel connection for nested editor surfaces so child handlers run before their ancestors.
- Resolve keyboard bindings through the workspace `ShortcutManager`, including no-document previews. Do not keep separate hardcoded key-to-action tables in components.
