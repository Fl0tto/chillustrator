---
title: "Open-Source SVG Logo Editor — Product Specification, Architecture, and Implementation Roadmap"
document_type: "AI-readable product and implementation specification"
version: "0.2.0"
status: "Draft for prototype implementation"
last_reviewed: "2026-07-24"
primary_goal: "Build a browser-based, open-source SVG and logo editor with a clean path from a one-prompt prototype to a professional vector-design application."
prototype_target: "Phase 0 and selected Phase 1 features"
recommended_stack: "React + TypeScript + Vite, native SVG rendering, Zustand, Immer, Vitest, Playwright"
license_target: "Open-source; choose license before accepting external contributions"
---

# 1. How to Use This Document

This file is intentionally structured so it can be given directly to a capable coding model or an orchestrating agent.

The implementation model should:

1. Read the entire document before writing code.
2. Implement only the requested phase.
3. Treat requirement IDs and acceptance criteria as authoritative.
4. Keep the document model independent from the UI framework.
5. Prefer a small, functioning vertical slice over incomplete breadth.
6. Run type checks, tests, and a production build before declaring completion.
7. Document any intentionally omitted or substituted requirement.
8. Never silently replace a required interaction with a static mock.

For a one-prompt prototype, instruct the model to implement **Phase 0** and the specifically identified **Phase 1 stretch features**. Do not request the entire backlog in one implementation pass.

---

# 2. Product Vision

Create an open-source web application that lets designers create, edit, inspect, and export clean SVG logos without requiring a proprietary desktop application.

The application should eventually support:

- Geometric logo construction
- Bézier path editing
- Shape boolean operations
- Text and text-to-path workflows
- Fills, strokes, gradients, clipping, and masks
- Structured layers and groups
- Clean SVG import, inspection, optimization, and export
- Reusable brand assets and logo variants
- Optional SVG animation
- A plugin-friendly architecture

The product should be designed as an SVG-native editor rather than as a generic raster canvas application.

---

# 3. Product Principles

## P-001 — SVG is the source format

The application document model must map cleanly to SVG concepts.

Do not make an HTML canvas bitmap or a framework-specific component tree the authoritative document representation.

## P-002 — Separate model, geometry, renderer, and UI

The architecture must keep these concerns separate:

1. Document model
2. Command and history system
3. Geometry engine
4. SVG renderer
5. Interaction controller
6. Editor panels and UI chrome
7. Import/export pipeline

## P-003 — Direct manipulation must feel immediate

Dragging, resizing, rotating, and moving path anchors should render at interactive frame rates.

High-frequency pointer movement must not trigger broad application rerenders or serialize the complete document.

## P-004 — Preserve editability

Prefer non-destructive operations where practical.

Examples:

- Keep primitive parameters until conversion to path.
- Keep editable text until explicitly converted to outlines.
- Allow boolean source objects to remain available for non-destructive booleans in later phases.
- Preserve unknown safe SVG attributes on import.

## P-005 — Export clean, portable SVG

The exported SVG should:

- Open in normal browsers.
- Avoid editor-specific metadata unless requested.
- Preserve meaningful IDs when requested.
- Avoid unnecessary groups, transforms, and definitions.
- Contain no executable scripts or unsafe event handlers.
- Support configurable numeric precision.

## P-006 — Progressive complexity

The initial prototype should solve common geometric-logo workflows well.

Advanced typography, filters, animation, collaboration, print color, and plugin systems should not compromise the initial editor architecture.

---

# 4. Recommended Technology Decision

## 4.1 Recommended prototype stack

Use:

- **React**
- **TypeScript with strict mode**
- **Vite**
- **Native SVG DOM rendering**
- **Zustand with selector-based subscriptions**
- **Immer patches or an explicit command system for history**
- **Vitest**
- **Playwright**
- **CodeMirror 6 for SVG source inspection**
- **DOMPurify or an equally strict SVG sanitation layer**
- **SVGO behind a controlled export adapter**
- **Lucide or another lightweight icon set**
- **Plain CSS, CSS Modules, or a small token-based styling system**

Use the latest stable versions available when implementation begins. Avoid prerelease dependencies in the prototype.

## 4.2 Why React is recommended despite performance concerns

React is recommended for the first prototype because:

- The developer already has React and Vite experience.
- Coding models generally produce and repair React code reliably.
- React has a large ecosystem for panels, accessibility, testing, and state management.
- The framework is not expected to perform path geometry or full-document updates on every pointer event.
- The most important performance decisions are architectural, not framework-brand decisions.

React should manage:

- Toolbar
- Inspector
- Layers panel
- Dialogs
- Menus
- Static or low-frequency canvas object rendering
- Selection state presentation
- Document metadata

React should not be responsible for a full application-state update on every pixel of pointer movement.

During a drag operation:

1. Capture the starting document state.
2. Apply visual movement directly to the selected SVG element or a transient interaction layer using `requestAnimationFrame`.
3. Update only lightweight interaction state while dragging.
4. Commit one document command when the pointer is released.
5. Add one undo entry for the complete interaction.

This avoids the common failure mode where the entire object tree rerenders 60 to 240 times per second.

## 4.3 Vue

Vue 3 with Vite is a strong alternative.

Advantages:

- Ergonomic templates
- Good TypeScript support
- Fine-grained dependency tracking in common component usage
- Straightforward state and computed-value patterns
- Good performance for ordinary editor UI

Disadvantages for this project:

- Switching frameworks would create learning and prompting overhead.
- It does not remove the need for an imperative high-frequency interaction layer.
- The geometry engine, history model, and SVG architecture remain the difficult parts.

Recommendation: choose Vue only if the primary maintainers strongly prefer Vue syntax and ecosystem. Do not switch solely because SVG editing is performance-sensitive.

## 4.4 Angular

Angular is not recommended for the initial prototype.

Angular can be built to perform well, but its application structure, dependency-injection patterns, and framework surface add complexity that provides little direct value to a browser-only SVG editor prototype.

It may be appropriate later for a large enterprise team with strict organizational conventions, but it is not a performance shortcut.

## 4.5 Solid

Solid is technically attractive because of fine-grained reactivity and targeted DOM updates.

Potential advantages:

- Low update overhead
- JSX syntax familiar to React developers
- Natural fit for many small reactive properties

Risks:

- Smaller ecosystem
- Lower probability that arbitrary coding agents produce idiomatic, maintainable Solid code
- Fewer editor-specific examples and integrations
- Harder contributor onboarding than React

Recommendation: consider Solid for an experimental renderer branch after the document model and interaction benchmarks exist. Do not use it as the default one-shot prototype stack unless the implementation model has demonstrated strong Solid competence.

## 4.6 Svelte

Svelte is also a credible alternative.

Potential advantages:

- Compact component syntax
- Good runtime performance
- Fine-grained compiled updates
- Pleasant local-state authoring

Risks:

- Large deeply reactive object graphs still require careful design.
- The editor must avoid proxying and mutating a huge document tree indiscriminately.
- AI-generated architecture is generally more predictable in React for a large multi-panel application.

