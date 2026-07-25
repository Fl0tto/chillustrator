/**
 * The single application store (Zustand).
 *
 * Separated domains (spec §7.3):
 *  - document      : persistent, undoable model
 *  - history       : undo/redo patch stacks
 *  - editor state  : tool, selection, hover, viewport, preferences
 *  - interaction   : transient overlay state (marquee, live preview) — NOT undoable
 *
 * Persistent edits go through `apply(command)` which captures Immer patches so a
 * whole gesture = one history entry (PERF-001/002, HST-002).
 *
 * The store is usable outside React via `useEditorStore.getState()/subscribe()`
 * so the imperative interaction layer never forces React re-renders per pointer
 * move.
 */
import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches } from "immer";
import type { NodeId, NodeStyle, SvgDocumentModel, SvgNode } from "@/model/types";
import type { Face } from "@/geometry/adapters/shapeArrangement";
import type { Point } from "@/geometry/matrix";
import type { EditablePath } from "@/geometry/editablePath";
import type { SnapGuide } from "@/interactions/snapping";
import { createEmptyDocument } from "@/model/document";
import { defaultStyle as makeDefaultStyle } from "@/model/factory";
import {
  loadDefaultStyle,
  loadPreferences,
  saveDefaultStyle,
  savePreferences,
} from "@/importExport/persistence";
import type { Command } from "@/commands/command";
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  emptyHistory,
  recordEntry,
  type HistoryState,
} from "./history";

enablePatches();

export type ToolId =
  | "select"
  | "rect"
  | "ellipse"
  | "line"
  | "polygon"
  | "text"
  | "build"
  | "pen"
  | "node"
  | "corner";

export interface Viewport {
  /** Root-user-units → screen-pixels scale. */
  zoom: number;
  /** Pan offset in screen pixels of the root origin. */
  panX: number;
  panY: number;
}

export interface Preferences {
  showCheckerboard: boolean;
  /** Smart alignment guides (edges/centers of other objects + artboard). */
  snapAlignment: boolean;
  /** Snap to the fixed pixel grid (`gridSize`). */
  snapGrid: boolean;
  /** Snap the dragged object's nearest vertex to another object's nearest vertex. */
  snapPoint: boolean;
  /** Numeric precision for SVG export. */
  exportPrecision: number;
  /** Grid cell size in root units; used by grid render + grid snapping. */
  gridSize: number;
  theme: "dark" | "light";
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InteractionState {
  /** Marquee selection rect in ROOT user coordinates, or null. */
  marquee: MarqueeRect | null;
  /** Live preview node while a creation tool is dragging, or null. */
  previewNode: SvgNode | null;
  /** True while a transient gesture (drag/resize/rotate) is in progress. */
  isGesture: boolean;
  /** Active smart-alignment guides (root coords) for the overlay. Never exported. */
  guides: SnapGuide[];
}

/** Live Pen-tool drawing session (transient; commits one PathNode on finish). */
export interface PenDraftState {
  /** Placed anchors in ROOT coordinates. */
  anchors: Array<{ x: number; y: number; handleIn: Point | null; handleOut: Point | null }>;
  /** Live pointer position (root), or null. */
  cursor: Point | null;
  /** True when the pointer is hovering the first anchor (would close the path). */
  overStart: boolean;
}

/** Direct-selection (node) editing session for one PathNode. */
export interface PathEditState {
  nodeId: NodeId;
  /** Editable representation in the node's LOCAL coordinate space. */
  path: EditablePath;
  /** Selected anchor flat indices. */
  selected: number[];
}

/**
 * Transient Shape Builder session (Illustrator-style region picker). Not
 * undoable; only the final merged path commits through the command system.
 */
export interface ShapeBuilderState {
  /** Atomic faces of the arrangement (world space). */
  faces: Face[];
  /** Indices of faces the user has toggled "keep". */
  kept: number[];
  /** Face index under the pointer, or -1. */
  hovered: number;
  /** Source node ids the arrangement was built from (kept, per user choice). */
  sourceIds: NodeId[];
}

export interface EditorStore {
  // --- persistent ---
  document: SvgDocumentModel;
  history: HistoryState;

  // --- editor state ---
  tool: ToolId;
  selection: NodeId[];
  hoveredId: NodeId | null;
  editingTextId: NodeId | null;
  viewport: Viewport;
  preferences: Preferences;
  /** "Last used" style seeded into newly created shapes (sticky appearance). */
  defaultStyle: NodeStyle;

