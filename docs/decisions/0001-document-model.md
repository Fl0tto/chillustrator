# ADR 0001 — Normalized SVG-native document model

**Status:** Accepted (Phase 0)

## Decision

The authoritative document is a normalized, id-keyed model (`SvgDocumentModel` in
`src/model/types.ts`) mapping cleanly to SVG concepts, not an HTML canvas bitmap
or a React component tree (spec P-001).

- Nodes stored in `nodes: Record<NodeId, SvgNode>`; order via `rootNodeIds` and
  group `childIds` (paint order = document order).
- Selection references ids only.
- Paint definitions (gradients) stored in `paints`, referenced as
  `PaintReference{kind:"definition", value: PaintId}` → `url(#id)`.
- Safe unknown SVG kept as `UnknownSafeNode` with pre-sanitized `innerMarkup`.
- UI/editor/transient state lives in the store, never on nodes.

## Consequences

Structural sharing (Immer) gives cheap per-node memoized rendering. Export maps
directly from the model. Transforms stored as `Matrix2D` per node (see ADR 0002 /
`transformCommands`), keeping primitive parameters editable (spec P-004).
```
