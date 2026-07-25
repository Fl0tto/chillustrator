# Implementation Status

Updated continuously through the Phase 0 build. Legend: ✅ done · 🟡 partial ·
⏳ in progress · ⬜ not started.

## Foundation (Wave 1 — orchestrator) ✅

- ✅ Vite + React 19 + TS strict, ESLint, Prettier, Vitest, Playwright config.
- ✅ Document model + ids + factory + tree ops (`src/model/**`).
- ✅ Geometry: matrix, bounds, node geometry, path bounds, viewport, DOM measure.
- ✅ Command system + Immer-patch history + Zustand store + selectors.
- ✅ Native SVG renderer (artwork + overlay) + CanvasStage.
- ✅ Seed interaction controller: select, move, marquee, create, resize, rotate,
  zoom, pan, keyboard (undo/redo/delete/nudge/tool shortcuts/escape).
- ✅ Minimal functional shell: toolbar, tool rail, inspector, layers, status bar.
- ✅ Core smoke tests green; typecheck + production build green.

## Phase 0 requirements — tracker

| ID | Feature | Status | Notes |
|---|---|---|---|
| APP-001 | Editor shell | 🟡 | Baseline shell; Agent E richer panels pending |
| DOC-001 | New document | 🟡 | 1200×800 default; New/size dialog pending (Agent E) |
| VPT-001 | Viewport pan/zoom | 🟡 | Wheel zoom, space/middle pan, fit-on-mount; zoom-to-fit UI pending |
| SHP-001 | Rectangle | ✅ | Drag-create + inspector |
| SHP-002 | Ellipse | ✅ | Drag-create, shift=circle |
| SHP-003 | Line | ✅ | Drag-create, shift=angle snap |
| SHP-004 | Polygon | 🟡 | Hexagon; adjustable side count pending (Agent E/D) |
| TXT-001 | Basic text | 🟡 | Click-place + inspector edit; on-canvas edit pending |
| SEL-001 | Selection | ✅ | Click, shift-toggle, marquee, deselect |
| TRN-001 | Move | ✅ | Drag + arrow nudge + inspector X/Y |
| TRN-002 | Resize | 🟡 | 8 handles, aspect + min-size; multi-select polish (Agent D) |
| TRN-003 | Rotate | 🟡 | Handle + 15° snap; inspector rotation pending |
| STY-001 | Solid fill | ✅ | Color + hex + none + opacity |
| STY-002 | Stroke | 🟡 | Color/width/none; cap/join/opacity UI pending (Agent E) |
| GRP-001 | Grouping | ✅ | Group/ungroup, nested, layers |
| ORD-001 | Paint order | 🟡 | Commands ready; toolbar buttons pending (Agent E) |
| LYR-001 | Layers panel | 🟡 | Tree/select/rename?/visibility/lock; rename+DnD pending |
| ALN-001 | Alignment | ✅ | 6 edges relative to selection bounds |
| HST-010 | Undo/redo | ✅ | Toolbar + shortcuts, one-entry-per-gesture |
| IMP-001 | Safe import | ✅ | Sanitize→parse→model; toolbar file picker; one undoable transaction |
| EXP-001 | SVG export | ✅ | Clean serializer (precision, pretty, referenced-defs only); download + copy |
| SRC-001 | Source viewer | ✅ | Read-only drawer, live refresh, copy button |
| SAV-001 | Local persistence | ✅ | Debounced localStorage autosave + restore-on-load |
| TST-001 | Tests | 🟡 | Core smoke + SVG-pipeline suite (14 tests); Playwright e2e pending Agent G |

## Known defects / limitations

- Rotation not yet editable numerically in the inspector.
- Layers panel lacks rename + drag-reorder (commands exist).
- Text editing is inspector-only (no in-canvas caret).
- Source viewer is read-only (editable source deferred to Phase 3 / SRC-010).
- Autosave persists the document only; undo history resets on reload (by design).

## Wave 2 (SVG pipeline) — added

- `importExport/serializeSvg.ts` — model→clean SVG (precision, pretty/minified,
  hidden-node omission, referenced-gradient defs only, XML-escaped).
