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

---

# Phase 0.5 — Transparency and Boolean Geometry

## Objective

Immediately extend the Phase 0 vertical slice so it supports:

1. Complete SVG alpha and transparency controls
2. Imported and manually constructed complex SVG paths
3. Destructive boolean operations between shapes and paths
4. Correct SVG export and import round-tripping for the resulting geometry

This phase is required before further UI polish, editable source code, animation, advanced typography, or collaboration work.

## Scope priority

Implementation order:

1. Complete transparency model
2. Complete path-node rendering and serialization
3. Primitive-to-path conversion
4. Geometry-engine adapter
5. Union
6. Subtract
7. Intersect
8. Exclude/XOR
9. Compound-path and hole handling
10. Boolean-operation integration tests
11. Worker migration and performance hardening

Do not implement non-destructive boolean groups or Shape Builder during this phase.

The initial boolean operations may destructively replace the selected source objects with one resulting `PathNode`.

---

# Transparency Architecture

## ALP-001 — Canonical opacity model

The document model must distinguish between:

* Object opacity
* Fill opacity
* Stroke opacity
* Gradient-stop opacity
* Color alpha

These values must not be merged into one property internally.

```ts
export interface BaseNode {
  id: NodeId;
  type: string;
  opacity: number;
  // ...
}

export interface PaintReference {
  kind: "solid" | "definition";
  value: string;
  opacity: number;
}

export interface GradientStop {
  id: string;
  offset: number;
  color: string;
  opacity: number;
}
```

All opacity values use normalized floating-point values from `0` through `1`.

Invalid values must be clamped.

## ALP-002 — SVG mapping

Use the following mapping:

| Model property        | SVG output       |
| --------------------- | ---------------- |
| Node opacity          | `opacity`        |
| Fill paint opacity    | `fill-opacity`   |
| Stroke paint opacity  | `stroke-opacity` |
| Gradient stop opacity | `stop-opacity`   |
| No fill               | `fill="none"`    |
| No stroke             | `stroke="none"`  |

Do not calculate one flattened alpha value during editing.

For example:

```svg
<path
  opacity="0.8"
  fill="#ff0000"
  fill-opacity="0.5"
  stroke="#000000"
  stroke-opacity="0.25"
/>
```

The effective visual fill alpha is calculated by the SVG renderer, but the model preserves the independent values.

## ALP-003 — Color representation

For Phase 0.5, use:

* Six-digit hexadecimal or canonical CSS color strings for color
* Separate numeric opacity fields for alpha

Example:

```ts
{
  value: "#ff3366",
  opacity: 0.4
}
```

Do not store the same alpha simultaneously in:

* Eight-digit hexadecimal
* `rgba()`
* `fill-opacity`
* Object opacity

Import may accept these representations, but they must be normalized into the canonical model.

## ALP-004 — Group opacity

Groups support object-level opacity.

Group opacity must apply visually to the composited group rather than being copied to every child.

The renderer must emit:

```svg
<g opacity="0.5">
  ...
</g>
```

It must not automatically rewrite each child to 50% opacity.

## ALP-005 — Transparency UI

The inspector must provide:

* Object opacity
* Fill opacity
* Stroke opacity
* Gradient-stop opacity when a gradient stop is selected
* No-fill control
* No-stroke control
* Numeric percentage input
* Slider or equivalent continuous control

The canvas must display a checkerboard or user-configurable preview background so transparency is visible.

The preview background must never be exported as artwork.

## ALP-006 — Transparency import

Import and normalize:

* `opacity`
* `fill-opacity`
* `stroke-opacity`
* `stop-opacity`
* `rgba()`
* Eight-digit hexadecimal colors when encountered
* Inherited opacity values
* Opacity defined through safe inline style declarations

CSS-derived values that cannot be resolved safely should produce an import warning.

## ALP-007 — Transparency export

Export must preserve independent alpha properties.

Do not unnecessarily emit opacity attributes whose value is `1`.

