/**
 * Selection-handle identifiers and helpers shared by the overlay (renderer) and
 * the interaction controllers.
 *
 * OWNED BY: Agent D (interactions). Seeded by the orchestrator as a contract so
 * the renderer overlay and controllers agree on handle ids. Extend here.
 */
import type { Bounds } from "@/geometry/bounds";

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const ALL_HANDLES: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Unit anchor (0..1) of each handle within a bounds box. */
export const HANDLE_ANCHORS: Record<HandleId, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  n: { fx: 0.5, fy: 0 },
  ne: { fx: 1, fy: 0 },
  e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 },
  s: { fx: 0.5, fy: 1 },
  sw: { fx: 0, fy: 1 },
  w: { fx: 0, fy: 0.5 },
};

/** The opposite (anchor) handle used as the fixed point during a resize. */
export const OPPOSITE_HANDLE: Record<HandleId, HandleId> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

export function handlePoint(bounds: Bounds, id: HandleId): { x: number; y: number } {
  const { fx, fy } = HANDLE_ANCHORS[id];
  return {
    x: bounds.minX + fx * (bounds.maxX - bounds.minX),
    y: bounds.minY + fy * (bounds.maxY - bounds.minY),
  };
}