Recommendation: viable, but React remains the lower-risk prototype choice.

## 4.7 Renderer decision: native SVG first

Use native inline SVG for the editable artwork.

Benefits:

- Direct correspondence to the export format
- Native browser hit testing
- Native text rendering
- Native gradients, patterns, clipping paths, and masks
- Easy inspection
- Accessible DOM
- Straightforward copy/export
- No need to rebuild every SVG feature on Canvas

Use a second overlay SVG for:

- Selection bounds
- Resize handles
- Rotation handles
- Anchor points
- Bézier handles
- Snap guides
- Marquee selection

Do not mix editor handles into exported artwork.

## 4.8 When Canvas or WebGL may be added

Canvas or WebGL may later be used for:

- Extremely large imported documents
- Thumbnail rendering
- Minimap rendering
- Heavy previews
- Complex filters
- Animation previews
- Raster tracing
- Offscreen hit maps

They should not replace the SVG-native document and export model in the prototype.

## 4.9 Geometry-library strategy

Keep third-party geometry behind adapter interfaces.

Suggested progression:

### Prototype

- Implement primitive shape transforms directly.
- Use browser `DOMMatrix` and typed utility functions.
- Defer complex path booleans unless a reliable adapter can be isolated.
- If booleans are included, use a dedicated adapter around a tested library rather than embedding library objects in the document state.

### Later

Evaluate:

- Paper.js for convenient path operations in an isolated geometry scope
- PathKit or another Skia PathOps WebAssembly build for curve-aware operations
- Clipper2 for polygon clipping and offsetting after flattening paths
- Dedicated path parsing and normalization libraries
- Web Workers for booleans, simplification, outlining, and tracing

Never let a third-party scene graph become the only source of truth.

---

# 5. System Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Editor UI                                                    │
│ Toolbar · Inspector · Layers · Menus · Dialogs · Status Bar  │
└───────────────────────────────┬──────────────────────────────┘
                                │ commands/selectors
┌───────────────────────────────▼──────────────────────────────┐
│ Application Store                                            │
│ document · selection · viewport · tool · preferences         │
└──────────────┬────────────────┬────────────────┬─────────────┘
               │                │                │
        ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼───────────┐
        │ Command and │  │ Interaction │  │ Serialization   │
        │ History     │  │ Controller  │  │ Import/Export   │
        └──────┬──────┘  └──────┬──────┘  └─────┬───────────┘
               │                │               │
        ┌──────▼────────────────▼───────────────▼─────────────┐
        │ Framework-independent document and geometry APIs     │
        └────────────────────────┬─────────────────────────────┘
                                 │
                 ┌───────────────▼────────────────┐
                 │ Native SVG renderer             │
                 │ Artwork SVG + editor overlay SVG│
                 └─────────────────────────────────┘
```

---

# 6. Repository Structure

```text
/
├─ README.md
├─ LICENSE
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ index.html
├─ docs/
│  ├─ architecture.md
│  ├─ decisions/
│  │  ├─ 0001-document-model.md
│  │  ├─ 0002-history.md
│  │  └─ 0003-renderer.md
│  └─ implementation-status.md
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ EditorShell.tsx
│  │  └─ routes.ts
│  ├─ model/
│  │  ├─ document.ts
│  │  ├─ nodes.ts
│  │  ├─ paint.ts
│  │  ├─ transforms.ts
│  │  ├─ ids.ts
│  │  └─ validation.ts
│  ├─ store/
│  │  ├─ editorStore.ts
│  │  ├─ selectors.ts
│  │  ├─ transactions.ts
│  │  └─ history.ts
│  ├─ commands/
│  │  ├─ command.ts
│  │  ├─ nodeCommands.ts
│  │  ├─ transformCommands.ts
│  │  ├─ styleCommands.ts
│  │  └─ layerCommands.ts
│  ├─ geometry/
│  │  ├─ matrix.ts
│  │  ├─ bounds.ts
│  │  ├─ points.ts
│  │  ├─ pathParser.ts
│  │  ├─ pathSerializer.ts
│  │  ├─ hitTesting.ts
│  │  └─ adapters/
│  │     └─ booleanAdapter.ts
│  ├─ renderer/
│  │  ├─ ArtworkSvg.tsx
│  │  ├─ SvgNodeRenderer.tsx
│  │  ├─ DefsRenderer.tsx
│  │  ├─ EditorOverlay.tsx
│  │  └─ renderAttributes.ts
│  ├─ interactions/
│  │  ├─ pointerController.ts
│  │  ├─ selectionController.ts
│  │  ├─ transformController.ts
│  │  ├─ marqueeController.ts
│  │  ├─ keyboardController.ts
│  │  ├─ snapping.ts
│  │  └─ tools/
│  │     ├─ selectTool.ts
│  │     ├─ rectangleTool.ts
│  │     ├─ ellipseTool.ts
│  │     ├─ lineTool.ts
│  │     ├─ textTool.ts
│  │     └─ penTool.ts
│  ├─ importExport/
│  │  ├─ importSvg.ts
│  │  ├─ sanitizeSvg.ts
│  │  ├─ serializeSvg.ts
│  │  ├─ optimizeSvg.ts
│  │  └─ download.ts
│  ├─ components/
│  │  ├─ toolbar/
│  │  ├─ inspector/
│  │  ├─ layers/
│  │  ├─ dialogs/
│  │  └─ common/
│  ├─ features/
│  │  ├─ gradients/
│  │  ├─ text/
│  │  ├─ booleans/
│  │  └─ sourceEditor/
│  ├─ styles/
│  │  ├─ tokens.css
│  │  ├─ global.css
│  │  └─ editor.css
│  ├─ workers/
│  │  └─ geometry.worker.ts
│  └─ test/
│     ├─ fixtures/
│     └─ setup.ts
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
└─ public/
```

The prototype may use a reduced version of this tree, but boundaries between model, commands, interactions, rendering, and import/export must remain visible.

---

# 7. Core Document Model

## 7.1 General rules

- Use normalized node storage.
- Each node has a stable unique ID.
- Parent-child order determines paint order.
- Definitions such as gradients and clipping paths are stored separately or as definition nodes.
- Selection references IDs, not object references.
- UI-only state must not be serialized into the exported SVG.
- Preserve safe unknown SVG attributes in an `extraAttributes` map.
- Avoid storing raw DOM nodes in application state.

## 7.2 Suggested TypeScript model

```ts
export type NodeId = string;
export type PaintId = string;

export interface SvgDocumentModel {
  schemaVersion: number;
  documentId: string;
  name: string;
  width: number;
  height: number;
  viewBox: [number, number, number, number];
  rootNodeIds: NodeId[];
  nodes: Record<NodeId, SvgNode>;
  paints: Record<PaintId, PaintDefinition>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    generator?: string;
  };
}

