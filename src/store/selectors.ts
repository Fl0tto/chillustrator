/**
 * Selector hooks for fine-grained subscriptions (PERF-003).
 *
 * Components should subscribe through these rather than reading the whole store,
 * so an unrelated change does not re-render them.
 */
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "./editorStore";
import type { NodeId, SvgNode } from "@/model/types";
import { selectionWorldBounds } from "@/geometry/nodeGeometry";
import type { Bounds } from "@/geometry/bounds";

export function useTool() {
  return useEditorStore((s) => s.tool);
}

export function useSelection(): NodeId[] {
  return useEditorStore(useShallow((s) => s.selection));
}

export function useIsSelected(id: NodeId): boolean {
  return useEditorStore((s) => s.selection.includes(id));
}

export function useHoveredId() {
  return useEditorStore((s) => s.hoveredId);
}

export function useNode(id: NodeId): SvgNode | undefined {
  return useEditorStore((s) => s.document.nodes[id]);
}

/** Subscribe to a single node's rendering-relevant summary (memoized). */
export function useRootNodeIds(): NodeId[] {
  return useEditorStore(useShallow((s) => s.document.rootNodeIds));
}

export function useDocumentSize() {
  return useEditorStore(useShallow((s) => ({ width: s.document.width, height: s.document.height })));
}

export function useViewBox() {
  return useEditorStore(useShallow((s) => s.document.viewBox));
}

export function useViewport() {
  return useEditorStore(useShallow((s) => s.viewport));
}

export function usePreferences() {
  return useEditorStore(useShallow((s) => s.preferences));
}

export function useInteraction() {
  return useEditorStore(useShallow((s) => s.interaction));
}

export function useGuides() {
  return useEditorStore(useShallow((s) => s.interaction.guides));
}

export function usePenDraft() {
  return useEditorStore((s) => s.penDraft);
}

export function usePathEdit() {
  return useEditorStore((s) => s.pathEdit);
}

export function useSelectedNodes(): SvgNode[] {
  const selection = useSelection();
  const nodes = useEditorStore((s) => s.document.nodes);
  return useMemo(
    () => selection.map((id) => nodes[id]).filter((n): n is SvgNode => Boolean(n)),
    [selection, nodes],
  );
}

/** Combined world-space bounds of the current selection (null if empty). */
export function useSelectionBounds(): Bounds | null {
  const selection = useSelection();
  const document = useEditorStore((s) => s.document);
  return useMemo(() => {
    if (selection.length === 0) return null;
    const b = selectionWorldBounds(document, selection);
    return b.minX <= b.maxX ? b : null;
  }, [selection, document]);
}

export function useHistoryFlags() {
  return useEditorStore(
    useShallow((s) => ({
      canUndo: s.history.past.length > 0,
      canRedo: s.history.future.length > 0,
      lastLabel: s.history.past[s.history.past.length - 1]?.label ?? null,
    })),
  );
}