Numeric opacity output must respect the document export precision setting.

## ALP-008 — Transparency acceptance criteria

A user must be able to:

1. Set an object to 50% opacity.
2. Set its fill to 30% opacity.
3. Set its stroke to 80% opacity.
4. Group it with another object.
5. Set the group to 60% opacity.
6. Export the document.
7. Reimport the exported SVG.
8. Recover materially equivalent opacity values and visual output.

---

# Path Architecture

## PTH-000 — Path support becomes mandatory

`PathNode` is now a first-class editable and serializable node type.

It must support:

* Imported SVG paths
* Boolean-operation results
* Primitive-to-path conversion
* Multiple subpaths
* Closed and open contours
* Curves
* Holes
* `nonzero` and `evenodd` fill rules

## PTH-001 — Canonical path representation

Do not rely only on an unvalidated `d` string for geometry operations.

Use a canonical parsed path representation.

```ts
export type PathSegment =
  | MoveSegment
  | LineSegment
  | CubicSegment
  | QuadraticSegment
  | ArcSegment
  | CloseSegment;

export interface PathGeometry {
  segments: PathSegment[];
}

export interface PathNode extends BaseNode {
  type: "path";
  geometry: PathGeometry;
}
```

The renderer serializes `PathGeometry` to SVG path data.

Imported `d` attributes are parsed into `PathGeometry`.

Exported path strings are generated from `PathGeometry`.

A cached serialized `d` string may be used for performance, but it must not become the authoritative geometry.

## PTH-002 — Supported SVG commands

The parser must accept:

* `M` and `m`
* `L` and `l`
* `H` and `h`
* `V` and `v`
* `C` and `c`
* `S` and `s`
* `Q` and `q`
* `T` and `t`
* `A` and `a`
* `Z` and `z`

Internally, shorthand and relative commands may be normalized to:

* Absolute coordinates
* Explicit segment forms
* Cubic curves where required by the chosen boolean engine

The original shorthand does not need to be preserved.

## PTH-003 — Path validation

Validate:

* Finite coordinates
* Correct command parameter counts
* Valid arc flags
* Non-empty geometry
* Maximum segment count
* Maximum coordinate magnitude
* Maximum number of subpaths

Malformed paths must produce a controlled import error or warning.

They must never crash the editor.

## PTH-004 — Path bounds

Path bounds must account for:

* Line endpoints
* Quadratic extrema
* Cubic extrema
* Arc extrema
* Node transforms
* Parent-group transforms
* Stroke width when visual bounds are requested

Do not calculate path bounds using only control points.

## PTH-005 — Path rendering

The artwork renderer must support normal `PathNode` objects with:

* Fill
* Stroke
* Opacity
* Fill rule
* Transform
* Visibility
* Clipping or masks later

The editor overlay must be separate from the exported path.

## PTH-006 — Path hit testing

For Phase 0.5, browser-native SVG hit testing may be used.

Selection should support:

* Filled path interiors
* Stroked open paths
* Compound paths
* Paths inside transformed groups

Hit testing must not require rasterizing the entire document.

---

# Primitive-to-Path Conversion

## CVP-001 — Conversion support

Implement conversion for:

* Rectangle
* Rounded rectangle
* Ellipse
* Circle
* Line
* Polygon
* Star when available

## CVP-002 — Conversion behavior

Conversion must:

1. Create equivalent path geometry.
2. Preserve fill and stroke.
3. Preserve opacity.
4. Preserve name where possible.
5. Preserve parent and paint-order position.
6. Preserve the existing transform or correctly bake it.
7. Replace the primitive in one undoable transaction.
8. Select the resulting path.

## CVP-003 — Rounded rectangles and ellipses

Rounded rectangles and ellipses must convert to curved path segments.

Do not approximate an ellipse using a large polygon unless the geometry engine explicitly requires flattened paths.

If flattening is required for one boolean engine, keep that conversion inside the geometry adapter.

---

