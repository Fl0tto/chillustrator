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
| PTH-000  | Canonical path model      |      ⬜ | Parsed geometry must become authoritative                            |
| PTH-001  | Full SVG path parser      |      ⬜ | M/L/H/V/C/S/Q/T/A/Z, relative and absolute                           |
| PTH-002  | Path serializer           |     🟡 | Existing `d` serialization must be connected to canonical geometry   |
| PTH-003  | Complex path rendering    |     🟡 | Imported paths render; curves/subpaths require explicit verification |
| PTH-004  | Accurate path bounds      |     🟡 | Verify cubic, quadratic, arc extrema and transformed groups          |
| PTH-005  | Path hit testing          |     🟡 | Verify fill, stroke, holes and transformed groups                    |
| CVP-001  | Rectangle to path         |      ⬜ | One undoable replacement                                             |
| CVP-002  | Rounded rectangle to path |      ⬜ | Preserve curved corners                                             |
| CVP-003  | Ellipse to path           |      ⬜ | Preserve curve geometry                                              |
| CVP-004  | Polygon/star to path      |      ⬜ | Preserve exact vertices                                             |
| CVP-005  | Line/stroke handling      |      ⬜ | Reject open geometry or outline stroke before booleans               |
| BLN-000  | Geometry-engine adapter   |      ⬜ | Async, implementation-independent boundary                           |
| BLN-001  | Union                     |      ⬜ | Destructive result PathNode                                          |
| BLN-002  | Subtract front            |      ⬜ | Front-most selected operand subtracts                                |
| BLN-003  | Intersect                 |      ⬜ | Preserve sources on empty result                                     |
| BLN-004  | Exclude/XOR               |      ⬜ | Correct holes and fill rules                                         |
| BLN-005  | Transform flattening      |      ⬜ | Resolve world and parent-local coordinates                           |
| BLN-006  | Compound paths            |      ⬜ | Multiple contours and holes                                          |
| BLN-007  | Boolean undo/redo         |      ⬜ | Restore exact source hierarchy and ordering                          |
| BLN-008  | Failure safety            |      ⬜ | Failed operations make no document changes                           |
| BLN-009  | Boolean UI                |      ⬜ | Visible toolbar/inspector actions                                    |
| BLN-010  | Geometry fixtures         |      ⬜ | Curves, holes, nested transforms, empty results                      |
| PERF-020 | Geometry performance      |      ⬜ | Record operation timings and move heavy work off UI thread           |

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
* Shape Builder
* Gradient mesh
* Collaboration