- `importExport/download.ts` — download + clipboard helpers.
- `importExport/persistence.ts` — debounced autosave + restore + clear.
- `importSvg.buildDocumentFromImport` — assemble a document from an import result.
- Wired into the toolbar (Import/Export/Source) + `SourcePanel`; autosave/restore
  in `App`.
- Fixed pre-existing typecheck/lint issues in the wave-2 interaction + import files.
- Tests: `tests/unit/svgPipeline.test.ts` (sanitation, export, round-trip,
  persistence).

## Test results (Wave 1)

- `npx tsc -b` → 0 errors.
- `npx vite build` → success (~255 kB JS / 80 kB gzip).
- `npx vitest run` → 7/7 passing (matrix, history, group/undo, delete).

## Phase 0.5 — Transparency and Boolean Geometry

This wave is now required immediately after the remaining critical Phase 0 integration work.

Legend: ✅ done · 🟡 partial · ⏳ in progress · ⬜ not started.

| ID       | Feature                   | Status | Notes                                                                |
| -------- | ------------------------- | -----: | -------------------------------------------------------------------- |
| ALP-001  | Object opacity            |      ⬜ | Independent `opacity` property                                       |
| ALP-002  | Fill opacity              |     🟡 | Confirm import/export and independent model representation           |
| ALP-003  | Stroke opacity            |      ⬜ | UI, renderer, import, export                                         |
| ALP-004  | Group opacity             |      ⬜ | Must composite group, not rewrite children                           |
| ALP-005  | Gradient-stop opacity     |      ⬜ | Required when gradients are introduced                               |
| ALP-006  | Transparency preview      |      ⬜ | Checkerboard or configurable preview background                      |
| ALP-007  | Alpha round-trip          |      ⬜ | Import → edit → export → reimport                                    |
| PTH-000  | Canonical path model      |      ✅ | `geometry/pathTypes.ts` — normalized M/L/C/Z; ops run on this form   |
| PTH-001  | Full SVG path parser      |      ✅ | `pathParser.ts` — all commands, rel/abs, shorthand, arc→cubic        |
| PTH-002  | Path serializer           |      ✅ | `pathData.serializePath` regenerates `d` from canonical geometry     |
| PTH-003  | Complex path rendering    |     🟡 | Path nodes render fill/stroke/fillRule; curves/subpaths verified in tests |
| PTH-004  | Accurate path bounds      |      ✅ | `geometryBounds` — exact cubic extrema (tested)                      |
| PTH-005  | Path hit testing          |     🟡 | Native SVG hit-testing; hole/transformed-group cases unverified      |
| CVP-001  | Rectangle to path         |      ✅ | `convertToPathCommand`, one undoable replacement                     |
| CVP-002  | Rounded rectangle to path |      ✅ | Curved corners via cubic arcs (tested)                               |
| CVP-003  | Ellipse to path           |      ✅ | 4-cubic ellipse, correct bounds (tested)                             |
| CVP-004  | Polygon/star to path      |      ✅ | Exact vertices preserved                                             |
| CVP-005  | Line/stroke handling      |     🟡 | Open lines rejected before booleans; stroke-outline not yet          |
| BLN-000  | Geometry-engine adapter   |      ✅ | Async `BooleanGeometryEngine`; polygon-clipping isolated in adapter  |
| BLN-001  | Union                     |      ✅ | Destructive result PathNode (AT-BLN-001)                             |
| BLN-002  | Subtract front            |      ✅ | Front-most operand subtracts (AT-BLN-002)                            |
| BLN-003  | Intersect                 |      ✅ | Preserves sources on empty result (AT-BLN-003/008)                   |
| BLN-004  | Exclude/XOR               |      ✅ | evenodd result with holes (AT-BLN-004)                               |
| BLN-005  | Transform flattening      |      ✅ | World-space combine, result→parent-local (AT-BLN-005)               |
| BLN-006  | Compound paths            |      ✅ | Multiple contours + holes via even-odd nesting                       |
| BLN-007  | Boolean undo/redo         |      ✅ | One transaction restores exact hierarchy (tested)                    |
| BLN-008  | Failure safety            |      ✅ | Empty/engine-failure leaves the document untouched                   |
| BLN-009  | Boolean UI                |      ✅ | Toolbar U/S/I/X + Convert-to-Path + transient warnings               |
| BLN-010  | Geometry fixtures         |      ✅ | `tests/unit/{pathGeometry,booleanOps}.test.ts` (26 tests)            |
| PERF-020 | Geometry performance      |      ⬜ | Sync execution; worker migration + timings still pending             |