# Boolean Geometry Architecture

## BLN-000 — Destructive booleans first

Phase 0.5 implements destructive boolean operations.

The selected source nodes are replaced with one resulting `PathNode`.

Non-destructive boolean groups are deferred.

## BLN-001 — Required operations

Implement:

* Union
* Subtract front
* Intersect
* Exclude/XOR

Optional after these are stable:

* Subtract back
* Divide
* Trim

## BLN-002 — Supported input

Boolean input may contain:

* Rectangles
* Rounded rectangles
* Ellipses
* Polygons
* Stars
* Closed paths
* Groups whose supported descendants can be flattened

Open lines or open paths must either:

* Be rejected with a clear message, or
* Be outlined into closed geometry before the operation

Do not silently treat an open stroke as a filled region.

## BLN-003 — Geometry-engine abstraction

All boolean operations must go through an adapter.

```ts
export type BooleanOperation =
  | "union"
  | "subtract"
  | "intersect"
  | "exclude";

export interface BooleanOperand {
  id: NodeId;
  geometry: PathGeometry;
  fillRule: "nonzero" | "evenodd";
  transform: Matrix2D;
}

export interface BooleanResult {
  geometry: PathGeometry;
  fillRule: "nonzero" | "evenodd";
  warnings: string[];
}

export interface BooleanGeometryEngine {
  execute(
    operation: BooleanOperation,
    operands: BooleanOperand[],
  ): Promise<BooleanResult>;
}
```

The API is asynchronous even if the initial implementation executes synchronously.

This allows later migration to a Web Worker or WebAssembly engine without changing commands or UI code.

## BLN-004 — No geometry-library leakage

Do not store library-specific path objects in:

* Zustand
* Document nodes
* Command history
* React component state
* Serialized documents

Convert from the application model into adapter input.

Convert adapter output back into `PathGeometry`.

## BLN-005 — Transform flattening

Before boolean execution:

1. Resolve all parent transforms.
2. Calculate each operand's world transform.
3. Apply the world transform to its path geometry.
4. Execute the boolean operation in one shared coordinate system.
5. Create the result in the selected common parent.
6. Convert result coordinates into that parent's local coordinate system.

Do not perform boolean operations on unflattened local geometry from differently transformed nodes.

## BLN-006 — Paint and metadata behavior

For Phase 0.5:

* Result fill comes from the bottom-most selected operand, or from a clearly documented consistent rule.
* Result stroke is removed by default unless the implementation can preserve it safely.
* Result opacity defaults to the chosen source object's object opacity.
* Result name describes the operation, for example `Union`.
* Result is inserted at the highest selected paint-order position.
* All source nodes are removed in the same transaction.
* Result becomes selected.

The chosen style rule must be documented and tested.

## BLN-007 — Fill rules and holes

Boolean results must support multiple contours.

Holes must be represented using:

* Correct contour direction with `nonzero`, or
* `evenodd`

Do not split every hole into an unrelated visible path unless that behavior is explicitly required by the geometry engine.

## BLN-008 — Empty results

An operation may produce no visible geometry.

Examples:

* Intersecting non-overlapping shapes
* Subtracting a shape completely

The command must:

* Display a non-destructive warning, or
* Require confirmation before deleting all sources

For the prototype, prefer retaining source objects and reporting:

`The boolean operation produced an empty result.`

## BLN-009 — Undo behavior

A boolean operation is one undo entry.

Undo restores:

* Every source node
* Parent relationships
* Original paint order
* Styles
* Transforms
* Selection state

Redo recreates the same result deterministically.

## BLN-010 — Error behavior

Geometry-engine failures must:

* Leave source objects unchanged
* Leave history unchanged
* Produce a visible error
* Record diagnostic information in development mode

Never partially delete operands before a successful result has been validated.

## BLN-011 — Worker boundary

The boolean adapter API must support later worker execution.

Use a worker immediately when:

* The chosen engine is WebAssembly-based
* An operation regularly blocks the UI
* Operand segment counts exceed the documented threshold

