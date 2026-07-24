# Interface Contracts, Ownership & Non-Goals

This is the source of truth agents build against. The core (Wave 1) is committed
and STABLE. Do not change a shared interface without orchestrator approval; add
adapters instead of importing another module's internals.

## File-ownership matrix

- **Core (committed, do not edit signatures):** `src/model/**`, `src/geometry/**`,
  `src/commands/**`, `src/store/**`, `src/renderer/**`.
- **Agent D — interactions:** `src/interactions/**` (seeded baseline present).
- **Agent E — UI:** `src/components/**`; may edit `src/app/EditorShell.tsx` and
  `src/app/panels/**` to wire richer components in.
- **Agent F — import/export/persistence:** `src/importExport/**`; may add a
  `src/features/sourceEditor/**`.
- **Agent G — tests:** `tests/**`, `src/**/*.test.ts(x)` colocated where useful.

Two agents must not edit the same file concurrently.

## Store contract (`src/store/editorStore.ts`)

`useEditorStore` is a Zustand store; use it as a hook in React and via
`useEditorStore.getState()/subscribe()` outside React.

Key state: `document`, `history`, `tool`, `selection`, `hoveredId`,
`editingTextId`, `viewport {zoom,panX,panY}`, `preferences`, `interaction
{marquee, previewNode, isGesture}`.

Key actions: `apply(command)`, `undo/redo`, `canUndo/canRedo`,
`loadDocument(doc,{record?})`, `newDocument`, `resetDocument`, `setDocumentSize`,
`setTool`, `setSelection/toggleSelection/addToSelection/clearSelection`,
`setHovered`, `setEditingText`, `setViewport`, `setPreferences`,
`setInteraction`, `resetInteraction`.

**All persistent edits go through `apply(command)`.** Never mutate `document`
directly. Selector hooks live in `src/store/selectors.ts` — prefer them over
reading the whole store (PERF-003).

## Command contract (`src/commands/command.ts`)

```ts
interface Command { label: string; apply(draft: SvgDocumentModel): void; }
```
`apply` mutates an Immer draft in place. Compose with `transaction(label, [...])`.
Available: node (add/delete/rename/visibility/lock/duplicate), transform
(applyWorldTransform/translate/setNodeTransform/updateNodeGeometry/setOpacity),
style (setFill/setStroke/setStrokeWidth/setStyle), layer
(group/ungroup/reorder/reparent/align, `flattenPaintOrder`, `topLevelSelection`).

## Geometry contract (`src/geometry/**`)

`matrix.ts` (identity/multiply/invert/rotate/scale/translate/compose/decompose/
applyToPoint/applyToVector/toSvgTransform), `bounds.ts`, `nodeGeometry.ts`
(worldMatrix/parentWorldMatrix/worldBounds/selectionWorldBounds/localSelfBounds),
`viewport.ts` (screenToRoot/rootToScreen/rootToLocal/zoomAtPoint/fitToRect),
`domMeasure.ts` (measureNodeRootBounds/getLocalToRootMatrix).

## Renderer contract (`src/renderer/**`)

Artwork elements carry `id`, `data-node-id`, `data-node-type`. The artboard rect
has `data-artboard`, content wrapper `data-artwork-content`, host `data-canvas-host`.
Overlay handles carry `data-handle="nw|n|ne|e|se|s|sw|w"` and `data-rotate`.
`CanvasStage` mounts artwork + overlay and calls the interaction hooks.

## Interaction contract (`src/interactions/**`, Agent D)

`useCanvasController(hostRef, svgRef)` and `useHoverController(hostRef)` attach
listeners and drive the store. Handle ids/anchors live in `handles.ts`. Perf
contract: transient DOM writes during gestures, one `apply(command)` on release.

## Import/Export contract (`src/importExport/**`, Agent F)

Provide pure functions the UI can call:
- `sanitizeSvg(text): string | {ok:false, reason}` — strip scripts/handlers/js: URLs.
- `importSvg(text): { nodes, paints, width?, height? } | error` → committed via a
  single command (import = one undo entry, HST-005).
- `serializeSvg(doc, {precision, pretty}): string` — clean root, no overlay/scripts.
- `optimizeSvg(svg, opts): string` — adapter (self-contained; SVGO pluggable later).
- `download(name, text)`, `copyToClipboard(text)`.
- Persistence: debounced autosave to localStorage/IndexedDB + restore + reset.

Must use model APIs, never read the editor DOM as source of truth (SEC-003).

## Explicit Phase-0 non-goals (spec §11.2)

Collaboration, accounts/backend, cloud, comments, animation timeline, raster
tracing, gradient mesh/freeform, CMYK, PDF/EPS export, plugin marketplace, AI
generation, advanced text shaping, text-on-path, variable fonts, compound boolean
history, Shape Builder, full AI file import, mobile touch-first UI, multiple
artboards. Phase-1 path/boolean/gradient tooling is out of scope for this pass.

## Open ADR defaults adopted for Phase 0 (spec §20)

- Hidden nodes: **omitted** from export by default (setting later).
- Primitive transform model: **geometry + matrix** (`L' = inv(P)·D·P·L`).
- Text measurement: **browser SVG APIs** (`getBBox`), model estimate as fallback.
- Boolean engine: **deferred** (Phase 1).
- Source editing: read-only viewer in Phase 0; **Apply-button replace** later.
```
