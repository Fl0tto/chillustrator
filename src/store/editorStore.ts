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
import type { NodeId, SvgDocumentModel, SvgNode } from "@/model/types";
import type { Face } from "@/geometry/adapters/shapeArrangement";
import { createEmptyDocument } from "@/model/document";
import type { Command } from "@/commands/command";
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  emptyHistory,
  recordEntry,
  type HistoryState,
} from "./history";

enablePatches();

export type ToolId = "select" | "rect" | "ellipse" | "line" | "polygon" | "text" | "build";

export interface Viewport {
  /** Root-user-units → screen-pixels scale. */
  zoom: number;
  /** Pan offset in screen pixels of the root origin. */
  panX: number;
  panY: number;
}

export interface Preferences {
  showCheckerboard: boolean;
  snapEnabled: boolean;
  /** Numeric precision for SVG export. */
  exportPrecision: number;
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

  // --- transient ---
  interaction: InteractionState;
  shapeBuilder: ShapeBuilderState | null;

  // --- persistent edits ---
  apply: (command: Command) => void;
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

  // --- transient actions ---
  setInteraction: (partial: Partial<InteractionState>) => void;
  resetInteraction: () => void;

  // --- shape builder ---
  startShapeBuilder: (session: ShapeBuilderState) => void;
  setShapeBuilderHover: (index: number) => void;
  toggleShapeBuilderFace: (index: number) => void;
  endShapeBuilder: () => void;
}

const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

const DEFAULT_PREFERENCES: Preferences = {
  showCheckerboard: true,
  snapEnabled: true,
  exportPrecision: 3,
  gridSize: 10,
  theme: "dark",
};

const EMPTY_INTERACTION: InteractionState = {
  marquee: null,
  previewNode: null,
  isGesture: false,
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: createEmptyDocument(),
  history: emptyHistory(),

  tool: "select",
  selection: [],
  hoveredId: null,
  editingTextId: null,
  viewport: { ...DEFAULT_VIEWPORT },
  preferences: { ...DEFAULT_PREFERENCES },
  interaction: { ...EMPTY_INTERACTION },
  shapeBuilder: null,

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
    // Leaving the build tool discards any in-progress region session.
    set({ tool, editingTextId: null, shapeBuilder: tool === "build" ? get().shapeBuilder : null });
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
    set({ preferences: { ...get().preferences, ...partial } });
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
}));

/** Non-React accessor for the imperative interaction layer. */
export const editorStore = useEditorStore;
