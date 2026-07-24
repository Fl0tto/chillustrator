/**
 * Canonical parsed path representation (spec Phase 0.5 PTH-001).
 *
 * All geometry operations (bounds, booleans, conversion) run on this normalized
 * form rather than an unvalidated `d` string. The parser (pathParser.ts) reduces
 * every SVG command to ABSOLUTE coordinates using only four segment kinds —
 * Move / Line / Cubic / Close — folding H/V/S/T/Q/A into lines and cubic curves.
 * The serializer (pathData.ts) regenerates a `d` string from this form.
 *
 * Pure math: no DOM, no React, no model imports. Safe for workers and tests.
 */
import type { Point } from "./matrix";

export interface MoveSegment {
  type: "M";
  x: number;
  y: number;
}

export interface LineSegment {
  type: "L";
  x: number;
  y: number;
}

/** Absolute cubic Bézier: control points (x1,y1),(x2,y2) → end (x,y). */
export interface CubicSegment {
  type: "C";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
}

/** Close the current subpath (line back to its most recent Move). */
export interface CloseSegment {
  type: "Z";
}

export type PathSegment = MoveSegment | LineSegment | CubicSegment | CloseSegment;

export interface PathGeometry {
  segments: PathSegment[];
}

/** A subpath flattened to a polyline plus whether it was explicitly closed. */
export interface Contour {
  points: Point[];
  closed: boolean;
}

export const EMPTY_GEOMETRY: PathGeometry = { segments: [] };

export function isEmptyGeometry(g: PathGeometry): boolean {
  return g.segments.length === 0;
}