The UI must expose an in-progress state and prevent duplicate execution.

---

# Boolean Command Lifecycle

```text
User selects operands
→ validate selection
→ resolve common parent
→ convert primitives to temporary path geometry
→ resolve world transforms
→ normalize geometry
→ invoke BooleanGeometryEngine
→ validate result
→ convert result to parent-local geometry
→ begin transaction
→ remove source nodes
→ insert result PathNode
→ select result
→ commit one history entry
```

Source nodes must not be mutated or deleted until the geometry engine returns a valid result.

---

# Boolean User Interface

## BLN-UI-001 — Toolbar or inspector actions

Add visible controls for:

* Union
* Subtract
* Intersect
* Exclude

Controls are enabled only when at least two compatible objects are selected.

## BLN-UI-002 — Operation order

The UI must communicate that selection or paint order affects subtraction.

For `Subtract front`:

* The front-most selected object is the subtracting object.
* Remaining selected objects form the base.

## BLN-UI-003 — Convert to path

Add a visible `Convert to Path` command.

Enable it for supported primitives.

## BLN-UI-004 — Progress and errors

Display:

* Operation in progress
* Unsupported selection
* Open-path warning
* Empty result warning
* Geometry-engine failure

---

# Phase 0.5 Acceptance Tests

## AT-ALP-001 — Independent alpha values

1. Create a rectangle.
2. Set object opacity to 80%.
3. Set fill opacity to 40%.
4. Set stroke opacity to 25%.
5. Export.
6. Reimport.

Expected: all three opacity values remain independently represented.

## AT-ALP-002 — Group opacity

1. Create two overlapping opaque shapes.
2. Group them.
3. Set group opacity to 50%.

Expected: the group is composited with 50% opacity rather than each child being independently rewritten.

## AT-BLN-001 — Union

1. Create two overlapping circles.
2. Select both.
3. Run Union.

Expected:

* One `PathNode`
* Source objects removed
* Overlap boundary removed
* Undo restores both circles
* Redo restores the same result

## AT-BLN-002 — Subtract

1. Place a circle in front of a rectangle.
2. Select both.
3. Run Subtract Front.

Expected: one path representing the rectangle with a circular region removed.

## AT-BLN-003 — Intersect

1. Create overlapping rectangle and circle.
2. Run Intersect.

Expected: only the shared region remains.

## AT-BLN-004 — Exclude

1. Create two overlapping shapes.
2. Run Exclude.

Expected: non-overlapping portions remain and the overlapping area becomes a hole.

## AT-BLN-005 — Transformed operands

1. Create two shapes.
2. Rotate one.
3. Scale the other.
4. Place one inside a transformed group.
5. Run Union.

Expected: result visually matches the pre-operation world-space shapes.

## AT-BLN-006 — Nested groups

1. Create operands inside different nested groups.
2. Select them.
3. Run a boolean operation.

Expected: either correct world-space resolution or a clear unsupported-selection message. No corrupted geometry is permitted.

## AT-BLN-007 — Complex imported paths

1. Import a path containing cubic curves and multiple subpaths.
2. Combine it with a primitive.
3. Export and reimport.

Expected: geometry remains materially equivalent.

## AT-BLN-008 — Empty result

1. Create two non-overlapping shapes.
2. Run Intersect.

Expected: sources remain unchanged and a clear empty-result message is shown.

---

# Phase 0.5 Exit Criteria

Phase 0.5 is complete only when:

* Object, fill, stroke, group, and gradient-stop opacity are represented correctly.
* Transparency survives export and import.
* Supported primitives can be converted to paths.
* Complex imported paths render and export.
* Union, subtract, intersect, and exclude operate on closed shapes.
* Transformed operands are handled correctly.
* Holes and multiple contours export correctly.
* Every operation is one undo entry.
* Failed operations do not modify the document.
* Required automated tests pass.
* The production build and strict type check pass.