export type SvgNode =
  | GroupNode
  | RectNode
  | EllipseNode
  | LineNode
  | PolygonNode
  | PathNode
  | TextNode
  | ImageNode
  | UnknownSafeNode;

export interface BaseNode {
  id: NodeId;
  type: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  transform: Matrix2D;
  parentId: NodeId | null;
  childIds?: NodeId[];
  style: NodeStyle;
  extraAttributes?: Record<string, string>;
}

export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface NodeStyle {
  fill: PaintReference | null;
  stroke: PaintReference | null;
  strokeWidth: number;
  strokeLinecap: "butt" | "round" | "square";
  strokeLinejoin: "miter" | "round" | "bevel";
  strokeMiterlimit: number;
  strokeDasharray: number[];
  strokeDashoffset: number;
  fillRule: "nonzero" | "evenodd";
  blendMode?: string;
}

export interface PaintReference {
  kind: "solid" | "definition";
  value: string;
  opacity: number;
}

export interface RectNode extends BaseNode {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
}

export interface EllipseNode extends BaseNode {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineNode extends BaseNode {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PolygonNode extends BaseNode {
  type: "polygon";
  points: Array<{ x: number; y: number }>;
  closed: boolean;
}

export interface PathNode extends BaseNode {
  type: "path";
  d: string;
  parsedPathVersion?: number;
}

export interface TextNode extends BaseNode {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: "normal" | "italic" | "oblique";
  letterSpacing: number;
  textAnchor: "start" | "middle" | "end";
}

export interface GroupNode extends BaseNode {
  type: "group";
  childIds: NodeId[];
}
```

## 7.3 State domains

Keep these domains separate:

### Persistent document state

- Nodes
- Paints
- Artboard dimensions
- ViewBox
- Document metadata

### Editor state

- Current tool
- Selection
- Hovered node
- Viewport zoom
- Viewport pan
- Active panel
- Snap settings
- User preferences

### Transient interaction state

- Pointer start position
- Current drag delta
- Active transform handle
- Original transforms
- Marquee bounds
- Preview geometry
- Snap candidates

Transient interaction state should not be added to undo history.

---

# 8. Command and History System

## HST-001 — Atomic commands

Every persistent edit should be represented as an atomic command or transaction.

Examples:

- Add node
- Delete nodes
- Move nodes
- Transform nodes
- Change fill
- Change stroke
- Rename node
- Reorder node
- Group nodes
- Ungroup nodes
- Import document

## HST-002 — One interaction, one history entry

A drag that produces 200 pointer events must create one undo entry.

## HST-003 — Transaction support

Multiple low-level edits may be grouped into one user-visible command.

Example:

```text
"Group selected objects"
- Create group
- Remove selected IDs from old parents
- Add selected IDs to group
- Insert group into common parent
- Select group
```

## HST-004 — History limits

Prototype defaults:

- Maximum 100 entries
- Clear redo stack after a new edit
- Do not store viewport-only changes
- Do not store hover changes
- Allow explicit document reset

## HST-005 — Import as one transaction

Importing an SVG should be reversible with one Undo action.

---

# 9. Coordinate Systems and Transforms

The implementation must explicitly distinguish:

1. Browser client coordinates
2. Editor viewport coordinates
3. Root SVG user coordinates
4. Local node coordinates
5. Parent-group coordinates

Use `DOMPoint` and `DOMMatrix` where practical, wrapped in framework-independent utility functions.

Required utilities:

- Client point to root SVG point
- Root SVG point to node-local point
- Matrix multiplication
- Matrix inversion
- Point transformation
- Bounds transformation
- Compose translate/rotate/scale
- Decompose matrix for inspector display
- Apply transform around arbitrary origin
- Calculate selection bounds in root coordinates

Do not assume transforms are only translation and uniform scale.

---

# 10. Performance Architecture

## PERF-001 — No full store write per pointer event

High-frequency interactions should use transient values and direct visual updates.

## PERF-002 — Commit on pointer release

Persistent state updates occur at the end of an interaction, except when continuous state is required for a specific tool.

## PERF-003 — Selective subscriptions

Components subscribe only to the minimum state they render.

Examples:

- A layer row subscribes to its node name, visibility, lock state, and selection state.
- The fill inspector subscribes only to the selected node style summary.
- The canvas does not subscribe to open-panel state.

## PERF-004 — Memoized node rendering

An unchanged node must not rerender because another unrelated node changed.

## PERF-005 — Separate artwork and overlay

The selection overlay should rerender independently from the artwork tree.

## PERF-006 — `requestAnimationFrame`

Batch transient pointer updates into one frame.

## PERF-007 — Avoid repeated layout reads

Read required geometry once at interaction start when possible.

Do not alternate layout reads and DOM writes in the same frame.

## PERF-008 — Worker boundary

Move these operations to a Web Worker when implemented:

- Boolean path operations
- Path simplification
- Stroke outlining
- Raster tracing
- Large-document optimization
- Expensive path measurements

## PERF-009 — Layer virtualization

Virtualize the layers panel when visible rows exceed a practical threshold, such as 300 to 500 rows.

## PERF-010 — Prototype performance targets

These are engineering targets, not contractual guarantees:

- Smooth manipulation of 500 simple SVG objects on a modern desktop browser
- No visible full-editor rerender while dragging one object
- Selection feedback within one animation frame
- Undo and redo response below 100 ms for ordinary edits
- Import and render a typical logo SVG below 1 MB without freezing the UI
- Production build with no unresolved TypeScript errors

Create a benchmark fixture containing:

- 500 rectangles
- 200 mixed primitives
- 100 nested groups
- 20 gradients
- 50 text nodes

---

# 11. Prototype Scope

The first prototype must be useful, coherent, and testable.

It should not attempt to reproduce all of Illustrator.

## 11.1 Phase 0 — One-prompt prototype

### Required features

#### APP-001 — Editor shell

- Top toolbar
- Left tool rail
- Central canvas
- Right properties inspector
- Right or left layers panel
- Bottom status bar
- Responsive minimum desktop layout
- Dark and light-neutral UI is acceptable; visual polish is secondary to clarity

#### DOC-001 — New document

- Default document: 1200 × 800
- Editable width and height
- Root viewBox matches document dimensions
- Transparent artwork background
- Optional checkerboard or configurable preview background

#### VPT-001 — Viewport

- Pan with space-drag or middle mouse
- Wheel or trackpad zoom
- Zoom centered around pointer
- Zoom to 100%
- Zoom to artwork or document
- Display zoom percentage

#### SHP-001 — Rectangle

- Create by drag
- Editable X, Y, width, height
- Editable corner radius
- Convert to path may be deferred

#### SHP-002 — Ellipse

- Create by drag
- Editable center and radii through width/height inspector
- Hold modifier to constrain to circle

#### SHP-003 — Line

- Create by drag
- Editable endpoints
- Hold modifier for angle constraint

#### SHP-004 — Polygon or star

At least one of these must be implemented.

Preferred prototype: polygon with adjustable side count before placement.

#### TXT-001 — Basic text

- Click to add point text
- Edit text content in inspector
- Font family text input or small safe-font list
- Font size
- Font weight
- Text fill
- Text remains editable

#### SEL-001 — Object selection

- Click to select
- Shift-click to toggle
- Click empty canvas to deselect
- Marquee selection
- Selection reflected in layers panel

#### TRN-001 — Move

- Drag selected object or selection
- Arrow-key nudge
- Shift-arrow larger nudge
- Inspector X and Y editing
- One undo entry per drag

#### TRN-002 — Resize

- Eight resize handles
- Corner resize
- Edge resize
- Modifier to preserve aspect ratio
- Multi-selection bounding-box resize
- Minimum size guard
- One undo entry per resize

#### TRN-003 — Rotate

- Rotation handle
- Modifier for angle snapping
- Inspector rotation input
- One undo entry per rotation

#### STY-001 — Solid fill

- No fill
- Hex color input
- Visual color input
- Fill opacity

#### STY-002 — Stroke

- No stroke
- Stroke color
- Stroke width
- Line cap
- Line join
- Stroke opacity

#### GRP-001 — Grouping

- Group selected objects
- Ungroup
- Nested groups supported
- Group displayed in layers panel

#### ORD-001 — Paint order

- Bring forward
- Send backward
- Bring to front
- Send to back
- Drag reorder in layers panel is a stretch requirement

#### LYR-001 — Layers panel

- Display node hierarchy
- Select node
- Rename node
- Toggle visibility
- Toggle lock
- Expand and collapse groups
- Show node-type icon
- Preserve paint order

#### ALN-001 — Alignment

- Align left
- Align center horizontally
- Align right
- Align top
- Align center vertically
- Align bottom
- Align relative to selection bounds

#### HST-010 — Undo and redo

- Toolbar controls
- Keyboard shortcuts
- At least 100 ordinary edits
- Drag interactions collapse to single entries

#### IMP-001 — Safe SVG import

- File picker
- Parse with `DOMParser`
- Reject malformed XML
- Remove scripts and event-handler attributes
- Block unsafe external references by default
- Import groups, paths, rectangles, circles/ellipses, lines, polygons, and text when supported
- Preserve unsupported safe elements as read-only unknown nodes or display a clear warning
- Import is one undoable transaction

#### EXP-001 — SVG export

- Download full document
- Copy SVG source
- Configurable numeric precision
- Clean root SVG with namespace and viewBox
- No editor overlay
- No scripts
- No transient state
- Optional pretty or minified output

#### SRC-001 — SVG source viewer

- Read-only source panel in the prototype
- Syntax-highlighted source
- Refreshes after committed document edits
- Copy source button
- Editable source is deferred unless time permits

#### SAV-001 — Local persistence

- Autosave current document to local storage or IndexedDB after debouncing
- Restore the most recent document on reload
- Clear/reset document action

#### TST-001 — Tests

- Unit tests for matrix utilities
- Unit tests for history
- Unit tests for serialization
- Unit tests for node ordering
- At least one import sanitation test
- Playwright test for create → move → style → undo → export

### Phase 0 stretch features

Implement only after all required Phase 0 criteria pass.

- Pen tool with straight segments
- Basic linear gradients
- Snapping to artboard center and object edges
- Editable source panel
- Duplicate command
- Drag reorder in layers
- Basic path-node rendering
- Simple union/intersect boolean adapter

## 11.2 Explicit Phase 0 non-goals

Do not implement these in the initial one-prompt prototype unless all required work is complete:

- Collaboration
- Accounts or backend
- Cloud storage
- Comments
- Animation timeline
- Raster image tracing
- Gradient mesh
- Freeform gradient
- CMYK
- PDF or EPS export
- Plugin marketplace
- AI image generation
- Advanced text shaping
- Text-on-path
- Variable fonts
- Compound boolean history
- Shape Builder
- Full Illustrator file import
- Mobile touch-first UI
- Multiple artboards

---

# 12. Detailed Feature Backlog

## 12.1 Document and viewport

- [ ] DOC-010 Infinite workspace around bounded artboard
- [ ] DOC-011 Multiple artboards
- [ ] DOC-012 Artboard rename
- [ ] DOC-013 Artboard reorder
- [ ] DOC-014 Fit artboard to selection
- [ ] DOC-015 Export selected artboards
- [ ] DOC-016 Document units
- [ ] VPT-010 Rulers
- [ ] VPT-011 Guides
- [ ] VPT-012 Grid
- [ ] VPT-013 Snap to grid
- [ ] VPT-014 Snap to guides
- [ ] VPT-015 Smart guides
- [ ] VPT-016 Minimap

## 12.2 Selection and transforms

- [ ] SEL-010 Select by type
- [ ] SEL-011 Select same fill
- [ ] SEL-012 Select same stroke
- [ ] SEL-013 Isolation mode
- [ ] SEL-014 Lasso selection
- [ ] TRN-010 Set transform origin
- [ ] TRN-011 Flip horizontal
- [ ] TRN-012 Flip vertical
- [ ] TRN-013 Skew
- [ ] TRN-014 Numeric matrix editor
- [ ] TRN-015 Transform each
- [ ] TRN-016 Repeat transform
- [ ] TRN-017 Bake transform into geometry
- [ ] TRN-018 Scale strokes toggle

## 12.3 Primitive shapes

- [ ] SHP-010 Rounded rectangle with independent corners
- [ ] SHP-011 Star
- [ ] SHP-012 Arc
- [ ] SHP-013 Pie segment
- [ ] SHP-014 Ring or donut
- [ ] SHP-015 Spiral
- [ ] SHP-016 Live primitive parameters
- [ ] SHP-017 Convert primitive to path

## 12.4 Pen and path editing

- [ ] PTH-001 Pen: straight anchors
- [ ] PTH-002 Pen: Bézier handles
- [ ] PTH-003 Continue existing path
- [ ] PTH-004 Close path
- [ ] PTH-005 Direct anchor selection
- [ ] PTH-006 Move anchors
- [ ] PTH-007 Move handles
- [ ] PTH-008 Corner to smooth conversion
- [ ] PTH-009 Break linked handles
- [ ] PTH-010 Add anchor
- [ ] PTH-011 Delete anchor
- [ ] PTH-012 Join endpoints
- [ ] PTH-013 Split path
- [ ] PTH-014 Reverse path direction
- [ ] PTH-015 Drag segment to reshape
- [ ] PTH-016 Pencil tool
- [ ] PTH-017 Smooth path
- [ ] PTH-018 Simplify path
- [ ] PTH-019 Offset path
- [ ] PTH-020 Outline stroke
- [ ] PTH-021 Knife tool
- [ ] PTH-022 Scissors tool
- [ ] PTH-023 Eraser tool

## 12.5 Boolean operations and compound geometry

- [ ] BLN-001 Union
- [ ] BLN-002 Subtract front
- [ ] BLN-003 Subtract back
- [ ] BLN-004 Intersect
- [ ] BLN-005 Exclude/XOR
- [ ] BLN-006 Divide
- [ ] BLN-007 Trim
- [ ] BLN-008 Crop
- [ ] BLN-009 Merge touching regions
- [ ] BLN-010 Non-destructive boolean group
- [ ] BLN-011 Expand boolean result
- [ ] CMP-001 Create compound path
- [ ] CMP-002 Release compound path
- [ ] CMP-003 Even-odd fill rule
- [ ] CMP-004 Reverse subpath
- [ ] SBL-001 Shape Builder region detection
- [ ] SBL-002 Hover region preview
- [ ] SBL-003 Merge dragged regions
- [ ] SBL-004 Delete region
- [ ] SBL-005 Preserve or replace source geometry

## 12.6 Fill and stroke

- [ ] STY-010 Dash array editor
- [ ] STY-011 Dash offset
- [ ] STY-012 Arrowheads
- [ ] STY-013 SVG markers
- [ ] STY-014 Variable-width stroke
- [ ] STY-015 Stroke profile
- [ ] STY-016 Inside/outside stroke simulation
- [ ] STY-017 Multiple fills
- [ ] STY-018 Multiple strokes
- [ ] STY-019 Appearance stack
- [ ] STY-020 Save appearance style

## 12.7 Color

- [ ] CLR-001 RGB input
- [ ] CLR-002 HSL input
- [ ] CLR-003 HSV input
- [ ] CLR-004 Alpha
- [ ] CLR-005 Eyedropper
- [ ] CLR-006 Recent colors
- [ ] CLR-007 Document swatches
- [ ] CLR-008 Named brand colors
- [ ] CLR-009 Global linked colors
- [ ] CLR-010 Replace color globally
- [ ] CLR-011 Generate tints and shades
- [ ] CLR-012 Contrast checker
- [ ] CLR-013 Color-blindness preview
- [ ] CLR-014 CSS variable export
- [ ] CLR-015 Palette JSON import/export
- [ ] CLR-016 Limit design to N colors
- [ ] CLR-017 Monochrome conversion

## 12.8 Gradients and patterns

- [ ] GRD-001 Linear gradient
- [ ] GRD-002 Radial gradient
- [ ] GRD-003 Add/remove stops
- [ ] GRD-004 Stop color and opacity
- [ ] GRD-005 Drag gradient handles
- [ ] GRD-006 Reverse gradient
- [ ] GRD-007 Gradient transform
- [ ] GRD-008 User-space or object-bounds units
- [ ] GRD-009 Spread method
- [ ] GRD-010 Shared gradient definitions
- [ ] GRD-011 Duplicate/unlink definition
- [ ] GRD-012 Gradient presets
- [ ] PAT-001 Pattern fill
- [ ] PAT-002 Pattern transform
- [ ] PAT-003 Pattern editor
- [ ] GRD-020 Freeform gradient
- [ ] GRD-021 Gradient mesh
- [ ] GRD-022 Dithering

## 12.9 Typography

- [ ] TXT-010 Area text
- [ ] TXT-011 Multi-line editing
- [ ] TXT-012 Text alignment
- [ ] TXT-013 Line height
- [ ] TXT-014 Letter spacing
- [ ] TXT-015 Kerning
- [ ] TXT-016 Word spacing
- [ ] TXT-017 Baseline shift
- [ ] TXT-018 Rich text spans
- [ ] TXT-019 Character styles
- [ ] TXT-020 Paragraph styles
- [ ] TXT-021 Font upload
- [ ] TXT-022 Missing-font warning
- [ ] TXT-023 Variable-font axes
- [ ] TXT-024 Text on path
- [ ] TXT-025 Flip text on path
- [ ] TXT-026 Text to outlines
- [ ] TXT-027 Preserve hidden editable source
- [ ] TXT-028 Independent letter transforms
- [ ] TXT-029 Warp or envelope
- [ ] TXT-030 Fit text inside shape

## 12.10 Clipping, masks, and filters

- [ ] CLP-001 Create clipping path
- [ ] CLP-002 Release clipping path
- [ ] CLP-003 Edit clipped content
- [ ] CLP-004 Nested clips
- [ ] MSK-001 Alpha mask
- [ ] MSK-002 Luminance mask
- [ ] MSK-003 Invert mask
- [ ] MSK-004 Unlink mask transform
- [ ] FLT-001 Drop shadow
- [ ] FLT-002 Gaussian blur
- [ ] FLT-003 Blend modes
- [ ] FLT-004 SVG filter presets
- [ ] FLT-005 Filter graph editor
- [ ] FLT-006 Raw filter XML editor

## 12.11 Reusable objects and brand systems

- [ ] SYM-001 Create symbol
- [ ] SYM-002 Create instance
- [ ] SYM-003 Edit master
- [ ] SYM-004 Detach instance
- [ ] SYM-005 Instance overrides
- [ ] SYM-006 Export `symbol` and `use`
- [ ] BRD-001 Primary logo variant
- [ ] BRD-002 Horizontal variant
- [ ] BRD-003 Stacked variant
- [ ] BRD-004 Icon-only variant
- [ ] BRD-005 Monochrome variant
- [ ] BRD-006 Inverted variant
- [ ] BRD-007 Linked shared components
- [ ] BRD-008 Brand style library

## 12.12 SVG source and export tooling

- [ ] SRC-010 Editable SVG source
- [ ] SRC-011 Two-way canvas/source synchronization
- [ ] SRC-012 Jump node to source
- [ ] SRC-013 Jump source to node
- [ ] SRC-014 Attribute inspector
- [ ] SRC-015 Arbitrary safe attributes
- [ ] SRC-016 ARIA attributes
- [ ] OPT-001 Remove unused definitions
- [ ] OPT-002 Remove empty groups
- [ ] OPT-003 Collapse redundant transforms
- [ ] OPT-004 Round numeric precision
- [ ] OPT-005 Merge compatible paths
- [ ] OPT-006 Deduplicate gradients
- [ ] OPT-007 Deduplicate filters
- [ ] OPT-008 Preserve meaningful IDs
- [ ] OPT-009 Generate minimal IDs
- [ ] EXP-010 Export selected objects
- [ ] EXP-011 Responsive SVG
- [ ] EXP-012 Text-to-outline export
- [ ] EXP-013 Embedded image export
- [ ] EXP-014 React/JSX export
- [ ] EXP-015 Vue component export
- [ ] EXP-016 Svelte component export
- [ ] EXP-017 Icon sprite export
- [ ] EXP-018 PNG preview export
- [ ] EXP-019 Favicon package

## 12.13 Animation

- [ ] ANM-001 Position tracks
- [ ] ANM-002 Rotation tracks
- [ ] ANM-003 Scale tracks
- [ ] ANM-004 Opacity tracks
- [ ] ANM-005 Fill and stroke tracks
- [ ] ANM-006 Stroke-dash drawing
- [ ] ANM-007 Motion path
- [ ] ANM-008 Keyframe timeline
- [ ] ANM-009 Cubic Bézier easing
- [ ] ANM-010 Loop region
- [ ] ANM-011 Path morphing
- [ ] ANM-012 Path normalization
- [ ] ANM-013 CSS keyframe export
- [ ] ANM-014 Web Animations API export
- [ ] ANM-015 SMIL export
- [ ] ANM-016 Standalone HTML export

## 12.14 Logo-specific assistance

- [ ] LOG-001 Logo grid generator
- [ ] LOG-002 Symmetry guides
- [ ] LOG-003 Circle construction guides
- [ ] LOG-004 Clear-space tool
- [ ] LOG-005 Minimum-size preview
- [ ] LOG-006 16/24/32/48 px previews
- [ ] LOG-007 Optical-centering helper
- [ ] LOG-008 Favicon preview
- [ ] LOG-009 App-icon preview
- [ ] LOG-010 Social-avatar preview
- [ ] LOG-011 Light/dark background preview
- [ ] LOG-012 Thin-stroke warning
- [ ] LOG-013 Small-gap warning
- [ ] LOG-014 Raster-content warning
- [ ] LOG-015 Monochrome legibility test
- [ ] LOG-016 Automated logo asset package

---

# 13. Implementation Roadmap

## Phase 0 — Coherent prototype

### Goal

Deliver a browser editor that can create, manipulate, style, organize, import, and export basic SVG artwork.

### Exit criteria

- All required Phase 0 features pass.
- The application builds.
- TypeScript strict mode passes.
- Automated tests pass.
- Exported SVG opens in Chromium and Firefox.
- No editor handles appear in exported artwork.
- A sample logo can be created without editing source code.

### Suggested implementation order

#### Milestone 0A — Foundation

1. Scaffold Vite, React, and TypeScript.
2. Add linting, formatting, Vitest, and Playwright.
3. Create layout shell and design tokens.
4. Define document model and ID utilities.
5. Define store domains and selectors.
6. Define command/history API.
7. Render a hard-coded document through the renderer.
8. Add test fixtures.

#### Milestone 0B — Viewport and selection

1. Implement artwork SVG and overlay SVG.
2. Implement zoom and pan.
3. Implement client-to-SVG coordinate conversion.
4. Implement click selection.
5. Implement shift-toggle selection.
6. Implement marquee selection.
7. Implement selection bounds and handles.
8. Add selection-related tests.

#### Milestone 0C — Creation tools

1. Rectangle tool.
2. Ellipse tool.
3. Line tool.
4. Polygon or star tool.
5. Basic text tool.
6. Escape to cancel creation.
7. Tool keyboard shortcuts.
8. One history entry per completed creation.

#### Milestone 0D — Transforms

1. Move interaction.
2. Resize interaction.
3. Rotate interaction.
4. Multi-selection transforms.
5. Inspector numeric transform controls.
6. Arrow-key nudging.
7. Layer lock and visibility behavior.
8. Performance fixture.

#### Milestone 0E — Styling and hierarchy

1. Fill inspector.
2. Stroke inspector.
3. Opacity.
4. Group and ungroup.
5. Paint-order controls.
6. Layers hierarchy.
7. Rename, hide, lock.
8. Alignment controls.

#### Milestone 0F — Persistence and SVG pipeline

1. Serialize model to SVG.
2. Copy SVG source.
3. Download SVG.
4. Source viewer.
5. SVG sanitation.
6. Import supported SVG nodes.
7. Autosave.
8. Restore.
9. End-to-end export test.

#### Milestone 0G — Stabilization

1. Run production build.
2. Run unit and end-to-end tests.
3. Test keyboard and pointer cancellation.
4. Test empty document.
5. Test nested groups.
6. Test import failures.
7. Test undo across import and grouping.
8. Add README and known limitations.
9. Record performance measurements.
10. Fix all high-severity errors.

## Phase 1 — Real path editor

### Goal

Add the minimum path functionality required for custom logo construction.

### Features

- Path parsing and serialization
- Pen tool
- Direct anchor selection
- Bézier handles
- Add/delete anchor
- Open/close path
- Join endpoints
- Convert primitive to path
- Basic path simplification
- Outline stroke
- Compound paths
- Union, subtract, intersect, exclude
- Linear and radial gradients
- Object snapping and smart guides

### Architecture work

- Introduce parsed path command representation.
- Add geometry-worker protocol.
- Add shape-to-path conversion.
- Add geometry-adapter tests using fixed fixtures.
- Add path round-trip tests.
- Establish error handling for invalid/self-intersecting geometry.

### Exit criteria

A designer can construct a custom mark from primitives, edit curves, merge shapes, and export a clean path-based logo.

## Phase 2 — Typography and professional styling

### Goal

Support real logo wordmarks and reusable visual systems.

### Features

- Better text editing
- Font loading
- Missing-font detection
- Tracking and kerning controls
- Text on path
- Text to outlines
- Rich gradients
- Swatches
- Global colors
- Appearance presets
- Clipping paths
- Masks
- Symbols/components
- Logo variants

### Exit criteria

A designer can create and package a mark plus wordmark with consistent colors and multiple linked variants.

## Phase 3 — SVG professional tooling

### Goal

Become a best-in-class SVG-specific editor.

### Features

- Editable source
- Two-way source synchronization
- Attribute inspector
- SVG validation
- Deep optimization controls
- React/Vue/Svelte exports
- Accessibility metadata
- Filter editor
- Pattern editor
- Export presets
- Favicon and asset-package generation

### Exit criteria

Developers and designers can collaborate using clean, inspectable, optimized assets without a second cleanup tool.

## Phase 4 — Animation

### Goal

Add structured animation without coupling the editor to one export format.

### Features

- Neutral animation-track model
- Timeline
- Transform, opacity, fill, and stroke tracks
- Easing editor
- Path drawing
- Motion paths
- Path morphing
- CSS, WAAPI, SMIL, and standalone HTML export

### Exit criteria

A user can create a lightweight animated logo and export it for the web without manually writing animation code.

## Phase 5 — Ecosystem and collaboration

### Goal

Support teams and community extension.

### Features

- Plugin API
- Shared libraries
- Version history
- Comments
- Collaborative editing
- Template library
- Community asset sharing
- Optional cloud projects

---

# 14. Multi-Agent Implementation Strategy

A one-prompt build should use an orchestrator model that plans first and delegates bounded work.

## 14.1 Required planning outputs

Before implementation, the orchestrator must create:

1. `docs/architecture.md`
2. `docs/implementation-status.md`
3. A dependency-ordered task list
4. Interface contracts for model, commands, renderer, and import/export
5. A file-ownership matrix
6. A test plan
7. A list of explicit non-goals

Implementation should start only after these are internally consistent.

## 14.2 Recommended agent roles

### Agent A — Architecture and document model

Owns:

- `src/model/**`
- Core types
- IDs
- Validation
- Architecture decision records

Must not build UI components.

### Agent B — Store, commands, and history

Owns:

- `src/store/**`
- `src/commands/**`
- Undo/redo
- Transactions
- Selector APIs

Depends on Agent A contracts.

### Agent C — SVG renderer and viewport

Owns:

- `src/renderer/**`
- Artwork SVG
- Overlay SVG
- Zoom/pan
- Coordinate conversion utilities

Coordinates with Agent D through documented interaction interfaces.

### Agent D — Interaction tools

Owns:

- `src/interactions/**`
- Selection
- Marquee
- Move
- Resize
- Rotate
- Creation tools
- Keyboard shortcuts

Must not directly mutate persistent document objects.

### Agent E — Panels and editor shell

Owns:

- `src/components/**`
- `src/app/**`
- Toolbar
- Inspector
- Layers
- Dialogs
- Status bar
- Styling

Consumes store selectors and command APIs.

### Agent F — Import, export, and persistence

Owns:

- `src/importExport/**`
- Sanitation
- Serialization
- Source viewer integration
- Autosave
- Download/copy

Must use model APIs rather than reading editor DOM as source of truth.

### Agent G — Tests and integration

Owns:

- `tests/**`
- Cross-module integration
- Playwright
- Performance fixture
- Build verification
- Accessibility smoke checks

May patch other modules only for integration defects and must document changes.

## 14.3 File ownership rules

- Two agents should not edit the same file concurrently.
- Shared interfaces are defined before parallel implementation.
- Shared interface changes require orchestrator approval.
- Agents should add adapters rather than importing another agent's internal implementation.
- The orchestrator integrates after each dependency layer, not only at the end.

## 14.4 Suggested dependency graph

```text
Agent A: model
   ├─> Agent B: store/history
   ├─> Agent C: renderer
   └─> Agent F: import/export

Agent B + Agent C
   └─> Agent D: interactions

Agent B + Agent C
   └─> Agent E: UI panels

Agents A-F
   └─> Agent G: integration and tests
```

## 14.5 Quality gates after each wave

### Gate 1 — Model

- Type check
- Model serialization fixture
- No DOM dependencies in model package

### Gate 2 — Store and renderer

- One static document renders
- Node updates are isolated
- History tests pass

### Gate 3 — Interactions and panels

- Create/select/move works
- One drag equals one history entry
- Layers selection is synchronized

### Gate 4 — Import/export

- Round-trip fixture
- Unsafe SVG fixture rejected or sanitized
- Downloaded SVG contains no overlay nodes

### Gate 5 — Final

- All tests
- Production build
- Manual smoke workflow
- README
- Known limitations

---

# 15. One-Prompt Prototype Execution Contract

The following contract can be appended to a coding-model prompt.

## Objective

Build a functioning Phase 0 prototype from this specification in the current repository.

## Execution rules

1. Plan before implementation.
2. Do not ask the user to choose routine technical details.
3. Use the recommended stack unless the repository already has an equivalent compatible setup.
4. Implement a complete vertical slice before optional features.
5. Keep all TypeScript strict.
6. Keep persistent model code framework-independent.
7. Do not use the live SVG DOM as the document database.
8. Use transient direct updates during pointer drags and commit once on pointer release.
9. Do not add a backend.
10. Do not add authentication.
11. Do not add collaboration.
12. Do not claim a feature works without testing it.
13. Run the build and tests.
14. Fix failures before finishing.
15. Update `docs/implementation-status.md` with:
    - Completed requirements
    - Partially completed requirements
    - Omitted requirements
    - Known defects
    - Test results
    - Performance notes

## Definition of done

The result is done only when a user can:

1. Open the application.
2. Create a rectangle, ellipse, line, polygon or star, and text.
3. Select one or multiple objects.
4. Move, resize, and rotate them.
5. Change fill and stroke.
6. Group objects.
7. Reorder objects.
8. Hide and lock objects in the layers panel.
9. Undo and redo edits.
10. Import a safe SVG.
11. View and copy generated SVG.
12. Download a clean SVG.
13. Reload and recover the autosaved document.

## Required final response from coding model

Report:

- Implemented requirements by ID
- Test commands run and results
- Build result
- Files or modules added
- Known limitations
- The next three highest-priority tasks

---

# 16. Acceptance Test Scenarios

## AT-001 — Create and transform

1. Create a rectangle.
2. Create an ellipse.
3. Select the rectangle.
4. Move it by dragging.
5. Resize it.
6. Rotate it.
7. Verify one undo step reverses rotation.
8. Verify another undo reverses resize.
9. Verify another undo reverses movement.

Expected: each interaction is independently undoable.

## AT-002 — Multi-selection

1. Create three shapes.
2. Shift-select two.
3. Move them together.
4. Resize the selection.
5. Verify the third shape is unchanged.
6. Undo twice.

Expected: transforms apply only to selected shapes.

## AT-003 — Styling

1. Select an ellipse.
2. Set fill to `#ff3366`.
3. Set fill opacity to 50%.
4. Add a 4-pixel black stroke.
5. Set round line join.
6. Export SVG.

Expected: exported element contains equivalent SVG styling.

## AT-004 — Grouping and ordering

1. Create three shapes.
2. Group two.
3. Move group.
4. Send group behind third shape.
5. Inspect layers panel.
6. Ungroup.
7. Undo ungroup.

Expected: hierarchy and paint order remain correct.

## AT-005 — Lock and hide

1. Lock one node in layers.
2. Attempt to select it on canvas.
3. Hide another node.
4. Export SVG.

Expected: locked behavior matches product decision; hidden-node export behavior is documented and consistent.

## AT-006 — Import safety

Import SVG fixtures containing:

- A script element
- An `onclick` attribute
- A `javascript:` link
- An external image
- A normal rectangle and path

Expected: unsafe content is removed or rejected; safe supported artwork remains.

## AT-007 — Round trip

1. Create a document with a rectangle, ellipse, group, text, and stroke.
2. Export.
3. Import the exported SVG into a new document.
4. Compare visible output and supported properties.

Expected: supported content remains materially equivalent.

## AT-008 — Persistence

1. Create artwork.
2. Reload page.
3. Confirm recovery.
4. Reset document.
5. Reload again.

Expected: recovered state and reset state behave correctly.

## AT-009 — Performance smoke

1. Load the 500-object benchmark fixture.
2. Select one rectangle.
3. Drag continuously for five seconds.
4. Observe profiler.

Expected: no complete editor rerender on every pointer event and interaction remains usable.

---

# 17. Security Requirements

## SEC-001 — Treat imported SVG as untrusted

Remove or reject:

- `<script>`
- Event-handler attributes such as `onclick`
- `javascript:` URLs
- Unsafe foreign content
- External network references unless explicitly allowed
- Embedded HTML that is not required
- Potentially dangerous CSS constructs

## SEC-002 — Never inject unsanitized markup

Do not pass imported SVG directly to `dangerouslySetInnerHTML`.

## SEC-003 — Parse into model

Sanitize, parse, validate, and convert to the application model.

## SEC-004 — Export only known safe structures

Unknown attributes may be preserved only through an allowlist or validated safe-attribute policy.

## SEC-005 — File limits

Set reasonable limits for:

- File size
- Node count
- Path command count
- Definition count
- Nested group depth

Display a clear error rather than freezing the browser.

---

# 18. Testing Strategy

## Unit tests

- Matrix multiplication and inversion
- Coordinate conversion
- Bounds calculations
- Node insertion and removal
- Paint order
- Group and ungroup
- Command undo and redo
- Serialization
- Numeric precision
- Sanitation
- SVG node conversion

## Integration tests

- Store + renderer
- Selection + layers
- Transform + history
- Import + export
- Autosave + restore

## End-to-end tests

- Create basic logo
- Multi-select and align
- Group and reorder
- Undo and redo
- Import a fixture
- Export and inspect resulting source

## Visual regression

Add after prototype stabilization:

- Standard primitive document
- Nested groups
- Strokes and opacity
- Text fixture
- Gradient fixture
- Imported SVG fixture

## Browser targets

Prototype:

- Current Chromium
- Current Firefox

Later:

- Safari
- Touch devices
- High-DPI and unusual zoom levels

---

# 19. Observability and Debugging

Development-only diagnostics should include:

- Current selected IDs
- Current tool
- Viewport matrix
- Last command
- History depth
- Render count per node in development mode
- Import warnings
- Serialization warnings
- Performance timing for expensive operations

Do not include development diagnostics in production exports.

---

# 20. Open Architectural Decisions

These decisions should be resolved before Phase 1.

## ADR-TODO-001 — Hidden-node export behavior

Options:

- Export hidden nodes with `display="none"`
- Omit hidden nodes
- Add export setting

Recommended: omit by default and offer a setting later.

## ADR-TODO-002 — Primitive transform model

Options:

- Store geometry plus matrix
- Bake common translations into geometry
- Normalize transforms after operations

Recommended: store geometry plus matrix initially; provide explicit normalization later.

## ADR-TODO-003 — Text measurement

Options:

- Browser SVG APIs
- Canvas measurement
- Font parsing library

Recommended: browser SVG APIs for prototype; font parsing when outlines and precise typography are implemented.

## ADR-TODO-004 — Boolean engine

Evaluate with test fixtures:

- Paper.js adapter
- PathKit adapter
- Another maintained curve-aware path-operations library

Do not commit to an engine before testing holes, self-intersections, curves, transforms, and fill rules.

## ADR-TODO-005 — Source-edit synchronization

Options:

- Replace complete model after parse
- Incremental diff
- Source mode with explicit Apply button

Recommended first implementation: explicit Apply button that parses and replaces the document in one transaction.

---

# 21. Framework Decision Summary

## Recommended

**React + TypeScript + Vite**

Use React for editor UI and declarative committed rendering.

Use direct DOM transforms or a lightweight imperative interaction layer during active manipulation.

Use a normalized external store and selector subscriptions.

## Equally viable with team preference

**Vue 3 + TypeScript + Vite**

Choose it for team familiarity, not as a presumed performance fix.

## Technically attractive but higher project risk

**Solid + Vite** or **Svelte + Vite**

Consider after the core model is framework-independent and benchmarked.

## Not recommended for the prototype

**Angular**

The added structure does not address the hardest editor problems and increases one-shot implementation complexity.

## Most important conclusion

The performance ceiling will be determined mainly by:

- Document normalization
- Selection subscriptions
- Pointer-event architecture
- Render isolation
- Geometry algorithms
- Worker usage
- SVG node count
- Avoiding serialization and history work during every frame

It will not be determined primarily by whether the toolbar was written in React, Vue, Angular, Solid, or Svelte.

---

# 22. Suggested Initial Dependency Categories

Do not add every library listed here automatically. Each dependency must justify its inclusion.

## Core

- React
- TypeScript
- Vite
- Zustand
- Immer

## Testing

- Vitest
- Testing Library
- Playwright

## SVG and source

- SVGO through an adapter
- CodeMirror 6
- DOMPurify or equivalent sanitation
- A maintained XML or SVG parsing helper only if native parsing is insufficient

## UI

- Lucide icons
- Optional accessible primitive library for menus/dialogs
- Avoid a large design system in the first prototype

## Geometry, later

- Isolated Paper.js adapter, or
- PathKit/WebAssembly adapter, or
- Another benchmarked path-operations adapter
- Clipper2 for polygon-specific operations
- `perfect-freehand` for freehand strokes

---

# 23. Dependency Selection Rules

- Prefer maintained packages.
- Prefer permissive licenses compatible with the project license.
- Avoid packages that own the complete scene graph.
- Avoid packages that require duplicating the document model.
- Wrap complex dependencies behind local interfaces.
- Add a dependency only when it replaces substantial tested complexity.
- Record geometry-library decisions in an ADR.
- Pin major versions and use a lockfile.
- Audit SVG sanitation and XML-processing dependencies carefully.

---

# 24. References for Technical Decisions

Reviewed on 2026-07-24.

- React: build an app from scratch with a build tool such as Vite  
  https://react.dev/learn/build-a-react-app-from-scratch

- React: Create React App deprecation and migration guidance  
  https://react.dev/blog/2025/02/14/sunsetting-create-react-app

- Vite guide  
  https://vite.dev/guide/

- Vite performance guide  
  https://vite.dev/guide/performance

- Vue performance guide  
  https://vuejs.org/guide/best-practices/performance

- Vue TypeScript guide  
  https://vuejs.org/guide/typescript/overview

- Angular runtime performance guidance  
  https://angular.dev/best-practices/runtime-performance

- Solid fine-grained reactivity  
  https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity

- Svelte best practices  
  https://svelte.dev/docs/svelte/best-practices

- MDN SVG reference  
  https://developer.mozilla.org/en-US/docs/Web/SVG

- SVG.js  
  https://svgjs.dev/

- Skia PathKit source documentation  
  https://skia.googlesource.com/skia/+/main/modules/pathkit/

- Clipper2 documentation  
  https://www.angusj.com/clipper2/Docs/Overview.htm

- JavaScript framework benchmark methodology and implementations  
  https://github.com/krausest/js-framework-benchmark

---

# 25. Final Recommendation

Start with the Phase 0 React/Vite prototype.

Do not switch to Angular or Vue for presumed canvas performance.

First prove:

- The normalized document model
- Isolated SVG node rendering
- Transient pointer interactions
- One-command-per-gesture history
- Safe import
- Clean export
- A 500-object benchmark

After that benchmark exists, compare alternative renderers or frameworks using the actual editor workload rather than a generic table-rendering benchmark.

The first prototype should prioritize architectural seams and a complete editing loop over advanced path features. A well-structured primitive editor can grow into a serious SVG application. A rushed attempt to implement every Illustrator feature in one prompt will likely create an unmaintainable scene graph, broken undo behavior, and expensive rerenders.