## Revised immediate implementation order

1. Finish required Playwright vertical-slice test.
2. Add canonical object, fill, and stroke opacity support.
3. Add checkerboard transparency preview.
4. Add opacity import/export round-trip tests.
5. Introduce canonical parsed path representation.
6. Implement primitive-to-path conversion.
7. Introduce asynchronous boolean-engine adapter.
8. Implement Union.
9. Implement Subtract Front.
10. Implement Intersect.
11. Implement Exclude/XOR.
12. Add compound-path and hole handling.
13. Add transformed-operand tests.
14. Add geometry worker where profiling shows blocking behavior.
15. Resume lower-priority Phase 0 polish.

## Features temporarily deprioritized

These items must not block Phase 0.5:

* On-canvas text caret editing
* Editable SVG source
* Layer drag-and-drop reordering
* Advanced layer-panel polish
* Rich typography
* Animation
* Multiple artboards
* Non-destructive booleans
* Gradient mesh
* Collaboration

## Shape Builder (SBL) — added on request

Illustrator-style region picker. Status: ✅ functional.

- `geometry/adapters/shapeArrangement.ts` — incremental planar arrangement:
  each shape splits existing faces via the clipping engine, so cost is
  polynomial in real arrangement complexity, not 2^N (SBL-001).
- Interaction: enter the **Build** tool (rail icon / `B`) with 2+ overlapping
  fillable shapes selected; hover highlights the face under the pointer
  (SBL-002), click toggles faces to keep, Enter/Build merges them into one path,
  Esc cancels. Source shapes are **kept** (per product decision).
- `interactions/useShapeBuilder.ts` (controller + commit), store
  `shapeBuilder` transient session, `renderer/ShapeBuilderOverlay.tsx`.
- Curved inputs are polygonalised at the flatten tolerance (curve-accurate
  regions are a later refinement).
- Tests: `tests/unit/shapeBuilder.test.ts` (6) — 3-face split, disjoint faces,
  many-shape scaling, hit-test, merge, keep-sources commit + undo.

## Feature Wave — Pen/Path Editing · Smart Guides · Fill Alpha

Status: ✅ functional. Built on the existing canonical path model, renderer,
overlay, command/history and interaction contracts — no parallel systems.

### 1. Custom path drawing + editing (Pen / node tools)

- `geometry/editablePath.ts` — pure anchor/handle layer over `PathGeometry`
  (`fromGeometry`/`toGeometry` round-trip; `moveAnchor`, `dragHandle` with
  smooth/symmetric continuity, `setAnchorMode`, `makeSegment{Curved,Straight}`,
  `clampCornerRadius`, `flatAnchors`/`locateAnchor`). Corner radius is a rounded
  fillet emitted at build time, clamped to half of each adjacent segment.
- **Pen tool** (`interactions/usePenTool.ts`, `penPreview.ts`, rail icon / `P`):
  click to add straight anchors, click-drag for symmetric Bézier handles, live
  rubber-band preview (`renderer/PenOverlay.tsx`), click the first anchor to
  close with a real `Z`, Enter/double-click finishes an open path, Escape
  cancels with **no** history, Backspace removes the last uncommitted anchor. One
  finished drawing = one `addNodeCommand`. Finishing hands off to the node tool.
- **Node (direct-selection) tool** (`interactions/usePathEditor.ts`,
  `pathEditActions.ts`, `renderer/PathEditOverlay.tsx`, rail icon / `A`): select
  & move anchors (multi), drag handles, convert anchor mode (corner/smooth/
  symmetric) and segment type (line/curve) from the inspector, and round a
  selected corner via an on-canvas pink grip **or** the inspector "Corner R"
  input. Each committed anchor/handle/mode/segment/radius edit = one entry;
  transient DOM `setAttribute` during drags, one command on release.
- Result is always a normal `PathNode` (`d`) — compatible with Shape Builder,
  booleans, bounds, hit-testing, import/export, and undo/redo.

### 2. Toggleable smart alignment (Smart Guides)

- `interactions/snapping.ts` rewritten into a candidate engine: artboard + every
  visible/unlocked/non-selected object's edges, center, 25%/75%, corners, and
  path anchors; viewport-filtered; candidates cached at gesture start.
