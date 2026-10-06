/**
 * Curve-tool geometry helpers.
 *
 * The drawing UI exposes a single signed "bend" value per segment instead of
 * raw Bézier handles. Bend is the perpendicular displacement of the curve at
 * t=0.5 from the straight chord: positive/negative values bow to opposite sides.
 * Internally each segment is emitted as a normal cubic Bézier, so the result is
 * fully compatible with path editing, booleans, import/export and bounds.
 */
import type { Point } from "./matrix";
import type { CubicSegment, PathGeometry } from "./pathTypes";

const EPS = 1e-9;

export function curveBendPoint(start: Point, end: Point, bend: number): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  if (len < EPS || Math.abs(bend) < EPS) return mid;
  return {
    x: mid.x + (-dy / len) * bend,
    y: mid.y + (dx / len) * bend,
  };
}

/**
 * Convert a chord + signed midpoint bend into a cubic Bézier.
 *
 * We construct the equivalent quadratic whose midpoint sits exactly at
 * curveBendPoint(), then convert that quadratic to a cubic. This gives the
 * wheel control a stable, intuitive meaning while still producing canonical C
 * segments.
 */
export function cubicFromBend(start: Point, end: Point, bend: number): CubicSegment {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) {
    return {
      type: "C",
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      x: end.x,
      y: end.y,
    };
  }

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const nx = -dy / len;
  const ny = dx / len;
  // For a quadratic Bézier, Q = midpoint + 2*bend makes B(0.5) land at
  // midpoint + bend. Convert Q -> cubic controls with the standard 2/3 rule.
  const q = { x: mid.x + nx * bend * 2, y: mid.y + ny * bend * 2 };
  return {
    type: "C",
    x1: start.x + (2 / 3) * (q.x - start.x),
    y1: start.y + (2 / 3) * (q.y - start.y),
    x2: end.x + (2 / 3) * (q.x - end.x),
    y2: end.y + (2 / 3) * (q.y - end.y),
    x: end.x,
    y: end.y,
  };
}

/** Build canonical path geometry from placed points and one bend per segment. */
export function curvePathGeometry(points: Point[], bends: number[]): PathGeometry {
  if (points.length === 0) return { segments: [] };
  const segments: PathGeometry["segments"] = [
    { type: "M", x: points[0].x, y: points[0].y },
  ];
  for (let i = 1; i < points.length; i++) {
    segments.push(cubicFromBend(points[i - 1], points[i], bends[i - 1] ?? 0));
  }
  return { segments };
}

/**
 * Circle-equivalent radius for the chord/sagitta pair, useful as UI feedback.
 * Infinity means a straight segment. This is informational only; the emitted
 * curve remains the stable quadratic-derived cubic above.
 */
export function equivalentCurveRadius(start: Point, end: Point, bend: number): number {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const s = Math.abs(bend);
  if (chord < EPS || s < EPS) return Number.POSITIVE_INFINITY;
  return (chord * chord) / (8 * s) + s / 2;
}