  // --- transient ---
  interaction: InteractionState;
  shapeBuilder: ShapeBuilderState | null;
  penDraft: PenDraftState | null;
  pathEdit: PathEditState | null;

  // --- persistent edits ---
  apply: (command: Command) => void;
  /**
   * Apply a command whose value is ABSOLUTE (e.g. "set opacity to X"), collapsing
   * a run of calls sharing `coalesceKey` into one undo entry. Used by slider /
   * live-drag inputs so the whole drag is a single history step (HST-002).
   */
  applyCoalesced: (command: Command, coalesceKey: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /** Replace the whole document. `record` makes it an undoable entry. */
  loadDocument: (doc: SvgDocumentModel, opts?: { record?: boolean; label?: string }) => void;
  newDocument: (width?: number, height?: number) => void;
  resetDocument: () => void;
  setDocumentSize: (width: number, height: number) => void;

  // --- editor actions ---
  setTool: (tool: ToolId) => void;
  setSelection: (ids: NodeId[]) => void;
  toggleSelection: (id: NodeId) => void;
  addToSelection: (ids: NodeId[]) => void;
  clearSelection: () => void;
  setHovered: (id: NodeId | null) => void;
  setEditingText: (id: NodeId | null) => void;

  setViewport: (partial: Partial<Viewport>) => void;
  setPreferences: (partial: Partial<Preferences>) => void;
  /** Merge into the sticky default style used to seed the next new shape. */
  setDefaultStyle: (partial: Partial<NodeStyle>) => void;

  // --- transient actions ---
  setInteraction: (partial: Partial<InteractionState>) => void;
  resetInteraction: () => void;

  // --- shape builder ---
  startShapeBuilder: (session: ShapeBuilderState) => void;
  setShapeBuilderHover: (index: number) => void;
  toggleShapeBuilderFace: (index: number) => void;
  endShapeBuilder: () => void;

  // --- pen / path editing ---
  setPenDraft: (draft: PenDraftState | null) => void;
  setPathEdit: (session: PathEditState | null) => void;
}

const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

const DEFAULT_PREFERENCES: Preferences = {
  showCheckerboard: true,
  snapAlignment: true,
  snapGrid: false,
  snapPoint: false,
  exportPrecision: 3,
  gridSize: 10,
  theme: "dark",
};

/** Merge stored prefs over defaults, migrating the legacy `snapEnabled` flag. */
function initialPreferences(): Preferences {
  const stored = loadPreferences();
  const prefs = { ...DEFAULT_PREFERENCES, ...stored } as Preferences & { snapEnabled?: boolean };
  // Legacy single toggle → alignment mode.
  if (typeof stored.snapEnabled === "boolean" && stored.snapAlignment === undefined) {
    prefs.snapAlignment = stored.snapEnabled as boolean;
  }
  delete prefs.snapEnabled;
  return prefs;
}

const EMPTY_INTERACTION: InteractionState = {
  marquee: null,
  previewNode: null,
  isGesture: false,
  guides: [],
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: createEmptyDocument(),
  history: emptyHistory(),

  tool: "select",
  selection: [],
  hoveredId: null,
  editingTextId: null,
  viewport: { ...DEFAULT_VIEWPORT },
  preferences: initialPreferences(),
  defaultStyle: makeDefaultStyle((loadDefaultStyle() ?? {}) as Partial<NodeStyle>),
  interaction: { ...EMPTY_INTERACTION },
  shapeBuilder: null,
  penDraft: null,
  pathEdit: null,

  apply(command) {
    const { document, history } = get();
    const [next, patches, inversePatches] = produceWithPatches(document, (draft) => {
      command.apply(draft);
    });
    if (patches.length === 0) return; // no-op edit, skip history
    set({
      document: next,
      history: recordEntry(history, { label: command.label, patches, inversePatches }),
    });
  },

  applyCoalesced(command, coalesceKey) {
    const { document, history } = get();
    const last = history.past[history.past.length - 1];
    const merging = last?.coalesceKey === coalesceKey && last.coalesceBase !== undefined;
    const base = merging ? last!.coalesceBase! : document;
    const [next, patches, inversePatches] = produceWithPatches(base, (draft) => {
      command.apply(draft);
    });
    if (!merging && patches.length === 0) return; // no-op edit, skip history
    const entry = {
      label: command.label,
      patches,
      inversePatches,
      coalesceKey,
      coalesceBase: base,
    };
    const past = merging ? [...history.past.slice(0, -1), entry] : [...history.past, entry];
    set({ document: next, history: { past, future: [] } });
  },

  undo() {
    const { document, history, selection } = get();
    const entry = history.past[history.past.length - 1];
    if (!entry) return;
    const next = applyPatches(document, entry.inversePatches);
    set({
      document: next,
      history: {
        past: history.past.slice(0, -1),
        future: [entry, ...history.future],
      },
      selection: selection.filter((id) => next.nodes[id]),
    });
  },

  redo() {
    const { document, history, selection } = get();
    const entry = history.future[0];
    if (!entry) return;
    const next = applyPatches(document, entry.patches);
    set({
      document: next,
      history: {
        past: [...history.past, entry],
        future: history.future.slice(1),
      },
      selection: selection.filter((id) => next.nodes[id]),
    });
  },

  canUndo() {
    return histCanUndo(get().history);
  },
  canRedo() {
    return histCanRedo(get().history);
  },

  loadDocument(doc, opts) {
    if (opts?.record) {
      const { document, history } = get();
      const [next, patches, inversePatches] = produceWithPatches(document, (draft) => {
        // Replace all fields in place so patches capture the full swap.
        Object.assign(draft, structuredClone(doc));
      });
      set({
        document: next,
        history: recordEntry(history, {
          label: opts.label ?? "Load document",
          patches,
          inversePatches,
        }),
        selection: [],
        interaction: { ...EMPTY_INTERACTION },
        shapeBuilder: null,
      });
    } else {
      set({
        document: doc,
        history: emptyHistory(),
        selection: [],
        interaction: { ...EMPTY_INTERACTION },
        shapeBuilder: null,
      });
    }
  },

  newDocument(width, height) {
    set({
      document: createEmptyDocument(width, height),
      history: emptyHistory(),
      selection: [],
      hoveredId: null,
      editingTextId: null,
      interaction: { ...EMPTY_INTERACTION },
      shapeBuilder: null,
    });
  },

  resetDocument() {
    const { document } = get();
    get().newDocument(document.width, document.height);
  },

  setDocumentSize(width, height) {
    get().apply({
      label: "Resize document",
      apply(draft) {
        draft.width = width;
        draft.height = height;
        draft.viewBox = [draft.viewBox[0], draft.viewBox[1], width, height];
      },
    });
  },

  setTool(tool) {
    // Leaving a modal tool discards its in-progress session.
    set({
      tool,
      editingTextId: null,
      shapeBuilder: tool === "build" ? get().shapeBuilder : null,
      penDraft: tool === "pen" ? get().penDraft : null,
      pathEdit: tool === "node" ? get().pathEdit : null,
    });
  },
  setSelection(ids) {
    set({ selection: [...new Set(ids)] });
  },
  toggleSelection(id) {
    const { selection } = get();
    set({
      selection: selection.includes(id)
        ? selection.filter((s) => s !== id)
        : [...selection, id],
    });
  },
  addToSelection(ids) {
    set({ selection: [...new Set([...get().selection, ...ids])] });
  },
  clearSelection() {
    set({ selection: [] });
  },
  setHovered(id) {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },
  setEditingText(id) {
    set({ editingTextId: id });
  },

  setViewport(partial) {
    set({ viewport: { ...get().viewport, ...partial } });
  },
  setPreferences(partial) {
    const preferences = { ...get().preferences, ...partial };
    set({ preferences });
    savePreferences(preferences);
  },
  setDefaultStyle(partial) {
    const defaultStyle = { ...get().defaultStyle, ...partial };
    set({ defaultStyle });
    saveDefaultStyle(defaultStyle);
  },

  setInteraction(partial) {
    set({ interaction: { ...get().interaction, ...partial } });
  },
  resetInteraction() {
    set({ interaction: { ...EMPTY_INTERACTION } });
  },

  startShapeBuilder(session) {
    set({ shapeBuilder: session });
  },
  setShapeBuilderHover(index) {
    const sb = get().shapeBuilder;
    if (!sb || sb.hovered === index) return;
    set({ shapeBuilder: { ...sb, hovered: index } });
  },
  toggleShapeBuilderFace(index) {
    const sb = get().shapeBuilder;
    if (!sb || index < 0) return;
    const kept = sb.kept.includes(index)
      ? sb.kept.filter((i) => i !== index)
      : [...sb.kept, index];
    set({ shapeBuilder: { ...sb, kept } });
  },
  endShapeBuilder() {
    set({ shapeBuilder: null });
  },

  setPenDraft(draft) {
    set({ penDraft: draft });
  },
  setPathEdit(session) {
    set({ pathEdit: session });
  },
}));

/** Non-React accessor for the imperative interaction layer. */
export const editorStore = useEditorStore;
