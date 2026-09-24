---
name: implement-features
description: Research local reference implementations and build end-to-end product features in this repository using its UI, manager, editor-core, port, and adapter layers. Use for feature work informed by .refs or .docs, not reference-only audits or isolated edits.
metadata:
  short-description: Research and implement layered features
---

# Implement features

Use this skill for product changes that need both behavior research and integration with the Xprite architecture. Keep the requested outcome narrow, but carry the feature through every layer it needs.

## Research the behavior

1. Read the root `AGENTS.md` and the nearest package `AGENTS.md` before editing. Check current package scripts and the working tree; preserve existing user changes.
2. Search `.refs/` for the matching workflow, command, settings model, renderer, and persistence code. Compare actual behavior and defaults, not only screenshots or labels. Identify the reference version and platform when that affects the result.
3. Read relevant `.docs/` notes as historical evidence. Check their dates, cited sources, and current implementation before treating them as requirements.
4. Read the applicable reference license. Use it to understand behavior and design; do not copy implementation text or code unless its license permits that use.
5. Record the behavior that matters to the request: entry point, state scope, defaults, interactions, persistence, undo/dirty-state effects, and unsupported cases. Separate source facts from implementation choices.

## Map the feature into the repository

Trace the existing path from the UI action to its state owner and side effect before adding code. Reuse an existing command, manager, dialog, port, or adapter when it already owns part of the workflow.

- Components compose `@xprite/ui` controls and call public manager APIs. They do not import editor-core, Bedrock, adapters, or store libraries directly.
- Managers own application workflows, UI state, preferences, and manager-owned port contracts.
- `editor-core` owns platform-independent document, history, and editing rules. It can depend on `bedrock/common`, not browser, React, UI, or app code.
- Adapters implement manager ports and own browser or platform I/O. `App.tsx` connects managers, adapters, and components.
- Keep document state and undo history in the editor/document/session models. Keep workspace-wide preferences in workspace or preference managers. Choose document, workspace, or global lifetime deliberately; do not mirror canonical state into a second store.

Follow the nearest `AGENTS.md` if these summaries differ from current repository guidance.

## Implement a complete vertical slice

- Wire the visible control or command through its manager to the real behavior. A UI control with no connected effect is incomplete.
- Put reusable UI in `@xprite/ui` when its behavior is generic; compose business-specific views from existing controls. Follow the repository's CSS Modules and design-token conventions.
- Keep product decisions in managers or editor-core, browser details in adapters, and dependency direction one-way.
- When adding settings, define defaults and normalization, choose the correct persistence scope, and connect the setting to every relevant consumer. Preserve Apply/OK/Cancel draft semantics where the surrounding dialog uses them.
- Check document switching, new documents, Home/no-document state, reload/recovery, and existing-file versus Save As paths when relevant.
- Keep unsupported behavior visibly unavailable and explain the concrete limitation. Do not present a setting as functional when the browser or current backend cannot honor it.
- Avoid compatibility aliases for moved code and avoid unrelated cleanup.

## Review and report

Inspect the changed call chain and diff for stale disabled styling, disconnected callbacks, wrong state scope, and changes to unrelated user work. Follow repository validation instructions. In this repository, root `AGENTS.md` says not to run builds or tests during development because git hooks run them automatically; respect that rule.

In the final response, summarize the behavior implemented, name the reference sources used and any meaningful divergence, state what validation was or was not run, and identify remaining unsupported behavior.
