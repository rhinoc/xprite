# WeChat mini program

Build a native host for the website editor with the same features, UI, defaults
and interactions. Follow the root repository rules; packaging and release paths
remain separate from the website.

- Reuse `@xprite/editor-app/embedded-runtime`, shared UI and editor-core through
  their public entry points. `src/mount-editor.tsx` assembles the editor providers.
- Keep `wx`, native canvas geometry, touch translation, fonts and file/storage
  implementations in `src/adapters/`. Managers and `RasterEditor` retain their
  existing workflow and document ownership.
- Preserve layout, menus, dialogs, theme artwork, scaling, control order,
  keyboard/touch behavior and Apply/OK/Cancel semantics at equal content viewports.
- Use website/core limits. Every parity exception needs a current official
  WeChat source, the affected operation and the closest supported native operation.
  Runtime-library and adapter gaps are implementation work.
- Verify parity with actual operations and pixel/geometry comparisons. Record
  unfinished and unverified areas in `PARITY.md`.
- Process artwork locally. Keep account, analytics and remote-service dependencies
  outside this host.
- `wechat:pack` and `wechat:watch` generate this app's `dist`; `wechat:probe`
  generates the isolated runtime investigation. Follow the root execution and
  release rules when running these commands.
