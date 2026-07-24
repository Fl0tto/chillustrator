/**
 * Shape Builder region arrangement (Illustrator-style).
 *
 * Given N operands, computes the planar arrangement's atomic FACES: maximal
 * disjoint regions where every point lies inside the same subset of shapes.
 * Built INCREMENTALLY — each new shape splits the existing faces via the
 * clipping engine — so cost is polynomial in the arrangement's real complexity
 * rather than the 2^N of trying every subset. Scales to many overlapping shapes.
 *
 * The clipping library is confined to this adapter layer (BLN-004). Faces carry
 * world-space geometry; the caller renders/merges them.
 */
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import type { Point } from "../matrix";
import type { PathGeometry } from "../pathTypes";
import type { BooleanOperand } from "../booleanTypes";
import { toWorldMultiPolygon, multiPolygonToGeometry } from "./booleanEngine";

/** Faces below this area (world units²) are discarded as clipping slivers. */
const MIN_FACE_AREA = 0.05;

export interface Face {
  id: string;
  /** World-space polygonal region (may contain holes / multiple islands). */
  polygon: MultiPolygon;
  geometry: PathGeometry;
  area: number;
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a / 2;
}

/** Signed-area sum → absolute area of a multipolygon (outer − holes). */
export function multiPolygonArea(mp: MultiPolygon): number {
  let a = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => {
      // ring 0 is outer (+), subsequent rings are holes (−); use signed area.
      a += i === 0 ? Math.abs(ringArea(ring)) : -Math.abs(ringArea(ring));
    });
  }
  return a;
}

function nonEmpty(mp: MultiPolygon): boolean {
  return mp.length > 0 && multiPolygonArea(mp) > MIN_FACE_AREA;
}

/** Ray-cast test: is a point inside a single closed ring? */
function pointInRing(p: Point, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1];
    const xi = ring[i][0], xj = ring[j][0];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point-in-face accounting for holes (inside an outer ring, outside its holes). */
export function pointInMultiPolygon(p: Point, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (poly.length === 0) continue;
    if (!pointInRing(p, poly[0])) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(p, poly[i])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * Compute the atomic faces of the arrangement of `operands` (world space).
 * Disjoint and collectively covering the union of all shapes.
 */
export function computeFaces(operands: BooleanOperand[]): Face[] {
  const shapes = operands.map(toWorldMultiPolygon).filter((mp) => mp.length > 0);
  if (shapes.length === 0) return [];

  // Incremental split: faces stay disjoint; each new shape divides overlaps.
  let faces: MultiPolygon[] = [];
  for (const shape of shapes) {
    const next: MultiPolygon[] = [];
    let remainder = shape;
    for (const face of faces) {
      let inside: MultiPolygon = [];
      let outside: MultiPolygon = [];
      try {
        inside = polygonClipping.intersection(face, shape);
        outside = polygonClipping.difference(face, shape);
      } catch {
        // On a clipping failure keep the face intact rather than losing area.
        next.push(face);
        continue;
      }
      if (nonEmpty(inside)) next.push(inside);
      if (nonEmpty(outside)) next.push(outside);
      // Whatever the new shape shares with an existing face is no longer "new".
      try {
        remainder = polygonClipping.difference(remainder, face);
      } catch {
        /* keep remainder as-is */
      }
    }
    if (nonEmpty(remainder)) next.push(remainder);
    faces = next.filter(nonEmpty);
  }

  return faces.map((polygon, i) => ({
    id: `face-${i}`,
    polygon,
    geometry: multiPolygonToGeometry(polygon),
    area: multiPolygonArea(polygon),
  }));
}

/** Index of the smallest face containing `p` (topmost visually), or -1. */
export function faceAtPoint(faces: Face[], p: Point): number {
  let best = -1;
  let bestArea = Infinity;
  for (let i = 0; i < faces.length; i++) {
    if (pointInMultiPolygon(p, faces[i].polygon) && faces[i].area < bestArea) {
      bestArea = faces[i].area;
      best = i;
    }
  }
  return best;
}

/** Union of the chosen faces into one world-space PathGeometry, or null. */
export function mergeFaces(faces: Face[], indices: number[]): PathGeometry | null {
  const chosen = indices.map((i) => faces[i]?.polygon).filter((p): p is MultiPolygon => Boolean(p));
  if (chosen.length === 0) return null;
  let merged: MultiPolygon = chosen[0];
  try {
    if (chosen.length > 1) merged = polygonClipping.union(chosen[0], ...chosen.slice(1));
  } catch {
    return null;
  }
  if (!nonEmpty(merged)) return null;
  return multiPolygonToGeometry(merged);
}