- Screen-space thresholds (÷ zoom), Schmitt-trigger **hysteresis** (wider release
  band) and a gentle movement-**direction** bias in ranking. Rotation snapping to
  nearby / parallel / perpendicular angles (`snapRotation`).
- Integrated into move, resize, rotate (`useCanvasController`) and anchor
  placement/movement (pen + node editors). **Alt** temporarily bypasses; **Shift**
  angle constraint takes precedence during rotation.
- Active guides render as dotted lines + concise labels (`Center ↔ Center`,
  `Right edge ↔ Left edge`, `25% ↔ 75%`, `Anchor ↔ Anchor`, `Parallel`, `90°`)
  in `renderer/GuidesOverlay.tsx` — overlay only, never exported.
- Global toolbar toggle with a visible active state (`data-testid=
  toggle-smart-guides`), persisted via `persistence.{save,load}Preferences`.

### 3. Fill alpha

- Model already separates object / fill / stroke opacity; added
  `setFillOpacityCommand` / `setStrokeOpacityCommand` (absolute → coalescable)
  and inspector percentage + slider controls with **mixed-value** handling for
  multi-selection. Slider drags coalesce into one undo entry via the new
  `applyCoalesced(command, key)` store action (history `coalesceKey`/`coalesceBase`).
- Import normalizes fill alpha from `fill-opacity`, inline styles, `rgba()`, and
  8-digit hex (existing `svgStyle`/`color`); export emits independent
  `fill-opacity`/`stroke-opacity`. Round-trip preserves all three alphas.
- Non-exported checkerboard preview retained; added a toolbar toggle
  (`data-testid=toggle-checkerboard`).

### Tests

- Unit: `editablePath.test.ts` (12), `snapping.test.ts` (13),
  `transparency.test.ts` (9). Integration: `pathEdit.integration.test.ts` (7).
  Covers open/closed drawing, straight/curved segments, anchor/handle editing,
  corner-radius clamping, path export/reimport, edge/center/quarter/anchor/
  parallel/perpendicular snapping, direction ranking, hysteresis, guides-disabled
  & Alt-bypass paths, guides absent from exports, independent alpha round-trip,
  and one-history-entry-per-gesture. All existing Shape Builder + boolean tests
  preserved (87 unit/integration total, green).
- E2E: `tests/e2e/featureWave.spec.ts` (2, chromium green) — full flow of smart
  snapping, fill alpha, pen creation, path editing, export, undo and redo, using
  a dev-only `window.__editorStore` hook for deterministic canvas coordinates.

### Performance observations

- Candidates collected once at gesture start and viewport-filtered; pointer
  moves do only per-frame candidate scanning + one transient DOM write (no
  full-scene geometry per event), matching PERF-001/002. Guides live in overlay
  state only. Slider coalescing keeps history compact during continuous drags.

### Limitations

- Corner-radius grip offset is a fixed screen distance (not zoom-scaled); the
  radius value itself is exact and clamped.
- Node editor doesn't yet add/delete on-path anchors or split segments by
  clicking the curve (move/convert/round only).
- Rotation guides render as a label at the pivot (no protractor arc).
- Path-anchor snap candidates are capped (400/scene) to bound cost on very dense
  imported paths.

### Changed / added files

- Added: `geometry/editablePath.ts`, `interactions/{usePenTool,usePathEditor,
  pathEditActions,penPreview}.ts`, `renderer/{GuidesOverlay,PenOverlay,
  PathEditOverlay}.tsx`, `tests/unit/{editablePath,snapping,transparency}.test.ts`,
  `tests/integration/pathEdit.integration.test.ts`, `tests/e2e/featureWave.spec.ts`.
- Rewritten: `interactions/snapping.ts`.
- Edited: `store/{editorStore,history,selectors}.ts`,
  `commands/styleCommands.ts`, `interactions/useCanvasController.ts`,
  `importExport/persistence.ts`, `renderer/{CanvasStage,EditorOverlay}.tsx`,
  `app/EditorShell.tsx`, `app/panels/InspectorPanel.tsx`,
  `geometry/editablePath.ts` (fillet), `styles/{tokens,editor}.css`, `main.tsx`.
