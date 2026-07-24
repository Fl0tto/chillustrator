# chillustrator — Architecture

An open-source, browser-based SVG & logo editor. Phase 0 prototype.

Stack: **React 19 + TypeScript (strict) + Vite 6 + Zustand 5 + Immer 10**, native inline SVG rendering, Vitest, Playwright.

## Layer boundaries (spec P-002)

```
Editor UI (components/, app/)
      │ selectors + commands
Application Store (store/)  ── document · selection · viewport · tool · prefs · transient
      │
 ┌────┴───────────────┬───────────────────┬──────────────────┐
 Command & History    Interaction          Serialization
 (commands/, store/)  (interactions/)      (importExport/)
      │                    │                     │
 Framework-independent model + geometry (model/, geometry/)
      │
 Native SVG renderer (renderer/): ArtworkSvg + EditorOverlay
```

**Hard rule:** `model/**` and `geometry/**` are framework-independent — no React, no
DOM writes, no store imports. (Exception: `geometry/domMeasure.ts` reads the live
DOM for pixel-accurate measurement/hit-testing only; it never treats the DOM as
the source of truth.)

## Document model (spec §7)

Normalized, id-keyed nodes. `parentId` + ordered `childIds`/`rootNodeIds` define
paint order. Selection references ids. UI-only state never touches persisted
nodes. See `src/model/types.ts` (authoritative contract) and
`docs/decisions/0001-document-model.md`.

## History (spec §8)

Every persistent edit is a `Command` whose `apply(draft)` mutates an Immer draft.
The store runs it through `produceWithPatches`, storing forward + inverse patches
→ one gesture = one undo entry (HST-002). Transient drag state never enters
history. See `docs/decisions/0002-history.md`.

## Performance model (spec §10)

- High-frequency pointer moves update the DOM directly (`setAttribute`) and only
  lightweight overlay state in the store (PERF-001/002). Exactly one command
  commits on pointer release.
- Per-node memoized rendering keyed on Immer structural sharing (PERF-004).
- Artwork and overlay are separate `<svg>` elements re-rendering independently
  (PERF-005).
- Selector-based subscriptions (`store/selectors.ts`) keep panels isolated
  (PERF-003).

## Coordinate systems (spec §9)

client → root-SVG → node-local. `geometry/viewport.ts` converts client↔root using
the store `Viewport {zoom, panX, panY}`. `geometry/nodeGeometry.ts` resolves world
matrices through the parent chain. World-space transforms map into a node's parent
space as `L' = inv(P)·D·P·L` (see `commands/transformCommands.ts`).

## Renderer (spec §4.7)

Native inline SVG. The artwork `<svg>` is the hit-testing + export surface and
contains no editor chrome. A separate overlay `<svg>` draws selection box,
handles, and marquee in screen-pixel space so they stay constant-size under zoom.
See `docs/decisions/0003-renderer.md`.

## Directory map

| Path | Owner | Contents |
|---|---|---|
| `src/model/**` | core | types, ids, factory, tree ops, document |
| `src/geometry/**` | core | matrix, bounds, node geometry, viewport, DOM measure |
| `src/commands/**` | core | command contract + node/transform/style/layer commands |
| `src/store/**` | core | Zustand store, history, selectors |
| `src/renderer/**` | core | ArtworkSvg, node/defs renderers, overlay, CanvasStage |
| `src/interactions/**` | Agent D | pointer/keyboard controllers, tools, handles |
| `src/importExport/**` | Agent F | sanitize, import, serialize, optimize, persistence |
| `src/components/**` | Agent E | toolbar, inspector, layers, dialogs, source viewer |
| `src/app/**` | core+E | shell, panels wiring |
| `tests/**` | Agent G | unit, integration, e2e, fixtures |

See `docs/contracts.md` for interface contracts, ownership rules, and non-goals.
```
