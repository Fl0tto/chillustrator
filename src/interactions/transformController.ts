/**
 * transformController — PURE transform math for the resize/rotate gestures.
 *
 * OWNED BY: Agent D (interactions). Extracted from the seed so the resize
 * scale-factor and rotation-snap math is unit-testable in isolation. The hook
 * (useCanvasController) turns pointer events into calls on these helpers and then
 * commits exactly one `applyWorldTransformCommand(ids, world)` on release, so the
 * result matches the world-transform contract L' = inv(P)·D·P·L (spec §9).
 */
import { multiply, rotate, scale, translate, type Matrix2D, type Point } from "@/geometry/matrix";
import type { Bounds } from "@/geometry/bounds";
import { OPPOSITE_HANDLE, type HandleId } from "./handles";

/** Minimum shape/resize extent in root user units. */
export const MIN_SIZE = 2;

/**
 * The fixed anchor point (root coords) a resize scales about: the corner/edge
 * opposite the dragged handle. Dragging "nw" keeps "se" pinned, etc.
 */
export function resizeAnchor(bounds: Bounds, handle: HandleId): Point {
  const opp = OPPOSITE_HANDLE[handle];
  const x = opp.includes("w") ? bounds.minX : opp.includes("e") ? bounds.maxX : (bounds.minX + bounds.maxX) / 2;
  const y = opp.includes("n") ? bounds.minY : opp.includes("s") ? bounds.maxY : (bounds.minY + bounds.maxY) / 2;
  return { x, y };
}

/**
 * The world-space transform D for a resize drag: a scale about `anchor` that maps
 * the dragged handle's start position to the current `pointer`. Applied to every
 * selected node it scales the whole selection about the opposite handle, so
 * multi-selection resize is correct.
 *
 * - Edge handles scale a single axis; corner handles scale both.
 * - `keepAspect` (Shift) locks the aspect ratio on corner handles.
 * - The minimum-size guard prevents a selection from collapsing/flipping through
 *   zero while still allowing an intentional flip once past the threshold.
 */
export function computeResizeWorld(
  startBounds: Bounds,
  anchor: Point,
  handle: HandleId,
  pointer: Point,
  keepAspect: boolean,
  minSize = MIN_SIZE,
): Matrix2D {
  const startW = startBounds.maxX - startBounds.minX || 1;
  const startH = startBounds.maxY - startBounds.minY || 1;
  const affectsX = handle.includes("e") || handle.includes("w");
  const affectsY = handle.includes("n") || handle.includes("s");

  let sx = 1;
  let sy = 1;
  if (affectsX) {
    const denom = (handle.includes("e") ? startBounds.maxX : startBounds.minX) - anchor.x;
    sx = denom !== 0 ? (pointer.x - anchor.x) / denom : 1;
  }
  if (affectsY) {
    const denom = (handle.includes("s") ? startBounds.maxY : startBounds.minY) - anchor.y;
    sy = denom !== 0 ? (pointer.y - anchor.y) / denom : 1;
  }
  if (keepAspect && affectsX && affectsY) {
    const s = Math.max(Math.abs(sx), Math.abs(sy));
    sx = Math.sign(sx || 1) * s;
    sy = Math.sign(sy || 1) * s;
  } else if (!affectsX) {
    sx = 1;
  } else if (!affectsY) {
    sy = 1;
  }
  // Minimum-size guard (keeps the sign so flips remain possible past threshold).
  if (affectsX && Math.abs(sx * startW) < minSize) sx = (minSize / startW) * Math.sign(sx || 1);
  if (affectsY && Math.abs(sy * startH) < minSize) sy = (minSize / startH) * Math.sign(sy || 1);

  return multiply(multiply(translate(anchor.x, anchor.y), scale(sx, sy)), translate(-anchor.x, -anchor.y));
}

/** Signed rotation (degrees) between the gesture start ray and the current ray. */
export function rotationDegrees(center: Point, startAngleRad: number, pointer: Point): number {
  const ang = Math.atan2(pointer.y - center.y, pointer.x - center.x) - startAngleRad;
  return (ang * 180) / Math.PI;
}

/** Snap a rotation to the nearest `step` degrees (Shift = 15° detents). */
export function snapDegrees(deg: number, step = 15): number {
  if (step <= 0) return deg;
  return Math.round(deg / step) * step;
}

/** The world-space transform D for a rotate drag: rotate `deg` about `center`. */
export function rotateWorld(center: Point, deg: number): Matrix2D {
  return rotate(deg, center.x, center.y);
}

/** Angle (radians) of the ray from `center` to `p` — used to seed a rotate gesture. */
export function angleOf(center: Point, p: Point): number {
  return Math.atan2(p.y - center.y, p.x - center.x);
}
