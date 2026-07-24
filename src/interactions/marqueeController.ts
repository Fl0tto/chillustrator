/**
 * marqueeController — PURE marquee-selection hit testing.
 *
 * OWNED BY: Agent D (interactions). The rubber-band marquee selects top-level
 * nodes whose world bounds are fully CONTAINED by the marquee box (SEL-001,
 * "contained" semantics). Effectively locked or invisible nodes are never
 * selectable (verified against isEffectivelyLocked / isEffectivelyVisible).
 */
import type { SvgDocumentModel } from "@/model/types";
import { selectionWorldBounds } from "@/geometry/nodeGeometry";
import { boundsContainBounds, isEmptyBounds, type Bounds } from "@/geometry/bounds";
import { isEffectivelyLocked, isEffectivelyVisible } from "@/model/tree";

/** Normalize two root-space corner points into a Bounds box. */
export function marqueeBounds(ax: number, ay: number, bx: number, by: number): Bounds {
  return {
    minX: Math.min(ax, bx),
    minY: Math.min(ay, by),
    maxX: Math.max(ax, bx),
    maxY: Math.max(ay, by),
  };
}

/**
 * Top-level node ids fully contained by `box`, skipping locked/invisible nodes
 * and nodes with empty (unmeasurable) bounds.
 */
export function marqueeHits(doc: SvgDocumentModel, box: Bounds): string[] {
  return doc.rootNodeIds.filter((id) => {
    if (isEffectivelyLocked(doc, id) || !isEffectivelyVisible(doc, id)) return false;
    const nb = selectionWorldBounds(doc, [id]);
    return !isEmptyBounds(nb) && boundsContainBounds(box, nb);
  });
}
