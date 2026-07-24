/**
 * Boolean geometry adapter backed by `polygon-clipping` (Martinez–Rueda).
 *
 * The engine is the ONLY place that touches the clipping library (BLN-004): it
 * converts our canonical PathGeometry into the library's ring format, runs the
 * operation in a single WORLD coordinate system (BLN-005), and converts the
 * result back into PathGeometry. Curves are flattened to polylines first
 * (booleans operate on flattened paths, spec §4.9); the result is polygonal.
 *
 * Pure apart from the imported library — no DOM/React/store. Safe for a worker.
 */
import polygonClipping, { type MultiPolygon, type Ring } from "polygon-clipping";
import type { Point } from "../matrix";
import type { PathGeometry, PathSegment } from "../pathTypes";
import { flattenGeometry, transformGeometry } from "../pathData";
import type {
  BooleanGeometryEngine,
  BooleanOperand,
  BooleanOperation,
  BooleanResult,
} from "../booleanTypes";

/** Curve-flattening tolerance in world units. Smaller = finer polygons. */
const FLATTEN_TOLERANCE = 0.15;
/** Minimum area (world units²) below which a ring is discarded as noise. */
const MIN_RING_AREA = 1e-6;

function ringArea(points: Point[]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return a / 2;
}

/** Ray-cast point-in-polygon (ring assumed closed or implicitly closed). */
function pointInRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y, yj = ring[j].y;
    const xi = ring[i].x, xj = ring[j].x;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function toLibRing(points: Point[]): Ring {
  const ring: Ring = points.map((p) => [p.x, p.y] as [number, number]);
  // polygon-clipping expects closed rings (first === last).
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

/**
 * Convert one operand's world geometry into a MultiPolygon, assigning holes by
 * even–odd containment nesting so compound paths (islands + holes) are correct.
 */
function operandToMultiPolygon(geometry: PathGeometry): MultiPolygon {
  const contours = flattenGeometry(geometry, FLATTEN_TOLERANCE)
    .map((c) => c.points)
    .filter((pts) => pts.length >= 3 && Math.abs(ringArea(pts)) > MIN_RING_AREA);

  if (contours.length === 0) return [];

  // Containment depth: how many other contours strictly contain this one.
  const depth = contours.map((c, i) => {
    const probe = c[0];
    let d = 0;
    for (let k = 0; k < contours.length; k++) {
      if (k === i) continue;
      if (pointInRing(probe, contours[k])) d++;
    }
    return d;
  });

  // Even depth → outer ring (starts a polygon); odd depth → hole of the nearest
  // enclosing outer ring. Order polygons so a hole can attach to its parent.
  const polygons: Ring[][] = [];
  const outerIndex = new Map<number, number>(); // contour index -> polygon index
  contours.forEach((c, i) => {
    if (depth[i] % 2 === 0) {
      outerIndex.set(i, polygons.length);
      polygons.push([toLibRing(c)]);
    }
  });
  contours.forEach((c, i) => {
    if (depth[i] % 2 === 1) {
      // Attach to the smallest-area outer contour that contains it.
      let best = -1;
      let bestArea = Infinity;
      for (const [oi, pi] of outerIndex) {
        if (pointInRing(c[0], contours[oi])) {
          const area = Math.abs(ringArea(contours[oi]));
          if (area < bestArea) {
            bestArea = area;
            best = pi;
          }
        }
      }
      if (best >= 0) polygons[best].push(toLibRing(c));
      else polygons.push([toLibRing(c)]); // orphan hole → treat as island
    }
  });

  return polygons;
}

function multiPolygonToGeometry(mp: MultiPolygon): PathGeometry {
  const segments: PathSegment[] = [];
  for (const polygon of mp) {
    for (const ring of polygon) {
      if (ring.length === 0) continue;
      // Drop the duplicated closing vertex; we emit an explicit Z.
      const pts = ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined);
      if (pts.length < 3) continue;
      segments.push({ type: "M", x: pts[0][0], y: pts[0][1] });
      for (let i = 1; i < pts.length; i++) segments.push({ type: "L", x: pts[i][0], y: pts[i][1] });
      segments.push({ type: "Z" });
    }
  }
  return { segments };
}

export class PolygonClippingEngine implements BooleanGeometryEngine {
  execute(operation: BooleanOperation, operands: BooleanOperand[]): Promise<BooleanResult> {
    const warnings: string[] = [];
    const empty = (): BooleanResult => ({
      geometry: { segments: [] },
      fillRule: "evenodd",
      warnings,
      empty: true,
    });

    try {
      if (operands.length < 2) {
        warnings.push("Boolean operations need at least two operands.");
        return Promise.resolve(empty());
      }

      // World-space MultiPolygons (BLN-005): transform then flatten.
      const polys = operands.map((op) =>
        operandToMultiPolygon(transformGeometry(op.geometry, op.transform)),
      );
      const usable = polys.filter((p) => p.length > 0);
      if (usable.length < 2) {
        warnings.push("Selection did not contain two fillable regions.");
        return Promise.resolve(empty());
      }

      let result: MultiPolygon;
      switch (operation) {
        case "union":
          result = polygonClipping.union(usable[0], ...usable.slice(1));
          break;
        case "intersect":
          result = polygonClipping.intersection(usable[0], ...usable.slice(1));
          break;
        case "exclude":
          result = polygonClipping.xor(usable[0], ...usable.slice(1));
          break;
        case "subtract": {
          // Front-most (last) operand subtracts from the union of the rest.
          const front = polys[polys.length - 1];
          const baseParts = polys.slice(0, -1).filter((p) => p.length > 0);
          if (front.length === 0 || baseParts.length === 0) {
            warnings.push("Subtract needs a solid base and a solid front shape.");
            return Promise.resolve(empty());
          }
          const base =
            baseParts.length === 1
              ? baseParts[0]
              : polygonClipping.union(baseParts[0], ...baseParts.slice(1));
          result = polygonClipping.difference(base, front);
          break;
        }
      }

      const geometry = multiPolygonToGeometry(result);
      if (geometry.segments.length === 0) {
        warnings.push("The boolean operation produced an empty result.");
        return Promise.resolve(empty());
      }
      return Promise.resolve({ geometry, fillRule: "evenodd", warnings, empty: false });
    } catch (err) {
      // Never partially apply: report failure, leave the document to the caller.
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/** Shared default engine instance. */
export const booleanEngine: BooleanGeometryEngine = new PolygonClippingEngine();
