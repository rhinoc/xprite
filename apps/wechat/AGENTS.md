# WeChat mini program

The required product is a native mini program with the same features, UI, defaults and interactions as the website. Keep the website and its build/release paths unchanged. The existing simplified native page is an incomplete prototype, not the requested product.

- Reuse the editor application workflows and UI source as well as `@xprite/editor-core`, `@xprite/editor-ui` and `@xprite/ui`. Expose deliberate shared entry points instead of copying app internals. Do not rebuild a smaller native feature set.
- `src/pages` composes managers and WeChat adapters; page views call manager APIs.
- `src/managers` owns workflows and declares ports. Keep document state in `RasterEditor`.
- `src/adapters` owns `wx`, native canvas geometry, touch translation and local file storage.
- Render the existing UI through a native platform adapter. Kbone is a candidate, not a verified implementation. Its missing browser APIs must be implemented or accounted for as unfinished work; library limitations are not WeChat official restrictions.
- Preserve the website's layout, controls, menus, dialogs, theme assets, fonts, scaling, control order, keyboard/touch semantics, Apply/OK/Cancel semantics and complete workflows at the same content viewport size.
- Do not keep the prototype's arbitrary 512-pixel, 64-frame, 32-layer, 16-MiB-file or 30-project caps in the full implementation. Reuse website/core limits unless an official WeChat restriction requires a narrower limit.
- Every exception needs a current official WeChat source, the affected operation and the closest supported native operation. Implementation cost, performance assumptions and unfinished adapters cannot authorize an exception.
- Mark parity complete only after actual operation checks and pixel/geometry comparisons against the website. Reusing React components or editor-core alone is not proof of parity.
- No remote server, business domain or web-view is required. Do not upload artwork or add account/analytics dependencies.
- Root scripts `wechat:pack` and `wechat:watch` generate this app's `dist` only. Never run them as part of the website build.
- The user explicitly authorized WeChat-only packaging, execution and UI comparisons in this conversation. Use that authorization for this migration. Root restrictions still apply to website builds/tests and all website release/pixel-gate rules.
