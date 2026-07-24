# ADR 0002 — Immer-patch command history

**Status:** Accepted (Phase 0)

## Decision

Undo/redo uses Immer patches. A `Command.apply(draft)` mutates an Immer draft;
the store runs it via `produceWithPatches` and stores `{label, patches,
inversePatches}` (`src/store/history.ts`). Undo applies inverse patches; redo
applies forward patches.

- One command (even a multi-step `transaction`) = one history entry (HST-002/003).
- A drag commits exactly one command on pointer release; transient movement is
  applied directly to the DOM and never recorded (spec §10).
- Limit 100 entries; redo cleared on new edit; viewport/hover changes excluded.
- Import replaces/merges the document in a single command → one-undo (HST-005).

## Alternatives considered

Explicit inverse-command objects (more code, error-prone) and full-document
snapshots (memory-heavy). Immer patches give correct minimal diffs for free.
```
