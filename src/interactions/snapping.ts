/**
 * snapping — PURE object/artboard snapping for the move gesture (optional, spec
 * stretch). Guarded by preferences.snapEnabled at the call site.
 *
 * OWNED BY: Agent D (interactions). Kept self-contained: it only nudges the
 * translation delta so the moving selection's edges/centers align to nearby
 * candidate lines (artboard edges + center, other objects' edges + centers)
 * within a small threshold. No store fields are required (there is no guide
 * overlay state yet), so it never renders guides — it just improves the delta.
 */
import type { SvgDocumentModel } from "@/model/types";
import type { Bounds } from "@/geometry/bounds";
import { selectionWorldBounds } from "@/geometry/nodeGeometry";
import { isEmptyBounds } from "@/geometry/bounds";
import { isEffectivelyVisible } from "@/model/tree";

/**
 * Return the offset that best moves one of `edges` onto a candidate within
 * `threshold`, or 0 when nothing is close. Ties resolve to the smallest move.
 */
export function snapOffset(edges: number[], candidates: number[], threshold: number): number {
  let best = 0;
  let bestDist = threshold;
  for (const edge of edges) {
    for (const cand of candidates) {
      const d = cand - edge;
      const ad = Math.abs(d);
      if (ad <= bestDist) {
        bestDist = ad;
        best = d;
      }
    }
  }
  return best;
}

export interface SnapCandidates {
  x: number[];
  y: number[];
}

/**
 * Collect candidate snap lines: artboard left/center/right + top/middle/bottom,
 * and every OTHER top-level node's left/center/right + top/middle/bottom edges.
 */
export function collectSnapCandidates(
  doc: SvgDocumentModel,
  excludeIds: Iterable<string>,
): SnapCandidates {
  const exclude = new Set(excludeIds);
  const x: number[] = [0, doc.width / 2, doc.width];
  const y: number[] = [0, doc.height / 2, doc.height];
  for (const id of doc.rootNodeIds) {
    if (exclude.has(id) || !isEffectivelyVisible(doc, id)) continue;
    const b = selectionWorldBounds(doc, [id]);
    if (isEmptyBounds(b)) continue;
    x.push(b.minX, (b.minX + b.maxX) / 2, b.maxX);
    y.push(b.minY, (b.minY + b.maxY) / 2, b.maxY);
  }
  return { x, y };
}

/**
 * Adjust a raw (dx, dy) move so the moved selection bounds snaps to nearby
 * candidates. Snaps left/center/right against `x` and top/middle/bottom against
 * `y` independently. Threshold is in root user units (convert screen px / zoom).
 */
export function snapMoveDelta(
  startBounds: Bounds,
  dx: number,
  dy: number,
  candidates: SnapCandidates,
  threshold: number,
): { dx: number; dy: number } {
  if (threshold <= 0 || isEmptyBounds(startBounds)) return { dx, dy };
  const cx = (startBounds.minX + startBounds.maxX) / 2;
  const cy = (startBounds.minY + startBounds.maxY) / 2;
  const movedX = [startBounds.minX + dx, cx + dx, startBounds.maxX + dx];
  const movedY = [startBounds.minY + dy, cy + dy, startBounds.maxY + dy];
  return {
    dx: dx + snapOffset(movedX, candidates.x, threshold),
    dy: dy + snapOffset(movedY, candidates.y, threshold),
  };
}
